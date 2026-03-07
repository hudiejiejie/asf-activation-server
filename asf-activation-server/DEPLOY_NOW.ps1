# ASF Activation Server - Auto Deploy Script
# Generates admin key, creates ZIP, shows config for Render

Write-Host "`n==================================" -ForegroundColor Cyan
Write-Host "🚀 ASF Activation Server - Deploy Helper" -ForegroundColor White
Write-Host "==================================`n" -ForegroundColor Cyan

# 1. Generate admin key
Write-Host "[1/5] Generating admin API key..." -ForegroundColor Yellow
$adminKey = & node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
Write-Host "🔑 ADMIN_API_KEY: $adminKey`n" -ForegroundColor Cyan
Write-Host "⚠️  SAVE THIS KEY! You'll need it to login admin panel.`n" -ForegroundColor Yellow

# 2. Create ZIP
Write-Host "[2/5] Creating deployment ZIP..." -ForegroundColor Yellow
$zipFile = "asf-activation-server-deploy.zip"
if (Test-Path $zipFile) { Remove-Item $zipFile -Force }
Compress-Archive -Path * -DestinationPath $zipFile -Force
$size = [math]::Round((Get-Item $zipFile).Length / 1KB, 1)
Write-Host "✅ Created: $zipFile ($size KB)`n" -ForegroundColor Green

# 3. Open Render
Write-Host "[3/5] Opening Render deployment page..." -ForegroundColor Yellow
Start-Process "https://dashboard.render.com/select-repo?type=web"
Start-Sleep -Seconds 3

# 4. Show config
Write-Host "[4/5] Render Configuration (copy and paste):`n" -ForegroundColor Yellow
Write-Host "┌─────────────────────────────────────┐" -ForegroundColor White
Write-Host "│  BASIC SETTINGS                     │" -ForegroundColor White
Write-Host "├─────────────────────────────────────┤" -ForegroundColor White
Write-Host "│ Name:            asf-activation-server" -ForegroundColor White
Write-Host "│ Environment:     Node" -ForegroundColor White
Write-Host "│ Build Command:   npm ci --only=production" -ForegroundColor White
Write-Host "│ Start Command:   node server.js" -ForegroundColor White
Write-Host "│ Plan:            Free" -ForegroundColor White
Write-Host "├─────────────────────────────────────┤" -ForegroundColor White
Write-Host "│  ENVIRONMENT VARIABLES              │" -ForegroundColor White
Write-Host "├─────────────────────────────────────┤" -ForegroundColor White
Write-Host "│ NODE_ENV=production" -ForegroundColor White
Write-Host "│ PORT=3000" -ForegroundColor White
Write-Host "│ ADMIN_API_KEY=$adminKey" -ForegroundColor White
Write-Host "│ DB_FILE=activation.db" -ForegroundColor White
Write-Host "└─────────────────────────────────────┘`n" -ForegroundColor White

# 5. Test commands
Write-Host "[5/5] After deployment, test with:`n" -ForegroundColor Yellow
Write-Host "  Health check:" -ForegroundColor White
Write-Host "  curl https://YOUR_SERVICE.onrender.com/api/health`n" -ForegroundColor Gray
Write-Host "  Full API test:" -ForegroundColor White
Write-Host "  node test-api.js https://YOUR_SERVICE.onrender.com $adminKey`n" -ForegroundColor Gray

# Save info
$info = @{
    admin_api_key = $adminKey
    zip_file = $zipFile
    render_name = "asf-activation-server"
    created_at = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
} | ConvertTo-Json
$info | Out-File "DEPLOY_INFO.json" -Encoding UTF8
Write-Host "📦 Deployment info saved to DEPLOY_INFO.json`n" -ForegroundColor Green

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "✅ READY! Now complete these steps:" -ForegroundColor Green
Write-Host "==================================`n" -ForegroundColor Cyan
Write-Host "1. In Render page, click 'Upload Files'" -ForegroundColor White
Write-Host "2. Select: $zipFile" -ForegroundColor White
Write-Host "3. Copy-paste the config above" -ForegroundColor White
Write-Host "4. Click 'Create Web Service'" -ForegroundColor White
Write-Host "5. Wait 3-5 minutes for deployment" -ForegroundColor White
Write-Host "6. Access: https://YOUR_SERVICE.onrender.com/admin.html" -ForegroundColor White
Write-Host "   Login with your ADMIN_API_KEY`n" -ForegroundColor White
Write-Host "Need help? Screenshot the Render page and send it to me.`n" -ForegroundColor Yellow