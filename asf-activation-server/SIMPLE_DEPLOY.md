# 🎯 极简部署 - 复制粘贴即用

这是最简单的部署方式，只需 **复制 5 行命令**。

---

## 方案：直接上传文件（无需 Git）

如果您不想用 Git，可以直接在 Render 网页上传文件：

---

### 步骤 1：压缩项目文件

1. 打开文件夹：`C:\Users\温洪杰\.openclaw\workspace\asf-activation-server`
2. 选中所有文件（Ctrl+A）
3. 右键 → 发送到 → 压缩文件夹
4. 命名为 `asf-activation-server.zip`

### 步骤 2：创建 Render 项目

1. 访问 https://dashboard.render.com/select-repo
2. 点击 **"Upload Files"**（或 "Manual Deploy"）
3. 上传 `asf-activation-server.zip`
4. Render 会自动解压并部署

### 步骤 3：配置（在网页表单中）

```
Name: asf-activation-server
Environment: Node
Build Command: npm ci --only=production
Start Command: node server.js
Plan: Free
```

### 步骤 4：环境变量

点击 **"Advanced"** → **"Environment Variables"** 添加：

```
NODE_ENV=production
PORT=3000
ADMIN_API_KEY=change-me-to-random-string
DB_FILE=activation.db
```

**修改 `ADMIN_API_KEY` 为一个随机字符串：**
```bash
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```
复制输出粘贴进去。

### 步骤 5：创建

点击 **"Create Web Service"**

等待 3-5 分钟，部署完成！

---

## 快速生成 ADMIN_API_KEY

打开 PowerShell 快速生成：

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

复制输出，粘贴到 Render 的 `ADMIN_API_KEY` 字段。

---

## 完成后的验证

1. Render 显示 **"Ready"** 绿色状态
2. 访问：`https://你的服务.onrender.com/api/health`
3. 应看到：`{"status":"ok","timestamp":"..."}`

4. 管理界面：`https://你的服务.onrender.com/admin.html`
5. 用刚才的 `ADMIN_API_KEY` 登录

---

## 简化版配置（环境变量一次性复制）

```
NODE_ENV=production
PORT=3000
ADMIN_API_KEY=这里粘贴生成的随机密钥
DB_FILE=activation.db
```

---

## ⚡ 2 分钟极速流程总结

1. ✅ 压缩文件夹为 ZIP
2. ✅ 访问 https://dashboard.render.com/select-repo
3. ✅ 上传 ZIP
4. ✅ 填写表单（Name + Build/Start Commands）
5. ✅ 添加 4 个环境变量
6. ✅ 点击 Create
7. ✅ 等待 5 分钟
8. ✅ 访问 `/api/health` 验证

---

**这就是最简单的方案，无需注册 Git，无需命令行，纯网页操作。**

有任何问题随时问我！🚀