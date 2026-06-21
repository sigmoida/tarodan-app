# Tarodan — PayTR Ödeme & Escrow Entegrasyonu (Otoriter Dokümantasyon)

> **Üst not:** Bu doküman `development` branch'indeki CANLI koddan üretilmiştir. Repodaki `payment-shipping-integration-incomplete` branch'inin dokümanları (`PAYMENT_SHIPPING_FLOW.md`, `ORDER_FLOW_TR.md`) **9 Mart 2026 tarihli ve bayattır** — eski "manuel satıcı kargosu + escrow payout YOK" tasarımını anlatır ve mevcut akışla çelişir. Bu dokümanı tek doğru kaynak (single source of truth) olarak kullanın; bayat branch dokümanlarını onboarding'de okumayın.
>
> Tüm teknik iddialar `dosya:satır` referansıyla işaretlidir; referanslar `apps/api/src/...` köküne görelidir (aksi belirtilmedikçe).

---

## İçindekiler

1. [Yönetici Özeti](#1-yönetici-özeti)
2. [Mimari Genel Bakış](#2-mimari-genel-bakış)
3. [Kullanılan Teknolojiler & Bağımlılıklar](#3-kullanılan-teknolojiler--bağımlılıklar)
4. [Yapılandırma & Ortam Değişkenleri](#4-yapılandırma--ortam-değişkenleri)
5. [Veri Modeli](#5-veri-modeli)
6. [PayTR Provider Sözleşmesi](#6-paytr-provider-sözleşmesi)
7. [Uçtan Uca Akışlar](#7-uçtan-uca-akışlar)
8. [Zamanlanmış İşler & Worker](#8-zamanlanmış-i̇şler--worker)
9. [Frontend Akışları](#9-frontend-akışları)
10. [Admin Operasyon Yüzeyleri](#10-admin-operasyon-yüzeyleri)
11. [Güvenlik & Bütünlük](#11-güvenlik--bütünlük)
12. [Test Kapsamı & Garanti Edilen Davranışlar](#12-test-kapsamı--garanti-edilen-davranışlar)
13. [Eksikler, Riskler ve Tutarsızlıklar](#13-eksikler-riskler-ve-tutarsızlıklar)
14. [Açık Sorular & Öneriler](#14-açık-sorular--öneriler)

---

## 1. Yönetici Özeti

Tarodan'ın tek aktif ödeme sağlayıcısı **PayTR**'dir (Iyzico tamamen kaldırılmıştır; geriye yalnızca ölü konfigürasyon/DTO kalıntıları kalmıştır). Tahsilat (pay-in) **PayTR iFrame token API** üzerinden yapılır: backend `get-token` ile bir token üretir, kullanıcı PayTR'nin barındırdığı güvenli 3D-Secure sayfasında ödeme yapar, sonuç sunucu-sunucu **callback (webhook)** ile ya da istemcinin başarı sayfasından tetiklediği **durum-sorgu (status inquiry)** ile aktive edilir. Para tahsil edildiğinde platform hesabına geçer ve satıcı payı **DB-tabanlı escrow** olarak `PaymentHold` (status=`held`) kaydında tutulur — kart bilgisi Tarodan'a hiç değmez, gerçek bir "escrow hesabı" yoktur; escrow yalnızca bir muhasebe-işaretidir. Hold süresi (`PAYMENT_HOLD_DAYS`, varsayılan 7 gün) dolunca veya teslimat/admin onayı ile hold `released` olur; ardından ayrı bir `PayoutService` cron'u **PayTR Platform Transfer API** ile satıcının IBAN'ına gerçek banka transferini başlatır (`PayoutTransfer` kaydı). Tüm imzalar **HMAC-SHA256 → base64** ile üretilir; ancak hash girdi sırası ve `merchantSalt`'ın konumu uç-noktaya göre değişir. Üç ödeme türü tek `Payment` modeliyle yönetilir: tekil sipariş (`orderId`), sepet/grup (`checkoutGroupId`), takas nakit-fark (`tradeCashPaymentId`).

---

## 2. Mimari Genel Bakış

Sistem dört ana katmandan oluşur:

| Katman | Sorumluluk | Ana Dosyalar |
|---|---|---|
| **Provider** | PayTR HTTP entegrasyonu, HMAC imzalama, ham sözleşme | `modules/payment-providers/paytr.service.ts` |
| **Orchestration** | Ödeme yaşam döngüsü, escrow hold, iade, callback işleme | `modules/payment/payment.service.ts`, `payment.controller.ts` |
| **Payout** | Escrow → satıcı IBAN transferi, retry, returned mutabakatı | `modules/payout/payout.service.ts`, `payout-scheduler.service.ts` |
| **Scheduler/Worker** | Süre-aşımı, mutabakat, hold-release, payout cron'ları | `modules/payment/payment-scheduler.service.ts`, `workers/payment.worker.ts` (ölü kod) |
| **Frontend** | Checkout, 3DS iframe/WebView, success/fail | `apps/web/src/app/payment/*`, `apps/mobile/app/payment/*` |

### ASCII Akış Şeması (Pay-in → Escrow → Payout)

```
  ┌────────────┐   POST /payments/initiate          ┌─────────────────────┐
  │  Alıcı     │ ─────────────────────────────────► │  PaymentController   │
  │ (web/mob)  │                                     │  initiatePayment...  │
  └────────────┘                                     └──────────┬──────────┘
        ▲                                                       │ processPaymentInitiation
        │ paymentUrl / paymentHtml                              ▼
        │                                            ┌─────────────────────┐
        │                                            │  PaymentService      │
        │                                            │  Payment(pending)    │
        │                                            │  rezervasyon (CAS)   │
        │                                            └──────────┬──────────┘
        │                                                       │ processOrderPayment
        │                                                       ▼
        │                                            ┌─────────────────────┐
        │  iframe/WebView (3DS)                       │  PayTRService        │
        └───────────────────────────────────────────►│  createIframeToken   │
                                                       │  → get-token (HMAC)  │
                                                       └──────────┬──────────┘
                                                                  │
                          ┌───────────────────────────────────────┘
                          ▼ (kullanıcı PayTR'de öder)
   PayTR ──webhook──► POST /payments/callback/paytr ──► verifyCallback (HMAC)
                                                          │ geçerli + success
                                                          ▼
                                              ┌────────────────────────────┐
                                              │ processSuccessfulPayment     │
                                              │ • Payment → completed (CAS)  │
                                              │ • Order → preparing          │
                                              │ • stok düşümü + stockout     │
                                              │ • PaymentHold(held, +7gün)   │  ◄── ESCROW
                                              │ • CommissionLedger(pending)  │
                                              └──────────────┬─────────────┘
                                                             │ (releaseAt geçince / teslimat / 7 gün)
                                                             ▼
                          @Cron 0 * * * *  releaseHoldsDue() → PaymentHold.released
                                                             │ (count>0 ise)
                                                             ▼
                          createPayoutsForReleasedHolds() → PayoutTransfer(pending)
                                                             │
                          @Cron */15 * * * *  processPendingPayouts()
                                                             ▼
                                              ┌────────────────────────────┐
                                              │ PayTRService                 │
                                              │ createPlatformTransfer       │
                                              │ → POST /platform/transfer    │  ◄── GERÇEK BANKA TRANSFERİ
                                              └────────────────────────────┘
                                                             ▼
                                                  Satıcı IBAN'ı (SellerBankAccount)
```

`PaymentModule`, `PayTRService`'i `PaymentProvidersModule` üzerinden alır; `payment-providers/payment-providers.module.ts:7-12` servisi `ConfigModule` ile sağlar ve dışa açar.

---

## 3. Kullanılan Teknolojiler & Bağımlılıklar

- **PayTR iFrame API** — `https://www.paytr.com/odeme` tabanı; `baseUrl` sabit kodludur (`paytr.service.ts:122`). Test/canlı ayrımı `test_mode` form alanı ile yapılır; ayrı bir sandbox host yoktur.
- **HMAC-SHA256 / base64** — tüm token ve callback imzaları `crypto.createHmac('sha256', merchantKey).update(...).digest('base64')` ile üretilir (`paytr.service.ts:191-194`, `377-380`, `811-814`). `crypto` modülü Node yerleşiğidir (`paytr.service.ts:3`).
- **NestJS** — `@Injectable` servisler, `@Controller` rotalar, `@Cron` zamanlayıcılar.
- **Prisma + PostgreSQL** — `Payment`, `PaymentHold`, `PayoutTransfer`, `Order`, `Trade`, `TradeCashPayment` modelleri (`prisma/schema.prisma`).
- **HTTP istemcisi** — Node global `fetch` (undici). **DİKKAT:** PayTR çağrılarının hiçbirinde uygulama-seviyesi timeout (`AbortController/signal`) veya retry yoktur; istek undici varsayılan ~300s `headersTimeout`'a kadar askıda kalabilir (`paytr.service.ts:221-227, 295-301, 432-438, 828-832` vd.).
- **@nestjs/schedule** — cron job'ları; `ScheduleModule.forRoot()` 9 modülde tekrarlanır ama NestJS modül-token dedup'ı nedeniyle tek `ScheduleModule` örneğine indirgenir (çift-tetikleme riski yoktur — bkz. Bölüm 13).
- **BullMQ + Redis** — `workers/worker.module.ts`'te `payment` kuyruğu kayıtlıdır ama **hiçbir yerden `.add()` ile beslenmez → `workers/payment.worker.ts` ölü koddur** (gerçek iş cron'larda yapılır).

---

## 4. Yapılandırma & Ortam Değişkenleri

| Değişken | Varsayılan | Açıklama | Referans |
|---|---|---|---|
| `PAYTR_MERCHANT_ID` | — | PayTR mağaza kimliği; tüm hash/isteklerde ilk alan. Constructor'da `trim`'lenir. | `paytr.service.ts:119` |
| `PAYTR_MERCHANT_KEY` | — | HMAC-SHA256 **anahtarı** (`createHmac` key parametresi). | `paytr.service.ts:120` |
| `PAYTR_MERCHANT_SALT` | — | Hash girdisine eklenen tuz; konumu uca göre değişir. | `paytr.service.ts:121` |
| `PAYTR_TEST_MODE` | `true` | `parsePaytrTestMode`: boş/undefined → `true`; `'1'/'true'/'yes'` (trim+lowercase) → `true`. Test modunda `test_mode` ve `debug_on` = `'1'`. | `paytr.service.ts:99-103,123,176` |
| `PAYTR_CALLBACK_URL` | (boş) | Opsiyonel özel Bildirim URL'i; boşsa `API_URL + /api/payments/callback/paytr`. `localhost` içerirse uyarı loglanır. | `paytr.service.ts:125-133` |
| `API_URL` | `http://localhost:3001` | Callback URL tabanı; sondaki `/` temizlenir. | `paytr.service.ts:126` |
| `FRONTEND_URL` | — | `merchant_ok_url` = `/payment/success`, `merchant_fail_url` = `/payment/fail` tabanı. | `paytr.service.ts:164-168` |
| `PAYMENT_HOLD_DAYS` | `7` | Escrow bekletme süresi (gün); `PaymentHold.releaseAt = now + holdDays`. | `payment.service.ts:47,1385-1386` |
| `PREPARING_DEADLINE_DAYS` | `3` | Ödeme sonrası satıcı hazırlama/kargo süresi. | `payment.service.ts:1141-1146` |
| `PAYMENT_TIMEOUT_MINUTES` | `30` | Rezervasyon serbest bırakma ve `cancelExpiredPayments` eşiği. | `payment.service.ts:3578-3583` |
| `PAYMENT_BYPASS` | `false` | `'true'` → PayTR'siz ödeme (dev/test). Prod'da `main.ts:28-44`'teki `assertPaymentBypassNotInProduction` hard-guard'ı (NODE_ENV=production + bypass=true) ile `process.exit(1)` — uygulama hiç ayağa kalkmaz. | `payment.service.ts:218,694-697` |
| `FEATURE_48H_CONFIRMATION_WINDOW` | (flag) | `'true'` → teslimatta `awaiting_buyer_confirmation` + 48h pencere; kapalıysa legacy: anında `delivered` + hold release. | `workers/shipping.worker.ts:37,139` |
| `PAYTR_RECONCILIATION_ENABLED` | `true` | `'false'/'0'` → `reconcilePendingPaytrPayments` no-op. | `payment.service.ts:3479-3482` |
| `PAYTR_RECONCILIATION_MIN_AGE_MINUTES` | `3` | Mutabakat için ödemenin minimum yaşı. | `payment.service.ts:3484-3487` |
| `PAYTR_RECONCILIATION_BATCH_LIMIT` | `40` | Mutabakat batch boyutu. | `payment.service.ts:3488` |
| `PAYTR_RECONCILE_AMOUNT_TOLERANCE_TL` | `0.05` | Mutabakat/hash-mismatch tutar toleransı (TL). | `payment.service.ts:3489` |
| `trade_shipping_deadline_days` (PlatformSetting) | `7` | Takas nakit başarısında `shippingDeadline`. | `payment.service.ts:2072-2075` |
| `payment_hold_days` (PlatformSetting) | `7` | Takas tamamlandığında escrow `holdReleaseAt`. **NOT:** sipariş tarafı env, takas tarafı DB-setting okur → drift kaynağı. | `trade.service.ts:1723-1728` |

> **Önemli boşluk:** `apps/api/env.example.txt` yalnızca `PAYMENT_HOLD_DAYS` ve `ADMIN_SESSION_TIMEOUT`'u dokümante eder; yukarıdaki `PAYMENT_BYPASS`, `PAYMENT_TIMEOUT_MINUTES`, `FEATURE_48H_CONFIRMATION_WINDOW`, tüm `PAYTR_RECONCILIATION_*` ve `SURAT_*` değişkenleri örnek env'de **yoktur**. Ayrıca `IYZICO_API_KEY/SECRET_KEY/BASE_URL` hâlâ örnek env'de ve hatta `infrastructure/docker-compose.prod.yml:174-175`'te prod konteynerine enjekte edilir — ama kodda hiçbir tüketicisi yoktur (ölü/yanıltıcı konfigürasyon).

---

## 5. Veri Modeli

### 5.1 Payment (polimorfik tek-tablo)

`Payment` modeli üç olası kaynağa bağlanabilir; **üçü de `String? @unique`** (`schema.prisma:1086-1088`):

- `orderId` — tekil sipariş satışı
- `checkoutGroupId` — sepet/çoklu-sipariş grubu
- `tradeCashPaymentId` — takastaki nakit fark ödemesi

**DB seviyesinde "tam biri dolu olmalı" CHECK constraint YOKTUR** — invariant tamamen uygulama koduna bağlıdır (bkz. Bölüm 13). Diğer alanlar (`schema.prisma:1084-1107`): `provider String` (her zaman `'paytr'`, enum değil), `providerPaymentId String?` (PayTR iframe token'ı), `providerConversationId String?` (PayTR `merchant_oid` eşleştirme anahtarı), `amount Decimal(10,2)`, `currency @default('TRY')`, `installmentCount Int @default(1)`, `status PaymentStatus @default(pending)`, `failureReason String?`, `metadata Json?` (audit history), `paidAt DateTime?`.

**`PaymentStatus` enum** (`schema.prisma:1885-1891`): `pending`, `processing`, `completed`, `failed`, `refunded`. Pay-in akışında pratikte kullanılanlar: `pending` (başlatma), `completed` (başarı, CAS ile), `failed` (başarısızlık), `refunded` (iade).

### 5.2 PaymentHold (sipariş escrow'u)

`schema.prisma:1109-1127`: `paymentId`, `orderId`, `sellerId`, `amount Decimal(10,2)` (= satıcı net payı = `totalAmount - commissionAmount`), `status PaymentHoldStatus @default(held)`, `releaseAt DateTime?` (serbest bırakma hedef zamanı), `releasedAt DateTime?`. `@@unique([paymentId, orderId])` → aynı sipariş için çift hold engellenir. `payoutTransfer` ile 1:1 ilişki (`HoldPayoutTransfer`).

**`PaymentHoldStatus` enum** (`schema.prisma:1893-1897`): `held`, `released`, `cancelled`. Durum makinesi: `held → released` (teslimat / admin / 7-gün cron), `held → cancelled` (iade / satıcı kargolamadı).

### 5.3 PayoutTransfer (gerçek banka transferi)

`schema.prisma:1145-1175`: `paymentHoldId String? @unique` (sipariş payout'u, 1:1), `tradeCashPaymentId String?` (**@unique DEĞİL** — çift-payout riski, bkz. Bölüm 13), `sellerId`, `amount/commission/netAmount Decimal(10,2)` (netAmount = amount − commission, **DB-doğrulamalı değil**), `currency @default('TRY')`, `merchantOid`, `transId String @unique` (idempotency anahtarı), `transferIban`, `transferName`, `status PayoutStatus @default(pending)`, `retryCount Int @default(0)`, `maxRetries Int @default(3)`, `nextRetryAt`, `providerResponse Json?`, `processedAt`.

**`PayoutStatus` enum** (`schema.prisma:1899-1906`): `pending`, `processing`, `completed`, `failed`, `returned`, `retry_pending` (6 durum).

### 5.4 SellerBankAccount

`schema.prisma:1129-1143`: `userId @unique` (kullanıcı başına tek hesap), `accountHolder`, `iban`, `tcKimlikNo String?`, `taxId String?`, `isVerified Boolean @default(false)`, `verifiedAt DateTime?`. `transferIban/transferName` payout kaydına **değer-kopyası (snapshot)** olarak yazılır; FK ile bağlı değildir (IBAN değişirse pending payout eski IBAN'a gider, bkz. Bölüm 13).

### 5.5 TradeCashPayment (takas nakit escrow'u)

`schema.prisma:600-623`: `tradeId @unique` (takas başına tek nakit ödemesi), `payerId`, `recipientId`, `amount`, `commission`, `totalAmount` (= amount + commission), `provider`, `providerPaymentId String?`, `status PaymentStatus @default(pending)`, `paidAt`, `holdReleaseAt DateTime?` (escrow serbest zamanı — takas tamamlanınca set edilir), `releasedAt`, `refundedAt`. Komisyon `cashAmount * 0.05` (%5) ile **hardcoded** (`trade.service.ts:972`).

### 5.6 Order & statü makinesi

`Order.status` — **`OrderStatus` enum** (`schema.prisma:1872-1883`): `pending_payment`, `paid`, `preparing`, `shipped`, `delivered`, `awaiting_buyer_confirmation`, `completed`, `cancelled`, `refund_requested`, `refunded`.

> **`paid` durumu pratikte hiç kullanılmaz:** `processSuccessfulPayment` ödeme başarısında order'ı doğrudan `pending_payment → preparing` yapar (`payment.service.ts:1151`), `paid`'i atlar. `markAsPreparing` (paid→preparing) ve state-machine'deki `paid` geçişleri ölü/legacy yoldur.

Ödeme penceresi alanları: `paymentExpiresAt DateTime` (NOT NULL, 24h TTL kill-switch), `reservationReleasedAt DateTime?` (30dk rezervasyon serbest işareti), `preparingDeadline`, `confirmationDeadline` (48h pencere), `deliveredAt`, `buyerConfirmedAt`, `buyerConfirmationType`.

### 5.7 CommissionLedger

`schema.prisma:1061-1082`: `orderId @unique`, `sellerCommission`, `buyerFee`, `totalPlatformRevenue`, `status CommissionLedgerStatus @default(pending)`. **`CommissionLedgerStatus` enum** (`schema.prisma:2094-2099`): `pending` (ödeme anı) → `earned` (escrow serbest) / `refunded` (iade) / `waived` (satıcı göndermedi).

### 5.8 KALDIRILAN: payment_methods

`20260612153717_drop_payment_methods` migration'ı saklı kart altyapısını (card_brand, last_four, token_id vb.) ve `user_memberships.payment_method_id` kolonunu tamamen kaldırdı. `UserMembership.autoRenew` alanı kaldı ama anlamı yeniden tanımlandı: artık saklı karttan tahsilat DEĞİL, yalnızca yenileme **hatırlatması** bayrağıdır (`membership-scheduler.service.ts` `processAutoRenewals` bilinçli no-op).

---

## 6. PayTR Provider Sözleşmesi

Tüm imzalar `base64(HMAC-SHA256(merchantKey, <hashStr>))` biçimindedir. **`merchantSalt`'ın konumu uç-noktaya göre değişir** — aşağıda her uç için hashStr girdi sırası TAM olarak verilmiştir.

### 6.1 iFrame Token Üretimi — `createIframeToken`

`paytr.service.ts:149-262`. Tutar `Math.round(amount * 100)` ile kuruşa çevrilir (`:163`). Sepet `encodeBasket` ile base64'lenir: her item `[name, (price*100).toFixed(0), quantity]` → JSON → base64 (`:707-714`).

- **Endpoint:** `POST https://www.paytr.com/odeme/api/get-token`, `Content-Type: application/x-www-form-urlencoded`
- **hashStr** (`:180-190`): `merchant_id + user_ip + merchant_oid + email + payment_amount + user_basket + no_installment + max_installment + 'TL' + test_mode`
- **paytr_token** (`:191-194`): `base64(HMAC-SHA256(merchantKey, hashStr + merchantSalt))` — **salt, update'in İÇİNE, hashStr'in SONUNA** eklenir.
- **Form alanları** (`:197-217`): `merchant_id, user_ip, merchant_oid, email, payment_amount, paytr_token, user_basket, debug_on, no_installment, max_installment, user_name='ad soyad', user_address, user_phone, merchant_ok_url, merchant_fail_url, timeout_limit(dk), currency='TL', test_mode, lang`
- **Dönüş:** `{status:'success'|'failed', token?, reason?}` → `iframeUrl = https://www.paytr.com/odeme/guvenli/{token}` (`:253-256`)
- **currency** her zaman `'TL'` sabittir (`:189,214`); `PayTRPaymentRequest.currency` tipi çok-para-birimi gösterse de o interface ölü koddur — iframe akışı daima TL gönderir.

> **Sepet birimi tuzağı:** `PayTRBasketItem.price` JSDoc'u (`:23`) `'in kuruş'` der ama hem üreticiler hem `encodeBasket` (`:710-711`) onu **TL** kabul eder; tek çağıran zinciri (`processOrderPayment → createIframeToken`) `Number(order.totalAmount)` (TL) iletir, dolayısıyla çalışma zamanında **çift ×100 bug'ı YOKTUR**. Risk yalnızca latent dokümantasyon hatasıdır — yorumu okuyup kuruş geçiren gelecekteki bir çağıran sepeti 100× şişirip hash doğrulamasını bozar.

### 6.2 Durum Sorgu — `queryPaymentStatus`

`paytr.service.ts:273-358`. Kaçırılan callback'leri yakalamak için kullanılır.

- **Endpoint:** `POST https://www.paytr.com/odeme/durum-sorgu`, form-urlencoded
- **hashStr** (`:282`): `merchant_id + merchant_oid + merchant_salt` — **salt update'e dahil, AYRI bir `+salt` YOK**.
- **paytr_token** (`:283-286`): `base64(HMAC-SHA256(merchantKey, hashStr))`
- **Form alanları:** `merchant_id, merchant_oid, paytr_token`
- **Dönüş** (`:317-353`): `status`/`Status` `'success'` ise `{ok:true, paymentTotalTl, paymentAmountTl, paymentDate?, currency}`; aksi `{ok:false, errNo, errMsg}`. Boş veya JSON-olmayan yanıt da güvenli ele alınır (`:303-315`). Tutarlar virgül-ondalıklı olabilir (`'10,8'` → 10.8), `parsePaytrMoneyString` ile parse edilir (`:361-366`).

### 6.3 Callback Doğrulama — `verifyCallback`

`paytr.service.ts:375-383`.

- **hashStr** (`:376`): `merchant_oid + merchant_salt + status + total_amount` — **salt İKİNCİ pozisyonda** (iframe'den ve durum-sorgudan farklı sıra).
- **expectedHash:** `base64(HMAC-SHA256(merchantKey, hashStr))`
- **Karşılaştırma** (`:382`): `callback.hash === expectedHash` — **düz string eşitliği**. `crypto.timingSafeEqual` kullanılmaz (aynı kod tabanında OTP yolunda kullanılmasına rağmen). Hash gizli `merchantKey` ile anahtarlandığından pratik timing yan-kanalı düşüktür ama defense-in-depth eksiğidir.

### 6.4 İade — `createRefund` / `createPartialRefund`

`paytr.service.ts:413-461`. `merchant_oid`'den tüm `-` karakterleri silinir (`:417`). `returnAmount = Math.round(amount*100)` (kuruş).

- **Endpoint:** `POST https://www.paytr.com/odeme/iade`, form-urlencoded
- **hashStr** (`:421`): `merchant_id + merchant_oid + return_amount + merchant_salt` — **salt SONDA, hashStr'e dahil** (`+salt` AYRI değil).
- **paytr_token:** `generateHash(hashStr)` = `base64(HMAC-SHA256(merchantKey, hashStr))` (`:719-724`)
- **Form alanları:** `merchant_id, merchant_oid, return_amount, paytr_token`
- **Dönüş:** `{status:'success'|'error', err_no?, err_msg?, merchant_oid?, return_amount?}`. `status !== 'success'` ise `BadRequestException` **fırlatılır** (`:442-443`) — bu yüzden çağıranlardaki ek `status !== success` kontrolleri ulaşılamaz/ölü daldır.
- `createPartialRefund` doğrudan `createRefund`'a delege eder (kısmi iade = daha düşük `return_amount`).

### 6.5 Platform Transfer (Satıcı Payout) — `createPlatformTransfer`

`paytr.service.ts:789-844`. `merchant_oid`'den `-` silinir, tutarlar kuruşa çevrilir.

- **Endpoint:** `POST https://www.paytr.com/odeme/platform/transfer` (`${baseUrl}/platform/transfer`)
- **hashStr** (`:801-809`): `merchant_id + oid + trans_id + submerchant_amount(kuruş) + total_amount(kuruş) + transfer_name + transfer_iban + merchant_salt`
- **paytr_token** (`:811-814`): `base64(HMAC-SHA256(merchantKey, hashStr))`
- **Form alanları:** `merchant_id, merchant_oid, trans_id, submerchant_amount, total_amount, transfer_name, transfer_iban, paytr_token`
- **Dönüş:** `{status, err_no?, err_msg?}`; `'success'` başarı sayılır. **Bu CANLI bir banka transferidir — placeholder/stub DEĞİL.** Önceden tamamlanmış bir ödeme gerektirir (`merchant_oid` eşleşmeli).
- `test_mode` parametresi **göndermez** — PayTR'nin transfer ucu test_mode kabul etmez; transferin test/canlı niteliği bağlı ödemeden miras alınır.

### 6.6 Geri Dönen Transferler — `getReturnedTransfers` / `resendReturnedTransfers`

`paytr.service.ts:849-923`.

- **getReturnedTransfers:** `POST .../geri-donen-transfer`; hashStr = `merchant_id + start_date + end_date + merchant_salt`; form: `merchant_id, start_date, end_date, paytr_token`.
- **resendReturnedTransfers:** `POST .../hesaptan-gonder`; hashStr = `merchant_id + trans_id + merchant_salt`; form: `merchant_id, trans_id, trans_info(JSON [{amount kuruş, receiver, iban}]), paytr_token`. **NOT:** Bu metot üretim kodunda hiçbir yerden çağrılmaz (ölü/yarım entegrasyon).

> **Hash sıralaması özeti:**
> | Uç | hashStr sırası | salt konumu |
> |---|---|---|
> | iFrame get-token | `mid+ip+oid+email+amount+basket+noInst+maxInst+'TL'+test` | update'e EK (`hashStr + salt`) |
> | durum-sorgu | `mid+oid+salt` | hashStr İÇİNDE (en sonda), ek YOK |
> | callback verify | `oid+salt+status+total` | hashStr İÇİNDE (2. pozisyon) |
> | iade | `mid+oid+returnAmount+salt` | hashStr İÇİNDE (en sonda) |
> | platform transfer | `mid+oid+transId+subAmt+total+name+iban+salt` | hashStr İÇİNDE (en sonda) |

---

## 7. Uçtan Uca Akışlar

### 7a. Tekil Ürün Satın Alma (initiate → iframe → callback → escrow)

1. **Sipariş yaratma:** `OrderService.createDirectOrder` siparişi `status=pending_payment`, `paymentExpiresAt = now + 24h` ile yaratır, stoğu `reservedQuantity++` ile rezerve eder (`order/order.service.ts:1004-1029`). OrderService PayTR'yi **doğrudan çağırmaz** (PaymentService inject etmez); `paymentUrl:''` placeholder döner.
2. **Başlatma:** `POST /payments/initiate` → `initiatePaymentUnified(userId, dto, req)` (`payment.controller.ts:102`, `payment.service.ts:118`). Erişim kontrolü: `userId` varsa `buyerId == userId`, yoksa `shippingAddress.isGuestOrder` şartı; `status !== pending_payment` veya `paymentExpiresAt` geçmiş ise hata (`:143-164`).
3. **Rezervasyon + Payment kaydı:** `processPaymentInitiation` (`:527-687`). `orderId @unique` olduğundan pending Payment varsa reset+reuse, yoksa `create(orderId, amount, currency:TRY, provider:paytr, status:pending)`. PayTR iframe token tek-kullanımlık olduğundan her retry'da `providerPaymentId=null` ile reset edilir.
4. **Token üretimi:** `initializePayTRPayment` (`:731-816`). `merchantOid = baseOid + 'T' + Date.now().slice(-6)` (orderNumber/id'den tireler silinmiş, çakışmayı önlemek için timestamp suffix'i, `:739-742`). `processOrderPayment` → `createIframeToken`. Token `providerPaymentId`'ye, merchantOid `providerConversationId`'ye yazılır (`:789-795`) — callback bununla eşleşir.
5. **Kullanıcı 3DS:** iframe/WebView'de PayTR güvenli sayfasında banka tahsilatı.
6. **Callback:** PayTR `POST /payments/callback/paytr` (`payment.controller.ts:171-177`). `RawBodyMiddleware` ham gövdeyi korur ve form-urlencoded body'yi parse eder. `handlePayTRCallback` (`payment.service.ts:940-979`): zorunlu alanlar eksikse `'OK'` döner; `verifyCallback` ile hash doğrulanır; geçersizse `handlePayTRCallbackHashMismatch` (durum-sorgu fallback); geçerli+success ise `processSuccessfulPayment`.
7. **Başarı işleme:** `processSuccessfulPayment` (`:1072-1580`) tek transaction'da:
   - **CAS idempotency:** `tx.payment.updateMany WHERE id+status:pending SET completed` — `claimed.count === 0` ise mükerrer callback/race, `false` döner (`:1109-1124`).
   - Order `pending_payment` değilse (cron iptal ettiyse) `autoRefundRequired` döner, tx sonrası `processRefund` (`:1128-1138`).
   - Order → `preparing`, `preparingDeadline = now + PREPARING_DEADLINE_DAYS` (`:1140-1155`).
   - Normal ürün: `quantity--`, `reservedQuantity--`, stockout kaskadı (son birim tükenince diğer pending order/teklifler iptal, `:1291-1362`).
   - **Escrow:** `sellerAmount = totalAmount - commissionAmount`; `PaymentHold(status=held, releaseAt=now+holdDays)` (`:1382-1397`); `CommissionLedger.upsertPending` (`:1400-1405`).
   - Tx sonrası: `emitOrderPaid`, fatura, Sürat shipment kaydı — hepsi best-effort (hata yutulur, bkz. Bölüm 13).
8. **Alternatif tamamlama:** İstemci success sayfası `POST /payments/:id/verify` → `verifyPaymentFromClient` (`:2432`) PayTR durum-sorgu ile anında tamamlar (callback localhost'a ulaşmadığında). Idempotent; tutar toleransı 0.01 TL.

### 7b. Grup Ödemesi

`initiateGroupPayment` (`payment.service.ts:174-210`) checkout grubunu siparişleriyle yükler, **TÜM siparişlerin `pending_payment` olmasını şart koşar** (kısmi tahsilat yok, biri değilse `BadRequestException`). `processGroupPaymentInitiation` (`:217-327`) `checkoutGroupId @unique` ile tek Payment yaratır; PayTR'ye `group.totalAmount` ve sipariş başına basket item gider. Başarıda `processSuccessfulGroupPayment` (`:1589-1868`): önce TÜM canlı siparişler `preparing` yapılır (stockout kaskadından ÖNCE — kardeş siparişleri yanlışlıkla iptal etmemek için), sonra sipariş başına stok düşümü + ayrı `PaymentHold` + `CommissionLedger`. Cron-yarışında iptal edilmiş kardeşlere kısmi auto-refund.

### 7c. Takas Nakit-Fark Ödemesi

`initiateTradeCashPayment` (`payment.service.ts:347-522`): trade `accepted`/`awaiting_payment` + `cashAmount > 0` + çağıran = `cashPayerId` olmalı. `tradeCashPaymentId @unique` ile Payment reuse/create. Sanal sipariş (`orderNumber = TRADE-{tradeNumber}`, `productId = trade-cash-{id}`). Başarıda `processSuccessfulTradeCashPayment` (`:2070-2183`): Payment + TradeCashPayment `completed` (CAS); trade `awaiting_payment` ise version-guard ile `shipping_to_warehouse` + `shippingDeadline`. Tx sonrası `emitTradeReadyForShipping` + `ModuleRef` ile lazy `TradeService.createInboundTradeShipments` (circular import bypass — fire-and-forget, hata yutulur).

### 7d. Başarısız / İptal / Süre-Aşımı Ödeme

- **Başarısız callback:** `processFailedPayment` → `releaseProductForFailedPayment` (order `cancelled`, rezervasyon serbest, offer `payment_expired`, Sürat iptal, `BACK_IN_STOCK` dispatch) (`payment.service.ts:1874-2061`).
- **İstemci fail sayfası:** `POST /payments/:id/confirm-failed` → pending ise `processFailedPayment` (idempotent, `:2415`).
- **30dk rezervasyon serbest:** `releaseExpiredOrderReservations` — `pending_payment` + `createdAt < now-30dk` + `reservationReleasedAt=null` siparişlerin rezervasyonunu kaldırır ama **order yaşar** (alıcı 24h içinde tekrar deneyebilir, `:3577-3648`).
- **24h kill-switch:** `expireUnpaidOrders` — `paymentExpiresAt < now` siparişleri tamamen iptal eder, payment `failed` (`:3743-3848`).

### 7e. Escrow Serbest Bırakma → Satıcı Payout

1. **Hold release (saatlik):** `@Cron('0 * * * *')` `handleReleaseHoldsDue` → `releaseHoldsDue` (`payment.service.ts:2925-2975`): `status=held && releaseAt<=now` hold'ları atomik `updateMany` ile `released` yapar; ayrıca `holdReleaseAt<=now` `TradeCashPayment`'ları `releasedAt` set eder.
2. **Teslimat/admin ile release:** `releasePaymentIfHeld(orderId)` (teslimat) ve `releasePayment` (admin) hold'u anında `released` yapar — **ama payout'u O ANDA yaratmaz.**
3. **Payout kaydı oluşturma:** `createPayoutsForReleasedHolds` (`payout/payout.service.ts:23-118`) `status=released && payoutTransfer=null` hold'lar için `PayoutTransfer(pending)` yaratır; `netAmount = hold.amount`. Banka hesabı yoksa `status=failed`, `failureReason='no_bank_account'`. **YALNIZCA** saatlik cron'da ve `result.count > 0 || tradeCashReleased > 0` ise çağrılır (`payment-scheduler.service.ts:132-137`).
4. **Gerçek transfer (15dk):** `@Cron('*/15 * * * *')` `processPendingPayouts` (`payout.service.ts:123-190`): `pending` payout'ları (max 50) `processing`e alıp `createPlatformTransfer` ile PayTR'ye gönderir; başarıda `completed` + IBAN auto-doğrulama; başarısızlıkta `handlePayoutFailure` (exponential backoff: 4^n × 15dk = 60dk/240dk/960dk, max 3 deneme).

### 7f. İade (Tam / Kısmi / Takas-Nakit)

- **Sipariş iadesi:** `processRefund(orderId, refundAmount?)` (`payment.service.ts:2499-2769`). `completed` payment'ı bulur; aktif `PayoutTransfer` (completed/processing) varsa **engeller** ('Transfer zaten başlatılmış'); `PAYMENT_BYPASS` değilse `createRefund(paytrOid, amount)`. Tx içinde: grup için `metadata.refundedOrders` ile idempotensi, `payment.status=refunded` (tam iadede), aktif hold `cancelled`, `commissionLedger.markRefunded`, tam iade eşiğini geçerse order `cancelled` + stok geri. Tx sonrası Sürat best-effort iptal.
- **Yetki:** Sadece siparişin alıcısı iade başlatabilir; satıcı başlatamaz (`payment.controller.ts:434-441`).
- **Takas-nakit iadesi:** `refundTradeCashPaymentIfCompleted` (`:2775-2887`) **her zaman TAM tutar** (`totalAmount` = ürün+komisyon) iade eder; admin-reject no-fault olduğundan komisyon tutulmaz.

### 7g. Mutabakat (Reconciliation)

`reconcilePendingPaytrPayments` (`payment.service.ts:3478-3568`, 5dk cron'da ilk adım): `PAYTR_RECONCILIATION_ENABLED != false` ise, `pending + paytr + providerConversationId != null + order hâlâ pending_payment + createdAt < cutoff(3dk)` adaylarını (batch 40) çeker. Her aday için `queryPaymentStatus`; `ok` ve tutar tolerans (0.05 TL) içindeyse, taze kayıt hâlâ pending ise `processSuccessfulPayment` ile tamamlar. **Tutar uyuşmazlığında yalnızca `logger.warn` + atla** (alarm/escalation yok).

---

## 8. Zamanlanmış İşler & Worker

| Cron | Sıklık | Ne yapar | Metot/Dosya |
|---|---|---|---|
| `handleExpiredPayments` | `*/5 * * * *` | 6 adım sırayla (her biri izole `runStep`): reconcile → rezervasyon serbest → reservedQty düzeltme → 24h expire → cancelExpired → out-of-stock sweep | `payment-scheduler.service.ts:42` |
| `handleReleaseHoldsDue` | `0 * * * *` (saatlik) | Escrow hold'ları release eder, sonra `createPayoutsForReleasedHolds` | `payment-scheduler.service.ts:118` |
| `handleExpiredPreparingOrders` | `*/30 * * * *` | Faz1: deadline-24h kala satıcı uyarısı; Faz2: deadline geçince order iptal + hold cancel + komisyon waive + stok geri + processRefund | `payment-scheduler.service.ts:147` |
| `handleProcessPayouts` | `*/15 * * * *` | Önce `processRetryPayouts` (retry_pending→pending), sonra `processPendingPayouts` (PayTR transfer) | `payout-scheduler.service.ts:14` |
| `handleCheckReturnedTransfers` | `0 6 * * *` (günlük) | Son 7 günün geri dönen transferlerini sorgular, `completed→returned`, IBAN doğrulamasını geri alır | `payout-scheduler.service.ts:38` |

> **Ölü kod:** `workers/payment.worker.ts` `@Processor('payment')` ile `webhook/refund/escrow-release/payout` handler'ları tanımlar ama `payment` kuyruğuna hiçbir yerden `.add()` çağrısı YOK → bu handler'lar asla tetiklenmez. `handleEscrowRelease` hardcoded %10 komisyon, `handlePayout` sadece log atan yanıltıcı stub'lardır (gerçek iş cron'larda).

---

## 9. Frontend Akışları

Tek sağlayıcı `'paytr'` sabittir (web `checkout/page.tsx:107`, mobil `payment/[id].tsx:51` — "iyzico kaldırıldı"). Ortak backend sözleşmesi: `POST /payments/initiate[-guest|-group|-trade-cash]`, `GET /payments/:id/status[-guest]` veya `GET /payments/:id`, `POST /payments/:id/{verify|retry|confirm-failed|bypass-complete}`.

- **Web (`apps/web/src/app/payment/[id]/page.tsx`):** Üye akışı PayTR'yi `dangerouslySetInnerHTML` ile **iç iframe** olarak gömer (`paymentHtml` tercihli). Geri dönüş **tamamen PayTR'ın `merchant_ok_url` → `/payment/success`** yönlendirmesine bağlıdır; `handlePaymentComplete` polling fonksiyonu tanımlı ama **hiçbir yerden çağrılmaz** (ölü kod), URL-interception yoktur. Success sayfası 5 kez `verify` retry dener (`payment/success/page.tsx:113-131`).
- **Mobil (`apps/mobile/app/payment/[id].tsx`):** PayTR'yi WebView'de **URL tercihli** (`source={{uri}}`) açar; `onShouldStartLoadWithRequest`/`onNavigationStateChange` ile callback URL'ini yakalar (`resolveIfTerminal`, `:223-265`), `setSupportMultipleWindows={false}` ile 3DS yeni-pencere "webe atma" sorununu çözer. Success ekranı 5 turlu `verify`+`getStatus` polling yapar.
- **Parite farkları:** (1) web iframe vs mobil URL-WebView; (2) **status okuma paritesizliği**: web `getStatusLight` (`GET /payments/:id/status` → `getPaymentStatusUnified`, grup/takas destekler) kullanırken mobil `getStatus` (`GET /payments/:id` → `findOne`, grup/takasta **400 fırlatır**) kullanır → mobil grup checkout success'inde özet gösterilmez (bkz. Bölüm 13); (3) fail-retry: web `/listings`'e gönderir, mobil `paymentsApi.retry` ile aynı ödemeyi yeniden başlatır.

---

## 10. Admin Operasyon Yüzeyleri

Tüm admin uçları `@Controller('admin')` + `@UseGuards(AdminJwtAuthGuard, RolesGuard)` ile korunur (`admin/admin.controller.ts:93-95`). Aksiyonlar:

| Aksiyon | Endpoint | Rol | Servis |
|---|---|---|---|
| Manuel iade | `POST /admin/payments/:id/manual-refund` | super_admin, admin | `manualRefund` (`admin.service.ts:4072`) |
| Ödemeyi zorla iptal | `POST /admin/payments/:id/force-cancel` | super_admin, admin | `forceCancelPayment` (`:4192`) |
| Payout serbest bırak | `POST /admin/payouts/release/:orderId` | super_admin, admin | `releasePayout` (`:4428`) |
| Takas hold release | `POST /admin/payouts/release-trade/:tradeId` | super_admin, admin | `releaseTradePaymentHold` (`:4437`) — **UI wrapper YOK** |
| Payout retry | `POST /admin/payouts/:transferId/retry` | super_admin, admin | `retryPayoutTransfer` (`:4454`) — **UI wrapper YOK** |
| Takas onay/red | `POST /admin/trades/:id/{approve,reject}` | super_admin, admin | `approveTrade`/`rejectTrade` |
| Takas iade retry | `POST /admin/trades/:id/retry-refund` | super_admin, admin | `retryTradeRefund` (`:6447`) |
| İade kayıp işaretle | `POST /admin/trades/:id/mark-return-lost` | **super_admin** | `markReturnShipmentLost` (`:5984`) |
| Tazminat kapat | `POST /admin/trades/:id/resolve-compensation` | super_admin, admin | `resolveTradeCompensation` (`:6404`) |

> **Önemli:** `manualRefund`/`forceCancelPayment` → `processRefund` zinciri gerçek PayTR `/odeme/iade` çağrısı yapar. `PAYMENT_BYPASS=true` iken PayTR atlanır ve DB direkt `refunded` işaretlenir.

---

## 11. Güvenlik & Bütünlük

- **Callback hash doğrulama:** Her callback `verifyCallback` ile HMAC-SHA256 doğrulanır (`paytr.service.ts:375-383`). Geçersizse gövdeye körü körüne güvenilmez — `handlePayTRCallbackHashMismatch` bağımsız PayTR durum-sorgu ile tutar doğrular (`payment.service.ts:864-934`).
- **Raw-body koruması:** `RawBodyMiddleware` yalnızca `/payments/callback/paytr` rotasında ham gövdeyi `req.rawBody`'e korur ve form-urlencoded'i parse eder (`payment.module.ts:52-53`). Not: `main.ts:56-57`'deki global `urlencoded()` parser zaten `@Body()`'yi doldurur; middleware'in qs.parse'ı fazlalıktır ve `rawBody` hiçbir yerde okunmaz.
- **Idempotency:** Çift/eşzamanlı başarı callback'i parayı yalnız bir kez escrow'a alır — `payment.updateMany WHERE status=pending` CAS guard'ı (`:1109-1124`); `claimed.count===0` ise no-op.
- **Webhook daima HTTP 200 'OK':** Eksik alan, payment yok, hash geçersiz, terminal durum dâhil her senaryoda `'OK'` döner; PayTR sonsuz retry yapmaz (`payment.controller.ts:173`, `payment.service.ts:943-979`).
- **Bypass guard:** `PAYMENT_BYPASS=true` yalnızca prod-olmayan ortamlarda çalışır; prod'da bootstrap'te `process.exit(1)` (`main.ts:28-44`). `bypassCompletePayment` servis ilk satırında `PAYMENT_BYPASS !== 'true'` ise `BadRequestException` (`payment.service.ts:694-697`).
- **ValidationPipe:** Global `whitelist:true, forbidNonWhitelisted:false` (`main.ts:88-91`); `PayTRCallbackDto` tüm alanları optional. DTO katmanı webhook'u elemez ama servis çok-katmanlı savunma uygular (zorunlu alan kontrolü + HMAC + durum-sorgu mutabakatı).

---

## 12. Test Kapsamı & Garanti Edilen Davranışlar (Invariants)

E2E testler gerçek Postgres + imzalı `MockPayTRService` ile çalışır; birim testler `paytr.service.spec.ts` ve `payment-group.spec.ts`.

- **Mükerrer callback:** 3 paralel aynı success callback sonrası `completed Payment = 1`, `PaymentHold = 1` (`concurrency.e2e-spec.ts:122-182`).
- **Escrow penceresi:** `PaymentHold` success'te `held`; sadece `releaseAt<=now` + `releaseHoldsDue` ile `released` olur; alıcı onayı tek başına serbest bırakmaz (`money-flow.e2e-spec.ts:143-163`).
- **Payout idempotency:** `createPayoutsForReleasedHolds` iki kez çalışsa da hold başına TAM 1 `PayoutTransfer` (`escrow-edge-cases.e2e-spec.ts:259-323`).
- **Tamamlanmış payout iadeyi bloklar:** `processRefund` 'transfer zaten başlatılmış' ile reddedilir (`escrow-edge-cases.e2e-spec.ts:189-257`).
- **Payout retry tavanı 3:** başarısız transfer → retry_pending → 3. denemede kalıcı `failed` (`payout.e2e-spec.ts:242-343`).
- **IBAN yoksa:** payout `failed` + `no_bank_account` (`payout.e2e-spec.ts:181-239`).
- **Stok aşırı satılamaz:** paralel son-birim yarışında tam biri kazanır, `reservedQuantity` 1'i aşmaz (`concurrency.e2e-spec.ts:43-119`).
- **Hash formülü sözleşmesi:** mock ile kaynak birebir aynı (`paytr.mock.ts:72-76` ↔ `paytr.service.ts:375-383`).

> **Devre dışı testler:** `payment-callback-paytr.spec.ts`, `payment-expiry.spec.ts`, `payment-reconciliation.spec.ts`, `payment-trade-cash-refund.spec.ts` `describe.skip` ile kapalıdır (stale unit test — constructor drift). Hash-mismatch pozitif kurtarma dalı, tutar-uyuşmazlığı reddi ve iade tutarının doğruluğu birim düzeyinde test edilmez (bkz. Bölüm 13).

---

## 13. Eksikler, Riskler ve Tutarsızlıklar

Adversarial doğrulamadan geçmiş bulgular. Önem sırasına göre.

### KRİTİK

| # | İddia (doğrulanmış) | Kanıt (file:line) | Doğrulama notu |
|---|---|---|---|
| K1 | **Release ile gerçek transfer atomik değil → çift ödeme riski.** Hold `released` yapıldıktan sonra payout sweep çalışmadan iade gelirse, `processRefund`'ın hold-iptal guard'ı `status=held` filtresi yüzünden released hold'u **cancelled YAPAMAZ** ve `existingPayout` guard'ı yalnızca `completed/processing`'e baktığından `pending`/null payout'u yakalayamaz. Sonuç: alıcıya iade + satıcıya payout = çift ödeme. | `payment.service.ts:2646-2661, 2548-2558`; `payout.service.ts:60` | Pencere geniş (teslimatla released hold saatlerce payoutTransfer:null bekler). Düzeltme: refund guard'ı `status:{in:[held,released]}` ile sorgulamalı; existingPayout `pending`/`retry_pending`'i de kapsamalı. |
| K2 | **Çoklu instance'ta payout çift-transfer.** `processPendingPayouts` `findMany` + ayrı `update` ile `processing`e çevirir (atomik claim YOK); `@nestjs/schedule` cluster-aware değil, distributed lock yok. `api` + `worker` konteynerleri aynı cron'u çalıştırır → iki instance aynı pending payout'u alıp ikisi de `createPlatformTransfer` çağırabilir; çift-transfer'i engelleyen tek şey PayTR'nin `trans_id` idempotency'sidir. | `payout.service.ts:124-149`; `payout-scheduler.service.ts:14` | Düzeltme: `FOR UPDATE SKIP LOCKED` + koşullu `updateMany`, ya da cron'u tek prosese gate'lemek. |
| K3 | **Alıcı `cancel()` iadeyi tetiklemez.** `OrderService.cancel` paid/preparing iptalinde `order.status=refunded` yapar ama PaymentService inject edilmediğinden `processRefund`/hold-cancel çağrılmaz; `status=refunded`'i dinleyen event listener/cron yoktur. Escrow `held` kalır, alıcıya otomatik iade yapılmaz. | `order/order.service.ts:3019-3022, 3071` | Yorum "Refund will be handled by PaymentModule" der ama mekanizma yoktur. |

### YÜKSEK

| # | İddia | Kanıt | Not |
|---|---|---|---|
| Y1 | **7-günlük release teslimat doğrulaması yapmaz.** `releaseHoldsDue` yalnızca `status=held && releaseAt<=now`'a bakar; order durumu, teslimat, açık RefundRequest guard'ı yok. `releaseAt` ödeme anında sabitlenir, teslimat/48h penceresine bağlanmaz. Kargo 7 günden uzun sürerse veya açık iade varsa escrow satıcıya bırakılabilir. | `payment.service.ts:2929-2943, 1385-1386` | İade-farkındalık yalnızca 48h auto-complete akışında var. |
| Y2 | **Payout starvation.** Teslimat/admin/onay ile `released` edilen hold'lar payout'u anında yaratmaz; `createPayoutsForReleasedHolds` yalnızca o saatte `releaseHoldsDue` zamanı-dolmuş bir hold döndürürse (`count>0`) çağrılır. Düşük hacimde başka due hold yoksa payout belirsiz süre gecikir. | `payment-scheduler.service.ts:132-137`; `payment.service.ts:2980-2991` | `handleReleaseHoldsDue` adım-izolasyonu (runStep) kullanmaz; createPayouts patlarsa kurtarma koşulludur. |
| Y3 | **'processing'de takılan payout kurtarılamaz.** `processing` PayTR çağrısından önce ayrı (tx'siz) update ile yazılır; instance çökerse kayıt kalıcı `processing`te kalır. Hiçbir cron `processing` seçmez, admin retry onu reddeder, `getFailedPayouts` listelemez → zombie payout. Payout-seviyesi mutabakat (transfer durum-sorgusu) yok. | `payout.service.ts:146-149, 124-127, 197-201`; `admin.service.ts:4457,4473` | PayTR'de transfer gerçekleşmiş olabilir; kayıp/çift ödeme tespit edilemez. |
| Y4 | **Doğrulanmamış IBAN'a kör transfer.** `isVerified` ödeme-öncesi ön-koşul değil; transfer öncesi tek kontrol `transferIban/transferName` dolu mu. `isVerified` yalnızca transfer SONUCUNA göre güncellenir (başarı→true, returned→false). İlk transfer her zaman kör denemedir. | `payout.service.ts:133-143, 152, 170-171, 251-252` | `SellerBankAccount.isVerified` default false. |
| Y5 | **IBAN snapshot bayatlaması.** `transferIban/transferName` payout'a snapshot yazılır; satıcı IBAN değiştirse `processPendingPayouts` güncel hesabı okumaz → para ESKİ IBAN'a gider. | `payout.service.ts:58-59, 132-159`; `user.service.ts:2371-2378` | retry_pending payout'lar saatlerce bekleyebilir. |
| Y6 | **Takas-nakit iade outbox'sız.** `createRefund` (tx-dışı, DB-öncesi) başarılı olup sonraki tx patlarsa PayTR'da iade yapılmış ama `refundedAt` set edilmemiş → sonraki çağrı tekrar refund dener. PayTR çağrısı idempotency anahtarı içermez. | `payment.service.ts:2843, 2864-2883`; `paytr.service.ts:413-451` | Telafi/outbox/otomatik mutabakat yok. |
| Y7 | **Auto-refund fon-kilitlenmesi.** `processSuccessfulPayment` cron-yarışı dalında (order cancelled) `PaymentHold` oluşturulmadan döner ve tx-dışı `processRefund` çağrılır; PayTR senkron değilse ('odeme henuz siteye bildirilmemis') hata yutulur, sadece log. Hold yaratılmadığından satıcıya gitmez, fon PayTR'da çekili kalır. | `payment.service.ts:1128-1138, 1422-1435, 2588-2592` | reconcile yalnız pending tarar, retry yok. |
| Y8 | **merchant_oid değişimi → kaçırılan ödeme.** Her init `merchantOid`'yi `baseOid+'T'+timestamp` ile değiştirip `providerConversationId`'yi EZER (eski oid saklanmaz). Kullanıcı eski token'la öderse callback eski oid ile gelir, hiçbir eşleşme tutmaz (verifyCallback eski oid ile valid döndüğü için durum-sorgu kurtarmasına da girmez), reconcile yeni oid'i sorguladığı için yakalamaz → ödeme sessizce kaybolur, yalnız PayTR panelinden manuel bulunur. | `payment.service.ts:741-742, 789-795, 840-855, 965-969, 3494-3522` | Re-init yolları providerConversationId'yi resetlemez. |
| Y9 | **Faz2 preparing-iptal iadesi telafisiz.** `handleExpiredPreparingOrders` tx commit'inden (order cancelled + hold cancelled) SONRA tx-dışı `processRefund` çağrılır; başarısız olursa sadece 'MANUAL INTERVENTION' log'u kalır, otomatik retry yok. | `payment.service.ts:4057-4113` | Admin manuel iade hâlâ mümkün (payment completed). |
| Y10 | **resendReturnedTransfers çağrılmaz + returned retry yanlış API.** Geri dönen transferler otomatik yeniden gönderilmez; admin retry `returned→pending` yapar ama o da `/platform/transfer` kullanır (`hesaptan-gonder` değil) — orijinal merchant_oid bakiyesi tükenmiş olabileceğinden başarısız olabilir. | `paytr.service.ts:886-923`; `admin.service.ts:4454-4467` | `resendReturnedTransfers` tüm üretimde çağrılmaz (ölü kod). |
| Y11 | **48h teslimat tutarsızlığı (webhook vs worker).** `shipping.service.ts handleProviderWebhook` delivered'da DAİMA legacy davranış yapar (anında `releasePaymentIfHeld`) ve `FEATURE_48H_CONFIRMATION_WINDOW` flag'ini kontrol etmez; `shipping.worker.ts` ise kontrol eder. Aynı escrow olayı geldiği yola göre farklı sonuç verir. | `shipping/shipping.service.ts:357-381`; `workers/shipping.worker.ts:139-180` | Webhook yolu hold'u erken serbest bırakabilir. |
| Y12 | **Takas iki bacağı escrow bölünmez + süresiz askıda.** `TradeCashPayment.tradeId @unique` → trade başına tek escrow; from_warehouse leg'lerinden biri onaylanmazsa trade `shipping_to_recipients`'te kalır, `holdReleaseAt` set EDİLMEZ. `autoConfirmExpiredReceipts` güvenlik ağı `confirmationDeadline { lt: now }` filtresi kullanır ama safe-trade akışında bu alan hiç set edilmediği için (null) job hiç eşleşmez → para süresiz askıda kalabilir. | `trade.service.ts:1639-1648, 1718-1734, 2134`; `admin.service.ts:5199-5205`; `schema.prisma:504` | Manuel dispute/refund dışında kurtarma yok. |
| Y13 | **Admin payout release korumasız.** Geri-dönülemez escrow→satıcı transferini UI'da confirm OLMADAN, API'de sebep/ön-onay OLMADAN tetikler; re-hold (geri alma) yoktur. `status=held` guard'ı yanlış orderId'yi engeller ama meşru held bir ödemenin erken serbest bırakılmasını engellemez. | `admin.service.ts:4428-4432`; `apps/admin/.../payouts/page.tsx:183` | Diğer admin para aksiyonları confirm kullanır; bu sapar. |
| Y14 | **Trade resolve-dispute admin guard'sız.** `resolveTradeDispute` frontend `/admin` prefix'siz `/trades/:id/resolve-dispute`'e POST eder; bu uç TradeController'dadır ve `@Roles(admin)` dekoratörü VAR ama `RolesGuard` o controller'a hiç bağlanmamıştır (global değil) → herhangi bir giriş yapmış kullanıcı takas itirazını çözebilir; audit'e admin yerine çağıran user id yazılır. | `apps/admin/.../api.ts:298`; `trade/trade.controller.ts:224-232`; `app.module.ts:199-206` | Yetkilendirme/audit açığı. |
| Y15 | **createPlatformTransfer testMode'u dikkate almıyor (bilgi).** İddianın aksine bu bir hata DEĞİLDİR — PayTR'nin transfer ucu `test_mode` kabul etmez; transferin test/canlı niteliği bağlı ödemeden gelir. Yine de transfer kodunda/çağıranında staging guard'ı yoktur (öneri: staging'de payout cron'unu çalıştırmamak). | `paytr.service.ts:789-844` | Severity düşürüldü. |
| Y16 | **Tutar-uyuşmazlığı success-path'te doğrulanmaz.** Geçerli-hash callback dalında `dto.total_amount` ile `payment.amount` HİÇ karşılaştırılmaz; tutar/tolerans kontrolü yalnız hash-mismatch dalında. Hash gizli sırla anahtarlandığından sahte tutar üretilemez, ama gerçek-fakat-farklı PayTR callback'i (kısmi capture) veya gevşek `providerPaymentId contains` eşleşmesi uyumsuz tutarı completed yapabilir. | `payment.service.ts:965-976, 851-855` vs `914-920` | Öneri: success dalına da tolerans kontrolü ekle. |

### ORTA

| # | İddia | Kanıt |
|---|---|---|
| O1 | Tüm fetch'lerde HTTP timeout (AbortController) ve retry YOK; PayTR yavaşsa istek ~300s'ye kadar bloke olur. | `paytr.service.ts:221-227, 645-649` vd. |
| O2 | `createRefund`/`getInstallmentOptions` `response.json()` doğrudan await eder; boş/HTML yanıtta SyntaxError ham parser mesajına dönüşür (createIframeToken/queryPaymentStatus/createDirectPayment text()+güvenli-parse yapar). | `paytr.service.ts:440, 501` vs `229-246` |
| O3 | DB-seviye CHECK yok: `Payment`'ın `orderId/checkoutGroupId/tradeCashPaymentId` üçünden tam birinin dolu olması zorlanmaz; orphan/multi-fill satır oluşabilir. | `schema.prisma:1086-1088` |
| O4 | `PayoutTransfer.tradeCashPaymentId @unique DEĞİL` (paymentHoldId @unique iken); takas-cash için çift-payout DB tarafından engellenmez (yalnız uygulama-seviyesi `payoutTransfers:none` check-then-create, TOCTOU açık). | `schema.prisma:1148` vs `1147` |
| O5 | `netAmount = amount − commission` DB-doğrulamalı değil (3 bağımsız Decimal kolon, CHECK/generated yok); netAmount ayrı kaynaktan kopyalanır, türetilmez. | `schema.prisma:1150-1152`; `payout.service.ts:55,102` |
| O6 | `processSuccessfulPayment` tx-sonrası `emitOrderPaid`/fatura/shipment best-effort yutulur; başarısız olursa ödeme completed kalır ama fatura/kargo oluşmaz, otomatik retry/alarm yok (Sentry yalnız HTTP pipeline'ı yakalar). | `payment.service.ts:1532-1535, 1543-1546, 1574-1576` |
| O7 | `processRefund` grup idempotensi tx-dışı okunan `metadata.refundedOrders` map'ine dayanır (FOR UPDATE/version yok); eşzamanlı kardeş iadelerde lost-update. | `payment.service.ts:2500-2516, 2542-2546, 2607-2644` |
| O8 | `findPaymentForPaytrCallback` fallback'i `providerPaymentId contains merchant_oid` — providerPaymentId PayTR token'ıdır, merchant_oid içermez; anlamsız/etkisiz savunma kodu. | `payment.service.ts:851-855` |
| O9 | Mobil success/fail `getStatus` (`/payments/:id` → findOne) kullanır; findOne grup/takasta 400 fırlatır → mobil grup checkout success'inde özet boş. | `payment.service.ts:3231-3235`; `apps/mobile/.../success.tsx:60` |
| O10 | Reconciliation tutar-uyuşmazlığında yalnız warn+atla; alarm/escalation yok (ödeme ~24h sonra expire ile sessizce failed olur, otomatik iade yok). | `payment.service.ts:3525-3531` |
| O11 | Takas nakit ödeme inbound shipment fire-and-forget; createInboundTradeShipments hatası (adres yok, Sürat fail) yalnız loglanır, kalıcı bayrak/reconciliation yok → para alındı ama kargo etiketi oluşmaz. | `payment.service.ts:2160-2179`; `trade.service.ts:282-286, 369-404` |
| O12 | `manualRefund` iade tutarı üst sınırı doğrulamaz (`amount \|\| payment.amount`); tek çağrıda over-amount talep edilebilir (PayTR reddi dışında engel yok). | `admin.service.ts:4091`; `payment.service.ts:2535-2585` |
| O13 | `resolveTradeCompensation` gerçek tazminat ödemesini garanti etmez — sadece `compensationResolvedAt` işaretler; ödeme out-of-band manuel, kanıt/dekont zorunlu değil. | `admin.service.ts:6404-6439` |
| O14 | `forceCancelStuckWarehouseTrade` stuck-cancel sonucunu kontrol etmez; PayTR business-fail dönse bile DB shipment cancelled olur → fiziksel kargo aktifken DB iptal görünür. | `admin.service.ts:5917-5936`; `surat-tracking.service.ts:539` |
| O15 | `payment.worker.ts` ölü kod (kuyruk register ama beslenmiyor); escrow-release stub'ı hardcoded %10 komisyon yazar (gerçek sistemle çelişir). | `workers/payment.worker.ts:22-228`; `worker.module.ts:65` |
| O16 | `verifyPaymentFromClient` (0.01 TL) ile reconcile/mismatch (0.05 TL) tolerans eşikleri farklı → aynı ödeme için tutarsız kabul/ret. | `payment.service.ts:2473` vs `3489, 895` |
| O17 | Takas-nakit refund tutar doğruluğu (tam vs kısmi) hiçbir aktif testte assert edilmez; birim test skip, E2E sadece `refundCalls.length` kontrol eder. | `payment-trade-cash-refund.spec.ts:12`; `money-flow.e2e-spec.ts:400` |
| O18 | `getReturnedTransfers`/returned mutabakat akışı (IBAN un-verify yan etkisi dâhil) hiçbir testte tetiklenmez. | `paytr.mock.ts:122-128`; `payout.service.ts:219-263` |
| O19 | `DirectPaymentDto/CreditCardDto/AddCardDto` (PCI-hassas kart alanları) tanımlı + barrel'dan export ama `process-direct` `GoneException` ile kapalı → ölü veri sözleşmesi. | `payment/dto/direct-payment.dto.ts:5-92`; `payment.controller.ts:158-166` |
| O20 | env.example.txt kritik ödeme/payout/Sürat değişkenlerini içermez; Iyzico konfigürasyonu hâlâ var (prod konteynerine de enjekte) ama kodda tüketici yok. | `apps/api/env.example.txt`; `infrastructure/docker-compose.prod.yml:174-175` |

### DÜŞÜK / BİLGİ

- **Sürat Kargo katman karması (düşük):** `cancelSuratShipmentIfExists` payment.service'te yaşar ve `SuratCargoService`'i doğrudan inject eder; Sürat `payment-providers/` değil `surat-cargo/` modülündedir. **Ölü kod DEĞİL** (5 canlı çağrı), bağımlılık karması DEĞİL (payment.service zaten `provider:'surat'` shipment OLUŞTURUR) — yalnızca düşük-kohezyon kokusu. `payment.service.ts:54-87, 1563, 1848`.
- **Gerçek banka entegrasyonu MEVCUT (bilgi):** `createPlatformTransfer` canlı PayTR `/platform/transfer`'e HMAC imzalı gerçek POST atar; mock/stub/TODO yoktur. `paytr.service.ts:828-833`.
- **createRefund ölü dal (düşük):** Çağıranlardaki `refundResult.status !== success` kontrolleri ulaşılamaz (createRefund zaten throw eder). `payment.service.ts:2596-2600, 2844-2848`.
- **ignoreExpiration:true (orta→düşük):** `/initiate`, `/initiate-trade-cash`, `/:id/status` manuel JWT'leri `ignoreExpiration:true` ile çözülür; imza doğrulanır (forge yok) ama 15dk token süresi bu yollarda etkisizdir. `payment.controller.ts:95,143,250`.
- **refundPayment kapsülleme ihlali (orta):** Controller `paymentService['prisma']` ile private üyeye bracket-notation erişir. `payment.controller.ts:429-432`.
- **initiate-trade-cash DTO yok (düşük):** Inline `{ tradeId: string }` tipi → ValidationPipe çalışmaz; format doğrulanmaz (sömürülebilir değil, defense-in-depth eksiği). `payment.controller.ts:134`.
- **logPaymentAction lost-update (düşük):** `metadata.auditHistory` tx-dışı read-modify-write; eşzamanlı yazmalarda denetim izi kaybolabilir (para/durum güvende). `payment.service.ts:1036-1059`.
- **`ScheduleModule.forRoot()` 9 modülde tekrar (düşük):** Redundant/dağınık ama NestJS token-dedup nedeniyle çift-tetikleme riski YOK. `payout.module.ts:12` vd.
- **Dokümantasyon sapmaları (düşük):** `SYSTEM_FLOWS.md` order state-machine'i `awaiting_buyer_confirmation`'ı atlar ve "3 gün auto-confirm" der (gerçek 48h); escrow diyagramı "holdReleaseAt = now+24h" der (kod confirm anında release eder, hold süresi ödeme anında +7gün). `ESCROW_PAYOUT_PLAN.md` "Mevcut Durum" tablosu bayat ("payout YOK/stub" der ama kodda gerçek payout var).

---

## 14. Açık Sorular & Öneriler

**Öncelikli düzeltme önerileri:**

1. **(K1/K2) Çift-ödeme guard'ları:** `processRefund` hold sorgusunu `status:{in:[held,released]}` yap ve released hold'da iadeyi bloke et/atomik cancel et; `existingPayout` guard'ına `pending`/`retry_pending` ekle; `processPendingPayouts`'u `FOR UPDATE SKIP LOCKED` + koşullu `updateMany` ile atomik claim'e çevir veya payout cron'unu tek prosese gate'le.
2. **(K3) Alıcı iptal iadesi:** `OrderService.cancel`'a PaymentService inject edip `processRefund`'u çağır veya `status=refunded` için bir event/cron tetikleyici ekle.
3. **(Y1/Y7/Y9) İade/release güvenilirliği:** `releaseHoldsDue` sorgusuna order durumu + açık RefundRequest guard'ı ekle; tx-dışı `processRefund` çağrılarını bir outbox/retry mekanizmasına bağla.
4. **(Y3) Zombie payout:** `processing` durumuna bir timeout/sweep cron'u ekle; ancak yeniden işlemeden ÖNCE PayTR transfer durum-sorgusu yap (idempotent transId'e rağmen çift ödeme riski).
5. **(Y8) merchant_oid:** Geçmiş oid'leri sakla veya `merchantOid`'yi sabit tut (timestamp suffix'i kaldır).
6. **(Y14) Yetki açığı:** `RolesGuard`'ı `TradeController`'a bağla veya `resolveTradeDispute`'u admin controller'a taşı.
7. **(O20) Konfigürasyon hijyeni:** env.example.txt'e eksik değişkenleri ekle; ölü Iyzico konfigürasyonunu/DTO'larını temizle.

**Açık sorular (kod-içi kanıtla netleştirilemedi):**

- Çoklu API instance (HA) deployment yapılıyor mu? Yapılıyorsa @Cron için distributed lock/leader-election şart (K2 kritik bağlamı).
- `FEATURE_48H_CONFIRMATION_WINDOW` prod'da `true` mu? Webhook vs worker tutarsızlığı (Y11) flag açıkken ortaya çıkar.
- `payment_gateways` platform-setting'i tarihsel olarak hiç tüketildi mi, yoksa baştan beri ölü UI mı (admin'in girdiği PayTR Key/Salt etkisiz + maskesiz görüntülenebiliyor)?
- Bayat `payment-shipping-integration-incomplete` branch dokümanları silinmeli/arşivlenmeli mi (onboarding'i yanıltıyor)?
