@echo off
chcp 65001 >nul
title ASF 激活码服务器 - Windows 服务安装

echo ==================================
echo ASF 激活码服务器 Windows 服务安装
echo ==================================
echo.

REM 检查管理员权限
net session >nul 2>&1
if errorlevel 1 (
    echo ❌ 需要管理员权限运行此脚本
    echo 请右键选择"以管理员身份运行"
    pause
    exit /b 1
)

REM 检查 Node.js
where node >nul 2>nul
if errorlevel 1 (
    echo ❌ Node.js 未安装
    echo 请访问 https://nodejs.org 下载安装
    pause
    exit /b 1
)

echo ✅ Node.js 已安装

REM 检查 PM2
npm list -g pm2 >nul 2>&1
if errorlevel 1 (
    echo ⚠️  PM2 未安装，正在安装...
    npm install -g pm2
    if errorlevel 1 (
        echo ❌ PM2 安装失败
        pause
        exit /b 1
    )
    echo ✅ PM2 安装成功
) else (
    echo ✅ PM2 已安装
)

REM 设置工作目录
set "WORKDIR=%~dp0"
cd /d "%WORKDIR%"

REM 安装依赖
echo 📦 安装依赖...
call npm ci --only=production
if errorlevel 1 (
    echo ❌ 依赖安装失败
    pause
    exit /b 1
)

REM 检查 .env 文件
if not exist ".env" (
    echo ⚠️  未找到 .env 文件
    copy .env.example .env
    echo.
    echo ⚠️  请编辑 .env 文件，至少修改以下内容:
    echo   1. ADMIN_API_KEY - 设置管理员密钥
    echo   2. PORT - 端口 (默认 3000)
    echo.
    notepad .env
    echo.
    set /p CONTINUE=编辑完成后按 Enter 继续...
)

REM 创建数据目录
if not exist "data" mkdir data
if not exist "logs" mkdir logs

REM 检查端口占用
netstat -ano | findstr :3000 >nul
if not errorlevel 1 (
    echo ⚠️  端口 3000 已被占用
    echo 占用进程:
    netstat -ano | findstr :3000
    echo.
    set /p CHOICE=是否继续安装服务? (y/n): 
    if /i not "%CHOICE%"=="y" (
        echo 安装已取消
        pause
        exit /b 0
    )
)

REM 生成 windows 服务脚本
echo 生成 Windows 服务脚本...
set "SERVICE_JS=%WORKDIR%service.js"

(
echo const { import \}= require\('node:module'\)\; 
echo const \[path, service\] = process\.argv\.slice\(-2\)\;
echo const { createService } = await import\(path\)\;
echo createService\(service\)\.then\(\(s\) \=> s\.install\(\)\)\.catch\(console\.error\)\;
) > "%SERVICE_JS%"

REM 安装为 Windows 服务
echo 安装为 Windows 服务...
pm2 start server.js --name asf-activation
pm2 save
pm2 startup windows -u "%USERNAME%" --hp "%USERPROFILE%"

REM 检查服务状态
echo.
echo 正在检查服务状态...
timeout /t 3 /nobreak >nul
pm2 list

echo.
echo ==================================
echo 安装完成！
echo ==================================
echo.
echo 服务名称: asf-activation
echo 管理命令:
echo   pm2 start asf-activation      ^> 启动
echo   pm2 stop asf-activation       ^> 停止
echo   pm2 restart asf-activation    ^> 重启
echo   pm2 logs asf-activation       ^> 查看日志
echo   pm2 list                      ^> 查看状态
echo.
echo 管理界面:
echo   http://localhost:3000/admin.html
echo   或 http://127.0.0.1:3000/admin.html
echo.
echo 防火墙配置:
echo  netsh advfirewall firewall add rule name="ASF Activation" dir=in action=allow protocol=TCP localport=3000
echo.
echo 如果需要在外部网络访问，请:
echo  1. 配置路由器端口转发 (3000)
echo  2. 使用域名 + HTTPS (推荐用 Nginx 反向代理)
echo.
echo 重要: 生产环境必须配置 HTTPS！
echo   参考: https://github.com/JustArchiNET/ArchiSteamFarm/wiki/Reverse-proxy
echo.
pause