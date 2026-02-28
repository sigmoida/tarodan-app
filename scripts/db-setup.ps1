# Veritabani baglanti ve seed - Docker calisirken calistir
# Kullanim: .\scripts\db-setup.ps1   veya   pwsh -File scripts\db-setup.ps1

$ErrorActionPreference = "Stop"
$apiDir = Join-Path $PSScriptRoot ".." "apps" "api"

Write-Host "=== Tarodan DB Kurulum ===" -ForegroundColor Cyan
Write-Host ""

# 1. .env kontrolu
$envPath = Join-Path $apiDir ".env"
if (-not (Test-Path $envPath)) {
    Write-Host "UYARI: apps/api/.env bulunamadi. env.example.txt kopyalaniyor..." -ForegroundColor Yellow
    $example = Join-Path $apiDir "env.example.txt"
    if (Test-Path $example) {
        Copy-Item $example $envPath
        Write-Host "apps/api/.env olusturuldu. DATABASE_URL zaten localhost:5432/tarodan olarak ayarli." -ForegroundColor Green
    } else {
        Write-Host "HATA: env.example.txt da yok. apps/api/.env olusturup DATABASE_URL ekleyin." -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "[OK] apps/api/.env mevcut" -ForegroundColor Green
}

Set-Location $apiDir

# 2. Prisma client
Write-Host ""
Write-Host "Prisma client olusturuluyor..." -ForegroundColor Cyan
npx prisma generate
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "[OK] prisma generate" -ForegroundColor Green

# 3. Migrate (tablolar)
Write-Host ""
Write-Host "Veritabani tablolari uygulanıyor (migrate deploy)..." -ForegroundColor Cyan
npx prisma migrate deploy
if ($LASTEXITCODE -ne 0) {
    Write-Host "HATA: migrate basarisiz. Docker'in calistigindan ve DATABASE_URL'in dogru oldugundan emin olun." -ForegroundColor Red
    exit $LASTEXITCODE
}
Write-Host "[OK] prisma migrate deploy" -ForegroundColor Green

# 4. Seed (ornek urunler)
Write-Host ""
Write-Host "Ornek urunler ekleniyor (seed)..." -ForegroundColor Cyan
npx prisma db seed
if ($LASTEXITCODE -ne 0) {
    Write-Host "UYARI: seed hata verdi (bazen ilk kurulumda normal). Urunleri elle ekleyebilir veya tekrar deneyebilirsiniz." -ForegroundColor Yellow
} else {
    Write-Host "[OK] prisma db seed" -ForegroundColor Green
}

Write-Host ""
Write-Host "=== Bitti ===" -ForegroundColor Cyan
Write-Host "Redis onbellek bosaltmak icin (urunler hala gorunmuyorsa):" -ForegroundColor Yellow
Write-Host "  docker exec tarodan-redis redis-cli FLUSHDB" -ForegroundColor White
Write-Host "Ardindan projeyi baslatin: pnpm dev veya npx pnpm dev" -ForegroundColor Yellow
