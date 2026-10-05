# Süreler ve Kurallar — iş sürelerinin tek kaynağı

Platformdaki her iş süresi (ilan ömrü, teklif geçerliliği, takas / sipariş /
iade pencereleri, ödeme zaman aşımları, operasyon alarm eşikleri) ve süre
dolunca ne olacağı **admin panelinden** yönetilir: **Sistem → Süreler ve
Kurallar** (`/system/timing-rules`). Değişiklik deploy gerektirmez.

| Katman           | Yer                                                                  |
| ---------------- | -------------------------------------------------------------------- |
| Kayıt (registry) | `packages/types/src/timing-rules.ts` → `TIMING_RULES`                |
| Okuma katmanı    | `apps/api/src/common/timing-rules/timing-rules.resolver.ts`          |
| Env geri düşüşü  | `apps/api/src/config/timing-env.ts`                                  |
| Admin yazma      | `PATCH /api/admin/timing-rules` (`modules/timing-rules` + admin ops) |
| Admin okuma      | `GET /api/admin/timing-rules`                                        |
| Herkese açık     | `GET /api/timing-rules` (`PUBLIC_TIMING_RULE_IDS`)                   |
| Admin ekranı     | `apps/admin/src/app/(admin)/system/timing-rules`                     |

## Çözüm sırası

Her süre üç katmandan çözülür; ilk **geçerli** değer kazanır:

1. **PlatformSetting satırı** (`settingKey`) — admin ekranından yazılır.
2. **Eski env değişkeni** (`envKey`) — yalnız ilk kurulum geri düşüşüdür.
3. **Kayıt varsayılanı** (`default`) — taşımadan önceki kod varsayılanı.

Admin bir değer kaydedene kadar sonuç, taşımadan önceki env/sabit okumasıyla
aynıdır: **deploy tek başına hiçbir süreyi değiştirmez.**

**Eski satırlar env'in önüne geçmez.** `updated_by` alanı boş bir satır bu
ekrandan önce yazılmıştır (seed ya da eski genel ayar ucu). Eski kod env'i olan
kayıtlarda bu satırları hiç okumuyordu (seed'deki `offer_expiry_hours=24` ölüydü,
kod `OFFER_EXPIRY_HOURS`'u okuyordu). Bu yüzden: env ayarlıysa env, değilse eski
satır, o da yoksa varsayılan. Env'i olmayan kayıtlarda (takas süreleri,
`payment_hold_days`) eski satır eskisi gibi okunur. Süreler ve Kurallar ucunun
yazdığı satırlar `updated_by` taşır ve her zaman kazanır.

**Sınır dışı değerler — karar.** Boş, sayı olmayan ya da 1'den küçük değer o
katmanı yok sayar (bir sonrakine düşülür); akışı çökerten tek değerler bunlardır
(sıfır/eksi pencere parayı anında açar, siparişi anında iptal eder) ve hiçbir
katmandan üretilmez. Ondalık değer aşağı yuvarlanır. 1 ve üstü ama admin
sınırlarının dışındaki bir değer (ör. env'de `RETURN_WINDOW_DAYS=7`, eski
ekrandan girilmiş 500 saatlik takas yanıtı) bugün nasıl uygulanıyorsa öyle
uygulanır — deploy davranış değiştirmez — ama sessiz kalmaz: `outOfBounds` ile
işaretlenir, admin ekranında satırda uyarı olarak görünür ve admin düzeltebilir.
Bu bir kilit değildir; diğer satırlar kaydedilebilir.

Admin sınırları (min/max, alanlar arası kurallar) **yazmada** uygulanır.

Okuma önbelleksizdir (tek indeksli satır): değişiklik web ve worker
süreçlerinde aynı anda geçerli olur.

Seçili eylem ayrı bir satırda durur: `<settingKey>_on_expiry`. Satır yoksa,
tanımsız ya da henüz açılmamış bir eylem içeriyorsa kaydın `defaultAction`'ı
(bugünkü davranış) geçerlidir.

## Yazma kuralları (sunucu + admin formu aynı fonksiyonlar)

Yalnız **değişen** satırlar doğrulanır (sunucu ve form aynı). Dokunulmamış,
sınır dışı bir satır başka bir satırın kaydını engellemez. Hatalı alan gizli
bir sekmedeyse sekme işaretlenir ve sayfada adıyla listelenir.

- Değer **tam sayı** ve kaydın `min`–`max` aralığında olmalı.
- İade (cayma) penceresi en az **14 gün** (Mesafeli Satış Yönetmeliği).
- Payout grace ve takas hold en az **1 gün**.
- Ödeme fail penceresi PayTR 3DS oturumunun (**30 dk**) üstünde olmalı → en az 31.
- Alanlar arası kurallar (değişikliklerin tamamı uygulanmış aday küme üzerinde):
  - `returnDropoffDays ≤ returnDropoffHardDays` (emniyet supabı drop-off'tan kısa olamaz),
  - `listingExpiryWarningDays < listingTtlDays`.
- Eylem kayıtta tanımlı **ve açık** olmalı; "yakında" eylemler doğrudan
  gönderilse bile 400 alır.
- Değişiklikler tek `Serializable` işlemde yazılır; biri geçersizse hiçbiri yazılmaz.
  Çakışmada (P2034) işlem baştan denenir (3 deneme, doğrulama yeni duruma göre
  tekrarlanır); tükenirse `409 server.admin.timingRules.conflict`.
- Yalnız **super_admin** değiştirir (okuma: super_admin + admin, izin `settings`).
- Her değişen kayıt için **zorunlu** denetim kaydı: `timing_rule_update` /
  `TimingRule` / kayıt kimliği, önce/sonra durumuyla — ayar yazımıyla **aynı
  işlemde**; denetim yazılamazsa süreler de değişmez.
- Genel `PATCH /api/admin/settings[/:key]` bu anahtarlara yazmayı **reddeder**.

## Kayıtlar

"Damga" sütunu: değer olayın anında kayda yazılıyorsa (✓) sonradan yapılan
değişiklik o kaydı etkilemez; yazılmıyorsa (✗) her cron turu "şimdi − N" ile
yeniden hesaplar ve değişiklik **yürürlükteki tüm kayıtlara geriye dönük**
uygulanır. ✗ satırlar kayıtta `appliesToInProgress: true` taşır ve admin
ekranında uyarı gösterir.

### İlan

| Kimlik                     | Ayar anahtarı                 | Birim | Vars. | Sınır | Env geri düşüşü    | Eylemler                                | Damga |
| -------------------------- | ----------------------------- | ----- | ----- | ----- | ------------------ | --------------------------------------- | ----- |
| `listingTtlDays`           | `listing_ttl_days`            | gün   | 60    | 7–365 | `LISTING_TTL_DAYS` | **deactivate** · auto_renew _(yakında)_ | ✗     |
| `listingExpiryWarningDays` | `listing_expiry_warning_days` | gün   | 7     | 1–30  | — (eski sabit 7)   | **notify_seller**                       | ✗     |

### Teklif

| Kimlik             | Ayar anahtarı        | Birim | Vars. | Sınır | Env geri düşüşü      | Eylemler                             | Damga         |
| ------------------ | -------------------- | ----- | ----- | ----- | -------------------- | ------------------------------------ | ------------- |
| `offerExpiryHours` | `offer_expiry_hours` | saat  | 24    | 1–168 | `OFFER_EXPIRY_HOURS` | **expire** · extend_once _(yakında)_ | ✓ `expiresAt` |

`offer_expiry_hours` seed'de vardı ama kod env'i okuyordu (ölü ayar). Artık
gerçekten okunur.

### Takas

| Kimlik                     | Ayar anahtarı                      | Birim | Vars. | Sınır | Env geri düşüşü                | Eylemler                             | Damga                    |
| -------------------------- | ---------------------------------- | ----- | ----- | ----- | ------------------------------ | ------------------------------------ | ------------------------ |
| `tradeResponseHours`       | `trade_response_deadline_hours`    | saat  | 72    | 1–336 | —                              | **cancel** · extend_once _(yakında)_ | ✓ `responseDeadline`     |
| `tradePaymentHours`        | `trade_payment_deadline_hours`     | saat  | 48    | 1–336 | —                              | **cancel** · extend_once _(yakında)_ | ✓ `paymentDeadline`      |
| `tradeShippingDays`        | `trade_shipping_deadline_days`     | gün   | 7     | 1–30  | —                              | **cancel_and_refund**                | ✓ `shippingDeadline`     |
| `tradeConfirmationDays`    | `trade_confirmation_deadline_days` | gün   | 3     | 1–30  | —                              | **complete**                         | ✓ `confirmationDeadline` |
| `tradeHoldDays`            | `payment_hold_days`                | gün   | 3     | 1–30  | —                              | **release_funds**                    | ✓ `holdReleaseAt`        |
| `tradeLostParcelGraceDays` | `trade_lost_parcel_grace_days`     | gün   | 14    | 1–90  | `TRADE_LOST_PARCEL_GRACE_DAYS` | **cancel_and_refund**                | ✗ (shippingDeadline + N) |

Takas süreleri eskiden Ayarlar → Takas sekmesindeydi; o sekme kaldırıldı.

### Sipariş

| Kimlik                  | Ayar anahtarı             | Birim | Vars. | Sınır | Env geri düşüşü           | Eylemler                                        | Damga                  |
| ----------------------- | ------------------------- | ----- | ----- | ----- | ------------------------- | ----------------------------------------------- | ---------------------- |
| `preparingDeadlineDays` | `preparing_deadline_days` | gün   | 3     | 1–14  | `PREPARING_DEADLINE_DAYS` | **cancel_and_refund** · extend_once _(yakında)_ | ✓ `preparingDeadline`  |
| `returnWindowDays`      | `return_window_days`      | gün   | 14    | 14–90 | `RETURN_WINDOW_DAYS`      | **complete**                                    | ✓ `returnWindowEndsAt` |

`returnWindowDays` teslimde siparişe **damgalanır**: `Order.returnWindowEndsAt =
deliveredAt + pencere` (`modules/order/helpers/order-return-window.ts`,
`PaymentHoldReleaseService.scheduleHoldReleaseOnDelivery`). Üç karar aynı damgayı
okur: (1) iade talebinin "cayma içinde mi" kararı, (2) teslim → tamamlandı
geçişi, (3) escrow `releaseAt = returnWindowEndsAt + payoutGraceDays`. Admin
pencereyi sonradan uzatıp kısaltsa da bir siparişte iade hakkı ile satıcı
ödemesi çakışamaz. Damgadan önce teslim edilmiş eski siparişler (`NULL`) bugünkü
pencereyle hesaplanır — escrow tarihleri zaten teslimde yazılmıştı, bu yüzden
eski siparişte pencere değiştirilirse eski çakışma riski yalnız onlar için
sürer. Teslim sonrası kargo taraması (`sync-surat-post-delivery-tail`) pencereyi
yalnız geriye bakış sınırı olarak bugünkü değerle kullanır; para/hak kararı
vermez. Migration: `20261005150000_order_return_window_ends_at`.

Sipariş yanıtı (`formatOrderResponse`) `returnWindowEndsAt`'i döndürür: web ve
mobil iade/ödeme tarihini kendileri hesaplamak yerine bunu göstermelidir.

### Ödeme

| Kimlik                      | Ayar anahtarı                  | Birim | Vars. | Sınır  | Env geri düşüşü                | Eylemler                | Damga                |
| --------------------------- | ------------------------------ | ----- | ----- | ------ | ------------------------------ | ----------------------- | -------------------- |
| `orderPaymentWindowHours`   | `order_payment_window_hours`   | saat  | 24    | 1–168  | `ORDER_PAYMENT_WINDOW_HOURS`   | **cancel**              | ✓ `paymentExpiresAt` |
| `paymentReservationMinutes` | `payment_reservation_minutes`  | dk    | 5     | 1–60   | `PAYMENT_TIMEOUT_MINUTES`      | **release_reservation** | ✗ (createdAt + N)    |
| `paymentFailTimeoutMinutes` | `payment_fail_timeout_minutes` | dk    | 35    | 31–240 | `PAYMENT_FAIL_TIMEOUT_MINUTES` | **fail_payment**        | ✗ (charge/createdAt) |
| `payoutGraceDays`           | `payout_grace_days`            | gün   | 1     | 1–30   | `PAYOUT_GRACE_DAYS`            | **release_funds**       | ✓ `releaseAt`        |

### İade

| Kimlik                      | Ayar anahtarı                     | Birim | Vars. | Sınır | Env geri düşüşü                   | Eylemler            | Damga                     |
| --------------------------- | --------------------------------- | ----- | ----- | ----- | --------------------------------- | ------------------- | ------------------------- |
| `returnDropoffDays`         | `refund_return_dropoff_days`      | gün   | 14    | 1–60  | `REFUND_RETURN_DROPOFF_DAYS`      | **close_refund**    | ✗ (returnCreatedAt + N)   |
| `returnDropoffHardDays`     | `refund_return_dropoff_hard_days` | gün   | 21    | 1–120 | `REFUND_RETURN_DROPOFF_HARD_DAYS` | **close_refund**    | ✗ (returnCreatedAt + N)   |
| `returnInspectionHours`     | `refund_return_inspection_hours`  | saat  | 24    | 1–168 | `REFUND_RETURN_INSPECTION_HOURS`  | **finalize_refund** | ✗ (returnDeliveredAt + N) |
| `refundWaitDeliveryMaxDays` | `refund_wait_delivery_max_days`   | gün   | 30    | 1–180 | `REFUND_WAIT_DELIVERY_MAX_DAYS`   | **close_refund**    | ✗ (createdAt + N)         |

Kod emniyet supabını okurken de `max(hard, dropoff)` uygular (env değeri
admin kuralından geçmediği için).

### Operasyon alarmları

Tümü **raise_alert** tek eylemlidir; alarm doğası gereği her turda yeniden
hesaplanır (✗) — bu beklenen davranıştır.

| Kimlik                          | Ayar anahtarı                      | Birim | Vars. | Sınır | Env geri düşüşü                    |
| ------------------------------- | ---------------------------------- | ----- | ----- | ----- | ---------------------------------- |
| `shippedStaleAlertDays`         | `shipped_stale_alert_days`         | gün   | 10    | 1–90  | `SHIPPED_STALE_ALERT_DAYS`         |
| `missingTrackingAlertHours`     | `missing_tracking_alert_hours`     | saat  | 24    | 1–720 | `MISSING_TRACKING_ALERT_HOURS`     |
| `carrierCancellationAlertHours` | `carrier_cancellation_alert_hours` | saat  | 24    | 1–720 | `CARRIER_CANCELLATION_ALERT_HOURS` |
| `invoiceDeadlineDays`           | `invoice_deadline_days`            | gün   | 5     | 1–30  | `INVOICE_DEADLINE_DAYS`            |
| `sellerInvoiceDeadlineDays`     | `seller_invoice_deadline_days`     | gün   | 7     | 1–60  | `SELLER_INVOICE_DEADLINE_DAYS`     |
| `cargoPickupNoDataDays`         | `cargo_pickup_no_data_days`        | gün   | 3     | 1–30  | `CARGO_PICKUP_NO_DATA_DAYS`        |
| `cargoStaleMovementDays`        | `cargo_stale_movement_days`        | gün   | 14    | 1–90  | `CARGO_STALE_MOVEMENT_DAYS`        |

Dashboard kuyruk/uyarı şeridi bu değerleri her derlemede bir kez okur
(`AlertThresholdContext.timing`); cron'lar ve finans özeti aynı kayıttan okur.

## Env değişkenleri — artık yalnız ilk kurulum geri düşüşü

`LISTING_TTL_DAYS`, `OFFER_EXPIRY_HOURS`, `TRADE_LOST_PARCEL_GRACE_DAYS`,
`PREPARING_DEADLINE_DAYS`, `RETURN_WINDOW_DAYS`, `ORDER_PAYMENT_WINDOW_HOURS`,
`PAYMENT_TIMEOUT_MINUTES`, `PAYMENT_FAIL_TIMEOUT_MINUTES`, `PAYOUT_GRACE_DAYS`,
`REFUND_RETURN_DROPOFF_DAYS`, `REFUND_RETURN_DROPOFF_HARD_DAYS`,
`REFUND_RETURN_INSPECTION_HOURS`, `REFUND_WAIT_DELIVERY_MAX_DAYS`,
`SHIPPED_STALE_ALERT_DAYS`, `MISSING_TRACKING_ALERT_HOURS`,
`CARRIER_CANCELLATION_ALERT_HOURS`, `INVOICE_DEADLINE_DAYS`,
`SELLER_INVOICE_DEADLINE_DAYS`, `CARGO_PICKUP_NO_DATA_DAYS`,
`CARGO_STALE_MOVEMENT_DAYS`.

Admin bir kaydı bir kez kaydettiğinde env değeri o kayıt için etkisiz kalır.
Çoğu `config/env.validation.ts`te bildirilmemiştir; yalnız gerçek ortam
değişkeni olarak verildiklerinde etkilidir (CLAUDE.md §15) — bu davranış
bilerek korundu.

**Env'de kalanlar (iş kuralı değil, teknik):** `PAYTR_RECONCILE_AMOUNT_TOLERANCE_TL`,
`PAYTR_ORPHAN_LOOKBACK_HOURS`, `PAYTR_RECONCILIATION_MIN_AGE_MINUTES`,
`PAYTR_HASH_MISMATCH_WINDOW_SEC`, `LEDGER_RECONCILE_WINDOW_DAYS`,
`NOTIFICATION_LOG_RETENTION_DAYS`, `OUTBOX_*` (ms/sayaç), `*_TIMEOUT_MS`,
`*_MAX_RETRIES` / `*_RETRY_BASE_MS`, `GUEST_CHECKOUT_OTP_TTL_SEC`,
`JWT_*_EXPIRES_IN`, `FEATURE_48H_CONFIRMATION_WINDOW` (bayrak).

## Herkese açık uç

`GET /api/timing-rules` → `{ [kimlik]: { value, unit } }`. İçerik:
`listingTtlDays`, `listingExpiryWarningDays`, `offerExpiryHours`,
`tradeResponseHours`, `tradePaymentHours`, `tradeShippingDays`,
`tradeConfirmationDays`, `tradeHoldDays`, `preparingDeadlineDays`,
`returnWindowDays`, `orderPaymentWindowHours`, `payoutGraceDays`,
`returnDropoffDays`, `returnInspectionHours`. Alarm eşikleri, ödeme
fail/rezervasyon süreleri ve iç emniyet supapları dönmez.

`packages/shared/src/policy-constants.ts` sabitleri yalnız bu uç yüklenene
kadar kullanılacak **geri düşüş** kopyalarıdır; kayıt varsayılanlarıyla eşitliği
`timing-rules.registry.spec.ts` ile korunur.

## Bilinen, atanmış iş (paket 5 — kullanıcı metinleri)

Ön yüzler henüz `GET /api/timing-rules`'u ve siparişteki `returnWindowEndsAt`'i
okumuyor; tarihleri hâlâ `@tarodan/shared` geri düşüş sabitlerinden hesaplıyor:

- web: `apps/web/src/app/[locale]/(main)/profile/(commerce)/orders/[id]/_lib/types.ts`
  (`ESCROW_RELEASE_DAYS` ile ödeme tarihi, `REFUND_COOLING_OFF_DAYS` ile iade
  penceresi),
- admin: `apps/admin/src/lib/escrow.ts` (`ESCROW_RELEASE_DAYS`,
  `REFUND_WINDOW_DAYS`).

Admin pencereyi değiştirdiğinde bu ekranlar yanlış tarih gösterir. Paket 5:
sipariş tarihlerini sunucudan (`returnWindowEndsAt`, hold `releaseAt`), politika
metinlerini `GET /api/timing-rules`'tan okuyacak.

## Sonraki paketler için: yeni eylem açmak

Kayıtta `available: false` duran eylemler (`auto_renew`, `extend_once`)
şimdiden listelenir ve admin seçicisinde "yakında" görünür. Bir eylemi açmak:

1. `TIMING_RULES[...]` içinde ilgili seçeneği `available: true` yap.
2. Davranışı yaz: süre dolumunu işleyen cron/servis
   `resolveTimingAction(db, id)` ile seçili eylemi okuyup dallanır (bugün hiçbir
   yer okumaz, çünkü her kaydın tek açık eylemi var).
3. `timing-rules.registry.spec.ts`teki `LATER_ACTIONS` sözleşmesini güncelle.

Yeni bir süre eklemek: `TIMING_RULES`'a kayıt + `admin.timingRules.rules.<id>`
etiketleri (tr/en) + okuyan yerde `resolveTimingValue(db, "<id>")`.
