# Prisma: old_price migration + generate
# Proje kökünden veya apps/api içinden çalıştırın:
#   cd apps/api; .\run-old-price-migration.ps1
# veya proje kökünden:
#   cd apps\api; npx prisma migrate deploy; npx prisma generate

$apiDir = $PSScriptRoot
Push-Location $apiDir
try {
  Write-Host "Prisma migrate deploy..." -ForegroundColor Cyan
  npx prisma migrate deploy
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  Write-Host "Prisma generate..." -ForegroundColor Cyan
  npx prisma generate
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  Write-Host "Tamamlandi." -ForegroundColor Green
} finally {
  Pop-Location
}
