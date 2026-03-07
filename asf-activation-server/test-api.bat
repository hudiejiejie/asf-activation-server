@echo off
chcp 65001 >nul
title ASF 激活码服务器 API 测试

echo ==================================
echo ASF 激活码验证服务器 API 测试
echo ==================================
echo.

REM 检查 Node.js
where node >nul 2>nul
if errorlevel 1 (
    echo ❌ Node.js 未安装
    pause
    exit /b 1
)

REM 设置参数
set SERVER_URL=http://localhost:3000
set API_KEY=change-me-in-production

if not "%1"=="" set SERVER_URL=%1
if not "%2"=="" set API_KEY=%2

echo 服务器地址: %SERVER_URL%
echo API 密钥: %API_KEY:~0,10%...
echo.

REM 运行测试
node test-api.js %SERVER_URL% %API_KEY%

pause