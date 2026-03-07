@echo off
chcp 65001 >nul
title ASF 激活码验证服务器部署

echo ==================================
echo ASF 激活码验证服务器部署脚本
echo ==================================
echo.

REM 检查 Node.js
where node >nul 2>nul
if errorlevel 1 (
    echo ❌ Node.js 未安装，请先安装 Node.js 18+
    pause
    exit /b 1
)

REM 检查 Node.js 版本
for /f "tokens=*" %%i in ('node --version') do set NODE_VER=%%i
echo ✅ Node.js 版本: %NODE_VER%

REM 检查 npm
for /f "tokens=*" %%i in ('npm --version') do set NPM_VER=%%i
echo ✅ npm 版本: %NPM_VER%
echo.

REM 检查 .env 文件
if not exist ".env" (
    echo ⚠️  未找到 .env 文件，从模板创建...
    copy .env.example .env >nul
    echo.
    echo ⚠️  请编辑 .env 文件，至少修改 ADMIN_API_KEY
    echo   使用命令: notepad .env
    pause
)

REM 安装依赖
echo 📦 安装依赖...
call npm ci --only=production
if errorlevel 1 (
    echo ❌ 依赖安装失败
    pause
    exit /b 1
)

REM 创建数据目录
if not exist "data" mkdir data
if not exist "logs" mkdir logs

REM 检查端口占用
netstat -ano | findstr :3000 >nul
if not errorlevel 1 (
    echo ⚠️  端口 3000 已被占用
    set /p CHOICE=是否停止占用程序? (y/n): 
    if /i "%CHOICE%"=="y" (
        for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000') do (
            taskkill /PID %%a /F >nul 2>nul
        )
        timeout /t 2 >nul
    ) else (
        echo ❌ 无法继续，请更改端口或停止占用程序
        pause
        exit /b 1
    )
)

REM 初始化数据库
if not exist "data\activation.db" (
    echo 📝 初始化数据库...
    start "" /B node server.js
    timeout /t 5 /nobreak >nul
    taskkill /FI "WINDOWTITLE eq ASF*" /F >nul 2>nul
    echo ✅ 数据库初始化完成
)

echo.
echo ==================================
echo 安装完成！
echo ==================================
echo.
echo 启动方式：
echo   1. 直接运行: npm start
echo   2. 使用 PM2: pm2 start server.js --name asf-activation
echo   3. Docker: docker-compose up -d
echo.
echo 管理界面：
echo   http://localhost:3000/admin.html
echo.
echo 测试 API：
echo   curl http://localhost:3000/api/health
echo.
echo 查看日志：
echo   npm start          ^> 前台运行，查看控制台
echo   pm2 logs asf-activation  ^> PM2 方式
echo   type logs\*.log    ^> 查看日志文件
echo.
echo 停止服务：
echo   Ctrl+C (前台运行)
echo   pm2 stop asf-activation (PM2)
echo   docker-compose down (Docker)
echo.

set /p START_NOW=是否现在启动服务? (y/n): 
if /i "%START_NOW%"=="y" (
    echo 🚀 启动服务...
    npm start
)

pause