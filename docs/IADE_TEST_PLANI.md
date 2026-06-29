# İade Akışı — Kapsamlı Test Planı

> Amaç: Gerçek bir müşteri sitede iade talep ettiğinde uçtan uca hiçbir sorun
> yaşanmadığından emin olmak. Tüm edge case'ler, admin işlemleri, izinler/onaylar,
> cron'lar ve gerçek-para (PayTR) hareketi sistematik test kapsamına alınır.

## 0. Strateji & TDD protokolü

İade akışı **çoğunlukla mevcut kod** (yeni feature değil). Bu yüzden iki mod:

1. **Karakterizasyon testi** (mevcut doğru davranış): testi yaz, koş; geçerse
   davranışı kilitlemiş oluruz (regresyon kalkanı). Geçmezse → bug bulduk.
2. **Bug-fix TDD** (Iron Law): test boşluğu bir bug ortaya çıkarırsa **önce kırmızı
   test yaz → çökmesini izle → minimal fix → yeşil**. Asla testsiz fix yok.

**Katmanlar (güven piramidi):**
- **L1 — Unit** (`src/modules/**/*.spec.ts`): saf mantık, hızlı, mock minimal.
- **L2 — API e2e** (`test/e2e/*.e2e-spec.ts`, izole `tarodan_test` DB, PayTR **mock**):
  orkestrasyon + DB durum geçişleri + cron'lar. **Gerçek PayTR'yi kanıtlamaz.**
- **L3 — Frontend e2e** (web Playwright + admin): kullanıcı/admin gerçekten tıklayınca.
- **L4 — Gerçek PayTR canlı doğrulama** (manuel, gerçek/test-merchant): para karta
  ulaşıyor mu — **otomatikleştirilemez**, operasyonel adım.

**Pristine çıktı kuralı:** her test koşusu hatasız/uyarısız geçmeli.

---

## 1. İade akışı durum makinesi (referans)

Akış **tam otomatik** — insan onay/inceleme/itiraz adımı YOK (satıcı onay + dispute
kaldırıldı). Ulaşılabilir statüler:

```
createRefundRequest (alıcı)
  ├─ kargo öncesi (paid/preparing, shipment yok) → INSTANT
  │     approved → (processRefund) → refunded                [PayTR iade + Sürat iptal]
  ├─ teslim ≤14 gün (cooling-off)
  │     approved → wait_for_delivery
  │        → (cron: openReturnShipmentsForDeliveredOrders) → return_shipment_open
  │        → (Sürat webhook) → return_in_transit → return_delivered
  │        → (cron: finalizeReturnedShipments / force-finalize) → refunded
  └─ teslim >14 gün → BLOKE (400, talep oluşmaz)
cancelled ← alıcı pending/wait_for_delivery iken iptal eder
```
Ölü statüler (yalnız legacy veri + defensive guard): `pending_review`, `disputed`, `rejected`.

İlgili cron'lar:
- **refund-scheduler** (10 dk): `openReturnShipmentsForDeliveredOrders`, `finalizeReturnedShipments`
- **payment-scheduler** (5 dk): `processRefundedOrders`, `expireUnpaidOrders`, `cancelExpiredPayments`, `releaseExpiredOrderReservations`, `reconcileReservedQuantities`, `sweepOutOfStockProducts`; (saatlik) `releaseHoldsDue` + `createPayoutsForReleasedHolds`; (30 dk) `handleExpiredPreparingOrders`

---

## 2. Test alanları

Kapsama etiketleri: ✅ COVERED · 🟡 KISMİ · ❌ BOŞLUK · 🖐 MANUEL/L4

### A. Talep oluşturma — `createRefundRequest`
| # | Senaryo | Beklenen | Durum |
|---|---------|----------|-------|
| A1 | paid + kargo yok → instant | `approved`→`refunded`, PayTR iade, Sürat iptal | ✅ refund-flow |
| A2 | teslim ≤14g → cooling-off | `wait_for_delivery`, hold dondurulur | ✅ refund-flow |
| A3 | teslim >14g | 400 "süre doldu", talep yok | ✅ refund-flow |
| A4 | `pending_payment` sipariş | 400 (önce siparişi iptal et) | ✅ refund-flow |
| A5 | alıcı dışı (satıcı/3.kişi) | 403 | ✅ refund-flow |
| A6 | aynı siparişte aktif talep varken tekrar | 400 duplicate | ✅ refund-flow |
| A7 | üyelik siparişi (MEM-*) | 400 (iade edilemez) | ✅ refund-membership-guard |
| A8 | adet bazlı kısmi tutar | `total*qty/orderQty` | ✅ refund-partial-amount (A10) |
| A9 | kurumsal satıcı KDV iade tutarı | ürün+KDV (made-whole) | ✅ refund-partial-amount |
| A10 | `refundQuantity > orderQuantity` | tam tutara clamp | ✅ refund-partial-amount |
| A11 | olmayan/başkasının siparişi | 404/403 | 🟡 doğrula |

### B. Cooling-off / iade kargosu yaşam döngüsü (cron'lar)
| # | Senaryo | Beklenen | Durum |
|---|---------|----------|-------|
| B1 | teslim olunca iade kargosu açılır (cron) | `return_shipment_open`, Sürat etiketi `Iademi=true` | ✅ refund-flow |
| B2 | henüz teslim değilse açılmaz | `wait_for_delivery` kalır | ✅ refund-flow |
| B3 | Sürat webhook tracking (in_transit→delivered) | statü ilerler | ✅ refund-flow |
| B4 | `finalizeReturnedShipments` return_delivered.ı bitirir | `refunded`, PayTR iade | ✅ refund-flow (B3/B5) |
| B5 | finalize 30dk fallback | cron finalize eder | ✅ refund-flow |
| B6 | satıcı adresi yoksa depo fallback | iade yine açılır | ✅ refund-flow |

### C. İade tutarı & politika
| # | Senaryo | Beklenen | Durum |
|---|---------|----------|-------|
| C1 | tam iade | `totalAmount` | ✅ |
| C2 | adet bazlı orantı | proporsiyonel | 🟡 unit |
| C3 | admin override-policy tutar yeniden hesap | doğru parçalı tutar | ✅ refund-flow |
| C4 | `subtotal` NULL türetme | `total-shipping-buyerFee` | ✅ unit refund-partial-amount |
| C5 | KDV davranışı (kurumsal) | ürün+KDV iade (tutarlı) | ✅ refund-partial-amount |
| C6 | iade kargo ödeyeni (buyer/seller/platform) | doğru atanır | ✅ refund-flow |

### D. PayTR gerçek iade — `createRefund`
| # | Senaryo | Beklenen | Durum |
|---|---------|----------|-------|
| D1 | endpoint/hash/tutar (ONDALIK TL) | `/odeme/iade`, HMAC-SHA256, `10.25` formatı | ✅ paytr.service.spec |
| D2 | `status!=success` → throw | BadRequest (err_msg) | ✅ paytr.service.spec |
| D3 | "ödeme henüz bildirilmemiş" hatası | "1-2 dk sonra deneyin" mesajı | ✅ b3 spec |
| D4 | oid normalizasyon (tire temizleme) | doğru oid | ✅ paytr.service.spec |
| D5 | B3 refund-in-progress marker (çift-iade guard) | marker varsa PayTR atla | ✅ payment-trade-cash-refund-b3 |
| D6 | `PAYMENT_BYPASS=true` gerçek çağrıyı atlar | DB'de `refunded` | ✅ payment-bypass.e2e |
| D7 | **canlı gerçek iade** → PayTR panel + banka ekstresi | para karta ulaşır | 🖐 L4 manuel |

### E. Escrow hold etkileşimi
| # | Senaryo | Beklenen | Durum |
|---|---------|----------|-------|
| E1 | iade açılınca hold dondurulur | `frozenByRefundId` set | ✅ refund-flow |
| E2 | iade açıkken hold release olmaz | payout çıkmaz | ✅ refund-flow (E2/E4) |
| E3 | iade iptal → hold çözülür | `frozenByRefundId` null | ✅ refund-flow |
| E4 | 14. gün son saniye iade vs payout yarışı | hold frozen, payout bloke | ✅ refund-flow (E2/E4) |
| E5 | iade sonrası PayoutTransfer oluşmaz | yok | ✅ money-flow |

### F. Sipariş iptali → iade
| # | Senaryo | Beklenen | Durum |
|---|---------|----------|-------|
| F1 | `pending_payment` iptal | `cancelled`, stok serbest, ledger yok | ✅ edge-cases |
| F2 | paid/preparing iptal | `refunded` → PayTR iade | ✅ refund-flow |
| F3 | kargolandıktan sonra iptal | 400 reddedilir | ✅ refund-flow |
| F4 | `processRefundedOrders` cron failed iadeyi retry | iade tamamlanır | ✅ refund-flow |
| F5 | iptalde komisyon ledger `waived` | doğru statü | ❌ ekle |

### G. Takas nakit iadesi
| # | Senaryo | Beklenen | Durum |
|---|---------|----------|-------|
| G1 | takas iptal → nakit iade | PayTR iade | ✅ money-flow |
| G2 | admin depo reddi → iade | iade + dönüş kargosu | ✅ money-flow |
| G3 | süre aşımı auto-cancel → iade | iade tetiklenir | ✅ money-flow (wiring) |
| G4 | B3 marker | çift-iade yok | ✅ b3 spec |
| G5 | idempotency (releasedAt/refundedAt/payout guard) | ikinci çağrı atlanır | ✅ b3 spec |

### H. Admin işlemleri & izinler
| # | Senaryo | Beklenen | Durum |
|---|---------|----------|-------|
| H1 | force-finalize `refund_requests` izni ister | moderator 403, admin OK | ✅ roles.guard.spec |
| H2 | override-policy izni | moderator 403 | ✅ roles.guard.spec |
| H3 | set-shipping-payer izni | moderator 403 | ✅ roles.guard.spec |
| H4 | manual-refund (`payments` izni) | moderator 403 | ✅ roles.guard.spec |
| H5 | retry-refund `refund_requests` ister | moderator 403, admin/super OK | ✅ roles.guard.spec |
| H6 | refund-requests list/detail moderator | 403 | ✅ roles.guard.spec |
| H7 | super_admin matris bypass | her zaman geçer | ✅ roles.guard.spec |

### I. Cron idempotency & dayanıklılık
| # | Senaryo | Beklenen | Durum |
|---|---------|----------|-------|
| I1 | processRefundedOrders iki kez → yan etki yok | idempotent | ✅ refund-flow |
| I2 | `processRefundedOrders` refunded bulur | iade çağrılır | ✅ refund-flow (F2/F4) |
| I3 | `releaseHoldsDue` frozen hold atlar | payout yok | ✅ refund-flow (E2/E4) |
| I4 | `finalizeReturnedShipments` 30dk fallback | finalize | ✅ refund-flow (B5) |

### J. Bildirimler
| # | Senaryo | Beklenen | Durum |
|---|---------|----------|-------|
| J1 | `REFUND_APPROVED` gönderilir | alıcıya in-app | ✅ refund-flow |
| J2 | `REFUND_CANCELLED` gönderilir | satıcıya | ✅ refund-flow |
| J3 | kaldırılan tipler (REJECTED/DISPUTED) üretilmez | hiç | ✅ (kod kaldırıldı) |

### K. Frontend (web alıcı + admin)
Web journey suite (apps/web/e2e/journeys, Playwright API-seviyesi, tarodan_test DB).
**Çalıştırma:** kendi web+api server'larını ayağa kaldırır (:3000/:3001); dev server'lar
kapalıyken veya CI'da koşulmalı (dev :3001'i tutuyorsa çakışır → bu turda çalıştırılmadı).
| # | Senaryo | Beklenen | Durum |
|---|---------|----------|-------|
| K1 | alıcı kargo öncesi/cooling-off iade talep eder | talep oluşur + statü | 🟡 j008/j009/j037 (harness gerekir) |
| K2 | alıcı iade statüsünü/akışını görür | doğru adım | 🟡 j009 |
| K3 | alıcı talebini iptal eder | `cancelled` | 🟡 j081/j093 + backend E3/J2 ✅ |
| K-fix | bayat journey'ler güncellendi | kaldırılmış akış temiz | ✅ j010 yeniden yazıldı (>14g bloke), j084/j085 emekli (describe.skip) |
| K4 | admin "İade Takibi" liste/detay render | hatasız | ❌ admin Playwright altyapısı YOK (ayrı infra işi) |
| K5 | admin aksiyon butonları izne göre | yetkisizde görünmez/403 | ✅ backend roles.guard.spec (H); admin UI infra yok |
| K6 | stepper doğru aşama ("İnceleme" yok) | otomatik akışa uygun | ✅ kod fix'i (RefundStatusStepper, 1c7e4b1d); UI render testi infra yok |

### L. Gerçek müşteri uçtan uca (manuel / staging) — L4
| # | Senaryo | Beklenen |
|---|---------|----------|
| L1 | staging/local PAYMENT_BYPASS=true tam akış | uçtan uca yeşil |
| L2 | prod `PAYTR_TEST_MODE=0` + gerçek merchant | yanlış config sessiz fail etmez |
| L3 | gerçek küçük ödeme→iade → PayTR panel "tamamlandı" + ekstre | para karta ulaşır |

> **NEDEN OTOMATİK DEĞİL:** L2/L3 gerçek PayTR merchant'ı + gerçek kart/banka
> gerektirir; e2e PayTR'yi mock'lar (orkestrasyonu kanıtlar, para hareketini DEĞİL).
> Aşağıdaki runbook (§6) elle bir kez koşulmalı — özellikle **prod'a ilk gerçek
> iade öncesi**.

---

## 6. Canlı PayTR Doğrulama Runbook'u (L4 — elle)

### L1 — Staging/local tam akış (PAYMENT_BYPASS=true)
1. `cd apps/api && cp .env.test .env.local-stg` (veya staging env) — `PAYMENT_BYPASS=true`.
2. Stack: `pnpm docker:up` + API + web ayağa.
3. Web'den: ürün al → ödeme (bypass-complete) → sipariş `paid`.
4. İade senaryoları (her biri için DB'de durum doğrula):
   - Kargo öncesi iptal → `cancelled`, stok serbest, iade yok.
   - paid iptal → `refunded` → `processRefundedOrders` cron → `cancelled` + payment `refunded`.
   - Teslim ≤14g → iade talebi → `wait_for_delivery`/`return_shipment_open` → kargo döndür → `refunded`.
   - Teslim >14g → iade talebi **400 bloke**.
5. Beklenen: tüm geçişler e2e ile birebir (zaten 72/72 yeşil).

### L2 — Prod config doğrulama (gerçek iade ÖNCESİ zorunlu)
- [ ] Coolify/prod env: `PAYTR_TEST_MODE=0` (veya unset DEĞİL — `parsePaytrTestMode` boş/undefined'ı **test** sayar! Mutlaka `0` yaz).
- [ ] `PAYTR_MERCHANT_ID` / `PAYTR_MERCHANT_KEY` / `PAYTR_MERCHANT_SALT` = PayTR panelindeki gerçek değerler.
- [ ] `PAYMENT_BYPASS` prod'da `false` (veya unset).
- [ ] Sağlık: API başlangıç loglarında PayTR config uyarısı yok.
- ⚠️ Risk: yanlış config sessiz fail eder (runtime guard yok) — bu yüzden L3 şart.

### L3 — Gerçek uçtan uca iade (tek seferlik, küçük tutar)
1. Gerçek bir test kartıyla **küçük tutarlı** (örn. en düşük) bir sipariş öde.
2. Admin/alıcı akışından iadeyi tetikle (kargo öncesi iptal en hızlısı).
3. **PayTR merchant paneli** → İşlemler/İade geçmişi → ilgili `merchant_oid` için iade
   kaydı **"tamamlandı/başarılı"** görünmeli.
4. Alıcının **banka ekstresinde** iade 1–5 iş günü içinde yansımalı (kartına geri).
5. DB: `payment.status='refunded'`, `order.status='cancelled'` (veya trade için `tradeCashPayment.refundedAt`).
6. ❌ Sapma görürsen: `merchant_oid` eşleşmesi (providerConversationId), tutar (ondalık TL),
   ve PayTR err_msg'i kontrol et (loglar).

### Öneri (canlı güveni artırmak için — opsiyonel kod işi)
- PayTR iade **callback/webhook**'u işleme (şu an yalnız senkron yanıta güveniliyor).
- `RefundRequest`/`payment` ↔ PayTR paneli **mutabakat cron'u** (asenkron settlement teyidi).

---

## 3. Öncelik & uygulama sırası

**Faz 1 — Para-yolu & yetki (en yüksek risk):**
H1–H4, H6 (admin izinleri) · D2–D4 (PayTR yanıt/oid unit) · E1–E4 (hold/refund yarışı) · F2–F4 (iptal→iade + cron retry)

**Faz 2 — Tutar & cooling-off doğruluğu:**
A7–A10, C3, C5, C6, B3, B5, B6

**Faz 3 — Cron idempotency & bildirimler:**
I1–I4, J1–J2, G3, G5

**Faz 4 — Frontend e2e:**
K1–K6 (web buyer + admin)

**Faz 5 — Canlı doğrulama (manuel):**
L1–L3

## 4. TDD uygulama protokolü (her test case için)
1. Test dosyasına yeni `it(...)` ekle (Given/When/Then net).
2. **Koş, çökmesini izle.** Karakterizasyonsa ve hemen geçtiyse: davranış kilitlendi, devam. Beklenmedik geçerse senaryoyu sıkılaştır.
3. Boşluk bir **bug** ortaya çıkardıysa: kırmızı test bırak → minimal fix → yeşil → ayrı commit "fix + regresyon testi".
4. Suite'i yeşil ve pristine bırak.

## 5. Bilinen boşluk/uyarılar
- **L4 (gerçek PayTR)** otomatik kanıtlanamaz — e2e mock'la. Canlı doğrulama şart.
- ✅ ÇÖZÜLDÜ: e2e 429 rate-limit flakiness — ThrottlerModule.forRoot skipIf(NODE_ENV===test) ile test ortamında atlanıyor (prod etkilenmez). refund + trade + money + escrow + edge + payment-window: 72/72 yeşil.
