#!/bin/bash

# ASF 激活码验证服务器 - 快速部署脚本
# 适用于 Linux/macOS

set -e

echo "=================================="
echo "ASF 激活码验证服务器部署脚本"
echo "=================================="
echo ""

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js 未安装，请先安装 Node.js 18+"
    exit 1
fi

NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js 版本过低，需要 18+，当前: $(node --version)"
    exit 1
fi

echo "✅ Node.js 版本: $(node --version)"

# 检查 npm
echo "✅ npm 版本: $(npm --version)"
echo ""

# 检查 .env 文件
if [ ! -f ".env" ]; then
    echo "⚠️  未找到 .env 文件，从模板创建..."
    cp .env.example .env
    echo ""
    echo "⚠️  请编辑 .env 文件，至少修改 ADMIN_API_KEY"
    echo "   使用命令: nano .env"
    read -p "按 Enter 继续安装依赖，或 Ctrl+C 退出编辑..."
fi

# 安装依赖
echo "📦 安装依赖..."
npm ci --only=production

# 创建数据目录
mkdir -p data logs

# 检查端口占用
if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "⚠️  端口 3000 已被占用"
    read -p "是否停止占用程序? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        lsof -ti:3000 | xargs kill -9 2>/dev/null || true
        sleep 2
    else
        echo "❌ 无法继续，请更改端口或停止占用程序"
        exit 1
    fi
fi

# 检查数据库
if [ ! -f "data/activation.db" ]; then
    echo "📝 初始化数据库..."
    node -e "require('./server.js')" &
    SERVER_PID=$!
    sleep 3
    kill $SERVER_PID 2>/dev/null || true
    wait $SERVER_PID 2>/dev/null || true
    echo "✅ 数据库初始化完成"
fi

# 启动服务
echo ""
echo "=================================="
echo "安装完成！"
echo "=================================="
echo ""
echo "启动方式："
echo "  1. 直接运行: npm start"
echo "  2. 使用 PM2: pm2 start server.js --name asf-activation"
echo "  3. Docker: docker-compose up -d"
echo ""
echo "管理界面:"
echo "  http://localhost:3000/admin.html"
echo ""
echo "测试 API:"
echo "  curl http://localhost:3000/api/health"
echo ""
echo "查看日志:"
echo "  npm start  # 前台运行，查看控制台"
echo "  pm2 logs asf-activation  # PM2 方式"
echo "  tail -f logs/app.log  # 自定义日志"
echo ""
echo "停止服务:"
echo "  Ctrl+C (前台运行)"
echo "  pm2 stop asf-activation (PM2)"
echo "  docker-compose down (Docker)"
echo ""

read -p "是否现在启动服务? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🚀 启动服务..."
    npm start
fi