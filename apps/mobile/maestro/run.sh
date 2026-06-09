#!/usr/bin/env bash
# Maestro yerel koşum harness'i.
# Görünür, booted simülatörde flow koşturur. Backend + Metro (EXPO_PUBLIC_MAESTRO=1)
# ön koşullarını garanti eder.
#
# Kullanım:
#   ./run.sh flows/01-smoke.yaml
#   MAESTRO_EMAIL=ahmet@demo.com ./run.sh flows/E-05-membership-manage.yaml
set -euo pipefail

API_URL="${API_URL:-http://127.0.0.1:3001/api}"
METRO_PORT="${METRO_PORT:-8081}"
MAESTRO_EMAIL="${MAESTRO_EMAIL:-zeynep@demo.com}"
MAESTRO_PASSWORD="${MAESTRO_PASSWORD:-Demo123!}"
MOBILE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

log() { printf '\033[1;36m[harness]\033[0m %s\n' "$1"; }
err() { printf '\033[1;31m[harness]\033[0m %s\n' "$1" >&2; }

# 1. Backend health
log "Backend kontrol: $API_URL/categories"
if ! curl -fsS -o /dev/null "$API_URL/categories"; then
  err "Backend ayakta değil ($API_URL). Önce: cd apps/api && pnpm dev"
  exit 1
fi

# 2. Booted simülatör
log "Booted iOS simülatör kontrol"
if ! xcrun simctl list devices booted | grep -q "Booted"; then
  err "Booted simülatör yok. Simülatörü aç (open -a Simulator) ve uygulamayı yükle."
  exit 1
fi

# 3. Metro (EXPO_PUBLIC_MAESTRO=1)
if lsof -nP -iTCP:"$METRO_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  log "Metro zaten $METRO_PORT portunda çalışıyor (auto-login için EXPO_PUBLIC_MAESTRO=1 ile başlatılmış olmalı)"
else
  log "Metro başlatılıyor (EXPO_PUBLIC_MAESTRO=1, email=$MAESTRO_EMAIL)…"
  ( cd "$MOBILE_DIR" && \
    EXPO_PUBLIC_MAESTRO=1 \
    EXPO_PUBLIC_MAESTRO_EMAIL="$MAESTRO_EMAIL" \
    EXPO_PUBLIC_MAESTRO_PASSWORD="$MAESTRO_PASSWORD" \
    nohup pnpm exec expo start --dev-client --port "$METRO_PORT" --clear \
    >/tmp/tarodan-metro.log 2>&1 & )
  log "Metro bundler hazırlanıyor; port bekleniyor…"
  for _ in $(seq 1 60); do
    lsof -nP -iTCP:"$METRO_PORT" -sTCP:LISTEN >/dev/null 2>&1 && break
    sleep 2
  done
  log "Metro hazır. (log: /tmp/tarodan-metro.log)"
fi

# 4. Maestro — ön planda, görünür simülatörde
log "maestro test $* — simülatörü izle"
cd "$MOBILE_DIR/maestro"
exec maestro test "$@"
