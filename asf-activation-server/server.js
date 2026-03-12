#!/usr/bin/env node

/**
 * ASF 激活码在线验证服务器
 * 完整实现包含：验证、管理、统计、安全防护
 */

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'change-me-in-production';
const BACKUP_API_KEY = process.env.BACKUP_API_KEY || ADMIN_API_KEY;

// 数据目录（优先显式配置，其次回落到项目内 data）
const DATA_ROOT = process.env.DATA_ROOT || path.join(__dirname, 'data');
const DB_FILE = process.env.DB_FILE || path.join(DATA_ROOT, 'activation.db');
const BACKUP_ROOT = process.env.BACKUP_ROOT || path.join(DATA_ROOT, 'backups');
fs.mkdirSync(DATA_ROOT, { recursive: true });
fs.mkdirSync(BACKUP_ROOT, { recursive: true });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024 * 512 } });
console.log('数据目录:', DATA_ROOT);
console.log('数据库文件:', DB_FILE);
console.log('备份目录:', BACKUP_ROOT);

// ============================================
// 中间件配置
// ============================================

// 安全头
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: false
}));

// CORS 配置（允许前端调用）
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// JSON 解析
app.use(express.json({ limit: '1mb' }));

// 请求日志
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path} - IP: ${req.ip}`);
  next();
});

// ============================================
// 速率限制
// ============================================

const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 30, // 每个IP最多30次验证
  message: { success: false, message: '请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false
});

const adminLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1小时
  max: 100, // 每个IP最多100次管理操作
  message: { success: false, message: '管理API请求过于频繁' }
});

const backupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: { success: false, message: '备份请求过于频繁' }
});

function requireBackupAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const bodyToken = req.body?.apiKey || req.query?.apiKey || '';
  const token = bearerToken || bodyToken;

  if (token !== BACKUP_API_KEY) {
    return res.status(401).json({ success: false, message: '未授权' });
  }

  next();
}

function getBackupKey() {
  return crypto.createHash('sha256').update(String(BACKUP_API_KEY).trim(), 'utf8').digest();
}

function sha256Buffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function safeReadJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.warn('读取 JSON 失败:', filePath, error.message);
    return null;
  }
}

const recentBackupUploads = new Map();
const RECENT_BACKUP_TTL_MS = 10 * 60 * 1000;

function pruneRecentBackupUploads() {
  const now = Date.now();
  for (const [key, value] of recentBackupUploads.entries()) {
    if (!value?.at || (now - value.at) > RECENT_BACKUP_TTL_MS) {
      recentBackupUploads.delete(key);
    }
  }
}

function buildBackupDedupeKeys(machineId, metadata, archiveHash) {
  const keys = [`${machineId}:hash:${archiveHash}`];
  const contentSignature = String(metadata?.contentSignature || '').trim();
  if (contentSignature) {
    keys.push(`${machineId}:sig:${contentSignature}`);
  }
  return keys;
}

function hasRecentBackupDuplicate(dedupeKeys) {
  pruneRecentBackupUploads();
  for (const key of dedupeKeys) {
    if (recentBackupUploads.has(key)) {
      return key;
    }
  }
  return null;
}

function markRecentBackupUploads(dedupeKeys, extra = {}) {
  const payload = { at: Date.now(), ...extra };
  for (const key of dedupeKeys) {
    recentBackupUploads.set(key, payload);
  }
}

function clearRecentBackupUploads(dedupeKeys) {
  for (const key of dedupeKeys) {
    recentBackupUploads.delete(key);
  }
}

function getBackupLockDir(machineDir) {
  return path.join(machineDir, '.upload-locks');
}

function acquireBackupLock(machineDir, archiveHash, metadata = {}) {
  const lockDir = getBackupLockDir(machineDir);
  fs.mkdirSync(lockDir, { recursive: true });
  const lockPath = path.join(lockDir, `${archiveHash}.lock.json`);
  try {
    fs.writeFileSync(lockPath, JSON.stringify({
      archiveHash,
      machineId: metadata.machineId || null,
      contentSignature: metadata.contentSignature || null,
      createdAt: new Date().toISOString()
    }, null, 2), { flag: 'wx' });
    return lockPath;
  } catch (error) {
    if (error.code === 'EEXIST') {
      return null;
    }
    throw error;
  }
}

function releaseBackupLock(lockPath) {
  if (!lockPath) return;
  try {
    if (fs.existsSync(lockPath)) {
      fs.unlinkSync(lockPath);
    }
  } catch (error) {
    console.warn('释放备份锁失败:', lockPath, error.message);
  }
}

function getBackupDirs(machineDir) {
  if (!fs.existsSync(machineDir)) {
    return [];
  }

  return fs.readdirSync(machineDir)
    .filter(name => !String(name).startsWith('.'))
    .map(name => ({
      name,
      dir: path.join(machineDir, name)
    }))
    .filter(item => fs.existsSync(item.dir) && fs.statSync(item.dir).isDirectory())
    .sort((a, b) => String(b.name).localeCompare(String(a.name)));
}

function getArchiveHashFromBackupDir(backupDir, meta) {
  if (meta?.archiveHash) {
    return meta.archiveHash;
  }

  const archivePath = path.join(backupDir, 'archive.bin');
  if (!fs.existsSync(archivePath)) {
    return null;
  }

  try {
    const archiveBuffer = fs.readFileSync(archivePath);
    return sha256Buffer(archiveBuffer);
  } catch (error) {
    console.warn('计算历史备份 archiveHash 失败:', backupDir, error.message);
    return null;
  }
}

function findDuplicateBackup(machineDir, metadata, archiveHash) {
  const incomingSignature = metadata?.contentSignature || null;
  const backupDirs = getBackupDirs(machineDir);

  for (const item of backupDirs) {
    const metaPath = path.join(item.dir, 'meta.json');
    const existingMeta = safeReadJson(metaPath);
    if (!existingMeta) {
      continue;
    }

    if (incomingSignature && existingMeta.contentSignature && existingMeta.contentSignature === incomingSignature) {
      return {
        type: 'contentSignature',
        backupName: item.name,
        meta: existingMeta
      };
    }

    const existingArchiveHash = getArchiveHashFromBackupDir(item.dir, existingMeta);
    if (existingArchiveHash && existingArchiveHash === archiveHash) {
      return {
        type: 'archiveHash',
        backupName: item.name,
        meta: existingMeta
      };
    }
  }

  return null;
}

// ============================================
// 数据库初始化
// ============================================

const db = new sqlite3.Database(DB_FILE, (err) => {
  if (err) {
    console.error('无法打开数据库:', err.message);
    process.exit(1);
  }
  console.log('已连接到 SQLite 数据库:', DB_FILE);
});

// 初始化表结构
db.serialize(() => {
  // 激活码表
  db.run(`CREATE TABLE IF NOT EXISTS activation_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    used BOOLEAN DEFAULT 0,
    used_by TEXT,
    used_at DATETIME,
    machine_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // 机器指纹表
  db.run(`CREATE TABLE IF NOT EXISTS machine_fingerprints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    machine_id TEXT UNIQUE NOT NULL,
    first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen DATETIME,
    usage_count INTEGER DEFAULT 0
  )`);

  // 验证日志表（审计）
  db.run(`CREATE TABLE IF NOT EXISTS verification_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL,
    machine_id TEXT,
    ip_address TEXT,
    user_agent TEXT,
    result BOOLEAN,
    message TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // 统计表
  db.run(`CREATE TABLE IF NOT EXISTS statistics (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    total_codes INTEGER DEFAULT 0,
    total_used INTEGER DEFAULT 0,
    total_machines INTEGER DEFAULT 0,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // 独立索引（SQLite 兼容）
  db.run(`CREATE INDEX IF NOT EXISTS idx_activation_codes_code ON activation_codes(code)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_activation_codes_used ON activation_codes(used)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_machine_fingerprints_machine_id ON machine_fingerprints(machine_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_verification_logs_timestamp ON verification_logs(timestamp)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_verification_logs_code ON verification_logs(code)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_verification_logs_machine_id ON verification_logs(machine_id)`);

  // 插入初始统计记录（如果不存在）
  db.run(`INSERT OR IGNORE INTO statistics (id, total_codes, total_used, total_machines) 
          VALUES (1, 0, 0, 0)`);

  console.log('数据库表初始化完成');
});

// ============================================
// 工具函数
// ============================================

/**
 * 生成激活码（格式：XXX-XXX-XXX）
 */
function generateActivationCode(prefix = '') {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去除0,O,1,I等易混淆字符
  let code = prefix ? prefix + '-' : '';
  
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 4; j++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    if (i < 2) code += '-';
  }
  
  return code;
}

/**
 * 记录验证日志
 */
function logVerification(code, machineId, ip, userAgent, success, message) {
  const stmt = db.prepare(
    `INSERT INTO verification_logs (code, machine_id, ip_address, user_agent, result, message) 
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  stmt.run(code, machineId, ip, userAgent, success, message, function(err) {
    if (err) console.error('日志记录失败:', err.message);
    stmt.finalize();
  });
}

/**
 * 更新统计数据
 */
function updateStatistics() {
  db.serialize(() => {
    db.get(`SELECT COUNT(*) as count FROM activation_codes`, (err, row) => {
      if (err) return console.error('统计查询失败:', err.message);
      const totalCodes = row.count;
      
      db.get(`SELECT COUNT(*) as count FROM activation_codes WHERE used = 1`, (err, row) => {
        if (err) return;
        const totalUsed = row.count;
        
        db.get(`SELECT COUNT(*) as count FROM machine_fingerprints`, (err, row) => {
          if (err) return;
          const totalMachines = row.count;
          
          db.run(
            `UPDATE statistics SET total_codes = ?, total_used = ?, total_machines = ?, last_updated = CURRENT_TIMESTAMP WHERE id = 1`,
            [totalCodes, totalUsed, totalMachines]
          );
        });
      });
    });
  });
}

// ============================================
// 健康检查端点
// ============================================

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    uptime: process.uptime()
  });
});

// ============================================
// 验证激活码（核心功能）
// ============================================

app.post('/api/verify-code', verifyLimiter, (req, res) => {
  const { code, machineId, username } = req.body;
  const clientIP = req.ip || req.connection.remoteAddress;
  const userAgent = req.get('User-Agent') || 'unknown';
  
  // 参数验证
  if (!code || !machineId) {
    logVerification(code, machineId, clientIP, userAgent, false, '缺少参数');
    return res.json({ 
      success: false, 
      message: '缺少必要参数：code 和 machineId' 
    });
  }
  
  // 标准化输入
  const normalizedCode = code.trim().toUpperCase();
  const normalizedMachineId = machineId.trim();
  
  console.log(`验证激活码: ${normalizedCode} from machine: ${normalizedMachineId}`);
  
  // 查询激活码
  db.get(
    'SELECT * FROM activation_codes WHERE code = ?',
    [normalizedCode],
    (err, row) => {
      if (err) {
        console.error('数据库查询错误:', err.message);
        logVerification(normalizedCode, normalizedMachineId, clientIP, userAgent, false, '数据库错误');
        return res.json({ success: false, message: '服务器错误' });
      }
      
      // 情况1：激活码不存在
      if (!row) {
        logVerification(normalizedCode, normalizedMachineId, clientIP, userAgent, false, '无效激活码');
        return res.json({ 
          success: false, 
          message: '无效的激活码' 
        });
      }
      
      // 情况2：激活码已被使用
      if (row.used) {
        // 检查是否绑定到当前机器
        if (row.machine_id === normalizedMachineId) {
          // 同一机器，允许"重新激活"
          logVerification(normalizedCode, normalizedMachineId, clientIP, userAgent, true, '重新激活成功');
          
          // 更新机器最后 seen 时间
          db.run(
            'UPDATE machine_fingerprints SET last_seen = CURRENT_TIMESTAMP, usage_count = usage_count + 1 WHERE machine_id = ?',
            [normalizedMachineId]
          );
          
          return res.json({ 
            success: true, 
            message: '欢迎回来',
            isReactivation: true,
            usedBy: row.used_by,
            usedAt: row.used_at
          });
        } else {
          // 其他机器使用过
          logVerification(normalizedCode, normalizedMachineId, clientIP, userAgent, false, '激活码已被其他设备使用');
          return res.json({ 
            success: false, 
            message: '激活码已被其他设备使用',
            usedBy: row.used_by,
            usedAt: row.used_at
          });
        }
      }
      
      // 情况3：激活码未使用，执行激活
      const now = new Date().toISOString();
      
      db.serialize(() => {
        // 更新激活码状态
        db.run(
          `UPDATE activation_codes 
           SET used = 1, used_by = ?, used_at = ?, machine_id = ? 
           WHERE code = ?`,
          [username || 'unknown', now, normalizedMachineId, normalizedCode],
          function(err) {
            if (err) {
              console.error('激活码更新失败:', err.message);
              logVerification(normalizedCode, normalizedMachineId, clientIP, userAgent, false, '激活失败');
              return res.json({ success: false, message: '激活失败，请重试' });
            }
            
            // 插入或更新机器指纹
            db.run(
              `INSERT INTO machine_fingerprints (machine_id, first_seen, last_seen, usage_count) 
               VALUES (?, ?, ?, 1)
               ON CONFLICT(machine_id) DO UPDATE SET 
                 last_seen = excluded.last_seen,
                 usage_count = usage_count + 1`,
              [normalizedMachineId, now, now]
            );
            
            // 更新统计
            updateStatistics();
            
            logVerification(normalizedCode, normalizedMachineId, clientIP, userAgent, true, '首次激活成功');
            
            res.json({ 
              success: true, 
              message: '激活成功',
              isFirstUse: true 
            });
          }
        );
      });
    }
  );
});

// ============================================
// 管理员接口 - 生成激活码
// ============================================

app.post('/api/admin/generate-codes', adminLimiter, (req, res) => {
  const { apiKey, count = 10, prefix = '' } = req.body;
  
  // 验证管理员密钥
  if (apiKey !== ADMIN_API_KEY) {
    console.warn(`未授权的管理访问尝试 from IP: ${req.ip}`);
    return res.status(403).json({ success: false, message: '未授权' });
  }
  
  // 验证数量
  const amount = Math.min(Math.max(parseInt(count) || 10, 1), 10000);
  
  const codes = [];
  const statements = [];
  
  db.serialize(() => {
    const stmt = db.prepare('INSERT OR IGNORE INTO activation_codes (code) VALUES (?)');
    
    for (let i = 0; i < amount; i++) {
      let code;
      let attempts = 0;
      
      // 确保生成的码不重复
      do {
        code = generateActivationCode(prefix);
        attempts++;
        if (attempts > 100) {
          console.error('无法生成不重复的激活码，可能代码空间耗尽');
          break;
        }
      } while (codes.includes(code));
      
      if (code) {
        codes.push(code);
        stmt.run(code);
      }
    }
    
    stmt.finalize();
    
    // 更新统计
    setTimeout(updateStatistics, 100);
    
    console.log(`生成了 ${codes.length} 个新激活码 (请求IP: ${req.ip})`);
    
    res.json({ 
      success: true, 
      count: codes.length,
      codes: codes,
      message: `成功生成 ${codes.length} 个激活码`
    });
  });
});

// ============================================
// 管理员接口 - 查询激活码
// ============================================

app.get('/api/admin/codes', adminLimiter, (req, res) => {
  const { apiKey, code, page = 1, limit = 50 } = req.query;
  
  if (apiKey !== ADMIN_API_KEY) {
    return res.status(403).json({ success: false, message: '未授权' });
  }
  
  const offset = (parseInt(page) - 1) * parseInt(limit);
  
  let query = 'SELECT * FROM activation_codes';
  let countQuery = 'SELECT COUNT(*) as total FROM activation_codes';
  const params = [];
  
  if (code) {
    const whereClause = ' WHERE code LIKE ?';
    query += whereClause + ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    countQuery += whereClause;
    params.push(`%${code}%`, parseInt(limit), offset);
  } else {
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);
  }
  
  db.all(query, params, (err, rows) => {
    if (err) {
      console.error('查询激活码失败:', err.message);
      return res.json({ success: false, message: '查询失败' });
    }
    
    // 同时查询总数
    const countParams = code ? [`%${code}%`] : [];
    db.get(countQuery, countParams, (err, countRow) => {
      if (err) countRow = { total: 0 };
      
      res.json({ 
        success: true, 
        codes: rows,
        total: countRow.total,
        page: parseInt(page),
        totalPages: Math.ceil(countRow.total / parseInt(limit))
      });
    });
  });
});

// ============================================
// 管理员接口 - 机器查询
// ============================================

app.get('/api/admin/machines', adminLimiter, (req, res) => {
  const { apiKey, machineId } = req.query;
  
  if (apiKey !== ADMIN_API_KEY) {
    return res.status(403).json({ success: false, message: '未授权' });
  }
  
  let query = 'SELECT * FROM machine_fingerprints';
  const params = [];
  
  if (machineId) {
    query += ' WHERE machine_id LIKE ?';
    params.push(`%${machineId}%`);
  }
  
  query += ' ORDER BY last_seen DESC LIMIT 100';
  
  db.all(query, params, (err, rows) => {
    if (err) {
      console.error('查询机器失败:', err.message);
      return res.json({ success: false, message: '查询失败' });
    }
    
    res.json({ success: true, machines: rows });
  });
});

// ============================================
// 管理员接口 - 统计数据
// ============================================

app.get('/api/admin/stats', adminLimiter, (req, res) => {
  const { apiKey } = req.query;
  
  if (apiKey !== ADMIN_API_KEY) {
    return res.status(403).json({ success: false, message: '未授权' });
  }
  
  db.get('SELECT * FROM statistics WHERE id = 1', (err, stats) => {
    if (err || !stats) {
      return res.json({ success: false, message: '查询失败' });
    }
    
    // 额外统计：最近24小时验证次数
    db.get(
      `SELECT COUNT(*) as recent FROM verification_logs 
       WHERE timestamp > datetime('now', '-1 day')`,
      (err, recent) => {
        if (err) recent = { recent: 0 };
        
        res.json({
          success: true,
          stats: {
            ...stats,
            recentVerifications: recent.recent || 0
          }
        });
      }
    );
  });
});

// ============================================
// 管理员接口 - 强制撤销激活码
// ============================================

app.delete('/api/admin/code/:code', adminLimiter, (req, res) => {
  const { apiKey } = req.query;
  const { code } = req.params;
  
  if (apiKey !== ADMIN_API_KEY) {
    return res.status(403).json({ success: false, message: '未授权' });
  }
  
  db.run(
    'UPDATE activation_codes SET used = 0, used_by = NULL, used_at = NULL, machine_id = NULL WHERE code = ?',
    [code.toUpperCase()],
    function(err) {
      if (err) {
        console.error('撤销激活码失败:', err.message);
        return res.json({ success: false, message: '操作失败' });
      }
      
      if (this.changes === 0) {
        return res.json({ success: false, message: '激活码不存在' });
      }
      
      updateStatistics();
      
      console.log(`撤销了激活码: ${code} (请求IP: ${req.ip})`);
      res.json({ success: true, message: '激活码已撤销，可重新使用' });
    }
  );
});

// ============================================
// 备份接口
// ============================================

app.post('/api/backup/upload', backupLimiter, requireBackupAuth, upload.fields([
  { name: 'metadata', maxCount: 1 },
  { name: 'nonce', maxCount: 1 },
  { name: 'tag', maxCount: 1 },
  { name: 'archive', maxCount: 1 }
]), (req, res) => {
  try {
    const metadataRaw = req.body.metadata || '{}';
    const metadata = JSON.parse(metadataRaw);
    const archive = req.files?.archive?.[0];
    const nonce = req.files?.nonce?.[0];
    const tag = req.files?.tag?.[0];
    const algorithm = req.body.algorithm || 'unknown';

    if (!archive || !nonce || !tag) {
      return res.status(400).json({ success: false, message: '缺少备份内容' });
    }

    const machineId = String(metadata.machineId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
    const machineDir = path.join(BACKUP_ROOT, machineId);
    fs.mkdirSync(machineDir, { recursive: true });

    const archiveHash = sha256Buffer(archive.buffer);
    const dedupeKeys = buildBackupDedupeKeys(machineId, metadata, archiveHash);

    const recentDuplicateKey = hasRecentBackupDuplicate(dedupeKeys);
    if (recentDuplicateKey) {
      return res.json({
        success: true,
        skipped: true,
        message: '相同内容短时间内重复上传，已跳过',
        duplicateBy: 'recentCache',
        duplicateKey: recentDuplicateKey
      });
    }

    const lockPath = acquireBackupLock(machineDir, archiveHash, metadata);
    if (!lockPath) {
      markRecentBackupUploads(dedupeKeys, { reason: 'in-progress' });
      return res.json({
        success: true,
        skipped: true,
        message: '相同内容正在处理中，已跳过重复上传',
        duplicateBy: 'inProgressLock'
      });
    }

    markRecentBackupUploads(dedupeKeys, { reason: 'processing' });

    try {
      const duplicate = findDuplicateBackup(machineDir, metadata, archiveHash);
      if (duplicate) {
        markRecentBackupUploads(dedupeKeys, { reason: duplicate.type, backupName: duplicate.backupName });
        return res.json({
          success: true,
          skipped: true,
          message: '相同内容，已跳过去重备份',
          duplicateBy: duplicate.type,
          existingBackup: duplicate.backupName
        });
      }

      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const random = crypto.randomBytes(4).toString('hex');
      const outDir = path.join(machineDir, `${stamp}_${random}`);
      fs.mkdirSync(outDir, { recursive: true });

      const metaToSave = {
        ...metadata,
        algorithm,
        archiveHash,
        uploadedAt: new Date().toISOString(),
        archiveSize: archive.size || archive.buffer?.length || 0,
        dedupeVersion: 3
      };

      fs.writeFileSync(path.join(outDir, 'meta.json'), JSON.stringify(metaToSave, null, 2));
      fs.writeFileSync(path.join(outDir, 'archive.bin'), archive.buffer);
      fs.writeFileSync(path.join(outDir, 'nonce.bin'), nonce.buffer);
      fs.writeFileSync(path.join(outDir, 'tag.bin'), tag.buffer);

      markRecentBackupUploads(dedupeKeys, { reason: 'saved', backupName: path.basename(outDir) });
      return res.json({
        success: true,
        message: '备份上传成功',
        archiveHash,
        backupName: path.basename(outDir)
      });
    } finally {
      releaseBackupLock(lockPath);
    }
  } catch (error) {
    console.error('备份上传失败:', error.message);
    return res.status(500).json({ success: false, message: '备份上传失败' });
  }
});

app.get('/api/backup/list/:machineId', backupLimiter, requireBackupAuth, (req, res) => {
  try {
    const machineId = String(req.params.machineId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
    const dir = path.join(BACKUP_ROOT, machineId);

    if (!fs.existsSync(dir)) {
      return res.json({ success: true, items: [] });
    }

    const items = getBackupDirs(dir).map(item => {
      const metaPath = path.join(item.dir, 'meta.json');
      const meta = safeReadJson(metaPath);
      return { machineId, name: item.name, meta };
    });

    return res.json({ success: true, items });
  } catch (error) {
    console.error('备份列表查询失败:', error.message);
    return res.status(500).json({ success: false, message: '备份列表查询失败' });
  }
});

app.get('/api/backup/all', backupLimiter, requireBackupAuth, (req, res) => {
  try {
    if (!fs.existsSync(BACKUP_ROOT)) {
      return res.json({ success: true, items: [] });
    }

    const items = [];
    for (const machineId of fs.readdirSync(BACKUP_ROOT)) {
      const machineDir = path.join(BACKUP_ROOT, machineId);
      if (!fs.statSync(machineDir).isDirectory()) continue;

      for (const item of getBackupDirs(machineDir)) {
        const metaPath = path.join(item.dir, 'meta.json');
        const meta = safeReadJson(metaPath);
        items.push({ machineId, name: item.name, meta });
      }
    }

    items.sort((a, b) => String(b.name).localeCompare(String(a.name)));
    return res.json({ success: true, items });
  } catch (error) {
    console.error('全部备份列表查询失败:', error.message);
    return res.status(500).json({ success: false, message: '全部备份列表查询失败' });
  }
});

// 清空所有备份
app.post('/api/backup/clear-all', backupLimiter, requireBackupAuth, (req, res) => {
  try {
    if (!fs.existsSync(BACKUP_ROOT)) {
      return res.json({ success: true, message: '备份根目录不存在，无需清理' });
    }

    let totalDeleted = 0;
    for (const machineId of fs.readdirSync(BACKUP_ROOT)) {
      const machineDir = path.join(BACKUP_ROOT, machineId);
      if (!fs.statSync(machineDir).isDirectory()) continue;
      for (const backupDir of fs.readdirSync(machineDir)) {
        const fullDir = path.join(machineDir, backupDir);
        if (fs.statSync(fullDir).isDirectory()) {
          fs.rmSync(fullDir, { recursive: true, force: true });
          totalDeleted++;
        }
      }
      try { if (fs.readdirSync(machineDir).length === 0) fs.rmdirSync(machineDir); } catch {}
    }

    return res.json({ success: true, deleted: totalDeleted, message: `已清理 ${totalDeleted} 个备份目录` });
  } catch (error) {
    console.error('清空备份失败:', error.message);
    return res.status(500).json({ success: false, message: '清空失败', error: error.message });
  }
});

function deleteBackupDir(machineIdRaw, backupIdRaw) {
  const machineId = String(machineIdRaw || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
  const backupId = String(backupIdRaw || '').replace(/[^a-zA-Z0-9_.-]/g, '_');
  const fullDir = path.join(BACKUP_ROOT, machineId, backupId);

  if (!fs.existsSync(fullDir) || !fs.statSync(fullDir).isDirectory()) {
    return { success: false, machineId, backupId, message: '备份目录不存在' };
  }

  fs.rmSync(fullDir, { recursive: true, force: true });

  const machineDir = path.join(BACKUP_ROOT, machineId);
  try {
    const remaining = fs.existsSync(machineDir)
      ? fs.readdirSync(machineDir).filter(name => !String(name).startsWith('.'))
      : [];
    if (remaining.length === 0 && fs.existsSync(machineDir)) {
      fs.rmSync(machineDir, { recursive: true, force: true });
    }
  } catch (error) {
    console.warn('清理空机器目录失败:', machineId, error.message);
  }

  return { success: true, machineId, backupId };
}

app.delete('/api/backup/:machineId/:backupId', backupLimiter, requireBackupAuth, (req, res) => {
  try {
    const result = deleteBackupDir(req.params.machineId, req.params.backupId);
    if (!result.success) {
      return res.status(404).json(result);
    }
    return res.json({ ...result, message: '备份已删除' });
  } catch (error) {
    console.error('删除备份失败:', error.message);
    return res.status(500).json({ success: false, message: '删除备份失败', error: error.message });
  }
});

app.post('/api/backup/delete', backupLimiter, requireBackupAuth, (req, res) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (items.length === 0) {
      return res.status(400).json({ success: false, message: '缺少要删除的备份列表' });
    }

    const results = [];
    let deleted = 0;
    for (const item of items) {
      const result = deleteBackupDir(item.machineId, item.backupId || item.name);
      results.push(result);
      if (result.success) deleted++;
    }

    return res.json({ success: true, deleted, total: items.length, results, message: `已删除 ${deleted}/${items.length} 个备份` });
  } catch (error) {
    console.error('批量删除备份失败:', error.message);
    return res.status(500).json({ success: false, message: '批量删除备份失败', error: error.message });
  }
});

function runBackupDedupe({ dryRun = true } = {}) {
  if (!fs.existsSync(BACKUP_ROOT)) {
    return { success: true, machines: 0, duplicateGroups: 0, deleted: 0, mode: dryRun ? 'dry-run' : 'apply', results: [] };
  }

  let totalMachines = 0;
  let totalGroups = 0;
  let totalDeleted = 0;
  const results = [];

  for (const machineId of fs.readdirSync(BACKUP_ROOT)) {
    const machineDir = path.join(BACKUP_ROOT, machineId);
    if (!fs.statSync(machineDir).isDirectory()) continue;
    totalMachines++;

    const backups = getBackupDirs(machineDir);
    const seen = new Map();

    for (const item of backups) {
      const meta = safeReadJson(path.join(item.dir, 'meta.json'));
      const hash = getArchiveHashFromBackupDir(item.dir, meta);
      const signature = meta?.contentSignature || null;
      const key = hash ? `hash:${hash}` : (signature ? `sig:${signature}` : null);
      if (!key) continue;

      if (!seen.has(key)) {
        seen.set(key, item);
        continue;
      }

      totalGroups++;
      const record = {
        machineId,
        keep: seen.get(key).name,
        delete: item.name,
        by: key,
        mode: dryRun ? 'dry-run' : 'apply'
      };
      results.push(record);

      if (!dryRun) {
        fs.rmSync(item.dir, { recursive: true, force: true });
      }
      totalDeleted++;
    }
  }

  return {
    success: true,
    machines: totalMachines,
    duplicateGroups: totalGroups,
    deleted: totalDeleted,
    mode: dryRun ? 'dry-run' : 'apply',
    results
  };
}

app.post('/api/backup/dedupe', backupLimiter, requireBackupAuth, (req, res) => {
  try {
    const dryRun = !(req.body?.dryRun === false || req.query?.dryRun === 'false' || req.query?.apply === 'true');
    const result = runBackupDedupe({ dryRun });
    return res.json({
      ...result,
      message: dryRun
        ? `预演完成：扫描 ${result.machines} 台机器，发现 ${result.deleted} 个可删除重复备份`
        : `去重完成：扫描 ${result.machines} 台机器，删除 ${result.deleted} 个重复备份`
    });
  } catch (error) {
    console.error('执行备份去重失败:', error.message);
    return res.status(500).json({ success: false, message: '执行备份去重失败', error: error.message });
  }
});

app.get('/api/backup/file/:machineId/:backupId/:fileName', backupLimiter, requireBackupAuth, (req, res) => {
  try {
    const machineId = String(req.params.machineId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
    const backupId = String(req.params.backupId || '').replace(/[^a-zA-Z0-9_.-]/g, '_');
    const fileName = String(req.params.fileName || '');
    const allowed = new Set(['meta.json', 'archive.bin', 'nonce.bin', 'tag.bin']);

    if (!allowed.has(fileName)) {
      return res.status(400).json({ success: false, message: '非法文件名' });
    }

    const fullPath = path.join(BACKUP_ROOT, machineId, backupId, fileName);
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ success: false, message: '备份文件不存在' });
    }

    if (fileName === 'meta.json') {
      return res.sendFile(fullPath);
    }

    return res.download(fullPath, fileName);
  } catch (error) {
    console.error('备份文件下载失败:', error.message);
    return res.status(500).json({ success: false, message: '备份文件下载失败' });
  }
});

app.get('/api/backup/download-zip/:machineId/:backupId', backupLimiter, requireBackupAuth, (req, res) => {
  try {
    const machineId = String(req.params.machineId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
    const backupId = String(req.params.backupId || '').replace(/[^a-zA-Z0-9_.-]/g, '_');
    const dir = path.join(BACKUP_ROOT, machineId, backupId);
    const metaPath = path.join(dir, 'meta.json');
    const archivePath = path.join(dir, 'archive.bin');
    const noncePath = path.join(dir, 'nonce.bin');
    const tagPath = path.join(dir, 'tag.bin');

    if (![metaPath, archivePath, noncePath, tagPath].every(p => fs.existsSync(p))) {
      return res.status(404).json({ success: false, message: '备份文件不存在' });
    }

    const key = getBackupKey();
    const archive = fs.readFileSync(archivePath);
    const nonce = fs.readFileSync(noncePath);
    const tag = fs.readFileSync(tagPath);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(archive), decipher.final()]);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${machineId}_${backupId}.zip"`);
    return res.send(plain);
  } catch (error) {
    console.error('恢复ZIP下载失败:', error.message);
    return res.status(500).json({ success: false, message: '恢复ZIP下载失败' });
  }
});

// ============================================
// Web 管理界面
// ============================================

app.get('/admin.html', (req, res) => {
  const htmlPath = path.join(__dirname, 'admin.html');
  if (fs.existsSync(htmlPath)) {
    res.sendFile(htmlPath);
  } else {
    res.status(404).send('管理界面未找到');
  }
});

// ============================================
// 错误处理
// ============================================

app.use((err, req, res, next) => {
  console.error('服务器错误:', err.stack);
  res.status(500).json({ success: false, message: '服务器内部错误' });
});

// 404 处理
app.use((req, res) => {
  res.status(404).json({ success: false, message: '端点不存在' });
});

// ============================================
// 启动服务器
// ============================================

app.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log(`🚀 ASF 激活码验证服务器已启动`);
  console.log(`📍 监听端口: ${PORT}`);
  console.log(`🔗 验证端点: POST /api/verify-code`);
  console.log(`🔐 管理员端点: POST /api/admin/generate-codes`);
  console.log(`📊 统计端点: GET /api/admin/stats`);
  console.log(`🌐 管理界面: http://localhost:${PORT}/admin.html`);
  console.log(`📝 日志: 控制台输出`);
  console.log('='.repeat(50));
  
  // 初始化时更新统计
  setTimeout(updateStatistics, 1000);
});

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\n收到退出信号，正在关闭...');
  db.close((err) => {
    if (err) {
      console.error('关闭数据库时出错:', err.message);
    } else {
      console.log('数据库连接已关闭');
    }
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\n收到终止信号，正在关闭...');
  db.close(() => process.exit(0));
});

module.exports = { app, db };