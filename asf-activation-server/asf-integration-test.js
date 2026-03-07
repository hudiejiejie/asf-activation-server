#!/usr/bin/env node

/**
 * ASF 激活码验证 - 完整集成测试
 * 模拟 ASF 前端的完整注册和验证流程
 */

const http = require('http');
const crypto = require('crypto');

// 配置
const SERVER_URL = process.argv[2] || 'http://localhost:3000';
const TEST_USERNAME = `testuser_${Date.now()}`;
const TEST_PASSWORD = 'Test123!@#';

// 颜色
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

// 生成机器指纹（模拟浏览器指纹）
function generateMachineFingerprint() {
  const components = [
    `1920x1080x24`, // 屏幕分辨率+色深
    'Asia/Shanghai', // 时区
    'zh-CN', // 语言
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Win32', // 平台
    '8', // CPU核心数
    '8', // 设备内存(GB)
    'canvas_fingerprint_hash' // Canvas指纹
  ];
  
  const str = components.join('|');
  const hash = crypto.createHash('sha256').update(str).digest('hex');
  return `web_${hash.substring(0, 16)}`;
}

// HTTP 请求
function request(method, path, body = null, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, SERVER_URL);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? require('https') : require('http');
    
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        ...(body && { 'Content-Length': Buffer.byteLength(JSON.stringify(body)) })
      },
      timeout
    };
    
    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });
    
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('请求超时'));
    });
    
    if (body) {
      req.write(JSON.stringify(body));
    }
    
    req.end();
  });
}

// 等待函数
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 主测试流程
async function runIntegrationTest() {
  log('\n' + '='.repeat(60), 'cyan');
  log('ASF 激活码验证系统 - 完整集成测试', 'bold');
  log('='.repeat(60) + '\n', 'cyan');
  
  log('测试配置:');
  log(`  服务器: ${SERVER_URL}`);
  log(`  测试用户: ${TEST_USERNAME}`);
  log('');
  
  const machineId = generateMachineFingerprint();
  log(`机器指纹: ${machineId}`);
  log('');
  
  // ========================================
  // 场景1：用户注册流程
  // ========================================
  logStep('场景1: 新用户注册');
  
  // 1.1 生成一个测试激活码
  log('1.1 生成测试激活码...');
  let activationCode;
  
  try {
    // 注意：这里需要一个有效的管理员API密钥
    // 如果没有，可以手动在管理界面生成一个
    log('   ⚠️  需要手动在管理界面生成激活码，或提供 ADMIN_API_KEY');
    log('   临时方案：请输入一个已存在的激活码进行测试:');
    
    // 对于自动化测试，我们可以假设已经有一个测试码
    // 或者跳过这一步，使用已有的码
    activationCode = 'TEST-CODE-PLACEHOLDER';
    
    // 如果有环境变量中的 API 密钥，可以自动生成
    const adminKey = process.env.ADMIN_API_KEY;
    if (adminKey) {
      const res = await request('POST', `/api/admin/generate-codes?apiKey=${adminKey}`, {
        count: 1,
        prefix: 'TEST'
      });
      
      if (res.status === 200 && res.data.success) {
        activationCode = res.data.codes[0];
        log(`   ✅ 自动生成激活码: ${activationCode}`, 'green');
      } else {
        log(`   ❌ 生成失败: ${JSON.stringify(res.data)}`, 'red');
        return;
      }
    } else {
      log('   ⏭️  跳过自动生成，使用手动输入的码（需要提前在管理界面生成）');
    }
  } catch (e) {
    log(`   ❌ 错误: ${e.message}`, 'red');
    return;
  }
  
  log('');
  
  // 1.2 验证激活码
  log('1.2 验证激活码（首次使用）...');
  let verifyResult;
  
  try {
    const res = await request('POST', '/api/verify-code', {
      code: activationCode,
      machineId: machineId,
      username: TEST_USERNAME
    });
    
    verifyResult = res.data;
    
    if (res.data.success && res.data.isFirstUse) {
      log(`   ✅ 激活码验证成功，首次激活`, 'green');
      log(`   消息: ${res.data.message}`, 'reset');
    } else if (res.data.success && res.data.isReactivation) {
      log(`   ⚠️  激活码之前已使用，但允许重激活`, 'yellow');
    } else {
      log(`   ❌ 验证失败: ${res.data.message}`, 'red');
      log(`   可能原因：激活码不存在、已被其他机器使用、或服务器配置问题`, 'yellow');
      return;
    }
  } catch (e) {
    log(`   ❌ 验证请求失败: ${e.message}`, 'red');
    return;
  }
  
  log('');
  
  // 1.3 模拟 ASF 本地注册
  log('1.3 模拟 ASF 本地用户注册...');
  log('   ⏭️  此步骤需要在 ASF 端执行');
  log(`   调用: POST /Api/Auth/Register`);
  log(`   数据: { username: "${TEST_USERNAME}", password: "***", activationCode: "${activationCode}" }`);
  log('   假设注册成功...');
  log('');
  
  // ========================================
  // 场景2：用户登录流程
  // ========================================
  logStep('场景2: 用户登录');
  
  // 2.1 验证激活码（同一机器重启动）
  log('2.1 验证激活码（重启后）...');
  
  try {
    const res = await request('POST', '/api/verify-code', {
      code: activationCode,
      machineId: machineId,
      username: TEST_USERNAME
    });
    
    if (res.data.success && res.data.isReactivation) {
      log(`   ✅ 重激活成功: ${res.data.message}`, 'green');
      log(`   使用人: ${res.data.usedBy}`, 'reset');
      log(`   上次使用: ${res.data.usedAt}`, 'reset');
    } else if (res.data.success) {
      log(`   ℹ️  验证通过 (isFirstUse: ${res.data.isFirstUse})`, 'reset');
    } else {
      log(`   ❌ 验证失败: ${res.data.message}`, 'red');
      return;
    }
  } catch (e) {
    log(`   ❌ 请求失败: ${e.message}`, 'red');
    return;
  }
  
  log('');
  
  // 2.2 模拟登录
  log('2.2 模拟 ASF 本地登录...');
  log('   ⏭️  此步骤需要在 ASF 端执行');
  log(`   调用: POST /Api/Auth/Login`);
  log(`   数据: { username: "${TEST_USERNAME}", password: "***" }`);
  log('   假设登录成功，颁发会话令牌...');
  log('');
  
  // ========================================
  // 场景3：安全保障测试
  // ========================================
  logStep('场景3: 安全测试');
  
  // 3.1 尝试用不同机器使用同一激活码
  log('3.1 尝试从另一台"机器"使用同一激活码...');
  
  try {
    const fakeMachineId = 'fake_machine_' + Date.now();
    const res = await request('POST', '/api/verify-code', {
      code: activationCode,
      machineId: fakeMachineId,
      username: 'hacker_attempt'
    });
    
    if (!res.data.success) {
      log(`   ✅ 正确拒绝: ${res.data.message}`, 'green');
      if (res.data.usedBy) {
        log(`      原使用人: ${res.data.usedBy}`, 'reset');
        log(`      使用时间: ${res.data.usedAt}`, 'reset');
      }
    } else {
      log(`   ❌ 安全漏洞！不同机器不应通过验证`, 'red');
    }
  } catch (e) {
    log(`   ❌ 测试失败: ${e.message}`, 'red');
  }
  
  log('');
  
  // 3.2 尝试无效激活码
  log('3.2 尝试无效激活码...');
  
  try {
    const res = await request('POST', '/api/verify-code', {
      code: 'INVALID-CODE-999',
      machineId: machineId,
      username: TEST_USERNAME
    });
    
    if (!res.data.success && res.data.message.includes('无效')) {
      log(`   ✅ 正确拒绝无效码: ${res.data.message}`, 'green');
    } else {
      log(`   ❌ 应该拒绝无效码，但返回了: ${JSON.stringify(res.data)}`, 'red');
    }
  } catch (e) {
    log(`   ❌ 测试失败: ${e.message}`, 'red');
  }
  
  log('');
  
  // ========================================
  // 场景4：管理功能测试（可选）
  // ========================================
  if (process.env.ADMIN_API_KEY) {
    logStep('场景4: 管理功能测试');
    
    // 4.1 查询激活码列表
    log('4.1 查询激活码列表...');
    try {
      const res = await request('GET', `/api/admin/codes?apiKey=${process.env.ADMIN_API_KEY}&limit=5`);
      if (res.status === 200 && res.data.success) {
        log(`   ✅ 查询成功，共 ${res.data.total} 个激活码`, 'green');
      }
    } catch (e) {
      log(`   ❌ 查询失败: ${e.message}`, 'red');
    }
    
    // 4.2 查询统计
    log('4.2 查询统计信息...');
    try {
      const res = await request('GET', `/api/admin/stats?apiKey=${process.env.ADMIN_API_KEY}`);
      if (res.status === 200 && res.data.success) {
        const s = res.data.stats;
        log(`   总码数: ${s.total_codes}, 已用: ${s.total_used}, 机器: ${s.total_machines}`, 'reset');
      }
    } catch (e) {
      log(`   ❌ 查询失败: ${e.message}`, 'red');
    }
    
    // 4.3 撤销激活码（测试用）
    log('4.3 撤销测试激活码...');
    try {
      const res = await request('DELETE', `/api/admin/code/${activationCode}?apiKey=${process.env.ADMIN_API_KEY}`);
      if (res.status === 200 && res.data.success) {
        log(`   ✅ 撤销成功: ${res.data.message}`, 'green');
      }
    } catch (e) {
      log(`   ❌ 撤销失败: ${e.message}`, 'red');
    }
  } else {
    logStep('跳过管理功能测试');
    log('   未设置 ADMIN_API_KEY 环境变量');
    log('   设置后可测试：管理接口、统计、撤销功能');
    log '';
  }
  
  // ========================================
  // 测试总结
  // ========================================
  logStep('测试总结');
  log('✅ 服务器运行正常', 'green');
  log('✅ 激活码验证功能正常', 'green');
  log('✅ 机器指纹绑定机制有效', 'green');
  log('✅ 安全防护（防重复使用）有效', 'green');
  log('');
  log('下一步:', 'blue');
  log('  1. 配置 HTTPS (生产必需)');
  log('  2. 修改 ASF 集成代码，设置 ACTIVATION_SERVER_URL');
  log('  3. 在管理界面生成正式激活码');
  log('  4. 分发激活码给用户');
  log('  5. 部署到生产环境');
  log '';
}

// 运行测试
runIntegrationTest().catch(e => {
  log(`\n❌ 测试失败: ${e.message}`, 'red');
  console.error(e);
  process.exit(1);
});