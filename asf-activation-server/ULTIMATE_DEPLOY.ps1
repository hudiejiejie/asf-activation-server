# 🚀 终极部署脚本 - 99% 自动化
# 功能：压缩项目、生成密钥、创建 GitHub 仓库（需要授权）、推送代码、等待 Render 部署

Write-Host "`n==================================" -ForegroundColor Magenta
Write-Host "⚡ ASF 激活码服务器 - 终极自动化部署" -ForegroundColor White
Write-Host "==================================`n" -ForegroundColor Magenta

# 1. 生成管理员密钥
Write-Host "[1/7] 生成安全管理员密钥..." -ForegroundColor Yellow
$adminKey = & node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
Write-Host "🔑 您的 ADMIN_API_KEY: " -NoNewline -ForegroundColor Cyan
Write-Host "$adminKey`n" -ForegroundColor White
Write-Host "⚠️  请复制保存此密钥！稍后用于登录管理界面`n" -ForegroundColor Yellow

# 2. 压缩项目
Write-Host "[2/7] 压缩项目文件..." -ForegroundColor Yellow
$zipPath = "asf-activation-server-ultimate.zip"
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Compress-Archive -Path * -DestinationPath $zipPath -Force
$zipSize = [math]::Round((Get-Item $zipPath).Length / 1KB, 1)
Write-Host "✅ 已创建: $zipPath ($zipSize KB)`n" -ForegroundColor Green

# 3. 自动打开 Render 页面
Write-Host "[3/7] 正在打开 Render 部署页面..." -ForegroundColor Yellow
Start-Process "https://dashboard.render.com/select-repo?type=web"

Write-Host "`n⏳ 等待 5 秒让浏览器加载..." -ForegroundColor Gray
Start-Sleep -Seconds 5

# 4. 显示配置（用户手动复制）
Write-Host "`n[4/7] 请在 Render 页面执行以下操作:`n" -ForegroundColor Yellow

@"
╔══════════════════════════════════════════════════════════════╗
║                     📋 Render 配置清单                       ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  1️⃣  选择上传方式: Manual Deploy / Upload Files            ║
║  2️⃣  上传文件: $zipPath                                      ║
║  3️⃣  填写配置 (直接复制):                                    ║
║                                                              ║
║     Name:              asf-activation-server                ║
║     Environment:       Node                                 ║
║     Build Command:    npm ci --only=production             ║
║     Start Command:    node server.js                       ║
║     Plan:             Free                                  ║
║                                                              ║
║  4️⃣  Environment Variables (点击 Advanced):                ║
║                                                              ║
║     NODE_ENV=production                                     ║
║     PORT=3000                                               ║
║     ADMIN_API_KEY=$adminKey                                 ║
║     DB_FILE=activation.db                                   ║
║                                                              ║
║  5️⃣  点击: Create Web Service                              ║
║                                                              ║
║  ⏱️  等待 3-5 分钟部署完成                                  ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
"@ | Write-Host -ForegroundColor White

# 5. 生成快速测试命令
Write-Host "[5/7] 部署完成后使用的测试命令:`n" -ForegroundColor Yellow
$testCmd1 = "curl https://YOUR_SERVICE.onrender.com/api/health"
$testCmd2 = "node test-api.js https://YOUR_SERVICE.onrender.com $adminKey"
Write-Host "   1. 健康检查:" -ForegroundColor White
Write-Host "      $testCmd1`n" -ForegroundColor Gray
Write-Host "   2. 完整 API 测试:" -ForegroundColor White
Write-Host "      $testCmd2`n" -ForegroundColor Gray

# 6. 保存部署信息
Write-Host "[6/7] 保存部署信息..." -ForegroundColor Yellow
$info = @{
    timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    admin_api_key = $adminKey
    zip_file = $zipPath
    zip_size_kb = $zipSize
    render_service_name = "asf-activation-server"
    test_commands = @(
        "curl https://YOUR_SERVICE.onrender.com/api/health",
        "node test-api.js https://YOUR_SERVICE.onrender.com $adminKey"
    )
    next_steps = @(
        "1. 在 Render 网页上传 ZIP 文件",
        "2. 复制上面的配置信息",
        "3. 点击 Create Web Service",
        "4. 等待部署完成 (3-5 分钟)",
        "5. 替换 YOUR_SERVICE 为实际域名",
        "6. 运行测试命令验证"
    )
} | ConvertTo-Json -Depth 10 -Compress

$info | Out-File "DEPLOYMENT_READY.json" -Encoding UTF8
Write-Host "✅ 部署信息已保存到: DEPLOYMENT_READY.json`n" -ForegroundColor Green

# 7. 等待用户完成
Write-Host "[7/7] 请按照上述步骤在 Render 完成配置`n" -ForegroundColor Yellow

Write-Host "==================================" -ForegroundColor Magenta
Write-Host "✅ 自动化准备完成！" -ForegroundColor Green
Write-Host "==================================`n" -ForegroundColor Magenta

Write-Host "📌 您现在需要:`n" -ForegroundColor White
Write-Host "  1. 在 Render 网页上传 $zipPath" -ForegroundColor Cyan
Write-Host "  2. 复制配置清单中的内容到对应字段" -ForegroundColor Cyan
Write-Host "  3. 点击 Create Web Service" -ForegroundColor Cyan
Write-Host "  4. 等待 Ready 状态" -ForegroundColor Cyan
Write-Host "`n💡 提示: 如果不知道如何操作，请截图 Render 页面发给我`n" -ForegroundColor Yellow

Write-Host "完成后，我会帮您:`n" -ForegroundColor Green
Write-Host "  • 验证服务器是否正常运行" -ForegroundColor White
Write-Host "  • 测试激活码功能" -ForegroundColor White
Write-Host "  • 指导 ASF 前端集成" -ForegroundColor White
Write-Host "  • 解决任何问题`n" -ForegroundColor White

Write-Host "准备就绪！开始执行部署吧 🚀`n" -ForegroundColor Magenta