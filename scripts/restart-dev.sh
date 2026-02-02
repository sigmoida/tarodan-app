#!/usr/bin/env bash
# Tüm dev process'leri durdur, portları serbest bırak, sıfırdan başlat
# Kullanım: ./scripts/restart-dev.sh  (proje kökünden)

cd "$(dirname "$0")/.."
echo "=== Eski process'ler durduruluyor (3000, 3001, 3002) ==="
for port in 3000 3001 3002; do
  pid=$(lsof -ti :$port 2>/dev/null || true)
  if [ -n "$pid" ]; then
    kill -9 $pid 2>/dev/null || true
    echo "Port $port (PID $pid) kapatıldı."
  fi
done
# Turbo/nest/next process'leri
pkill -f "nest start" 2>/dev/null || true
pkill -f "next dev" 2>/dev/null || true
pkill -f "turbo run dev" 2>/dev/null || true
sleep 3
echo "=== Proje başlatılıyor: pnpm dev ==="
exec pnpm dev
