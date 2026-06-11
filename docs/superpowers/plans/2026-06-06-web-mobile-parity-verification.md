# Web ↔ Mobil Parity Canlı Doğrulama — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Web'de çalışan 11 kritik akışın mobilde (iOS Simulator) de çalıştığını canlı API çağrıları + Maestro + manuel kontrolle doğrulayıp tek bir bulgu raporu üretmek.

**Architecture:** Yerel stack (docker + `pnpm dev`) ayağa kaldırılır, mobil Expo Go ile iOS Simulator'da koşar. Her akış sabit 4-adımlı yöntemden (API → mobil kod uyumu → Maestro → manuel) geçer ve `apps/mobile/docs/WEB_MOBILE_VERIFICATION_REPORT.md`'e bir durum satırı yazar. Ödeme `PAYMENT_BYPASS=true`, kargo Surat stub modunda. Bozuk bulgular kuyruğa yazılır; sadece blocker + tek-satır düzeltmeler anında yapılır.

**Tech Stack:** Turborepo (pnpm), NestJS API (`:3001`, global prefix `api`), Next.js web, Expo/React Native mobil, Maestro E2E (Expo Go), docker compose (Postgres/Redis/ES/MailHog), curl + jq.

**Spec:** `docs/superpowers/specs/2026-06-06-web-mobile-parity-verification-design.md`

---

## Watchdog Protokolü (her uzun adımda uygulanır)

Her uzun süren komut bir **zaman aşımı bütçesiyle** çalıştırılır. Komut arka planda (`run_in_background`) başlatıldıysa, bütçe boyunca **her ~3 dakikada bir nabız** atılır.

**Zaman aşımı bütçeleri:** `docker:up`/migration = 3 dk · API açılış = 2 dk · tek API çağrısı = 30 sn · Expo/Metro bundle = 8 dk · tek Maestro flow = 5 dk.

**Nabız (her ~3 dk):**
1. `curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/health` → `200` mü?
2. `lsof -ti:8081` (Metro) boş değil mi?
3. `xcrun simctl list devices booted` → en az bir `Booted` cihaz var mı?
4. `docker compose -f infrastructure/docker-compose.yml ps` → konteynerler `Up` mı?

**Takılma görülürse (bütçe aşıldı / nabız kırmızı):**
1. **Yakala:** ilgili logu/portu/son çıktıyı not et.
2. **Teşhis:** kök neden (port çakışması, OOM, bayat prisma client, watchman, sonsuz await).
3. **Çöz:** sadece ilgili servisi restart et (tüm stack'i değil); kod takılması ise minimal düzelt.
4. **Devam:** akışı baştan değil kaldığı adımdan sürdür; raporun "Takılma günlüğü" bölümüne 1 satır yaz.

**Asılı tek API çağrısı** (30 sn) = o akış için `❌` bulgu; çağrıyı iptal et (`curl --max-time 30`), işaretle, devam et.

---

## Bulgu Kaydı Kuralı (her task'ta geçerli)

- **Varsayılan:** bulguyu rapora yaz, kod düzeltmesine geçme, sıradaki adıma/akışa devam et.
- **İstisna 1 — blocker:** bir akış diğerlerinin doğrulanmasını imkânsız kılıyorsa (örn. login bozuk) → anında düzelt.
- **İstisna 2 — tek-satır aşikar hata:** yanlış endpoint adı/eksik parametre gibi 1-2 satırlık net hata → düzelt, tekrar doğrula, rapora "düzeltildi" yaz.
- Diğer her düzeltme bulgu kuyruğuna (`BUG-NNN`) gider.

---

## Dosya Yapısı

- **Oluştur:** `apps/mobile/docs/WEB_MOBILE_VERIFICATION_REPORT.md` — tek canlı bulgu raporu (tüm task'lar buraya satır ekler).
- **Geçici (commit YOK):** `apps/api/.env` — `PAYMENT_BYPASS=true` (doğrulama bitince geri alınır).
- **Geçici çalışma dosyası (commit YOK):** `/tmp/tarodan-token` — seed login token'ı (her task okur).
- **Salt-okunur referanslar:** `apps/mobile/docs/WEB_MOBILE_PARITY.md`, `packages/api-client/src/endpoints/*`, `apps/mobile/maestro/flows/*`, `TEST_HESAPLARI.md`.

Her task yalnızca rapor dosyasına yazar (ve istisna durumunda ilgili mobil kaynak dosyasına). Bu, doğrulama mantığını tek yerde toplar.

---

## Task 1: Ortam kurulumu + smoke kapısı

**Files:**
- Create: `apps/mobile/docs/WEB_MOBILE_VERIFICATION_REPORT.md`
- Modify (commit YOK): `apps/api/.env`

- [ ] **Step 1: Altyapıyı kaldır (bütçe 3 dk — Watchdog)**

Run:
```bash
cd /Users/gorkemsubas/Desktop/projeler/tarodan/tarodan-app
pnpm docker:up
docker compose -f infrastructure/docker-compose.yml ps
```
Expected: Postgres / Redis / Elasticsearch / MailHog konteynerleri `Up`. Aşılırsa Watchdog Protokolü (port/volume çakışması).

- [ ] **Step 2: DB migrate + seed (bütçe 3 dk)**

Run:
```bash
pnpm db:migrate
pnpm db:seed
```
Expected: migration `up to date` / uygulanan migration'lar; seed "completed" benzeri çıktı. Hata = blocker, Watchdog ile çöz.

- [ ] **Step 3: Ödeme bypass'ı aç (commit YOK)**

`apps/api/.env` içinde `PAYMENT_BYPASS=false` satırını `PAYMENT_BYPASS=true` yap. Kargo satırlarına (`SURAT_*`) dokunma.

Run (doğrula):
```bash
grep -E "^(PAYMENT_BYPASS|SURAT_SOAP_MODE)=" apps/api/.env
```
Expected: `PAYMENT_BYPASS=true` ve `SURAT_SOAP_MODE=stub`.

- [ ] **Step 4: Backend'i başlat (arka plan, bütçe 2 dk — Watchdog nabzı)**

Run (arka planda): `pnpm dev`
Sonra bekle ve doğrula:
```bash
curl -s --max-time 30 http://localhost:3001/api/health
```
Expected: `200` + JSON (status ok). 404 dönerse `curl http://localhost:3001/health` dene ve raporda gerçek path'i not et. Açılış 2 dk'yı aşarsa Watchdog (port 3001 / prisma generate).

- [ ] **Step 5: Seed login → token al (smoke kapısı 2/3)**

Run:
```bash
curl -s --max-time 30 -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"ahmet@demo.com","password":"Demo123!"}' \
  | tee /tmp/tarodan-login.json | jq -r '.accessToken // .token // .data.accessToken' > /tmp/tarodan-token
cat /tmp/tarodan-token
```
Expected: boş olmayan bir JWT. Boşsa `/tmp/tarodan-login.json`'a bakıp gerçek alan adını bul (`.accessToken` farklıysa raporda not et ve sonraki task'larda kullan). Login başarısız = **blocker**, anında çöz.

- [ ] **Step 6: Mobili başlat + iOS Simulator'da aç (smoke kapısı 3/3, bütçe 8 dk)**

Run (arka planda): `cd apps/mobile && pnpm start`
Sonra iOS Simulator'da Expo Go'da projeyi aç (Expo terminalinde `i`). Açılış ekranı yüklenmeli ve ürün/listeleme verisi gelmeli (API bağlı).

Doğrula (Metro ayakta mı):
```bash
lsof -ti:8081 && xcrun simctl list devices booted | grep -i booted
```
Expected: Metro PID + en az bir `Booted` simülatör. Bundle 8 dk'yı aşarsa Watchdog (`pnpm start -- --clear`).

> **Not (Maestro önkoşulu):** Maestro `launchApp` Expo Go'nun cache'inden **son açılan** projeyi açar. Bu adımda projenin sim'de bir kez açılmış olması, sonraki Maestro task'larının çalışması için zorunludur.

- [ ] **Step 7: Rapor iskeletini oluştur**

`apps/mobile/docs/WEB_MOBILE_VERIFICATION_REPORT.md` dosyasını şu içerikle oluştur:
```markdown
# Web ↔ Mobil Parity — Canlı Doğrulama Raporu

**Tarih:** 2026-06-06
**Ortam:** Yerel stack (docker + pnpm dev) · API :3001 · iOS Simulator (Expo Go) · PAYMENT_BYPASS=true · Kargo Surat stub

## Genel Skor

| # | Akış | Durum |
|---|------|-------|
| 1 | Auth | — |
| 2 | Arama & filtre & kategori | — |
| 3 | Ürün detay & favori | — |
| 4 | Sepet & Checkout & Ödeme | — |
| 5 | Kargo / teslimat | — |
| 6 | Takas (ürün + nakit) | — |
| 7 | Teklif (offers) | — |
| 8 | Üyelik satın alma | — |
| 9 | Mesajlar & bildirim | — |
| 10 | İade / dispute | — |
| 11 | Satıcı paneli | — |

## Akış Detayları

<!-- her task buraya bir bölüm ekler -->

## Bulgu Listesi (aksiyon kuyruğu)

| BUG | Akış | Önem | Web'de | Kanıt | Önerilen düzeltme |
|-----|------|------|--------|-------|-------------------|

## Takılma Günlüğü

| Adım | Belirti | Kök neden | Çözüm |
|------|---------|-----------|-------|

## Kapanış

<!-- son task doldurur -->
```

- [ ] **Step 8: Smoke kapısı teyidi + commit**

Üç kapı da yeşilse (health 200 · token alındı · mobil bağlandı) Genel Skor tablosunda hiçbir şeyi değiştirme, sadece raporu commit et:
```bash
git add apps/mobile/docs/WEB_MOBILE_VERIFICATION_REPORT.md
git commit -m "test(parity): doğrulama raporu iskeleti + ortam smoke kapısı"
```
Expected: commit oluştu. Herhangi bir kapı kırmızıysa **blocker** — Watchdog ile çöz, sonra commit.

---

## Task 2: Auth akışı doğrulama

**Files:** Modify: `apps/mobile/docs/WEB_MOBILE_VERIFICATION_REPORT.md`

- [ ] **Step 1: API — login / refresh / register canlı çağrı**

Run:
```bash
TOKEN=$(cat /tmp/tarodan-token)
# login (tekrar) + me
curl -s --max-time 30 -o /dev/null -w "login:%{http_code}\n" -X POST http://localhost:3001/api/auth/login -H 'Content-Type: application/json' -d '{"email":"ayse@demo.com","password":"Demo123!"}'
curl -s --max-time 30 -o /dev/null -w "me:%{http_code}\n" http://localhost:3001/api/auth/me -H "Authorization: Bearer $TOKEN"
# yanlış şifre negatif
curl -s --max-time 30 -o /dev/null -w "wrongpw:%{http_code}\n" -X POST http://localhost:3001/api/auth/login -H 'Content-Type: application/json' -d '{"email":"ayse@demo.com","password":"yanlis"}'
```
Expected: `login:200/201`, `me:200`, `wrongpw:401`. (`/auth/me` 404 ise `packages/api-client/src/endpoints/auth.ts`'ten gerçek "current user" yolunu bul, raporda not et.)

- [ ] **Step 2: Mobil kod uyumu**

Run:
```bash
grep -rn "/auth/login\|/auth/refresh\|/auth/register" packages/api-client/src/endpoints/auth.ts
grep -rln "authStore\|login(" apps/mobile/app/\(auth\)
```
Expected: mobil aynı `/auth/*` yollarını kullanıyor. Web ile diff varsa raporda not.

- [ ] **Step 3: Maestro — login akışları (bütçe 5 dk/flow)**

Run:
```bash
cd apps/mobile
maestro test --env EMAIL=ahmet@demo.com maestro/flows/01-01-login-happy.yaml
maestro test maestro/flows/01-02-login-wrong-password.yaml
maestro test maestro/flows/01-12-logout-cleanup.yaml
```
Expected: her flow `Flow Passed`. Kalan/donan flow = Watchdog (öldür, screenshot, not).

- [ ] **Step 4: Manuel kontrol**

iOS sim'de elle: forgot-password ekranı açılıyor mu, verify-email gate çalışıyor mu, logout sonrası token temizleniyor mu (tekrar login isteniyor mu). Gözlemleri not al.

- [ ] **Step 5: Rapor satırı + skor + commit**

Rapora `## 1. Auth — <durum>` bölümü ekle (API / mobil kod / Maestro / manuel alt satırları), Genel Skor tablosunda satır 1'i güncelle, bulgu varsa `BUG-NNN` ekle.
```bash
git add apps/mobile/docs/WEB_MOBILE_VERIFICATION_REPORT.md
git commit -m "test(parity): Auth akışı doğrulama sonucu"
```
Expected: commit oluştu.

---

## Task 3: Arama & filtre & kategori doğrulama

**Files:** Modify: `apps/mobile/docs/WEB_MOBILE_VERIFICATION_REPORT.md`

- [ ] **Step 1: API — ürün/listeleme/arama çağrıları**

Run:
```bash
TOKEN=$(cat /tmp/tarodan-token)
curl -s --max-time 30 -o /dev/null -w "products:%{http_code}\n" "http://localhost:3001/api/products?page=1&limit=10"
curl -s --max-time 30 -o /dev/null -w "listings:%{http_code}\n" "http://localhost:3001/api/listings?status=active"
curl -s --max-time 30 -w "\nsearch:%{http_code}\n" "http://localhost:3001/api/products?search=ceket&condition=new" | tail -c 400
```
Expected: hepsi `200`, JSON sonuç listesi. Boş sonuç ≠ hata (seed verisine bağlı) ama not et.

- [ ] **Step 2: Mobil kod uyumu**

Run:
```bash
grep -rn "buildProductListQueryParams\|/products\|/listings" apps/mobile/app/listings.tsx apps/mobile/app/\(tabs\)/search.tsx 2>/dev/null | head
```
Expected: mobil aynı endpoint + query parametrelerini (`condition`, `scale`, `tradeOnly`, `sort`) kullanıyor. Web ile filtre seti farkı varsa not.

- [ ] **Step 3: Maestro (bütçe 5 dk/flow)**

Run:
```bash
cd apps/mobile
maestro test maestro/flows/03-search.yaml
maestro test maestro/flows/F-06-search-product-detail.yaml
maestro test maestro/flows/F-07-category-drill-down.yaml
```
Expected: her flow `Flow Passed`.

- [ ] **Step 4: Manuel kontrol**

Elle: arama çubuğu kontrastı/placeholder görünür mü, filtre uygula (marka adı + tradeOnly + sırala) → sonuç tutarlı mı, kategori drill-down doğru ürünleri getiriyor mu. Not al.

- [ ] **Step 5: Rapor satırı + skor + commit**

`## 2. Arama & filtre & kategori — <durum>` ekle, skor satır 2, bulgular.
```bash
git add apps/mobile/docs/WEB_MOBILE_VERIFICATION_REPORT.md
git commit -m "test(parity): Arama & filtre akışı doğrulama sonucu"
```

---

## Task 4: Ürün detay & favori doğrulama

**Files:** Modify: `apps/mobile/docs/WEB_MOBILE_VERIFICATION_REPORT.md`

- [ ] **Step 1: API — ürün detay + wishlist**

Run:
```bash
TOKEN=$(cat /tmp/tarodan-token)
PID=$(curl -s --max-time 30 "http://localhost:3001/api/products?limit=1" | jq -r '.data[0].id // .items[0].id // .[0].id')
echo "PID=$PID"
curl -s --max-time 30 -o /dev/null -w "detail:%{http_code}\n" "http://localhost:3001/api/products/$PID"
curl -s --max-time 30 -o /dev/null -w "wishadd:%{http_code}\n" -X POST "http://localhost:3001/api/wishlist" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "{\"productId\":\"$PID\"}"
curl -s --max-time 30 -o /dev/null -w "wishlist:%{http_code}\n" "http://localhost:3001/api/wishlist" -H "Authorization: Bearer $TOKEN"
```
Expected: `detail:200`, `wishadd:200/201`, `wishlist:200`. PID boşsa jq alan adını `/tmp` çıktısından düzelt. Wishlist endpoint yolu farklıysa (`packages/api-client/src/endpoints/wishlist.ts`) gerçek yolu kullan ve not et.

- [ ] **Step 2: Mobil kod uyumu**

Run:
```bash
grep -rn "/products/\|wishlist\|favorites" packages/api-client/src/endpoints/wishlist.ts apps/mobile/app/product/\[id\].tsx 2>/dev/null | head
```
Expected: mobil `favorites` store'u aynı wishlist API'sini kullanıyor (isim farkı `favorites` ↔ `wishlist` ise eşleştiğini doğrula).

- [ ] **Step 3: Maestro (bütçe 5 dk)**

Run:
```bash
cd apps/mobile
maestro test maestro/flows/F-08-favorite-toggle.yaml
```
Expected: `Flow Passed`.

- [ ] **Step 4: Manuel kontrol**

Elle: ürün detayda görseller/fiyat/komisyon etiketi görünüyor mu, favori toggle ekledikten sonra favoriler listesinde görünüyor mu. Not al.

- [ ] **Step 5: Rapor satırı + skor + commit**

`## 3. Ürün detay & favori — <durum>`, skor satır 3.
```bash
git add apps/mobile/docs/WEB_MOBILE_VERIFICATION_REPORT.md
git commit -m "test(parity): Ürün detay & favori doğrulama sonucu"
```

---

## Task 5: Sepet & Checkout & Ödeme doğrulama (KRİTİK)

**Files:** Modify: `apps/mobile/docs/WEB_MOBILE_VERIFICATION_REPORT.md`

- [ ] **Step 1: API — quote + sipariş + bypass ödeme**

Run:
```bash
TOKEN=$(cat /tmp/tarodan-token)
# quote (checkout fiyat önizleme)
curl -s --max-time 30 -w "\nquote:%{http_code}\n" -X POST "http://localhost:3001/api/orders/quote" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"items":[{"productId":"'"$(curl -s "http://localhost:3001/api/products?limit=1" | jq -r '.data[0].id // .items[0].id')"'","quantity":1}]}' | tail -c 500
# ödeme bypass config açık mı
curl -s --max-time 30 -w "\npayconfig:%{http_code}\n" "http://localhost:3001/api/payments/config"
```
Expected: `quote:200/201` + pricing breakdown (komisyon/platform bedeli/kargo dahil); `payconfig` JSON'da `bypassEnabled:true`. (`/payments/config` yolu farklıysa `apps/api/src/modules/payment/payment.controller.ts`'teki `getPublicConfig` route'unu kullan.)

- [ ] **Step 2: Mobil kod uyumu**

Run:
```bash
grep -rn "orders/quote\|getQuote\|bypass\|payments" apps/mobile/app/checkout/index.tsx apps/mobile/app/payment/success.tsx 2>/dev/null | head
```
Expected: mobil checkout aynı `quote` + sipariş + bypass-complete akışını kullanıyor; `payment/success` invalidate ediyor (`orders`/`products`/`listings`/`my-listings`).

- [ ] **Step 3: Maestro (bütçe 5 dk/flow)**

Run:
```bash
cd apps/mobile
maestro test maestro/flows/04-checkout-bypass.yaml
maestro test maestro/flows/D-01-checkout-bypass-regression.yaml
maestro test maestro/flows/F-09-cart-add-remove.yaml
```
Expected: her flow `Flow Passed`.

- [ ] **Step 4: Manuel kontrol (stok tutarlılığı — kritik)**

Elle: sepete ekle → checkout → bypass ile öde → başarı ekranı → ana sayfa/arama/ilanlar'da **stok güncel mi** (satılan adet düştü mü). Fatura adresi alanı web'de var, mobilde var mı? Kayıtlı kart desteği? Eksikse `BUG-NNN`.

- [ ] **Step 5: Rapor satırı + skor + commit**

`## 4. Sepet & Checkout & Ödeme — <durum>`, skor satır 4, kritik bulgular işaretli.
```bash
git add apps/mobile/docs/WEB_MOBILE_VERIFICATION_REPORT.md
git commit -m "test(parity): Checkout & ödeme akışı doğrulama sonucu"
```

---

## Task 6: Kargo / teslimat doğrulama (KRİTİK)

**Files:** Modify: `apps/mobile/docs/WEB_MOBILE_VERIFICATION_REPORT.md`

- [ ] **Step 1: API — adres + kargo gönderim (stub) + takip**

Run:
```bash
TOKEN=$(cat /tmp/tarodan-token)
curl -s --max-time 30 -o /dev/null -w "addresses:%{http_code}\n" "http://localhost:3001/api/users/me/addresses" -H "Authorization: Bearer $TOKEN"
# satıcı bir siparişi kargola: önce satıcı token al
curl -s --max-time 30 -X POST http://localhost:3001/api/auth/login -H 'Content-Type: application/json' -d '{"email":"ayse@demo.com","password":"Demo123!"}' | jq -r '.accessToken // .token' > /tmp/tarodan-seller-token
STOKEN=$(cat /tmp/tarodan-seller-token)
OID=$(curl -s --max-time 30 "http://localhost:3001/api/orders/sales?limit=1" -H "Authorization: Bearer $STOKEN" | jq -r '.data[0].id // .items[0].id')
echo "OID=$OID"
curl -s --max-time 30 -w "\nship:%{http_code}\n" -X POST "http://localhost:3001/api/orders/$OID/ship" -H "Authorization: Bearer $STOKEN" -H 'Content-Type: application/json' -d '{"carrier":"surat"}' | tail -c 300
```
Expected: `addresses:200`; `ship` → stub bir `trackingNumber` döndürür (200/201). Adres/sipariş yolu farklıysa `packages/api-client/src/endpoints/*` ve `order.controller.ts`'ten gerçek yolu al. Sipariş yoksa Task 5'te oluşan siparişi kullan.

- [ ] **Step 2: Mobil kod uyumu**

Run:
```bash
grep -rn "ship\|carrier\|surat\|aras\|yurtici\|trackingNumber\|order-track" apps/mobile/app/order-track.tsx apps/mobile/app/orders 2>/dev/null | head
```
Expected: mobil gönderim/takip aynı `ship` + tracking API'sini kullanıyor.

- [ ] **Step 3: Maestro (bütçe 5 dk)**

Run:
```bash
cd apps/mobile
maestro test maestro/flows/E-04-trade-shipping-card.yaml
```
Expected: `Flow Passed` (manual tag — backend fixture'a bağımlı; donarsa not et, blocker değil).

- [ ] **Step 4: Manuel kontrol**

Elle: order-track ekranı takip numarasını gösteriyor mu, kargo durumu (stub) ilerliyor mu. Not al.

- [ ] **Step 5: Rapor satırı + skor + commit**

`## 5. Kargo / teslimat — <durum>`, skor satır 5.
```bash
git add apps/mobile/docs/WEB_MOBILE_VERIFICATION_REPORT.md
git commit -m "test(parity): Kargo / teslimat akışı doğrulama sonucu"
```

---

## Task 7: Takas (ürün + nakit ödeme) doğrulama

**Files:** Modify: `apps/mobile/docs/WEB_MOBILE_VERIFICATION_REPORT.md`

- [ ] **Step 1: API — takas oluştur + detay + nakit ödeme (bypass)**

Run:
```bash
TOKEN=$(cat /tmp/tarodan-token)
curl -s --max-time 30 -o /dev/null -w "trades:%{http_code}\n" "http://localhost:3001/api/trades" -H "Authorization: Bearer $TOKEN"
curl -s --max-time 30 -o /dev/null -w "mytradeproducts:%{http_code}\n" "http://localhost:3001/api/users/me/products" -H "Authorization: Bearer $TOKEN"
```
Expected: `trades:200`, `mytradeproducts:200`. Takas oluşturma payload'ı için `packages/api-client/src/endpoints/trades.ts`'teki `create` imzasını referans al; oluşturma denemesi 400 dönerse (eksik karşı ürün) bunu beklenen kabul et, raporda not.

- [ ] **Step 2: Mobil kod uyumu**

Run:
```bash
grep -rn "tradesApi\|/trades\|handleCashPayment\|initiateTradeCash\|cashAmount" apps/mobile/app/trade 2>/dev/null | head
```
Expected: mobil `trade/[id].tsx` nakit ödeme bloğu (`handleCashPayment`, bypass, `Linking`) içeriyor — spec §5 kritik maddesi.

- [ ] **Step 3: Maestro (bütçe 5 dk/flow)**

Run:
```bash
cd apps/mobile
maestro test maestro/flows/D-04-trades-list-smoke.yaml
maestro test maestro/flows/E-06-cash-trade-payment-button.yaml
```
Expected: `Flow Passed`.

- [ ] **Step 4: Manuel kontrol**

Elle: takas başlat (ürün + nakit kuralları) → detayda durumlar ilerliyor mu, nakit tarafta ödeme butonu/akışı var mı (web parity). Eksikse `BUG-NNN`.

- [ ] **Step 5: Rapor satırı + skor + commit**

`## 6. Takas — <durum>`, skor satır 6.
```bash
git add apps/mobile/docs/WEB_MOBILE_VERIFICATION_REPORT.md
git commit -m "test(parity): Takas akışı doğrulama sonucu"
```

---

## Task 8: Teklif (offers) doğrulama

**Files:** Modify: `apps/mobile/docs/WEB_MOBILE_VERIFICATION_REPORT.md`

- [ ] **Step 1: API — offers liste + komisyon önizleme**

Run:
```bash
TOKEN=$(cat /tmp/tarodan-token)
curl -s --max-time 30 -o /dev/null -w "offers_sent:%{http_code}\n" "http://localhost:3001/api/offers?tab=sent" -H "Authorization: Bearer $TOKEN"
curl -s --max-time 30 -o /dev/null -w "offers_recv:%{http_code}\n" "http://localhost:3001/api/offers?tab=received" -H "Authorization: Bearer $TOKEN"
```
Expected: ikisi de `200`. Komisyon preview batch yolu için `packages/api-client/src/endpoints/offers.ts`'teki `getCommissionPreviewBatch`'i referans al; varsa bir çağrı ekle.

- [ ] **Step 2: Mobil kod uyumu**

Run:
```bash
grep -rn "/offers\|getCommissionPreviewBatch\|tab=sent\|tab=received" apps/mobile/app/offers.tsx 2>/dev/null | head
```
Expected: mobil aynı `/offers?tab=` query + komisyon batch + "Tahmini net (satıcı)" kartı.

- [ ] **Step 3: Maestro (bütçe 5 dk/flow)**

Run:
```bash
cd apps/mobile
maestro test maestro/flows/E-03-offers-list.yaml
maestro test maestro/flows/F-10-make-offer.yaml
```
Expected: `Flow Passed`.

- [ ] **Step 4: Manuel kontrol**

Elle: teklif gönder/yanıtla (accept/reject/counter/cancel) → liste güncelleniyor mu, hata metni `formatApiErrorMessage` ile düzgün mü. Not al.

- [ ] **Step 5: Rapor satırı + skor + commit**

`## 7. Teklif — <durum>`, skor satır 7.
```bash
git add apps/mobile/docs/WEB_MOBILE_VERIFICATION_REPORT.md
git commit -m "test(parity): Teklif akışı doğrulama sonucu"
```

---

## Task 9: Üyelik satın alma doğrulama

**Files:** Modify: `apps/mobile/docs/WEB_MOBILE_VERIFICATION_REPORT.md`

- [ ] **Step 1: API — üyelik planları + ödeme başlat (bypass)**

Run:
```bash
TOKEN=$(cat /tmp/tarodan-token)
curl -s --max-time 30 -w "\nsettings_public:%{http_code}\n" "http://localhost:3001/api/admin/settings/public" | tail -c 300
curl -s --max-time 30 -o /dev/null -w "membership:%{http_code}\n" "http://localhost:3001/api/membership/plans" -H "Authorization: Bearer $TOKEN"
```
Expected: `settings_public:200` (fiyat kaynağı), `membership:200`. Plan yolu farklıysa `apps/api/src/modules/membership/membership.controller.ts`'ten gerçek route'u al.

- [ ] **Step 2: Mobil kod uyumu**

Run:
```bash
grep -rn "settings/public\|membership\|paymentUrl\|type=membership" apps/mobile/app/membership 2>/dev/null | head
```
Expected: mobil `membership/checkout.tsx` aynı fiyat sanitize + `Linking.openURL(paymentUrl)` + `?type=membership` akışını kullanıyor.

- [ ] **Step 3: Maestro (bütçe 5 dk/flow)**

Run:
```bash
cd apps/mobile
maestro test maestro/flows/D-02-membership-screen-smoke.yaml
maestro test maestro/flows/E-05-membership-manage.yaml
```
Expected: `Flow Passed`.

- [ ] **Step 4: Manuel kontrol**

Elle: üyelik planı seç → kart formu → ödeme (bypass) → başarı ekranı (`?tier=`). Geçersiz plan geri linki çalışıyor mu. Not al.

- [ ] **Step 5: Rapor satırı + skor + commit**

`## 8. Üyelik satın alma — <durum>`, skor satır 8.
```bash
git add apps/mobile/docs/WEB_MOBILE_VERIFICATION_REPORT.md
git commit -m "test(parity): Üyelik satın alma doğrulama sonucu"
```

---

## Task 10: Mesajlar & bildirim doğrulama

**Files:** Modify: `apps/mobile/docs/WEB_MOBILE_VERIFICATION_REPORT.md`

- [ ] **Step 1: API — mesaj + bildirim listeleri**

Run:
```bash
TOKEN=$(cat /tmp/tarodan-token)
curl -s --max-time 30 -o /dev/null -w "messages:%{http_code}\n" "http://localhost:3001/api/messages" -H "Authorization: Bearer $TOKEN"
curl -s --max-time 30 -o /dev/null -w "notifications:%{http_code}\n" "http://localhost:3001/api/notifications" -H "Authorization: Bearer $TOKEN"
```
Expected: ikisi de `200`. Yol farklıysa `packages/api-client/src/endpoints/messages.ts` / `notifications.ts`'ten al.

- [ ] **Step 2: Mobil kod uyumu**

Run:
```bash
grep -rn "/messages\|/notifications\|messagesStore" apps/mobile/app/messages apps/mobile/src/stores/messagesStore.ts 2>/dev/null | head
```
Expected: mobil aynı endpoint'leri kullanıyor.

- [ ] **Step 3: Maestro (bütçe 5 dk/flow)**

Run:
```bash
cd apps/mobile
maestro test maestro/flows/D-05-messages-smoke.yaml
maestro test maestro/flows/E-07-notifications-tab.yaml
```
Expected: `Flow Passed`.

- [ ] **Step 4: Manuel kontrol**

Elle: konuşma listesi yükleniyor mu, mesaj gönder → görünüyor mu, bildirim sekmesi öğeleri gösteriyor mu. Not al.

- [ ] **Step 5: Rapor satırı + skor + commit**

`## 9. Mesajlar & bildirim — <durum>`, skor satır 9.
```bash
git add apps/mobile/docs/WEB_MOBILE_VERIFICATION_REPORT.md
git commit -m "test(parity): Mesajlar & bildirim doğrulama sonucu"
```

---

## Task 11: İade / dispute doğrulama

**Files:** Modify: `apps/mobile/docs/WEB_MOBILE_VERIFICATION_REPORT.md`

- [ ] **Step 1: API — iade talebi + dispute**

Run:
```bash
TOKEN=$(cat /tmp/tarodan-token)
curl -s --max-time 30 -o /dev/null -w "refunds:%{http_code}\n" "http://localhost:3001/api/refund-requests" -H "Authorization: Bearer $TOKEN"
```
Expected: `200`. Dispute yolu için `packages/api-client/src/endpoints/*` ve `apps/api/src/modules/refund/refund.controller.ts`'i referans al; `raiseDispute` endpoint'i varsa bir GET liste çağrısı ekle.

- [ ] **Step 2: Mobil kod uyumu**

Run:
```bash
grep -rn "refund\|dispute\|raiseDispute\|refund-request" apps/mobile/app/refund-policy.tsx apps/mobile/app/orders 2>/dev/null | head
```
Expected: mobilde iade talebi/dispute ekranı var mı; web'de var, mobilde yoksa `BUG-NNN`.

- [ ] **Step 3: Maestro (bütçe 5 dk)**

Run:
```bash
cd apps/mobile
maestro test maestro/flows/E-02-refund-request.yaml
```
Expected: `Flow Passed` (manual tag — fixture'a bağımlı; donarsa not).

- [ ] **Step 4: Manuel kontrol**

Elle: bir sipariş için iade talebi açılabiliyor mu, 48h pencere banner'ı + ChangedMindWarning görünüyor mu (Faz 4C eklentileri). Not al.

- [ ] **Step 5: Rapor satırı + skor + commit**

`## 10. İade / dispute — <durum>`, skor satır 10.
```bash
git add apps/mobile/docs/WEB_MOBILE_VERIFICATION_REPORT.md
git commit -m "test(parity): İade / dispute doğrulama sonucu"
```

---

## Task 12: Satıcı paneli doğrulama

**Files:** Modify: `apps/mobile/docs/WEB_MOBILE_VERIFICATION_REPORT.md`

- [ ] **Step 1: API — satıcı sipariş listesi + detay**

Run:
```bash
STOKEN=$(cat /tmp/tarodan-seller-token)
curl -s --max-time 30 -o /dev/null -w "sales:%{http_code}\n" "http://localhost:3001/api/orders/sales" -H "Authorization: Bearer $STOKEN"
curl -s --max-time 30 -o /dev/null -w "seller_dashboard:%{http_code}\n" "http://localhost:3001/api/seller/dashboard" -H "Authorization: Bearer $STOKEN"
```
Expected: `sales:200`; dashboard yolu farklıysa gerçek route'u `packages/api-client/src/endpoints/*` veya ilgili controller'dan al. `/tmp/tarodan-seller-token` Task 6'da üretildi; yoksa Task 6 Step 1'deki login'i tekrar çalıştır.

- [ ] **Step 2: Mobil kod uyumu**

Run:
```bash
grep -rn "orders/sales\|seller/dashboard\|sales/" apps/mobile/app/sales apps/mobile/app/seller 2>/dev/null | head
```
Expected: mobil `sales/*` ↔ web `seller/orders/[id]` özellik seti; diff varsa not (spec §5/5).

- [ ] **Step 3: Maestro (bütçe 5 dk/flow)**

Run:
```bash
cd apps/mobile
maestro test maestro/flows/05-ilanlarim-diagnostic.yaml
maestro test maestro/flows/D-03-orders-list-smoke.yaml
```
Expected: `Flow Passed`.

- [ ] **Step 4: Manuel kontrol**

Elle: satıcı sipariş detayı (durum, kargola butonu, müşteri bilgisi) web ile eş mi. Eksik alan varsa `BUG-NNN`.

- [ ] **Step 5: Rapor satırı + skor + commit**

`## 11. Satıcı paneli — <durum>`, skor satır 11.
```bash
git add apps/mobile/docs/WEB_MOBILE_VERIFICATION_REPORT.md
git commit -m "test(parity): Satıcı paneli doğrulama sonucu"
```

---

## Task 13: Kapanış — özet + bulgu önceliklendirme + ortam geri alma

**Files:** Modify: `apps/mobile/docs/WEB_MOBILE_VERIFICATION_REPORT.md`, `apps/api/.env` (geri al)

- [ ] **Step 1: Genel skor + kapanış özeti**

Raporun "## Kapanış" bölümünü doldur: kaç `✅ / ⚠️ / ❌ / ⛔`, kritik bulgular (kargo/ödeme/auth), kalan iş. Genel Skor tablosunun tamamen dolu olduğunu doğrula (11/11 satır).

- [ ] **Step 2: Bulgu kuyruğunu önceliklendir**

"## Bulgu Listesi" tablosundaki tüm `BUG-NNN` satırlarını önem (kritik > orta > düşük) sırasına diz. Her satırda web'de var/yok + kanıt + önerilen düzeltme dolu olmalı.

- [ ] **Step 3: Ortamı geri al (commit YOK olan değişiklik)**

`apps/api/.env`'de `PAYMENT_BYPASS=true` → `PAYMENT_BYPASS=false` geri al. Geçici dosyaları temizle:
```bash
rm -f /tmp/tarodan-token /tmp/tarodan-seller-token /tmp/tarodan-login.json
git diff --stat apps/api/.env || true
```
Expected: `.env` yalnızca yerelde değişti, commit edilmeyecek (zaten gitignore/secret). Skor tablosu ve rapor commit'li.

- [ ] **Step 4: Final commit**

```bash
git add apps/mobile/docs/WEB_MOBILE_VERIFICATION_REPORT.md
git commit -m "test(parity): doğrulama kapanışı — skor özeti + önceliklendirilmiş bulgu kuyruğu"
```
Expected: commit oluştu. Rapor tamamlanmış; kullanıcıya tek paragraf özet sun (ne çalışıyor / bozuk / eksik + sıradaki düzeltme önerisi).

---

## Notlar

- **Endpoint yolları:** Plan, `packages/api-client/src/endpoints/*`'teki yolları temel alır. Bir curl `404` dönerse, doğru yolu ilgili endpoint dosyasından veya `apps/api/src/modules/<m>/<m>.controller.ts`'ten teyit et ve gerçek yolu kullan — bunu bir bulgu değil, plan düzeltmesi olarak ele al (yol değişmiş olabilir).
- **jq alan adları:** Yanıt zarfı `.data` / `.items` / düz dizi olabilir; ilk çağrıda `/tmp/tarodan-login.json` ve benzeri çıktılara bakıp doğru alanı seç, sonraki task'larda tutarlı kullan.
- **Maestro manual-tag flow'ları** (E-01/02/04/05/06/08) backend fixture'a bağımlıdır; donma = blocker değil, "fixture eksik" notu yeterli.
- **Bu plan kod yazmaz**, doğrular. İstisna: blocker + tek-satır aşikar düzeltme (Bulgu Kaydı Kuralı).
