# 🚀 全自动部署脚本 - 只需一个命令

本方案使用 **Render** 免费托管，无需信用卡，完全自动。

---

## 📋 部署前准备（2分钟）

### 1. 创建 GitHub 仓库

打开 https://github.com/new

填写：
- Repository name: `asf-activation-server`
- Description: `ASF activation code verification server`
- **Public** (必须)
- ✅ Add a README file

点击 **"Create repository"**

### 2. 获取个人访问令牌（Personal Access Token）

1. 访问 https://github.com/settings/tokens
2. 点击 **"Generate new token"** → **"Fine-grained tokens"**
3. 填写：
   - Token name: `asf-deploy-2024`
   - Expiration: No expiration
   - Repository access: 选择刚才创建的 `asf-activation-server`
   - Permissions:
     - ✅ Contents: Read and write
     - ✅ Metadata: Read-only
4. 点击 **"Generate token"**
5. **复制令牌**（只显示一次！保存好）

---

## ⚡ 一键部署

### Windows 用户（推荐）

```powershell
# 1. 进入项目目录
cd C:\Users\温洪杰\.openclaw\workspace\asf-activation-server

# 2. 运行自动化部署脚本
powershell -ExecutionPolicy Bypass -File .\auto-deploy.ps1
```

脚本将自动：
1. ✅ 配置 Git
2. ✅ 推送代码到 GitHub
3. ✅ 创建 Render 项目（需您授权一次）
4. ✅ 配置环境变量
5. ✅ 等待部署完成
6. ✅ 输出最终访问地址

---

### 手动部署（如果脚本失败）

如果自动化脚本有问题，可以手动操作：

#### 步骤 1: 推送代码到 GitHub

```bash
cd C:\Users\温洪杰\.openclaw\workspace\asf-activation-server

# 如果已有 Git 配置
git remote set-url origin https://YOUR_GITHUB_USERNAME:YOUR_TOKEN@github.com/YOUR_GITHUB_USERNAME/asf-activation-server.git
git push -f origin main
```

替换：
- `YOUR_GITHUB_USERNAME` - 您的 GitHub 用户名
- `YOUR_TOKEN` - 刚才生成的 Personal Access Token

#### 步骤 2: 在 Render 创建项目

1. 访问 https://dashboard.render.com/select-repo
2. 连接您的 GitHub 账号（首次需要授权）
3. 选择仓库 `asf-activation-server`
4. 点击 **"Connect"**

#### 步骤 3: 配置 Render 服务

填写配置：

| 字段 | 值 |
|------|-----|
| **Name** | `asf-activation-server` |
| **Environment** | `Node` |
| **Build Command** | `npm ci --only=production` |
| **Start Command** | `node server.js` |
| **Plan** | `Free` |

**Environment Variables** 添加：

| Key | Value |
|-----|-------|
| `NODE_ENV` | `production` |
| `PORT` | `3000` |
| `ADMIN_API_KEY` | **留空（自动生成）** |
| `DB_FILE` | `activation.db` |

点击 **"Create Web Service"**

#### 步骤 4: 等待部署

- 构建时间：3-5 分钟
- 查看日志：Render Dashboard → Logs
- 成功后显示绿色 "Ready"

#### 步骤 5: 获取管理员密钥

部署完成后，Render 会自动生成 `ADMIN_API_KEY` 环境变量。

**查找密钥：**
1. Render Dashboard → 您的服务 → **"Environment"**
2. 找到 `ADMIN_API_KEY`，复制其值
3. **保存好这个密钥**（用于登录管理界面）

---

## ✅ 验证部署

### 1. 健康检查

```bash
# 替换 YOUR_SERVICE 为您的 Render 域名
curl https://YOUR_SERVICE.onrender.com/api/health
```

应返回：
```json
{"status":"ok","timestamp":"2026-03-08T..."}
```

### 2. 访问管理界面

```
https://YOUR_SERVICE.onrender.com/admin.html
```

使用 `ADMIN_API_KEY` 登录。

### 3. 生成测试激活码

在管理界面：
1. 输入数量：`10`
2. 可选前缀：`TEST-`
3. 点击 **"生成激活码"**
4. 复制生成的激活码

### 4. 测试 API

```bash
# 使用刚才生成的 admin key
curl -X POST "https://YOUR_SERVICE.onrender.com/api/admin/generate-codes?apiKey=YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"count":5,"prefix":"AUTO"}'
```

---

## 🔌 集成到 ASF

### 修改 ASF 前端

编辑 `C:\Users\温洪杰\Desktop\程希希\项目\EA网络\ArchiSteamFarm-main\ArchiSteamFarm-main\publish-exe\www\auth\login.html`

找到 `</head>` 前，添加：

```html
<script>
// ============================================
// 在线激活码验证配置
// ============================================
const ACTIVATION_SERVER_URL = 'https://YOUR_SERVICE.onrender.com';
</script>
```

替换 `doRegister()` 函数：

参考之前提供的完整代码，或查看 `INTEGRATION.md`

### 测试完整流程

1. 启动 ASF（`ArchiSteamFarm.exe`）
2. 打开浏览器访问 ASF Web 界面
3. 点击"注册用户"
4. 输入：
   - Username: `testuser123`
   - Password: 任意密码
   - Activation Code: 刚才生成的测试码
5. 点击 Register
6. 应看到：
   - "正在验证激活码..."
   - "激活码有效，正在创建账户..."
   - "注册成功！请登录"
7. 返回管理界面查看统计更新

---

## 📊 管理您的服务器

### 访问管理界面

```
https://YOUR_SERVICE.onrender.com/admin.html
```

功能：
- 📈 实时统计
- 🔢 生成激活码（批量）
- 📋 查看使用记录
- 💻 机器管理
- 📝 验证日志

### API 调用示例

```bash
# 生成激活码
curl -X POST "https://YOUR_SERVICE.onrender.com/api/admin/generate-codes?apiKey=YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"count":100,"prefix":"EA"}'

# 查询统计
curl "https://YOUR_SERVICE.onrender.com/api/admin/stats?apiKey=YOUR_KEY"

# 查询激活码列表
curl "https://YOUR_SERVICE.onrender.com/api/admin/codes?apiKey=YOUR_KEY&limit=20"
```

---

## ⚠️ Render 免费版限制须知

### 休眠问题
- 免费实例 **15分钟无请求后会休眠**
- 首次访问需要 30-60 秒唤醒
- 不影响功能，但首次验证会慢

### 数据持久化
- ⚠️ **免费版无持久化磁盘**
- 重启/休眠后数据库清空
- 需要定期：
  1. 导出激活码列表（CSV）
  2. 备份数据库文件（手动下载）
  3. 重新生成激活码分发

### 解决持久化问题（2个方案）

**方案 A：使用 Render 付费版（$7/月）**
- 提供 1GB 持久化磁盘
- 永不丢失数据
- 无需手动备份

**方案 B：切换到 Railway（推荐长期使用）**
- $5/月 ≈ 1000 小时（24/7 运行）
- 1GB 免费持久化磁盘
- 更稳定，不会休眠

**方案 C：备用策略（免费）**
- 定期导出激活码到本地
- 发生数据丢失时重新导入
- 接受每月重建一次数据库

---

## 🔄 自动化备份脚本（免费版补救）

创建 `backup-codes.js`：

```javascript
const https = require('https');
const fs = require('fs');

const SERVER = 'https://YOUR_SERVICE.onrender.com';
const API_KEY = 'YOUR_ADMIN_KEY';

function backup() {
  https.get(`${SERVER}/api/admin/codes?apiKey=${API_KEY}&limit=10000`, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try {
        const json = JSON.parse(data);
        if (json.success) {
          const csv = 'code,status,used_by,used_at,machine_id,created_at\n' +
            json.codes.map(c => [
              c.code,
              c.used ? 'used' : 'available',
              c.used_by || '',
              c.used_at || '',
              c.machine_id || '',
              c.created_at || ''
            ].join(',')).join('\n');
          fs.writeFileSync(`backup-${Date.now()}.csv`, csv);
          console.log('✅ Backup saved');
        }
      } catch (e) {
        console.error('Backup failed:', e);
      }
    }
  });
}

backup();
```

每天运行一次：
```bash
# Windows 任务计划程序
# 每天 2:00 AM 运行
node backup-codes.js
```

---

## 📈 监控和日志

### 查看实时日志

Render Dashboard → 您的服务 → **"Logs"**

监控关键词：
- `ERROR` - 错误
- `verification` - 验证记录
- `Registration` - 注册事件

### 设置错误告警（可选）

使用 Render Alerts：
1. Dashboard → Alerts
2. Add Alert
3. 当 Error 频率 > 10/分钟时发送邮件

---

## 🆘 故障排除

### 问题：部署失败
**解决：**
- 检查 `package.json` 是否正确
- 查看 Render Logs 的具体错误
- 确认 `Build Command` 为 `npm ci --only=production`

### 问题：数据库为空
**原因：** Render 免费版无持久化
**解决：**
- 定期手动备份
- 或升级到付费版
- 或迁移到 Railway

### 问题：API 返回 500
**解决：**
```bash
# 查看服务器日志
Render Dashboard → Logs

# 常见原因：
# 1. ADMIN_API_KEY 未设置 - 在 Environment 添加
# 2. 数据库文件权限 - 确保 DB_FILE=activation.db
# 3. 端口冲突 - 确保使用 PORT=3000
```

### 问题：HTTPS 证书未生效
**解决：**
- Render 自动提供 HTTPS
- 等待 5-10 分钟
- 使用 `https://` 而不是 `http://`

---

## 📞 支持资源

- **Render 文档**: https://render.com/docs
- **GitHub 问题**: 在仓库创建 Issue
- **查看日志**: Render Dashboard → Logs

---

## 🎯 下一步行动

1. **现在立即执行**：
   - 创建 GitHub 仓库
   - 运行 `auto-deploy.ps1`（或手动步骤）

2. **部署完成后**：
   - 获取 `ADMIN_API_KEY`
   - 访问管理界面生成激活码
   - 修改 ASF 前端代码

3. **测试部署**：
   - 用 test API 验证功能
   - 完整注册流程测试

4. **生产准备**：
   - 决定长期方案（Railway vs Render付费）
   - 设置备份策略
   - 文档化密钥和域名

---

## 📝 我需要您做的

**只需 2 件简单的事：**

1. 在 https://github.com/new 创建仓库（公开）
2. 运行 PowerShell 脚本（或按手动步骤操作）

**剩下的全部自动化！**

---

**现在请：**

1. 创建 GitHub 仓库
2. 告诉我仓库地址（如：`https://github.com/yourname/asf-activation-server`）
3. 运行 `auto-deploy.ps1`
4. 有任何问题立即告诉我

我会在您运行脚本时协助解决任何问题！🚀