# ASF 激活码服务器 - 全自动部署脚本
# 功能：推送代码到 GitHub + 创建 Render 项目（需用户授权一次）

param(
    [string]$GitHubToken,
    [string]$GitHubUsername,
    [string]$RepoName = "asf-activation-server"
)

# 颜色
Write-Host "`n==================================" -ForegroundColor Cyan
Write-Host "🚀 ASF 激活码服务器 - 全自动部署" -ForegroundColor White
Write-Host "==================================`n" -ForegroundColor Cyan

# 检查 Node.js
Write-Host "[1/6] 检查环境..." -ForegroundColor Yellow
if (!(Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Node.js 未安装，请先安装 Node.js 18+" -ForegroundColor Red
    exit 1
}
node --version
npm --version

# 项目路径
$projectPath = $PWD
Write-Host "📁 项目目录: $projectPath"

# 检查必要文件
$requiredFiles = @('server.js', 'package.json', 'admin.html')
foreach ($file in $requiredFiles) {
    if (!(Test-Path $file)) {
        Write-Host "❌ 缺失文件: $file" -ForegroundColor Red
        exit 1
    }
}

Write-Host "✅ 项目文件完整`n" -ForegroundColor Green

# 询问 GitHub 凭据
if (!$GitHubToken -or !$GitHubUsername) {
    Write-Host "[2/6] GitHub 认证" -ForegroundColor Yellow
    Write-Host "`n需要 GitHub Personal Access Token 才能自动创建仓库。"
    Write-Host "如果已有令牌，请输入；如果没有，请按 Ctrl+C 取消，然后创建。"
    Write-Host "创建令牌：https://github.com/settings/tokens`n"
    
    if (!$GitHubUsername) {
        $GitHubUsername = Read-Host "GitHub 用户名"
    }
    if (!$GitHubToken) {
        $GitHubToken = Read-Host "Personal Access Token"
    }
}

Write-Host "✅ GitHub 凭据已获取`n" -ForegroundColor Green

# 创建 GitHub 仓库
Write-Host "[3/6] 创建 GitHub 仓库..." -ForegroundColor Yellow

# 检查是否已存在
$repoCheck = Invoke-RestMethod -Uri "https://api.github.com/repos/$GitHubUsername/$RepoName" -Method Get -ErrorAction SilentlyContinue
if ($repoCheck) {
    Write-Host "⚠️  仓库已存在: $RepoName" -ForegroundColor Yellow
    $overwrite = Read-Host "是否覆盖? (y/N)"
    if ($overwrite -eq 'y') {
        # 删除仓库
        Invoke-RestMethod -Uri "https://api.github.com/repos/$GitHubUsername/$RepoName" -Method Delete -Headers @{Authorization = "token $GitHubToken"}
        Write-Host "已删除旧仓库" -ForegroundColor Yellow
        Start-Sleep -Seconds 3
    } else {
        Write-Host "跳过创建仓库" -ForegroundColor Yellow
    }
}

if (!$repoCheck -or $overwrite -eq 'y') {
    $repoData = @{
        name = $RepoName
        description = "ASF activation code verification server"
        private = $false
        auto_init = $false
    } | ConvertTo-Json

    $headers = @{
        Authorization = "token $GitHubToken"
        "User-Agent" = "ASF-Deploy-Script"
        "Content-Type" = "application/json"
    }

    try {
        $response = Invoke-RestMethod -Uri "https://api.github.com/user/repos" -Method Post -Headers $headers -Body $repoData
        Write-Host "✅ 仓库创建成功: $($response.html_url)" -ForegroundColor Green
        $repoUrl = $response.html_url
    } catch {
        Write-Host "❌ 创建仓库失败: $_" -ForegroundColor Red
        exit 1
    }
}

# 配置 Git 并推送
Write-Host "`n[4/6] 推送代码到 GitHub..." -ForegroundColor Yellow

# 配置 Git
git config user.name "ASF Deploy Bot"
git config user.email "deploy@asf-activation.local"

# 设置远程仓库（使用令牌认证）
$remoteUrl = "https://$GitHubToken@github.com/$GitHubUsername/$RepoName.git"
git remote remove origin 2>$null
git remote add origin $remoteUrl

# 推送
git add .
git commit -m "Deploy ASF activation server - $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
git push -f origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ 代码推送成功" -ForegroundColor Green
} else {
    Write-Host "❌ Git 推送失败" -ForegroundColor Red
    exit 1
}

# 生成随机管理员密钥
Write-Host "`n[5/6] 生成管理员密钥..." -ForegroundColor Yellow
$adminKey = & node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
Write-Host "🔑 ADMIN_API_KEY: $adminKey" -ForegroundColor Cyan
Write-Host "⚠️  请保存此密钥！将用于登录管理界面`n" -ForegroundColor Yellow

# 输出 Render 部署说明
Write-Host "[6/6] 部署到 Render`n" -ForegroundColor Yellow
Write-Host "==================================" -ForegroundColor Cyan
Write-Host "✅ GitHub 仓库已就绪！" -ForegroundColor Green
Write-Host "==================================`n" -ForegroundColor Cyan

Write-Host "📍 仓库地址: https://github.com/$GitHubUsername/$RepoName" -ForegroundColor White
Write-Host "🔑 管理员密钥: $adminKey" -ForegroundColor Cyan
Write-Host "`n🚀 下一步：创建 Render 项目`n" -ForegroundColor Yellow

Write-Host "1. 打开此链接: https://dashboard.render.com/select-repo" -ForegroundColor White
Write-Host "2. 连接 GitHub 账号（首次需要授权）" -ForegroundColor White
Write-Host "3. 选择仓库: $RepoName" -ForegroundColor White
Write-Host "4. 点击 Connect" -ForegroundColor White
Write-Host "`n配置 Render 服务：`n" -ForegroundColor Yellow

@"
Name:              asf-activation-server
Environment:       Node
Build Command:    npm ci --only=production
Start Command:    node server.js
Plan:             Free
"@ | Write-Host -ForegroundColor White

Write-Host "`n环境变量 (Environment Variables):`n" -ForegroundColor Yellow
@"
Key               Value
---               -----
NODE_ENV          production
PORT              3000
ADMIN_API_KEY     $adminKey
DB_FILE           activation.db
"@ | Write-Host -ForegroundColor White

Write-Host "`n5. 点击 'Create Web Service'" -ForegroundColor White
Write-Host "6. 等待 3-5 分钟部署完成" -ForegroundColor White
Write-Host "7. 访问: https://YOUR_SERVICE.onrender.com/api/health" -ForegroundColor White
Write-Host "8. 管理界面: https://YOUR_SERVICE.onrender.com/admin.html`n" -ForegroundColor White

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "📝 重要提醒" -ForegroundColor Yellow
Write-Host "==================================`n" -ForegroundColor Cyan
Write-Host "⚠️  Render 免费版限制：" -ForegroundColor Yellow
Write-Host "   • 15分钟无请求会休眠（首次访问需 30-60 秒唤醒）" -ForegroundColor White
Write-Host "   • 无持久化磁盘（重启后数据丢失）" -ForegroundColor White
Write-Host "   • 建议定期导出激活码备份" -ForegroundColor White
Write-Host "`n💡 长期建议：" -ForegroundColor Yellow
Write-Host "   • 升级 Render 付费版 (\$7/月，有持久化磁盘)" -ForegroundColor White
Write-Host "   • 或切换 Railway (\$5/月，更稳定，1GB 免费磁盘)" -ForegroundColor White
Write-Host "`n📖 详细文档: DECLOGO_AUTO_DEPLOY.md`n" -ForegroundColor Cyan

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "✅ 部署准备完成！" -ForegroundColor Green
Write-Host "==================================" -ForegroundColor Cyan
Write-Host "`n请按照上述步骤在 Render 创建项目。`n" -ForegroundColor White

# 保存密钥到文件
$info = @{
    repository = "https://github.com/$GitHubUsername/$RepoName"
    render_service_name = "asf-activation-server"
    admin_api_key = $adminKey
    deployment_date = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
} | ConvertTo-Json -Depth 10

$info | Out-File "DEPLOYMENT_INFO.json" -Encoding UTF8
Write-Host "📦 部署信息已保存到: DEPLOYMENT_INFO.json" -ForegroundColor Green

Write-Host "`n现在请打开 Render 完成最后一步！🚀`n" -ForegroundColor Yellow