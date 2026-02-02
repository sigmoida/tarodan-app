# Run from apps/api directory (cd apps/api first from repo root).
# Resolves the failed advertisements migration and deploys remaining migrations.

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

Write-Host "1. Marking failed migration as applied..." -ForegroundColor Cyan
npx prisma migrate resolve --applied "20260130100000_add_advertisements"

Write-Host "2. Deploying remaining migrations..." -ForegroundColor Cyan
npx prisma migrate deploy

Write-Host "Done." -ForegroundColor Green
