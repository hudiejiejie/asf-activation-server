# 🆓 免费服务器部署指南

本指南说明如何将 ASF 激活码验证服务器免费部署到云端。

---

## 📊 免费平台对比

| 特性 | Railway | Render | 其他选项 |
|------|---------|--------|----------|
| **免费额度** | $5/月 (~1000小时) | 750小时/月 | - |
| **数据库** | ✅ SQLite (需挂载) | ✅ SQLite (需磁盘) | - |
| **HTTPS** | ✅ 自动 | ✅ 自动 | - |
| **自定义域名** | ✅ 免费 | ✅ 免费 | - |
| **休眠策略** | 15分钟不访问休眠 | 睡眠后需唤醒 | - |
| **构建时间** | ~5分钟 | ~3分钟 | - |
| **限制** | 并发sleep会暂停 | 免费实例会休眠 | - |
| **推荐度** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | - |

**结论：Railway 更适合，提供稳定 $5 免费额度，不会因休眠而完全停止**

---

## 🚀 方案一：Railway 部署（推荐）

### 前置要求

- GitHub 账号
- 项目已上传到 GitHub（或准备上传）

### 步骤 1：上传代码到 GitHub

```bash
cd asf-activation-server

# 初始化 Git（如果还没有）
git init
git add .
git commit -m "ASF activation server ready for deployment"

# 创建 GitHub 仓库并推送
# 在 https://github.com/new 创建仓库
git remote add origin https://github.com/YOUR_USERNAME/asf-activation-server.git
git branch -M main
git push -u origin main
```

### 步骤 2：连接 Railway

1. 访问 https://railway.app
2. 使用 GitHub 账号登录
3. 点击 **"New Project"**
4. 选择 **"Deploy from GitHub repo"**
5. 选择您的仓库 `asf-activation-server`

### 步骤 3：配置环境变量

Railway 会自动检测 `railway.json` 配置，但需要手动添加密钥：

在 Railway Dashboard 中：
1. 进入项目 → **"Variables"** 标签
2. 添加以下变量：

| Key | Value | 说明 |
|-----|-------|------|
| `ADMIN_API_KEY` | **生成一个强的随机字符串** | 管理员API密钥，必须修改！ |
| `DB_FILE` | `activation.db` | 数据库文件名（可选） |
| `NODE_ENV` | `production` | 环境变量 |
| `PORT` | `3000` | 端口（Railway 会自动设置） |

⚠️ **重要：** 不要将 `ADMIN_API_KEY` 设置为简单密码。生成方法：
```bash
# 在线生成：https://www.uuidgenerator.net/version4
# 或命令行：openssl rand -base64 32
# 或：node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 步骤 4：添加持久化磁盘（重要！）

SQLite 数据库需要持久化存储，否则重启会丢失数据：

1. Railway Dashboard → 您的项目
2. 点击 **"Settings"** → **"Disk"**
3. 点击 **"Add Volume"**
4. 配置：
   - **Mount Path**: `/data`
   - **Size**: 1 GB (免费额度)
5. 保存

**修改代码使用持久化路径：**

在 `server.js` 中，数据库路径需要调整。查找：
```javascript
const DB_FILE = process.env.DB_FILE || 'activation.db';
```

Railway 会自动将 `/data` 挂载到项目，我们需要修改路径为 `/data/activation.db`。

在 `server.js` 第 10 行左右，确保：
```javascript
const DB_FILE = process.env.DB_FILE || (process.env.RAILWAY_ENVIRONMENT ? '/data/activation.db' : 'activation.db');
```

或者更简单：修改 `server.js`：
```javascript
// 原始代码（line 10-12）:
const DB_FILE = process.env.DB_FILE || 'activation.db';

// 改为:
const DB_FILE = process.env.DB_FILE || (process.env.RAILWAY_STATIC_URL ? '/data/activation.db' : 'activation.db');
```

Railway 设置环境变量 `RAILWAY_STATIC_URL` 时，使用 `/data` 路径。

**实际上，最简单的方法：**

在 Railway Variables 中添加：
```
DB_FILE=/data/activation.db
```

这样无需修改代码！✅

### 步骤 5：部署

Railway 会自动检测 Git push 并触发部署：

1. 推送代码后，Railway 会自动开始构建
2. 查看进度：Dashboard → **"Deployments"**
3. 构建成功后，会显示 **"Deployment succeeded"**
4. 点击生成的域名（如 `asf-activation-server.up.railway.app`）

### 步骤 6：验证部署

#### 健康检查
```bash
curl https://your-project.up.railway.app/api/health
```
应返回：
```json
{"status":"ok","timestamp":"2026-03-08T..."}
```

#### 访问管理界面
```
https://your-project.up.railway.app/admin.html
```
输入您设置的 `ADMIN_API_KEY`，应该能看到管理界面。

#### 测试 API
```bash
# 生成测试激活码（需要 ADMIN_API_KEY）
curl -X POST "https://your-project.up.railway.app/api/admin/generate-codes?apiKey=YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"count":5,"prefix":"TEST"}'
```

### 步骤 7：获取正式域名

Railway 提供的免费域名格式：`项目名.up.railway.app`

如需自定义域名（免费）：
1. Railway Dashboard → Settings → Domains
2. 添加您的域名（如 `asf.yourdomain.com`）
3. 在 DNS 配置 CNAME 指向 `your-project.up.railway.app`
4. Railway 会自动配置 HTTPS

---

## 🚀 方案二：Render 部署

Render 也提供免费额度，但有以下限制：
- 免费 Web 服务每月 750 小时
- 实例会休眠（15分钟无请求休眠）
- 需要手动唤醒（访问一次）

### 步骤 1：上传代码到 GitHub

同上，确保代码在 GitHub 仓库中。

### 步骤 2：创建 Render 项目

1. 访问 https://render.com
2. 点击 **"New"** → **"Web Service"**
3. 连接您的 GitHub 仓库
4. 配置：
   - **Name**: `asf-activation-server`
   - **Environment**: `Node`
   - **Build Command**: `npm ci --only=production`
   - **Start Command**: `node server.js`
   - **Plan**: `Free`

### 步骤 3：添加环境变量

在 Render Dashboard → Service → **"Environment"**:

```
ADMIN_API_KEY=your-secure-key-here
DB_FILE=activation.db
NODE_ENV=production
PORT=3000
```

### 步骤 4：添加持久化磁盘

⚠️ **Render 免费版磁盘限制：**
- 免费实例只有临时磁盘（重启清空）
- 需要付费才能获得持久化磁盘（$7/月）

**解决方案（免费）：**
1. 使用外部数据库（如 Supabase PostgreSQL - 免费）
2. 定期备份到 GitHub/云存储
3. 或使用 Railway（更友好）

**如果需要持久化数据库，强烈建议使用 Railway。**

### 步骤 5：部署

点击 **"Create Web Service"**，Render 会自动构建和部署。

### 步骤 6：验证

查看日志，确认启动成功，访问 `https://your-service.onrender.com/api/health`

---

## 📋 部署检查清单

无论选择哪个平台，请确认：

- [x] `ADMIN_API_KEY` 已设置为强随机字符串
- [x] 数据库文件路径配置为持久化位置
- [x] HTTPS 正常工作（访问 `/api/health`）
- [x] 管理界面可以访问
- [x] 可以生成测试激活码
- [x] 验证 API 响应正确

---

## 🔐 重要安全提醒

### 1. 必须更改默认密钥

在 `DEPLOY_FREE.md` 中提到的 `ADMIN_API_KEY` 必须修改为强密码：

```bash
# 生成强密钥
openssl rand -base64 32
# 或
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2. 数据库备份

免费平台可能随时删除数据，请定期备份：

```bash
# 备份数据库
sqlite3 activation.db ".backup backup-$(date +%Y%m%d).db"

# 导出激活码列表
sqlite3 activation.db -header -csv "SELECT * FROM activation_codes" > codes.csv
```

建议设置定期备份脚本，上传到 Google Drive/Dropbox。

### 3. 使用限制

免费平台有以下限制：
- **Railway**: $5 免费额度约 1000 小时，足够 24/7 运行
- **Render**: 750 小时/月，会休眠
- **内存**: 512 MB - 1 GB
- **CPU**: 共享，性能有限
- **超时**: 15-30 分钟不访问可能休眠

### 4. 域名

免费平台提供随机子域名：
- Railway: `xxxx.up.railway.app`
- Render: `xxxx.onrender.com`

如需自定义域名，两者都支持免费 CNAME 记录，并自动提供 HTTPS 证书。

---

## 🧪 测试部署脚本

为了简化测试，我更新了 `test-api.js` 支持 Railway/Render 域名：

```bash
node test-api.js https://your-project.up.railway.app YOUR_ADMIN_KEY
```

完整集成测试：
```bash
set ADMIN_API_KEY=your-key
node asf-integration-test.js https://your-project.up.railway.app
```

---

## 📊 平台对比详细

### Railway
- ✅ $5 免费额度（约 1000 小时/月）
- ✅ 从不强制休眠
- ✅ 持久化磁盘（1GB 免费）
- ✅ 自动 HTTPS
- ✅ 支持自定义域名
- ⚠️ 需要绑定信用卡（但不扣费）
- ✅ 构建时间 ~5 分钟

### Render
- ✅ 完全免费（无信用卡）
- ✅ 自动 HTTPS
- ✅ 支持自定义域名
- ❌ 免费实例会休眠（15分钟无请求）
- ⚠️ 无持久化磁盘（需付费 $7/月）
- ❌ 750 小时/月限制
- ✅ 构建时间 ~3 分钟

### Fly.io
- ✅ 3 个免费虚拟机
- ✅ 持久化磁盘
- ✅ 全球 CDN
- ❌ CLI 工具复杂
- ⚠️ 需要信用卡

### Cyclic.sh
- ✅ 完全免费
- ✅ Node.js 支持
- ❌ 无持久化磁盘
- ❌ 无自定义域名
- ⚠️ 性能有限

**推荐选择：Railway**（最稳定，无需担心休眠）

---

## 📝 部署后操作

### 1. 生成首批激活码

访问管理界面，批量生成（如 100 个）激活码，导出 CSV。

### 2. 修改 ASF 前端

在 `login.html` 中设置：
```javascript
const ACTIVATION_SERVER_URL = 'https://your-project.up.railway.app';
```

### 3. 测试完整流程

1. 启动 ASF
2. 打开 Web 界面
3. 注册新用户，使用一个激活码
4. 验证管理界面显示统计更新
5. 尝试用不同机器使用同一码（应失败）

### 4. 监控

- 设置定时备份数据库
- 监控 Railway 使用量（避免超额）
- 关注错误日志

---

## 🆘 常见问题

### Q: Railway 构建失败？
A: 检查 `railway.json` 格式是否正确，查看构建日志。

### Q: 申请不到 Railway $5 额度？
A: Railway 需要绑定信用卡验证身份，但不会扣费。如果不想绑定信用卡，可用 Render（限制较多）。

### Q: 数据库丢失了怎么办？
A: 如果没有持久化磁盘，重启会清空数据库。需重新生成激活码。建议：
1. 使用 Railway + 持久化磁盘
2. 或使用 Render 但配置外部 PostgreSQL（Supabase 免费）

### Q: 可以部署到 Vercel 吗？
A: Vercel 主要用于静态站点，Serverless Functions 有 10 秒超时限制，不适合本应用（需要长时间运行数据库连接）。

### Q: 免费额度用完了怎么办？
A:
1. Railway: 可以升级到付费 ($5/月起)
2. Render: 下个月自动重置
3. 考虑部署到二手服务器/树莓派

---

## 🎯 推荐部署流程

1. **准备** - 确保代码在 GitHub
2. **选择** - Railway（稳定）或 Render（无需信用卡）
3. **部署** - 按本指南步骤 5-10 分钟完成
4. **配置** - 设置环境变量和数据库路径
5. **验证** - 健康检查、API 测试
6. **集成** - 修改 ASF 前端，测试注册
7. **监控** - 设置备份，关注使用量

---

## 📞 需要帮助？

如果部署遇到问题：
1. 检查 Railway/Render 日志
2. 确认环境变量正确
3. 验证数据库路径
4. 运行本地测试确保代码正常
5. 查看本指南的故障排除部分

---

**现在您可以：**
- ⬜ 选择平台（Railway 或 Render）
- ⬜ 上传代码到 GitHub
- ⬜ 创建项目并配置
- ⬜ 测试部署结果
- ⬜ 获取域名
- ⬜ 修改 ASF 集成

需要我帮您准备 GitHub 仓库文件吗？或者您想选择哪个平台开始部署？🚀