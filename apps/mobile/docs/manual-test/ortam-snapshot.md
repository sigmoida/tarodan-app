# Ortam Snapshot — Test Başlangıcı

**Tarih:** 2026-05-02 20:39 +03

## Repo

- Branch: `development`
- Commit: `7202a31` (HEAD — `fix(trade): cover all ShipmentStatus values in counterparty status hint`)
- Working tree: `apps/admin/tsconfig.tsbuildinfo` modified (test'i etkilemez)

## Backend

- API health (`http://localhost:3001/api/health`): **200** ✅
- API process: PID 95442 (`/tmp/tarodan-api.log`)
- Docker servisleri (hepsi `Up 6h healthy`):
  - tarodan-postgres
  - tarodan-redis
  - tarodan-elasticsearch
  - tarodan-mailhog
  - tarodan-kibana

## Ödeme yapılandırması

- Başlangıç modu: `PAYMENT_BYPASS=true` ✅ (`apps/api/.env`)
- Bypass endpoint: `POST /api/payments/:id/bypass-complete` — `@Public()` (auth gerektirmez), payment ID zorunlu.
- API davranışı ([payment.service.ts](apps/api/src/modules/payment/payment.service.ts)):
  - `PAYMENT_BYPASS=true` iken sipariş ve membership ödemesi `paymentUrl` döndürmez, sadece `{useBypass: true, paymentId}` döner (lines 399 ve 471).
  - Membership servisi [membership.service.ts:517](apps/api/src/modules/membership/membership.service.ts#L517) `paymentService.initiatePayment` çağırdığı için aynı bypass davranışını miras alır.
  - Mobil checkout (sipariş + membership) `paymentUrl` öncelikli; yoksa paymentId ile `/payment/[id]`'a route eder. **`payment/[id].tsx` `useBypass`'ı hiç handle etmiyor** (kodda referans yok) → WebView boş yüklenir, ödeme tamamlanamaz. **B-001 olarak raporlanacak.**
  - Sadece takas nakit ödemesi ([trade/[id].tsx:476-484](apps/mobile/app/trade/[id].tsx#L476-L484)) `useBypass`'ı handle edip `paymentsApi.bypassComplete(paymentId)` çağırıyor → bypass yolu mobilde sadece burada çalışır.
- Test stratejisi: **iki koşu gerekir** — Koşu A `PAYMENT_BYPASS=true` (takas bypass çalışır + sipariş/membership için B-001 parity bug doğrulanır), Koşu B `PAYMENT_BYPASS=false` (sipariş + membership + takas nakit için sandbox kart). Detaylar [faz1-kritik-checklist.md](faz1-kritik-checklist.md) başında.
- PayTR test mode: ON (`[PayTRService] PayTR test mode: ON` logundan)
- Iyzico: sandbox

## Mod değişiklik logu (testçi tarafından doldurulacak)

| Saat | Mod | Not |
|------|-----|-----|
| 20:39 | PAYMENT_BYPASS=true | Koşu A başlangıcı |
| | | |

## Mobil

- Sim: iPhone 17 (UDID `51067740-ACBF-4CDA-A8C0-5A1DB9551A16`) — **Booted**
- iOS runtime: 26.0.1 (23A8464)
- Mobile dev server: kullanıcı tarafından `pnpm ios` ile manuel başlatılacak

## Bilinen sınırlamalar (test sırasında not)

- **Push notification** Expo Go'da çalışmaz → F1.7 push adımı kısmi (foreground only).
- **WebSocket gerçek zamanlı** test için iki cihaz gerekir (iki sim ya da sim + web).
- **Kargo:** sadece **Sürat Kargo** kullanılır (sipariş + takas) — web ve mobil tek opsiyon olarak sabit. Aras/Yurtiçi/MNG seçenekleri kullanım dışı.
- **SendGrid / Twilio / Sentry** yapılandırılmamış (log-only). Mail için MailHog (http://localhost:8025) kullanılacak.

## Test kullanıcıları (hepsi `Demo123!`)

| Email | Tier |
|-------|------|
| admin@tarodan.com | ADMIN |
| zeynep@demo.com | FREE |
| mehmet@demo.com | BASIC |
| ahmet@demo.com | PREMIUM |
| ali@demo.com | BUSINESS |
