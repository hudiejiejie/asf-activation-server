# ASF 激活码在线验证系统

## 项目简介

为 ArchiSteamFarm (EA网络) 提供中央激活码验证服务，确保每个激活码只能被一人一次使用。

## 架构

```
用户ASF → 前端验证 → 中央API服务器 → SQLite数据库
```

## 功能

- ✅ 激活码在线验证
- ✅ 机器指纹绑定
- ✅ 防重复使用
- ✅ 管理员API
- ✅ 激活码生成
- ✅ 使用统计
- ✅ 完整审计日志

## 快速开始

### 1. 安装依赖
```bash
npm install
```

### 2. 配置环境变量
```bash
# 必须：设置管理员API密钥
export ADMIN_API_KEY="your-secure-random-key-here"

# 可选：自定义端口
export PORT=3000
```

### 3. 启动服务器
```bash
npm start
# 或使用 PM2
pm2 start server.js --name asf-activation
```

### 4. 生成激活码
```bash
# Web 管理界面
打开浏览器访问: http://localhost:3000/admin.html

# 或使用 API
curl -X POST http://localhost:3000/api/admin/generate-codes \
  -H "Content-Type: application/json" \
  -d '{"apiKey":"your-admin-key","count":50}'
```

### 5. 集成到 ASF
修改 `www/auth/login.html` 中的验证URL：
```javascript
const SERVER_URL = 'https://your-server.com'; // 改为您的服务器地址
```

## API 文档

### 验证激活码
```
POST /api/verify-code
Content-Type: application/json

{
  "code": "ABC-123-DEF",
  "machineId": "unique-machine-fingerprint",
  "username": "optional-username"
}

响应:
{
  "success": true,
  "message": "激活成功",
  "isFirstUse": true
}
```

### 管理接口（需API密钥）
```
POST /api/admin/generate-codes
GET  /api/admin/codes?code=ABC-123-DEF
```

## 安全建议

- ✅ 使用 HTTPS
- ✅ 设置强管理员密钥
- ✅ 启用防火墙限制端口
- ✅ 定期备份数据库
- ✅ 监控异常请求

## 许可证

MIT License

## 支持

如有问题，请查看日志或提交 Issue。