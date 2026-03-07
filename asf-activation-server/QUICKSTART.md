# 🚀 ASF 激活码服务器 - 快速入门

**5 分钟快速部署指南**

---

## 📦 您将得到什么

一个完整的在线激活码验证系统，可以：
- ✅ 确保每个激活码只能使用一次
- ✅ 绑定机器指纹，防止共享
- ✅ 实时统计和监控
- ✅ Web 管理界面
- ✅ Docker 一键部署

---

## 📋 前置要求

- Node.js 18+ 或 Docker
- 一台公网可访问的服务器 (Linux 推荐)
- 域名（HTTPS 必需）

---

## ⚡ 5 分钟部署（Docker 方式，推荐）

### 1. 上传文件到服务器

将整个 `asf-activation-server` 文件夹上传到服务器 `/opt/asf-activation`

```bash
scp -r asf-activation-server user@your-server:/opt/
```

### 2. 配置环境变量

```bash
cd /opt/asf-activation-server
cp .env.example .env
nano .env
```

修改 `ADMIN_API_KEY` 为一个强随机密码：
```env
ADMIN_API_KEY=your-super-secure-random-key-change-this
```

### 3. 启动服务

```bash
# 使用 Docker Compose（最简单）
docker-compose up -d

# 或使用 Docker 直接
docker build -t asf-activation .
docker run -d \
  --name asf-activation \
  -p 3000:3000 \
  -e ADMIN_API_KEY=your-key \
  -v $(pwd)/data:/app/data \
  asf-activation
```

### 4. 配置 HTTPS (Nginx)

```bash
sudo nano /etc/nginx/sites-available/asf-activation
```

内容：
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

```bash
sudo ln -s /etc/nginx/sites-available/asf-activation /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 5. 访问管理界面

浏览器打开: `https://your-domain.com/admin.html`

使用您设置的 `ADMIN_API_KEY` 登录并生成激活码。

---

## 🔧 传统部署（非 Docker）

```bash
# 1. 安装依赖
npm ci --only=production

# 2. 配置环境
cp .env.example .env
nano .env  # 修改 ADMIN_API_KEY

# 3. 启动（前台）
npm start

# 或使用 PM2（推荐后台运行）
npm install -g pm2
pm2 start server.js --name asf-activation
pm2 save
pm2 startup
```

---

## 🔌 集成到 ASF

### 修改 ASF 前端文件

编辑 `publish-exe/www/auth/login.html`：

1. 找到 `</head>` 标签前，添加配置：

```javascript
// 在线验证配置
const ACTIVATION_SERVER_URL = 'https://your-domain.com';
```

2. 替换整个 `doRegister()` 函数：

参考 [INTEGRATION.md](./INTEGRATION.md) 中的完整代码。

3. (可选) 添加机器指纹生成函数：

```javascript
async function generateMachineFingerprint() {
  // ... 参见 INTEGRATION.md
}
```

4. 添加验证函数：

```javascript
async function verifyActivationCode(code, machineId, username) {
  // ... 参见 INTEGRATION.md
}
```

重新打包 ASF 即可使用。

---

## 🧪 测试

### 测试服务器是否正常运行

```bash
curl https://your-domain.com/api/health
# 应返回: {"status":"ok","timestamp":"..."}
```

### 运行完整 API 测试

```bash
node test-api.js https://your-domain.com YOUR_ADMIN_KEY
```

### 运行集成测试

```bash
# 先设置管理员密钥
export ADMIN_API_KEY=your-admin-key

# 运行集成测试
node asf-integration-test.js https://your-domain.com
```

---

## 📊 使用管理界面

访问 `https://your-domain.com/admin.html`

**主要功能：**
- 📈 统计面板（总数、已用、剩余、机器数）
- 🔢 生成激活码（批量、带前缀）
- 📋 激活码列表（搜索、导出、撤销）
- 💻 机器管理（查看注册机器）
- 📝 验证日志（实时监控）
- 📊 统计数据 API

---

## 🔐 安全建议

1. ✅ **必须使用 HTTPS** - 没有例外
2. ✅ 设置强 `ADMIN_API_KEY`（至少 32 位随机）
3. ✅ 启用防火墙，只开放 443/80 端口
4. ✅ 定期备份数据库 (`activation.db`)
5. ✅ 使用 PM2/systemd 确保服务持续运行
6. ✅ 监控日志，关注异常验证尝试
7. ✅ 限制管理员接口访问 IP（可选）

---

## 🆘 常见问题

### Q: 激活码验证失败怎么办？
A: 检查：
1. 服务器是否正常运行？→ `curl https://your-domain.com/api/health`
2. 管理员密钥是否正确？
3. 数据库文件权限是否正确？
4. 查看服务器日志：`pm2 logs asf-activation`

### Q: 用户说"激活码已被其他设备使用"？
A: 这是正常行为。可能原因：
1. 该激活码已被注册过
2. 用户重装系统导致机器指纹变化
3. 解决方案：在管理界面"撤销"该激活码，让用户重试

### Q: 如何批量生成激活码？
A:
1. 登录管理界面
2. 输入数量（最多 10000）
3. 可选前缀（如 `EA-`）
4. 生成后导出 CSV

### Q: 服务器宕机了怎么办？
A:
1. PM2 会自动重启（如果使用 PM2）
2. 检查日志：`pm2 logs`
3. 重装：`pm2 restart asf-activation`
4. systemd：`sudo systemctl restart asf-activation`

### Q: 如何升级服务器？
A:
```bash
cd /opt/asf-activation-server
git pull origin main  # 如果使用 Git
npm ci --only=production
pm2 restart asf-activation
```

---

## 📞 联系方式

- **文档:** [INTEGRATION.md](./INTEGRATION.md), [README.md](./README.md)
- **日志:** `pm2 logs asf-activation` 或 `tail -f logs/app.log`
- **问题反馈:** 请检查日志文件

---

## 🎯 下一步

1. ✅ 部署服务器到公网
2. ✅ 配置 HTTPS 证书
3. ✅ 在管理界面生成激活码
4. ✅ 修改 ASF 前端集成验证逻辑
5. ✅ 测试完整注册流程
6. ✅ 分批分发激活码给用户

---

**祝您部署顺利！** 🚀

如有问题，请查看详细文档 [INTEGRATION.md](./INTEGRATION.md)