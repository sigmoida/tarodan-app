# Tarodan - Docker PostgreSQL'e eksik sütunları ekler (Prisma şeması ile uyum)
# Kullanım: Proje kökünden .\scripts\sync-db-docker.ps1

$ErrorActionPreference = "Stop"
$sqlPath = Join-Path $PSScriptRoot "..\apps\api\prisma\scripts\add-users-missing-columns.sql"

if (-not (Test-Path $sqlPath)) {
    Write-Host "SQL dosyasi bulunamadi: $sqlPath" -ForegroundColor Red
    exit 1
}

Write-Host "Docker PostgreSQL (tarodan-postgres) kontrol ediliyor..." -ForegroundColor Cyan
$container = docker ps --filter "name=tarodan-postgres" --format "{{.Names}}" 2>$null
if (-not $container) {
    Write-Host "HATA: tarodan-postgres container calisiyor olmali. Once: docker-compose -f infrastructure/docker-compose.yml up -d" -ForegroundColor Red
    exit 1
}

Write-Host "Eksik users sutunlari ekleniyor..." -ForegroundColor Cyan
Get-Content $sqlPath -Raw -Encoding UTF8 | docker exec -i tarodan-postgres psql -U postgres -d tarodan --set ON_ERROR_STOP=on
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Veritabani Prisma semasi ile uyumlu hale getirildi." -ForegroundColor Green
Write-Host "Prisma Studio: pnpm db:studio  -> http://localhost:5555" -ForegroundColor Yellow
