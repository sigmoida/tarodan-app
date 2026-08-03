# Ödeme, Komisyon ve Para Akışı

> Kalıcı referans (2026-08-02, kod üzerinden doğrulandı). Para akışının uçtan uca
> özeti: **ödeme → escrow hold → teslimat → hold release → payout**, yanında
> komisyon motoru, hizmet KDV'si, iadeler ve ledger/mutabakat. Doküman ile kod
> çelişirse kod doğrudur; her bölümde ilgili dosyalar verilmiştir.

---

## 1. Ödeme başlatma ve kart verisi sınırı

Sağlayıcı soyutlaması `payment-providers/payment-provider.registry.ts`; tek
gerçek sağlayıcı **PayTR** (`paytr.service.ts`). Uçlar
`modules/payment/payment.controller.ts`:

- `GET /payments/config` (public) — `bypassEnabled` (prod'da zorla `false`),
  `cardStorageEnabled`, `recurringEnabled`.
- `POST /payments/initiate` / `initiate-guest` / `initiate-trade-cash`.
- `POST /payments/direct-form` — kart akışı (aşağıda).
- `POST /payments/callback/paytr` — public webhook (60/dk throttle) + alias controller.

**`direct-form` bir tahsilat sonucu DEĞİL, imzalı bir PayTR form tarifi döner:**
`{ paymentId, action, method, fields[], requireCvv, savedCard, status:"pending" }`.
İstemci bu alanlara kart bilgilerini ekleyip **doğrudan PayTR'ye** POST eder;
ödeme, asenkron callback ile tamamlanır. İki akış: yeni kart (`store_card=1`
yalnız login + `PAYTR_CARD_STORAGE_ENABLED`) ve kayıtlı kart
(`utoken`/`ctoken`/`require_cvv`; login şart). Form üretilirken Payment atomik
olarak `processing`'e CLAIM edilir, `finally`'de `pending`'e bırakılır.

**3DS**: `createDirectPaymentForm` içinde `non_3d = "0"` sabittir — alıcı
başlatan her ödeme 3D Secure'dür. `non_3d=1` yalnız `chargeRecurring`'de
(`PAYTR_RECURRING_ENABLED` arkasında) vardır.

**Kart verisi sınırı** (`payment-card-data-boundary.spec.ts` sözleşmesi):
API PAN/CVV'yi asla görmez. (1) Eski `process-direct` rotası yoktur;
(2) `DirectPaymentDto` kart alanı bildirmez; (3) `assertNoRawCardData(req.body)`
gövdeyi tarar ve kart alanı görürse 400 fırlatır.

**Misafir OTP** bir ödeme akışı değildir: `POST /orders/guest/send-verification-code`
ile sipariş oluşturma anında e-posta doğrulamasıdır (Redis'te tek kullanımlık;
idempotency kontrolünden **sonra** tüketilir, replay kodu yakmaz). Misafir
ödemesi `userId = null` ile sıradan `initiate`/`direct-form`'dur.

---

## 2. Sipariş para formülü

Tek kaynak dört helper, `modules/order/`:

- **Alıcı toplamı** (`order-total.helper.ts` → `buyerTotalOf`):
  `total = (indirim sonrası) subtotal + buyerShipping + buyerFee + buyerServiceTax`.
  **Ürün KDV'si yoktur** — ilan fiyatı KDV dahil kabul edilir, beyanı satıcıya aittir.
- **Satıcı neti** (`order-net.helper.ts` → `sellerNetAmountOf`):
  `net = subtotal − sellerFee − stopaj − sellerShipping − sellerServiceTax` (≥0).
- **Hizmet KDV'si** (`order-service-tax.helper.ts`): kural _hizmeti kim alıyorsa
  KDV'sini o öder_. Alıcı tabanı = alıcı komisyonu + hizmet bedeli + alıcı kargo
  payı → alıcı toplamına **eklenir**; satıcı tabanı = satıcı komisyonu + platform
  bedeli + satıcı kargo payı → hakedişten **düşülür**. Ürün tutarı tabana asla
  girmez. KDV **satır bazında** yuvarlanır (e-fatura satırlarıyla birebir eşitlik).
- **Vergi politikası** (`order-tax-policy.service.ts`): sabit değer yok;
  `PlatformSetting` anahtarları `service_vat_enabled` (true), `service_vat_rate`
  (20), `withholding_tax_rate` (1), `withholding_applies_to_individual` (false).
  Stopaj (GVK 94/19) yalnız satıcı tarafından kesilir; kurumsal olmayan satıcıda
  bayrak kapalıysa 0'dır.

Quote ve checkout aynı koddan geçer (`order-pricing.service.ts`,
`order-checkout-common.service.ts` → `resolveOrderTaxes` + `buyerTotalOf`).
Quote yanıtındaki `pricing.summary { productAmount, shippingAmount,
serviceFeeAmount, total }` ekranların aynen basması gereken üç satırdır.

---

## 3. Komisyon motoru

Saf mantık `modules/order/order-commission.helper.ts`; quote-anı çözücü
`OrderPricingService.calculateCommission` (`order-pricing.service.ts:849`);
admin CRUD + doğrulamalar `modules/admin/admin-commission.service.ts`.
(`modules/commission/` yalnız ledger'dır — motor orada değildir.)

- **Dört bedel ekseni** kural başına: `buyerCommissionRate`,
  `buyerServiceFeeRate`, `sellerCommissionRate`, `sellerPlatformFeeRate` — her
  biri kendi TL Min/Max clamp'iyle. Alıcı tarafı `appliesTo ∈ {BUYER, BOTH}`,
  satıcı tarafı `{SELLER, BOTH}`; iki taraf **bağımsız** eşlenir.
- **Özgüllük skoru**: kategori (4) > mükellefiyet (2) > satıcı tipi (1),
  sınırlı `[minAmount,maxAmount]` aralığına +0.5; beraberlik `priority` ile çözülür.
  `null`/`ALL` joker.
- **Mükellefiyet ekseni**: `corporate` ⟺ `businessStatus === "approved" && taxId`
  (KDV/stopaj uygunluğuyla aynı test).
- **Satıcı tipi**: üyelik → `BUSINESS`/`PREMIUM` (yalnız `isPremiumEntitled`
  iken — `past_due` üyelik ucuz komisyon açmaz), platform satıcısı → `BUSINESS`,
  aksi `FREE`.
- **Kargo payı**: kuralda tekil `shippingBuyerShare` + paket kademesi başına
  `shippingShares[]`; `resolveShippingBuyerShares` tam `{small,medium,large}`
  haritası üretir (yoksa tekil pay, o da yoksa 100 = alıcı öder).
- **Catch-all zorunluluğu → 503**: her eksende joker + `appliesTo: BOTH` bir
  kural aktif olmak zorundadır. Satıcı tarafı eşleşmezse checkout
  `ServiceUnavailableException` (503) ile **fail-closed**. Son catch-all'ı
  silme/daraltma admin'de engellenir; `/api/health/ready` yokluğunu raporlar.
- **Çakışma doğrulaması**: aynı eksenler + kesişen `appliesTo` + kesişen tutar
  aralığı → 400. Birden çok kural ancak çakışmıyorsa yaşayabilir.

---

## 4. Checkout güvenlik rayları

- **`idempotencyKey`** (UUIDv4, zorunlu) — aynı anahtar aynı checkout grubunu
  döndürür; misafirde OTP tüketiminden **önce** kontrol edilir.
- **`expectedShippingTariffVersion`** (zorunlu) — aktif tarife versiyonundan
  farklıysa/yoksa `409 server.shipping.pricingChanged`.
- **`expectedPricingHash`** (zorunlu) — quote'un döndürdüğü 16-hex sha256
  (sıralı `productId:unitPrice:quantity:desi` üzerinden); bayat/eksikse aynı 409.
  İstemci 409'da quote'u yeniler.
- **Finansal snapshot** — hash, indirim, tarife id/versiyon, komisyon kural
  id/adı, vergiler ve toplam siparişe yazılır (audit + yeniden hesap).
- **Fail-closed 503'ler**: aktif kargo tarifesi yoksa ve satıcı tarafı komisyon
  kuralı eşleşmiyorsa.

---

## 5. Escrow

`modules/payment/escrow-hold.service.ts`; ödeme tamamlanırken para
transaction'ının içinde `createHold` çağrılır (`payment-fulfillment.service.ts`).

`sellerAmount = totalAmount − komisyon − stopaj − alıcı hizmet KDV − satıcı
hizmet KDV − TAM kargo (alıcı+satıcı payı) + platform fonlu indirim` (≥0).
Kargonun tamamı platformda kalır çünkü Sürat faturası platforma kesilir; kesinti
hold'u aşarsa fark idempotent `shipping_deficit` satıcı borcu olarak yazılır.
Aynı tx'te `pending` `CommissionLedger` satırı upsert edilir.

`releaseAt` ödeme anında **NULL**'dur. Tek tetik teslimat:
`PaymentRefundService.handleOrderDelivered` (webhook/worker/poll/admin hepsi
buraya akar) CAS ile siparişi günceller, `FEATURE_48H_CONFIRMATION_WINDOW`
açıksa `awaiting_buyer_confirmation` + 48s onay penceresi kurar ve
`releaseAt = deliveredAt + RETURN_WINDOW_DAYS (14) + PAYOUT_GRACE_DAYS` yazar.

**Release**: `releaseHoldsDue()` saatlik `payment-release-holds` cron'unda;
yalnız `held`, vadesi gelmiş, iade ile dondurulmamış hold'lar — ayrıca sipariş
`{delivered, awaiting_buyer_confirmation, completed}` içinde ve açık iade talebi
yoksa. Şüphede para **tutulur**, yanlış ödenmez. Takas nakit escrow'u aynı
geçişte açılır.

---

## 6. Payout

`modules/payout/payout.service.ts`; scheduler: `payout-process` 15 dk'da bir,
`payout-check-returned` her gün 06:00. Kill-switch: `PAYOUTS_DISABLED=true`.

1. **Oluşturma** — `released` ve dondurulmamış her hold için (bloklayan iade
   yoksa) `PYT-…` referanslı transfer; `netPayout = hold − iade edilen`.
2. **Satıcı borcu mahsubu** — açık `sellerAccountAdjustment` varsa FIFO tahsis
   (`FOR UPDATE`), `netAmount = max(0, net − Σtahsis)`; dengeli ledger grubu
   `seller_debt_recovery / seller_escrow`.
3. **İşleme kontrolleri** — uygunluk + iade yeniden doğrulanır; **bayat-net
   koruması** (yalnız aşağı düzeltme; `fully_refunded` → failed); IBAN her
   seferinde güncel `SellerBankAccount`'tan okunur (snapshot'a güvenilmez);
   `isValidTrIban` (mod-97) geçemeyen → failed; **3 günlük IBAN değişiklik
   soğuması** → pending bekler; atomik `pending → processing` claim + claim
   sonrası TOCTOU yeniden okuma.
4. **Submitted / processed ayrımı** — PayTR `success` yalnız _talimat kabulü_
   demektir. `PAYTR_TRANSFER_CALLBACK_ENABLED=true` iken payout `processing` +
   `submittedAt` olarak kalır (**submitted**); tamamlanma yalnız callback'te.
   Bayrak kapalıyken (varsayılan) senkron kabul `completed` sayılır. İki yol da
   `applyPayoutCompletionEffects()`'te birleşir (IBAN oto-doğrulama, satıcıya
   e-posta, ledger settle).
5. **Callback** — `POST /payouts/callback/paytr-transfer` (public, hash
   doğrulamalı, düz `"OK"` dönmek zorunda). 3 günü aşan callback gecikmesi alarm
   üretir. `payout-failed-seller` / `payout-returned-seller` e-postaları maskeli
   IBAN son-4 ve sebep taşır; günlük returned taraması + 30 dk stuck-processing
   tespiti vardır.

---

## 7. İadeler

Politika saf ve merkezî: `modules/refund/refund-financial-policy.ts`.

**İade (return) politikaları** — `resolveReturnPolicy(reason)`:

| Politika               | Nedenler                                                                                       | İade kargosu | Gidiş kargo alıcıya iade | Alıcı bedeli iade | Satıcı payı tazmin | Gidiş satıcıya yansıtılır |
| ---------------------- | ---------------------------------------------------------------------------------------------- | ------------ | ------------------------ | ----------------- | ------------------ | ------------------------- |
| `seller_fault_return`  | delivery_delayed, not_as_described, wrong_item, damaged, missing_parts, counterfeit, defective | satıcı       | ✔                        | ✔                 | ✘                  | ✔                         |
| `buyer_remorse_return` | changed_mind                                                                                   | alıcı        | ✘                        | ✘                 | ✔                  | ✘                         |
| `buyer_fault_return`   | buyer_damaged                                                                                  | alıcı        | ✘                        | ✘                 | ✔                  | ✘                         |
| `manual_review_return` | diğer her şey                                                                                  | —            | ✘                        | ✘                 | ✘                  | ✘                         |

`wrong_item` / `counterfeit` ayrıca ceza incelemesi işaretler.

**İptal** — `resolveCancellationPolicy(reason, { hasShipped })`: kargoya
verilmeden maliyet gerçek değildir → iki taraf da bütünlenir. Verildikten sonra
maliyet kusurlu tarafa gider: `delivery_delayed`'de gidiş satıcıya yansır;
cayma nedenlerinde alıcının kargo payı iade edilmez ve koruma bedeli hep kalır.

**Hesap** (`calculateRefundFinancials`): "alıcı bedeli tam iade" =
`buyerFeeAmount` (alıcı komisyonu **+** hizmet bedeli). Satır bazlı oranlama
`refundQuantity/orderQuantity`; **kargo asla oranlanmaz** — satıcı kargo tazmini
yalnız tam iadede ödenir; satıcıya yansıtılan gidiş, fiilen iade edilen tutarı
aynaladığı için oranlanır. `buyerRefund = ürün + gidiş + koruma − alıcıya
yazılan dönüş kargosu` (≥0).

**PayTR iadesi**: `createRefund(merchantOid, amount, referenceNo)` —
`return_amount` **ondalık TL**'dir (asla kuruş; 100× kayıp riski), `reference_no`
= `RefundAttempt` id (hash'e dahil değildir). Kesin ret ile belirsiz sonuç
ayrıdır; belirsizler `manual_review`'a park eder ve
`refund-reconciliation.service.ts` PayTR **durum sorgusu**ndaki `returns[]`
listesini `referenceNo` ile eşleyip CAS ile `succeeded`'a çevirir; referanssız
ama tutarı tutan dönüş **belirsiz** bırakılır (insan kararı).

---

## 8. Takas ödemeleri (v2)

`modules/trade/trade-pricing.helper.ts` (fiyat motoru), `trade-quote.service.ts`
(teklif/önizleme), `trade-payment-rows.helper.ts` (kabulde yazılan satırlar),
`trade-refund-policy.ts` (iade matrisi).

Eski model bir **aracılık komisyonuydu**: yalnız nakit farkı varsa, yalnız farkı
ödeyen taraftan farkın yüzdesi alınırdı — kafa kafaya takasta platform hiç gelir
elde etmezken dört kargo bacağının maliyetini üstlenirdi. v2'de **her iki taraf
kendi ödemesini yapar**:

```
takas hizmet bedeli + (2 × kargo) + (fark ödeyense fark)
```

- **Hizmet bedeli** komisyon kuralından ürün başına okunur ve TOPLANIR: bir taraf
  kendi verdiği ürünlerin `tradeFeeSellerAmount`'ını + karşıdan aldıklarının
  `tradeFeeBuyerAmount`'ını öder. Tutarlar admin'in girdiği **KDV DAHİL**
  sabitlerdir — üzerine oran ya da KDV hesabı YAPILMAZ (sipariş ücretlerinden
  bilinçli fark). Ekranda tek satır gösterilir.
- **Kargo** taraf başına 2 bacaktır (kullanıcı→depo, depo→karşı kullanıcı);
  kademe tarafın ürünlerinin birleşik desisinden çözülür. Kademe tanımı yoksa
  fiyatlama **fail-closed** 503 verir (sessizce 0 yazmaz).
- Fiyat **kabulde snapshot'lanır** (`TradeCashPayment` satırlarına yazılır);
  kural ya da tarife sonradan değişse bile takas kabul edildiği fiyatla biter.

**İki ödeme kapısı** — `payment-fulfillment.service.ts`: her satır kendi PayTR
ödemesiyle tahsil edilir; takas ancak İKİ satır da `completed` olduğunda
`awaiting_payment → shipping_to_warehouse`a geçer. Geçiş `version` guard'lı
`updateMany` ile yazılır, böylece eşzamanlı iki callback sevkiyatı iki kez
tetiklemez.

**İade matrisi** — kargoya verilmeden iptal = TAM iade; ürünler kargoya
verildikten sonra (`firstWarehouseArrivalAt` ya da herhangi bir `shippedAt`)
**kargo bedeli iade edilmez**, hizmet bedeli ve fark iade edilir. `completed`
terminaldir; sonrası yalnız dispute.

**Para nereye gider** — fark karşı tarafa (escrow → payout), hizmet bedeli ve
kargo platformda kalır. Payout yalnız fark taşıyan satır için üretilir. Defterde
fark `seller_escrow`, ücret `platform_commission`, kargo `shipping_income`
(gelir değil, taşıyıcıya geçiş kalemi) hesabına düşer. Fatura taraf başına
kesilir: v2 satırı `trade_service_fee` (KDV **dahil**, içinden ayrıştırılır),
v1 satırı `trade_commission` (KDV hariç matrah).

**v1 takaslar** eski kuralla biter: ayrım tek yerde, `Trade.pricingVersion`
alanındadır.

---

## 9. Ledger ve mutabakat

`modules/ledger/ledger.service.ts` append-only çift kayıt defteridir:
Σborç == Σalacak değilse kayıt reddedilir. `payment_captured`, `refund_issued`,
`psp_fee_accrued`, payout settle ve satıcı borcu tahsili kaydedilir.

Çapraz kontrol iki hat: (1) **PayTR rapor senkronu**
(`paytr-report-sync.service.ts`, `PAYTR_REPORT_SYNC_ENABLED=true` iken):
işlem ekstresi 3 günlük kayan pencereyle (05:00), settlement raporları 31 günle
(05:30) `paytr_statement_lines`/`paytr_settlements` tablolarına idempotent
çekilir. (2) **Eşleme + sapma**
(`paytr-report-matching.service.ts`): her ekstre satırı oid üzerinden Payment/
RefundAttempt'e eşlenir (±0.05 TL toleransla `matched`/`amount_mismatch`/
`unmatched`); ters tarama bizim `completed` deyip PayTR'nin hiç raporlamadığı
ödemeleri bulur (en yüksek alarm); settlement'lar `satış − iade == net` ile
doğrulanır; PSP ücretleri ledger'a damgalanır. `ledger-reconciliation.service.ts`
(her gün 04:00, salt-okuma) beş invariantı denetler ve para taşımaz, alarm basar.

## 10. Para cron'ları

Tek kaynak `apps/api/src/workers/cron-catalog.ts` (Bull `scheduled` kuyruğu,
Europe/Istanbul):

| Anahtar                 | Zamanlama | Görev                                               |
| ----------------------- | --------- | --------------------------------------------------- |
| `payment-expired`       | */5 dk    | süresi dolan ödemeleri iptal, rezervasyonları bırak |
| `payment-release-holds` | saatlik   | escrow release                                      |
| `payout-process`        | */15 dk   | payout oluştur + işle                               |
| `payout-check-returned` | 06:00     | dönen transferler                                   |
| `paytr-statement-sync`  | 05:00     | PayTR ekstresi                                      |
| `paytr-settlement-sync` | 05:30     | PayTR settlement                                    |
| `ledger-reconcile`      | 04:00     | sapma invariantları                                 |

Kargoyla ilgili cron'lar için [SHIPPING.md](./SHIPPING.md); kod/referans
biçimleri için [CODE_SCHEME.md](./CODE_SCHEME.md).
