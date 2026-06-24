# Tarodan Ödeme Sistemi — Kapsamlı Mimari ve Akış Dokümanı

> Son güncelleme: 2026-06-24. Bu doküman ödeme sistemini sıfırdan okuyan birinin
> tüm akışa, mimariye ve kod yapısına hâkim olabilmesi için yazıldı.
> Sağlayıcı: **PayTR**. Model: **Direct API** (site-içi kart formu). iframe **kaldırıldı**.

---

## 0. TL;DR (en kritik 8 madde)

1. **Tek ödeme yolu = PayTR Direct API.** iframe tamamen kaldırıldı. Misafir + üye **aynı** site-içi kart formunu kullanır.
2. **Tek aksiyon endpoint'i:** `POST /payments/process-direct`. Tüm hedefler (sipariş / sepet-grup / takas-nakit / üyelik) buradan geçer.
3. **Para birimi KRİTİK:** PayTR Direct API `/odeme`'ye `payment_amount` ve sepet fiyatları **ONDALIK TL** ("462.81") gider — **kuruş DEĞİL**. (Kuruş göndermek 100× fazla çekime yol açar.)
4. **Escrow (emanet):** Ödeme alınır, para platformda **PaymentHold** olarak tutulur, ~7 gün sonra satıcıya **payout** edilir. Satıcı başına ayrı hold + ayrı payout.
5. **Sepet (grup):** 1 sepet → N sipariş (ürün başına) → 1 CheckoutGroup → **1 ödeme** → N hold → N kargo → N payout. Çok-satıcı/tek-satıcı aynı kod yolu.
6. **Callback (Bildirim URL):** PayTR ödeme sonucunu sunucuya POST eder; biz **`"OK"`** döneriz. İki yol: `/api/payments/callback/paytr` (kanonik) ve `/callback` (alias).
7. **Kayıtlı kart + kullanıcısız oto-yenileme (Non3D)** `PAYTR_RECURRING_ENABLED` bayrağı arkasında — PayTR Non3D yetkisi gelene kadar kapalı.
8. **Güvenlik:** Kart numarası/CVV **asla** DB'ye/log'a yazılmaz; yalnız PayTR token'ları (utoken/ctoken) + maskeli son4 saklanır.

---

## 1. Genel Bakış ve Felsefe

Tarodan ikinci-el diecast (model araç) **pazar yeridir (marketplace)**: alıcı öder, platform parayı **emanette (escrow)** tutar, ürün teslim edilip onaylanınca satıcıya öder. Bu yüzden ödeme "para alıp bitti" değil; **çok aşamalı bir yaşam döngüsüdür**: tahsilat → emanet → kargo → teslim → onay → satıcıya payout (veya iade).

Ödeme **sağlayıcıdan bağımsız** tasarlanmış olsa da tek aktif sağlayıcı **PayTR**'dir. Entegrasyon **Direct API** modelidir: kart bilgisi **bizim** sayfamızdan alınır, PayTR'ye sunucudan iletilir, yeni kartta 3D Secure yapılır. (Eski iframe/hosted-page modeli kaldırıldı.)

---

## 2. Temel Kavramlar / Veri Modelleri (Prisma)

`apps/api/prisma/schema.prisma`

| Model | Ne işe yarar | Önemli alanlar |
|---|---|---|
| **Order** | Tek bir ürünün siparişi | `buyerId`, `sellerId`, `productId`, `totalAmount` (TL), `commissionAmount`, `shippingCost`, `status`, `checkoutGroupId`, `paymentExpiresAt`, `shippingAddress` (JSON) |
| **CheckoutGroup** | Sepet/grup; birden çok Order'ı tek ödemede toplar | `buyerId`, `totalAmount` (TL), `isGuest`, `groupNumber` |
| **Payment** | Bir ödeme girişimi (tahsilat) | `orderId?` \| `checkoutGroupId?` \| `tradeCashPaymentId?` (üçünden biri), `amount` (TL), `status`, `provider`, `providerConversationId` (= PayTR merchant_oid), `metadata` (merchantOidHistory, auditHistory) |
| **PaymentHold** | Escrow — satıcıya gidecek paranın emaneti | `orderId`, `sellerId`, `amount` (net = order.total − komisyon), `status` (held/released/cancelled), `holdReleaseAt` |
| **PayoutTransfer** | Satıcıya yapılan banka transferi | `paymentHoldId`, `sellerId`, `netAmount`, `commission`, `transferIban`, `status` |
| **SavedCard** | Kayıtlı kart (PAN yok!) | `userId`, `utoken`, `ctoken` (PayTR token'ları), `last4`, `brand`, `requireCvv`, `status`, `mandateAcceptedAt` |
| **TradeCashPayment** | Takasta nakit fark ödemesi | `tradeId`, `payerId`, `amount`, `status`, `holdReleaseAt` |

**Üçlü hedef kuralı:** Bir `Payment` ya tekil siparişe (`orderId`), ya sepete (`checkoutGroupId`), ya da takas-nakde (`tradeCashPaymentId`) bağlıdır. Bu üç alan da `unique`.

`PaymentStatus` enum: `pending` | `completed` | `failed`. (**`cancelled` YOK** — başarısız için `failed` kullanılır. `OrderStatus`'ta `cancelled` vardır.)

---

## 3. Ödeme Hedefleri (3 giriş kapısı, 1 boru hattı)

Hangi şeyin ödendiğine göre 3 hedef vardır; hepsi **aynı** `process-direct` boru hattından geçer:

| Hedef | Tetikleyen | Payment bağı |
|---|---|---|
| **Tekil sipariş** (`orderId`) | Doğrudan alım, teklif (offer) kabulü, üyelik sanal siparişi | `Payment.orderId` |
| **Sepet/grup** (`checkoutGroupId`) | Çok ürünlü sepet checkout | `Payment.checkoutGroupId` |
| **Takas nakit farkı** (`tradeId`) | Takasta ek nakit ödeyen taraf | `Payment.tradeCashPaymentId` |

---

## 4. Uçtan Uca Akış (mutlu yol)

```
[Frontend]                         [API]                              [PayTR]
   |                                 |                                   |
1. Sipariş/grup/takas oluştur  --->  Order/CheckoutGroup/TradeCash       |
   (offer accept / checkout / buy)   (status=pending_payment)            |
   |                                 |                                   |
2. /payment/[id] aç  ------------->  GET /payments/:id/status            |
   (CardPaymentForm)  <-------------  amount + hedef (orderId/group/trade)|
   |                                 |                                   |
3. Kart gir, "Öde"  -------------->  POST /payments/process-direct       |
   |                                 |  resolveDirectPaymentContext:     |
   |                                 |   - sahiplik + durum + süre        |
   |                                 |   - rezervasyon CAS (oversell)     |
   |                                 |   - çift-çekim guard (durum-sorgu) |
   |                                 |   - merchant_oid ata               |
   |                                 |  createDirectPayment ----------->  /odeme (3D)
   |                                 |  <-- 3DS HTML --------------------  |
   |  <-- threeDSHtml ---------------  |                                   |
4. 3D Secure TAM SAYFA  --------------|---- banka 3D doğrulama ---------->  banka
   (document.write web / WebView)     |                                   |
   |                                  |   <--- 3D sonuç -----------------  banka→PayTR
   |                                  |                                   |
5. Banka → merchant_ok_url            |                                   |
   /payment/success  -------------->  POST /payments/:id/verify           |
   (verify döngüsü)                   |   (durum-sorgu, yedek)  -------->  /odeme/durum-sorgu
   |                                  |                                   |
   |          [PayTR Bildirim URL] -->  POST /callback  <----------------  PayTR (asıl onay)
   |                                  |   handlePayTRCallback:            |
   |                                  |    - hash doğrula                 |
   |                                  |    - TUTAR doğrula (kuruş)         |
   |                                  |    - processSuccessfulPayment     |
   |                                  |    - "OK" döndür ---------------->  PayTR
   |                                  |                                   |
6. Sipariş "preparing" + PaymentHold(escrow) + Shipment + invoice oluşur.
7. Teslim + onay → hold release → satıcıya PayTR payout.
```

**Önemli:** Sonucu kesinleştiren **callback**'tir. `verify` (durum-sorgu) bir **yedektir** — callback gecikir/gelmezse success sayfası PayTR'ye sorup tamamlar. İkisi de **idempotent**.

---

## 5. Endpoint Referansı (`payment.controller.ts`)

| Method + Path | Auth | Açıklama |
|---|---|---|
| `GET /payments/config` | public | `{ bypassEnabled, recurringEnabled }` — frontend UI'ı buna göre ayarlar |
| `POST /payments/process-direct` | opsiyonel (misafir+üye) | **TEK ödeme aksiyonu.** Throttle 10/dk (ham kart verisi). Yeni kartta 3DS HTML döner |
| `POST /payments/callback/paytr` | public (webhook) | PayTR Bildirim URL (kanonik). `"OK"` döner |
| `POST /callback` | public (webhook) | **Alias** — panel Bildirim URL `.../callback` ile bittiğinde. Aynı handler. (Global `api` prefix'inden hariç) |
| `POST /payments/:id/verify` | public | Success sayfasından durum-sorgu ile anında tamamla |
| `POST /payments/:id/confirm-failed` | public | Fail sayfasından; pending'se rezervasyonu bırak |
| `GET /payments/:id/status` (+ `/status-guest`) | opsiyonel | Hafif durum + hedef alanları (amount, orderId/checkoutGroupId/tradeId) |
| `GET /payments/me` | üye | Ödeme geçmişi |
| `GET /payments/holds/me` | satıcı | Satıcının escrow hold'ları |
| `POST /payments/:id/retry` | üye | Başarısız ödemeyi tekrar başlat (intent) |
| `POST /payments/:id/cancel` | üye | Bekleyen ödemeyi iptal et |
| `POST /payments/:id/bypass-complete` | public | **Dev/test** — PayTR olmadan tamamla (`PAYMENT_BYPASS`) |
| `POST /payments/refund` | üye (alıcı) | İade |

> **Not — initiate uçları:** `POST /payments/initiate`, `initiate-guest`, `initiate-trade-cash` hâlâ vardır ama artık **PayTR çağırmaz**; yalnız "ödeme niyeti" (Payment satırı + merchant_oid) oluşturup `paymentId` döner. Frontend'ler bunları paymentId almak için kullanır, sonra `/payment/[id]`'ye gider. (iframe token üretimi kaldırıldı.)

---

## 6. Servis Katmanı (`payment.service.ts` — kalp)

| Metod | Sorumluluk |
|---|---|
| `processDirectPayment(userId\|null, dto, req)` | **Giriş.** Kart kontrolü, flag kontrolü (savedCard→recurring), context çöz, Flow A (yeni kart 3D) veya Flow B (kayıtlı kart Non3D) |
| `resolveDirectPaymentContext(...)` | Hedefi (order/group/trade) çöz; sahiplik + durum + süre doğrula; **rezervasyon CAS re-reserve** (oversell koruması); **çift-çekim guard** (durum-sorgu); `buildBuyer` (misafirde gerçek bilgi); merchant_oid ata; ortak `{payment, buyer, basketItems, amount, merchantOid}` döndür |
| `assignMerchantOid(paymentId, baseOid)` | Payment'a yeni `merchant_oid` atar, eskiyi `merchantOidHistory`'e taşır (eski oid'li callback de eşleşsin) |
| `handlePayTRCallback(dto)` | Webhook: hash doğrula → **tutar doğrula** → `processSuccessfulPayment`/`processFailedPayment` → her zaman `"OK"` döndür |
| `processSuccessfulPayment(payment, txnRef)` | Tekil: sipariş→preparing, stok düş, **PaymentHold** oluştur, kargo, invoice, store_card→SavedCard senkron |
| `processSuccessfulGroupPayment(payment, txnRef)` | Grup: **her sipariş için** yukarıdakiler (satıcı başına hold + kargo) |
| `processFailedPayment(payment, reason)` | Rezervasyonu bırak, sipariş iptal/pending |
| `verifyPaymentFromClient(paymentId)` | durum-sorgu → ödendiyse + tutar eşleşirse tamamla. Idempotent |
| `reconcilePendingPaytrPayments()` (cron) | Bekleyen ödemeleri durum-sorgu ile mutabakatla |
| `retryPayment / cancelPayment / processRefund` | Tekrar / iptal / iade |

**Sağlayıcı adaptörü** `payment-providers/paytr.service.ts`:
| Metod | Açıklama |
|---|---|
| `createDirectPayment(oid, amount, card, buyer, basket, opts)` | `/odeme` POST. **Yeni kart 3D** (non3d=false). `payment_amount`=**ondalık TL**. 3DS HTML döner |
| `chargeRecurring({utoken, ctoken, amount, ...})` | Kayıtlı kartla **Non3D** çekim (kullanıcısız oto-yenileme + tek-tık). `payment_amount`=ondalık TL |
| `queryPaymentStatus(oid)` | durum-sorgu (`/odeme/durum-sorgu`). callback kaçınca kurtarma |
| `verifyCallback(dto)` / `parseCallback` | Callback hash doğrulama |
| `createRefund` / `createPartialRefund` | İade (`/odeme/iade`) |
| `capiListCards` / `capiDeleteCard` | Kayıtlı kart listele/sil (CAPI) |
| `createPlatformTransfer(...)` | **Payout** — satıcı IBAN'ına transfer |

---

## 7. ⚠️ PARA BİRİMİ (en sık hata kaynağı)

PayTR uçları **farklı birim** ister. Yanlış birim = 100× yanlış çekim. Kesin kurallar:

| Uç | Alan | Birim | Kod |
|---|---|---|---|
| Direct API `/odeme` (yeni kart) | `payment_amount`, basket fiyat | **ONDALIK TL** ("462.81") | `amount.toFixed(2)` |
| Recurring `/odeme` (kayıtlı kart) | `payment_amount`, basket fiyat | **ONDALIK TL** | `amount.toFixed(2)` |
| Callback (Bildirim) | `total_amount` | **KURUŞ** (integer) | `parseInt` → `expected = amount*100` ile karşılaştır |
| durum-sorgu | `payment_total` | **TL** | `parseFloat` (÷100 YOK) |

> **Kanıt/ders (2026-06-24):** `createDirectPayment` bir dönem `payment_amount`'ı kuruş gönderiyordu → PayTR 462.81 yerine 46.281 TL çekti (panelde "46.281,00 TL", callback `total_amount=4628100`). Resmi PayTR Direkt API NodeJS örneği `payment_amount='100.99'` (ondalık TL) der. **Smoke testi yalnız hash'i doğrular, çekilen tutarı DEĞİL** — bu yüzden hata ancak gerçek callback gelince ortaya çıktı. Birim değişikliği yaparken **gerçek bir ödeme + callback ile** doğrula.

---

## 8. Callback / verify / mutabakat (sonucu kesinleştirme)

- **Callback (asıl):** PayTR, panelde tanımlı **Bildirim URL**'e ödeme sonucunu POST eder. Handler: hash doğrula → tutar doğrula (kuruş) → başarılıysa `processSuccessfulPayment`. **Yanıt gövdesi tam olarak `"OK"` olmalı** yoksa PayTR tekrar dener / işlem "Devam Ediyor" kalır.
- **verify (yedek):** `/payment/success` sayfası `POST /payments/:id/verify`'i birkaç kez dener; durum-sorgu ile PayTR'ye sorar, ödendiyse tamamlar. Callback gecikse/gelmese bile kullanıcı success'e düşünce tamamlanır. **Çıkış bağlantısıdır — tünel gerektirmez.**
- **reconcile cron:** Bekleyen ödemeleri periyodik durum-sorgu ile kapatır (son emniyet).

Üçü de **idempotent**: zaten `completed` olan ödeme tekrar işlenmez.

---

## 9. Escrow (PaymentHold) ve Payout — pazar yeri çekirdeği

```
Ödeme başarılı
  → her sipariş için PaymentHold { sellerId, amount = order.total − komisyon, status: held, holdReleaseAt ≈ +7 gün }
  → teslim + alıcı onayı (veya zaman aşımı)
  → cron: holdReleaseAt geçince hold "released"
  → PayoutTransfer { sellerId, netAmount, commission } oluşur
  → cron: PayTR createPlatformTransfer → satıcı IBAN'ına net tutar
```

- **Komisyon** satıcı başına `order.commissionAmount`'tan kesilir; platform geliri `CommissionLedger`'da izlenir.
- **Çok satıcılı sepet:** N satıcı → N hold → N payout (her satıcının kendi IBAN'ına).
- **Payout güvenliği:** atomik claim (çift-payout önleme), güncel IBAN okuma, IBAN format/checksum doğrulama.

---

## 10. Sepet / Grup Akışı (çok-satıcı dahil)

```
1 sepet → N Order (ÜRÜN BAŞINA 1, her biri kendi sellerId) → 1 CheckoutGroup → 1 Payment(grup toplamı)
        → ödeme başarılı → N PaymentHold (SATICI BAŞINA) → N Shipment (sipariş başına) → N PayoutTransfer
```

- Tek-satıcı / çok-satıcı **aynı kod yolu**; fark sadece order'ların sellerId'lerinin aynı/farklı olması.
- Müşteri **tek ödeme** (tek 3D) yapar; grup toplamı çekilir, sepet PayTR'ye **kalem kalem** (sipariş başına) gönderilir.
- **Hep-ya-hiç tahsilat:** gruptaki bir sipariş `pending_payment` değilse ödeme reddedilir (kısmi tahsilat yok).
- Kargo: tek teslimat adresi, ama gönderiler **satıcı başına ayrı**.

---

## 11. Takas Nakit Farkı ve Üyelik

- **Takas nakit:** Takasta ek nakit ödeyen taraf `tradeId` ile `process-direct`'e gider; `TradeCashPayment` + `Payment.tradeCashPaymentId`. Başarı → takasın nakit emaneti (holdReleaseAt) açılır. Başarı sonrası `/trades/{id}?paid=1`'e döner (orders'a değil).
- **Üyelik:** `membership.subscribe` bir **sanal sipariş** (`membership-*` ürün) oluşturur → `process-direct` ile `orderId` üzerinden ödenir → başarı `/membership/success`. Üyelik siparişi kargo akışına girmez (completed'a çekilir).

---

## 12. Kayıtlı Kart + Kullanıcısız Oto-Yenileme (Non3D) — flag arkasında

- **Akış A (yeni kart):** `createDirectPayment` non3d=false → 3D Secure. `saveCard` işaretliyse `store_card=1` → callback'te `utoken` döner → `SavedCard` senkronlanır.
- **Akış B (kayıtlı kart):** `chargeRecurring` non3d=1 (kullanıcısız) → anında sonuç. Tek-tık ödeme + cron ile oto-yenileme.
- **Bağımlılık:** Akış B + `store_card` PayTR'nin **Non3D / Tekrarlayan Ödeme yetkisine** bağlıdır → tümü `PAYTR_RECURRING_ENABLED` arkasında. Kapalıyken: kayıtlı-kart UI'ı gizli, sadece yeni-kart 3D çalışır.
- **Güvenlik:** Kayıtlı kartta PAN/CVV yok; yalnız `utoken`/`ctoken` + maskeli `last4` saklanır.

---

## 13. İade (Refund)

- Yalnız **alıcı** iade talep eder (`POST /payments/refund`).
- `processRefund`: PayTR `/odeme/iade` çağrısı + ilgili `PaymentHold` iptal (payout'a gitmesin) + stok geri yükle.
- **Kısmi iade:** gruptaki tek sipariş iade edilebilir; o satıcının hold'u iptal, diğerleri etkilenmez; Payment `completed` kalır. Hepsi iade → Payment `refunded`.
- Sürat Kargo entegrasyonu açıksa iade kargosu da yönetilir.

---

## 14. Bayraklar (Feature Flags) ve Ortam

| Env | Varsayılan | Etki |
|---|---|---|
| `PAYTR_RECURRING_ENABLED` | `false` | Açıkken: kayıtlı kartla ödeme (Akış B) + "kartı kaydet" + oto-yenileme cron. (PayTR Non3D yetkisi gerekir.) |
| `PAYMENT_BYPASS` | `false` | **Dev/test.** Açıkken PayTR'yi tümüyle atlar, ödemeyi anında tamamlar. **Prod'da KAPALI kalmalı** (bootstrap'ta prod guard önerilir). |
| `PAYTR_TEST_MODE` | `1` (dev) | PayTR test modu (gerçek para çekilmez) |
| `PAYTR_MERCHANT_ID/KEY/SALT` | — | PayTR mağaza kimlik bilgileri |
| `PAYTR_CALLBACK_URL` | — | **Yalnız log için.** Gerçek Bildirim URL **PayTR panelinde** tanımlıdır (otoriter) |
| `FRONTEND_URL` | `http://localhost:3000` | `merchant_ok_url`/`merchant_fail_url` tabanı (kullanıcının döneceği success/fail sayfası) |
| `PAYTR_RECONCILE_AMOUNT_TOLERANCE_TL` | `0.05` | Tutar eşleşme toleransı |

---

## 15. Frontend

### Web (`apps/web`)
- `app/payment/[id]/page.tsx`: durumu yükler → **herkese** `CardPaymentForm` gösterir. iframe/fallback/re-initiate **yok**. Bypass açıksa anında tamamlar.
- `components/CardPaymentForm.tsx`: tek kanonik kart formu. Yeni kart → `process-direct` → 3DS HTML'i **tam-sayfa** `document.write` ile açar (gömme değil!). `recurringEnabled` ise kayıtlı kart + "kaydet".
- `app/payment/success/page.tsx`: `verify` döngüsü + **gerçek status'a** bağlı UI (tamamlanmadıysa "Doğrulanıyor", failed→fail).
- Çağrı noktaları: `checkout`, `orders/[id]`, `trades/[id]`, `membership/checkout` → hepsi `/payment/[id]`'ye yönlendirir.
- `lib/api.ts`: `paymentsApi.processDirect / getConfig / verify / getStatusLight ...`

### Mobil (`apps/mobile`, Expo)
- `app/payment/[id].tsx`: status'tan hedefi türetir → `CardPaymentForm`. 3DS **tam-ekran in-app WebView** (mobilde doğru desen).
- `src/components/CardPaymentForm.tsx`: web paritesi.
- `app/payment/success.tsx`: `isTerminal(status)`'a bağlı UI.

---

## 16. Dev Kurulumu (callback'i lokalde çalıştırmak)

PayTR sunucusu `localhost`'a ulaşamaz → **tünel şart**.

1. ngrok kur + authtoken ekle (`brew install ngrok`, `ngrok config add-authtoken ...`).
2. `ngrok http 3001 --url=https://<senin-dev-domain>.ngrok-free.dev` (API portu **3001**; pencere açık kalmalı).
3. PayTR panel → **Bildirim URL** = `https://<domain>/callback` (alias) veya `/api/payments/callback/paytr`.
4. `.env`'de `PAYTR_CALLBACK_URL`'i aynı yap (log tutarlılığı), `PAYMENT_BYPASS=false`.
5. Test kartı: `4355 0843 5508 4358`, SKT ileri tarih, **CVV `000`**.

**Callback gelmezse** (tünel ölü): işlem PayTR'de "Devam Ediyor" kalır; success sayfasının `verify`'ı veya reconcile cron'u eninde sonunda kapatır. **`PAYMENT_BYPASS=true`** ile PayTR'siz tüm akış test edilebilir.

---

## 17. Garantiler / Kenar Durumlar

- **Çift-çekim koruması:** Yeni çekimden önce önceki `merchant_oid` durum-sorgu ile kontrol edilir; ödendiyse 400 ile engellenir. (Tünel bozukken "Devam Ediyor" limbo'da %100 değil — tünel düzgünken tamdır.)
- **Oversell koruması:** Rezervasyon (30dk cron) bırakılmışsa charge öncesi CAS ile geri alınır.
- **Idempotent callback/verify:** Zaten tamamlanmış ödeme tekrar işlenmez.
- **Tutar doğrulama:** Hash geçse bile callback tutarı beklenenle uyuşmazsa ödeme tamamlanmaz (ALARM log).
- **Sahte başarı yok:** Success sayfası gerçek status'a bağlıdır.
- **PAN/CVV asla saklanmaz/loglanmaz.**

---

## 18. Dosya Haritası

| Katman | Yol |
|---|---|
| Controller | `apps/api/src/modules/payment/payment.controller.ts` |
| Callback alias | `apps/api/src/modules/payment/paytr-callback-alias.controller.ts` |
| Servis (kalp) | `apps/api/src/modules/payment/payment.service.ts` |
| PayTR adaptör | `apps/api/src/modules/payment-providers/paytr.service.ts` |
| DTO | `apps/api/src/modules/payment/dto/` (`direct-payment.dto.ts` vb.) |
| Payout | `apps/api/src/modules/payout/payout.service.ts` |
| Sipariş/sepet/grup | `apps/api/src/modules/order/order.service.ts` |
| Üyelik | `apps/api/src/modules/membership/membership.service.ts` |
| Şema | `apps/api/prisma/schema.prisma` |
| Global prefix exclude | `apps/api/src/main.ts` |
| Web ödeme | `apps/web/src/app/payment/`, `apps/web/src/components/CardPaymentForm.tsx` |
| Mobil ödeme | `apps/mobile/app/payment/`, `apps/mobile/src/components/CardPaymentForm.tsx` |
| E2E testler | `apps/api/test/e2e/` (`direct-payment`, `direct-scenarios`, `card-saving`, `payment-window`, `payment-bypass`, `payment-misc`, `recurring-renewal`, `escrow-edge-cases`) |
| Smoke (gerçek PayTR) | `apps/api/scripts/paytr-real-smoke.mjs` |
| PayTR resmi dökümanlar | `PayTR Direkt API/` (otoriter kaynak — birim/parametre buradan) |

---

## 19. Prod'a Çıkış Kontrol Listesi

- [ ] `PAYMENT_BYPASS=false`
- [ ] PayTR panel **Bildirim URL** = gerçek prod domain `/callback` (ngrok değil)
- [ ] `FRONTEND_URL` = gerçek prod domain
- [ ] `PAYTR_TEST_MODE=0` (canlı), gerçek merchant kimlikleri
- [ ] Gerçek bir ödeme + callback ile **tutarın doğru çekildiği** kanıtlandı (×100 yok)
- [ ] `PAYTR_RECURRING_ENABLED`: yalnız PayTR Non3D yetkisi onaylanınca aç
- [ ] Callback endpoint dışarıdan erişilebilir + `"OK"` dönüyor
- [ ] Satıcı IBAN doğrulama + payout cron çalışıyor

---

## 20. Test ve Doğrulama

- **E2E (mock PayTR, gerçek akış):** `cd apps/api && npx jest --config ./test/jest-e2e.json --runInBand direct-payment direct-scenarios card-saving payment-window payment-bypass payment-misc recurring-renewal`
  - Not: tek process'te tüm suite OOM verebilir → hedefli batch koş.
- **Gerçek PayTR smoke (hash/kabul):** `PAYTR_MERCHANT_ID=.. KEY=.. SALT=.. PAYTR_TEST_MODE=true node apps/api/scripts/paytr-real-smoke.mjs` (3DS HTML dönerse istek kabul edildi; **tutar doğruluğunu kanıtlamaz** — onu gerçek callback gösterir).
- **Gerçek uçtan uca:** ngrok + test kartı ile ödeme → loglarda `callback → tutar eşleşti → completed` zinciri + panelde **doğru tutar**.
