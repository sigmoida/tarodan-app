# ============================================================
#  Tarodan - Hizli Baslat Scripti
#  Bu script uygulamayi sifirdan baslatiyor:
#  1. Docker konteynerlerini yukari kaldirir (PostgreSQL, Redis, Elasticsearch)
#  2. Bagimliliklari yukler
#  3. Veritabanini sifirlar ve seed verileri yukler
#  4. Tum uygulamalari gelistirme modunda baslatir
# ============================================================

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  TARODAN - Hizli Baslat" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Proje dizinine git
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

# 1. Docker konteynerlerini baslat
Write-Host "[1/5] Docker konteynerleri baslatiliyor..." -ForegroundColor Yellow
docker compose -f infrastructure/docker-compose.yml up -d
if ($LASTEXITCODE -ne 0) {
    Write-Host "HATA: Docker konteynerleri baslatilirken sorun olustu." -ForegroundColor Red
    Write-Host "Docker Desktop'in calistigindan emin olun." -ForegroundColor Red
    exit 1
}
Write-Host "  Docker konteynerleri hazir." -ForegroundColor Green

# 2. Birkaç saniye bekle (PostgreSQL'in hazır olması için)
Write-Host "[2/5] Veritabani hazir olana kadar bekleniyor..." -ForegroundColor Yellow
Start-Sleep -Seconds 8
Write-Host "  Bekleme tamamlandi." -ForegroundColor Green

# 3. Bagimliliklari yukle
Write-Host "[3/5] Bagimliliklar yukleniyor (pnpm install)..." -ForegroundColor Yellow
pnpm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "HATA: Bagimliliklar yuklenemedi." -ForegroundColor Red
    exit 1
}
Write-Host "  Bagimliliklar yuklendi." -ForegroundColor Green

# 4. Veritabanini sifirla ve seed yukle
Write-Host "[4/5] Veritabani sifirlaniyor ve ornek veriler yukleniyor..." -ForegroundColor Yellow
pnpm db:reset
if ($LASTEXITCODE -ne 0) {
    Write-Host "UYARI: db:reset basarisiz oldu. Manuel olarak 'pnpm db:reset' deneyin." -ForegroundColor Yellow
} else {
    Write-Host "  Veritabani hazir, ornek veriler yuklendi." -ForegroundColor Green
}

# 5. Uygulamayi baslat
Write-Host "[5/5] Uygulama baslatiliyor (dev mode)..." -ForegroundColor Yellow
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Uygulama baslatildi!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Web:   http://localhost:3000" -ForegroundColor White
Write-Host "  API:   http://localhost:3001" -ForegroundColor White
Write-Host "  Admin: http://localhost:3002" -ForegroundColor White
Write-Host ""
Write-Host "  Admin Giris:" -ForegroundColor Gray
Write-Host "    E-posta: admin@tarodan.com" -ForegroundColor Gray
Write-Host "    Sifre:   Admin123!" -ForegroundColor Gray
Write-Host ""
Write-Host "  Demo Kullanici:" -ForegroundColor Gray
Write-Host "    E-posta: ahmet@demo.com" -ForegroundColor Gray
Write-Host "    Sifre:   Demo123!" -ForegroundColor Gray
Write-Host ""
Write-Host "  Durdurmak icin: Ctrl+C" -ForegroundColor DarkGray
Write-Host ""

pnpm dev
