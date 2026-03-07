# ASF 激活码验证系统集成指南

## 概述

本指南说明如何将在线验证服务器集成到您的 ASF 发布版本 (`publish-exe`) 中。

---

## 架构说明

```
┌─────────────────┐
│   ASF 前端      │ (www/auth/login.html)
│   + custom.js   │
└────────┬────────┘
         │ POST /api/verify-code
         ▼
┌─────────────────┐
│  验证服务器     │ (Node.js + SQLite)
│  server.js      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  中央数据库      │ (activation.db)
│  - 激活码状态    │
│  - 机器指纹      │
│  - 验证日志      │
└─────────────────┘
```

---

## 步骤1：部署验证服务器

### 1.1 准备服务器

您需要一个公网可访问的服务器（VPS/云主机）。

**最低配置：**
- CPU: 1核
- 内存: 512 MB
- 磁盘: 1 GB
- 系统: Linux (Ubuntu 20.04+) 或 Windows Server

### 1.2 安装 Node.js

```bash
# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 验证安装
node --version  # 应显示 v18.x 或更高
npm --version
```

### 1.3 上传服务器文件

将 `asf-activation-server` 文件夹上传到服务器，例如 `/opt/asf-activation`

```bash
sudo mkdir -p /opt/asf-activation
# 上传所有文件到该目录
```

### 1.4 安装依赖

```bash
cd /opt/asf-activation
npm ci --only=production
```

### 1.5 配置环境变量

```bash
cp .env.example .env
nano .env
```

**必须修改:**
```env
ADMIN_API_KEY=your-secure-random-string-here
```

**建议:**
```bash
# 生成一个安全的随机密钥
openssl rand -base64 32
```

### 1.6 配置 HTTPS (强制要求！)

**选项A：使用 Let's Encrypt (推荐)**

```bash
# 安装 Certbot
sudo apt-get install certbot

# 获取证书
sudo certbot certonly --standalone -d your-domain.com

# 证书通常位于
# /etc/letsencrypt/live/your-domain.com/fullchain.pem
# /etc/letsencrypt/live/your-domain.com/privkey.pem
```

然后配置 Nginx 反向代理：

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

**选项B：使用云服务商证书**
- 在阿里云/腾讯云/AWS 申请免费 SSL 证书
- 上传证书到服务器并配置 Nginx

### 1.7 启动服务器

```bash
# 使用 PM2 (推荐，自动重启)
sudo npm install -g pm2
pm2 start server.js --name asf-activation
pm2 save
pm2 startup  # 设置开机自启

# 或使用 systemd
sudo nano /etc/systemd/system/asf-activation.service
```

systemd 配置示例：
```ini
[Unit]
Description=ASF Activation Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/asf-activation
Environment=NODE_ENV=production
EnvironmentFile=/opt/asf-activation/.env
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable asf-activation
sudo systemctl start asf-activation
sudo systemctl status asf-activation
```

### 1.8 验证服务器运行

```bash
curl https://your-domain.com/api/health
# 应返回: {"status":"ok","timestamp":"..."}
```

访问管理界面：
- 浏览器打开: `https://your-domain.com/admin.html`
- 输入您的 `ADMIN_API_KEY`

---

## 步骤2：修改 ASF 前端

### 2.1 编辑 login.html

找到 `publish-exe/www/auth/login.html`，在 `<script>` 部分添加：

```javascript
// ============================================
// 在线激活码验证配置
// ============================================

// 修改为您的服务器地址
const ACTIVATION_SERVER_URL = 'https://your-domain.com';

/**
 * 生成机器指纹
 * 使用多种浏览器特征生成唯一ID
 */
async function generateMachineFingerprint() {
  const components = [
    // 屏幕信息
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
    
    // 时区
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown',
    
    // 语言
    navigator.language || navigator.userLanguage || 'unknown',
    
    // User Agent
    navigator.userAgent,
    
    // 平台
    navigator.platform,
    
    // CPU 核心数（部分浏览器支持）
    navigator.hardwareConcurrency || 'unknown',
    
    // 设备内存（部分浏览器支持）
    navigator.deviceMemory || 'unknown',
    
    // Canvas 指纹（更稳定）
    getCanvasFingerprint()
  ];
  
  // 生成哈希
  const str = components.join('|');
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return `web_${hashHex.substring(0, 16)}`;
}

/**
 * Canvas 指纹生成（辅助）
 */
function getCanvasFingerprint() {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // 绘制测试文本
    const txt = 'ASF Activation v1.0';
    ctx.textBaseline = 'top';
    ctx.font = '14px "Arial"';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.fillText(txt, 2, 15);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.fillText(txt, 4, 17);
    
    return canvas.toDataURL().substring(0, 100);
  } catch (e) {
    return 'canvas_error';
  }
}

/**
 * 验证激活码（与服务器通信）
 */
async function verifyActivationCode(code, machineId, username) {
  try {
    const response = await fetch(`${ACTIVATION_SERVER_URL}/api/verify-code`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        code: code.trim().toUpperCase(),
        machineId: machineId,
        username: username || 'unknown'
      })
    });
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('激活码验证失败:', error);
    return {
      success: false,
      message: '无法连接到验证服务器，请检查网络连接'
    };
  }
}

// ============================================
// 修改 doRegister 函数
// ============================================

// 找到原来的 doRegister() 函数，完全替换为：

function doRegister() {
  var u = document.getElementById('regUsername').value.trim();
  var p = document.getElementById('regPassword').value;
  var c = document.getElementById('regCode').value.trim();
  
  if (!u || !p || !c) {
    showMsg('请填写所有字段', false);
    return;
  }
  
  // 第一步：在线验证激活码
  showMsg('正在验证激活码...', true);
  
  // 生成机器指纹
  generateMachineFingerprint().then(function(machineId) {
    // 调用在线验证
    verifyActivationCode(c, machineId, u).then(function(verifyResult) {
      if (!verifyResult.success) {
        showMsg(verifyResult.message || '激活码验证失败', false);
        return;
      }
      
      // 激活码有效，继续本地注册
      showMsg('激活码有效，正在创建账户...', true);
      
      fetch('/Api/Auth/Register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, password: p, activationCode: c })
      })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (d.Success) {
          showMsg('注册成功！请登录', true);
          setTimeout(function() { switchTab('login'); }, 1500);
        } else {
          showMsg(d.Message || '注册失败', false);
        }
      })
      .catch(function() {
        showMsg('注册请求失败', false);
      });
    });
  }).catch(function(err) {
    showMsg('机器指纹生成失败: ' + err.message, false);
  });
}
```

### 2.2 测试修改

```bash
# 启动 ASF 测试
cd publish-exe
./ArchiSteamFarm.exe

# 打开浏览器访问
# http://localhost:5000  (或 ASF 实际端口)
# 尝试注册，应看到激活码验证流程
```

---

## 步骤3：生成和分发激活码

### 3.1 生成激活码

访问管理界面 `https://your-domain.com/admin.html`，使用您设置的 `ADMIN_API_KEY` 登录。

**生成方法：**
1. 输入数量（如：50）
2. 可选前缀（如：EA-）
3. 点击"生成激活码"
4. 复制生成的激活码列表

### 3.2 分发激活码

将激活码通过安全渠道分发给用户（如：邮件、加密消息）。

**建议：**
- 每个用户一个激活码
- 记录哪个用户领取了哪个码（方便追踪）
- 建议批量生成，分批发货

### 3.3 监控使用情况

在管理界面可以：
- ✅ 查看哪些激活码已使用
- ✅ 查看使用人和机器信息
- ✅ 查看验证日志
- ✅ 统计使用率
- ✅ 撤销异常激活码

---

## 步骤4：生产环境检查清单

### 安全性
- [ ] 服务器已配置 HTTPS (Nginx/Apache + SSL)
- [ ] ADMIN_API_KEY 已设置为强随机字符串
- [ ] 防火墙只开放必要端口（443/80）
- [ ] 数据库定期备份（`sqlite3 activation.db ".backup backup.db"`）
- [ ] 服务器系统定期更新

### 可用性
- [ ] 使用 PM2 或 systemd 确保服务持续运行
- [ ] 设置了日志轮转（logrotate）
- [ ] 监控服务器资源使用
- [ ] 配置了错误报警（可选）

### 性能
- [ ] 如果激活码量大（>10万），考虑 PostgreSQL/MySQL
- [ ] 启用 Redis 缓存验证结果（可选）
- [ ] CDN 加速静态资源（如果需要）

### 用户体验
- [ ] 验证超时时间合理（建议 10秒）
- [ ] 错误消息清晰友好
- [ ] ASF 前端显示验证进度
- [ ] 网络失败时有重试机制（可选）

---

## 故障排除

### 问题1：验证超时
```
激活码验证失败：网络错误
```
**解决：**
- 检查服务器防火墙，确保端口开放
- 检查 ASF 端能否访问公网
- 检查服务器是否运行：`curl https://your-domain.com/api/health`

### 问题2：HTTPS 证书错误
**解决：**
- 确保证书有效：`openssl x509 -in certificate.crt -text`
- 确保证书链完整
- 重启 Nginx: `sudo systemctl reload nginx`

### 问题3：激活码全部显示"已使用"
**可能原因：**
- 数据库文件损坏
- 多个服务器实例运行（数据不同步）

**解决：**
```bash
# 检查数据库
sqlite3 activation.db "SELECT code, used FROM activation_codes LIMIT 5;"

# 如果数据异常，从备份恢复
# 或者导出有效激活码重新导入
```

### 问题4：同一激活码多人使用
**说明：** 这是本系统的预期防御结果。
如果两个不同机器使用同一码，后一个会收到"已被其他设备使用"错误。

**特殊情况：**
- 用户重装系统 → 机器指纹变化 → 会被当作新机器
- 解决方案：在管理界面"撤销"该激活码，让用户重新激活

### 问题5：机器指纹不稳定
**原因：** 浏览器指纹依赖浏览器特征，某些因素会改变：
- 浏览器升级
- 分辨率改变
- User Agent 改变

**缓解：**
- 改进 `generateMachineFingerprint()` 函数，使用更稳定的指纹
- 考虑使用服务器端会话而非纯机器指纹
- 对于重装系统用户，提供"重置激活"功能（需要管理员手动撤销）

---

## API 参考

### 验证激活码
```
POST /api/verify-code
Content-Type: application/json

{
  "code": "ABC-123-DEF",
  "machineId": "web_abc123def456",
  "username": "user123"
}

响应:
{
  "success": true/false,
  "message": "操作结果描述",
  "isFirstUse": true/false,  // 是否首次激活
  "isReactivation": false,  // 是否重新激活
  "usedBy": "username",     // 已使用时的使用人
  "usedAt": "timestamp"     // 已使用时的使用时间
}
```

### 生成激活码
```
POST /api/admin/generate-codes
Authorization: 通过 query 参数 ?apiKey=YOUR_KEY
Content-Type: application/json

{
  "count": 50,
  "prefix": "EA"
}
```

### 查询激活码
```
GET /api/admin/codes?apiKey=YOUR_KEY&page=1&limit=50&code=ABC
```

### 查询机器
```
GET /api/admin/machines?apiKey=YOUR_KEY&machineId=web_abc123
```

### 统计信息
```
GET /api/admin/stats?apiKey=YOUR_KEY
```

---

## 升级和维护

### 定期备份
```bash
# 每天备份数据库
0 2 * * * sqlite3 /opt/asf-activation/activation.db ".backup /backup/activation-$(date +\%Y\%m\%d).db"

# 压缩旧备份
0 3 * * * find /backup -name "activation-*.db" -mtime +30 -delete
```

### 更新服务器代码
```bash
cd /opt/asf-activation
git pull origin main  # 如果使用 Git
npm ci --only=production
pm2 restart asf-activation
```

### 监控
```bash
# 查看日志
pm2 logs asf-activation

# 查看实时验证统计
curl https://your-domain.com/api/admin/stats?apiKey=YOUR_KEY
```

---

## 许可证

MIT License - 可自由使用、修改、分发

---

## 支持和反馈

如有问题，请检查：
1. 服务器日志 (`pm2 logs`)
2. 数据库状态
3. 网络连接

---

**最后更新：** 2026-03-08
**版本：** 1.0.0