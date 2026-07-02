# Tarodan - Projeyi tek adimda baslat
# Kullanim: Proje kok dizininde .\PROJE_BASLAT.ps1 veya sag tik > PowerShell ile calistir

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot

Set-Location $ProjectRoot
Write-Host "=== Tarodan Proje Baslatiliyor ===" -ForegroundColor Cyan

# 1. Docker servisleri
Write-Host "`n[1/4] Docker servisleri baslatiliyor..." -ForegroundColor Yellow
& pnpm run docker:up
if ($LASTEXITCODE -ne 0) {
    Write-Host "Uyari: Docker baslatilamadi. Docker Desktop acik mi? Devam ediliyor..." -ForegroundColor DarkYellow
}
Start-Sleep -Seconds 3

# 2. Prisma generate (API client)
Write-Host "`n[2/4] Prisma Client uretiliyor..." -ForegroundColor Yellow
& pnpm --filter @tarodan/api exec prisma generate
if ($LASTEXITCODE -ne 0) {
    Write-Host "Hata: prisma generate basarisiz." -ForegroundColor Red
    exit 1
}

# 3. Veritabani migration
Write-Host "`n[3/4] Veritabani migration uygulaniyor..." -ForegroundColor Yellow
& pnpm run db:migrate:deploy
if ($LASTEXITCODE -ne 0) {
    Write-Host "Uyari: Migration basarisiz (veritabani kapali olabilir). Devam ediliyor..." -ForegroundColor DarkYellow
}

# 4. Dev sunuculari
Write-Host "`n[4/4] Gelistirme sunuculari baslatiliyor (API, Web, Admin)..." -ForegroundColor Yellow
Write-Host "Durdurmak icin: Ctrl+C`n" -ForegroundColor Gray
& pnpm run dev
