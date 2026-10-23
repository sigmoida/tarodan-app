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
  `cardStorageEnabled`, `recurringEnabled` ve amaç başına
  `purposes.{checkout,membership}.{cardStorageEnabled,recurringEnabled}`.
- `POST /payments/initiate` / `initiate-guest` / `initiate-trade-cash`.
- `POST /payments/direct-form` — kart akışı (aşağıda).
- `POST /payments/callback/paytr` — pazaryeri mağazasının webhook'u (60/dk throttle) + alias controller.
- `POST /payments/callback/paytr/membership` — üyelik mağazasının webhook'u.

### İki PayTR mağazası

PayTR non-3D (kullanıcısız recurring) yetkisini pazaryeri mağazasına vermedi.
Bu yüzden iki mağaza vardır (`PaytrMerchant`):

| Mağaza        | Env                           | Ne alınır                                                  | Yetenek                                                                                                     |
| ------------- | ----------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `marketplace` | `PAYTR_MERCHANT_*`            | Sipariş, sepet, takas nakdi, öne çıkarma; satıcı transferi | kart saklama `PAYTR_CARD_STORAGE_ENABLED`; recurring **hiçbir zaman**                                       |
| `membership`  | `PAYTR_MEMBERSHIP_MERCHANT_*` | Üyelik ilk satın alma + oto-yenileme                       | kart saklama varsayılan açık (`PAYTR_MEMBERSHIP_CARD_STORAGE_ENABLED`); recurring `PAYTR_RECURRING_ENABLED` |

Kurallar (tek kaynak `config/paytr.ts` + `payment/helpers/paytr-merchant.helper.ts`):

- **Yeni** ödemenin mağazası yalnız `resolvePaytrMerchant` ile belirlenir (üyelik
  siparişi → `membership`, diğer her şey → `marketplace`) ve direct-form claim'inde
  `payments.paytr_merchant`'a yazılır. Oto-yenileme `membership_payments.paytr_merchant = membership` yazar.
- **Sonraki** her PayTR çağrısı (durum-sorgu, iade, iade-sonucu çözümü, kart silme,
  mutabakat) oid önekine değil **kaydın** `paytrMerchant`'ına bakar
  (`PaymentProviderRegistry.resolve(provider, merchant)`). Geçiş öncesi alınmış
  üyelik ödemeleri bu yüzden eski mağazadan iade edilir.
- İmza yalnız `PaytrMerchantCredentials`'ta atılır; iki mağazanın anahtarı hiçbir
  istemciye kopyalanmaz.
- Bildirim hash'i **ucun** mağazasının anahtarıyla doğrulanır. Doğrulanmış ama kaydı
  diğer mağazada alınmış bir bildirim `PAYTR_MERCHANT_MISMATCH` ile loglanıp
  uygulanmadan `OK` döner (ör. mağaza değişmiş bir ödemenin eski oid'i ya da panelde
  yanlış Bildirim URL'i) — manuel inceleme. Geçiş sonrası yarım ödeme kontrolü
  (log araması + salt-okunur SQL + manuel çözüm adımları) ve üyelik mağazası
  panelindeki Bildirim URL uyarısı (yalnız `/callback/paytr/membership`; `/callback`
  alias'ı ve pazaryeri URL'i her bildirimi hash hatasına düşürür):
  `OPERATIONS.md` → "Bir kerelik: PayTR üyelik mağazası geçişi" 2. ve 6. adım.
- Kartlar (`saved_cards.paytr_merchant`) mağazaya özeldir: sepet ödemesi pazaryeri,
  üyelik ödemesi ve oto-yenileme üyelik kartlarını kullanır. Kart **taşınmaz**.

**`direct-form` bir tahsilat sonucu DEĞİL, imzalı bir PayTR form tarifi döner:**
`{ paymentId, action, method, fields[], requireCvv, savedCard, status:"pending" }`.
İstemci bu alanlara kart bilgilerini ekleyip **doğrudan PayTR'ye** POST eder;
ödeme, asenkron callback ile tamamlanır. İki akış: yeni kart (`store_card=1`
yalnız login + ödemenin mağazasında kart saklama; `saveCard` gönderilmezse
üyelik ödemesinde saklanır, diğerlerinde saklanmaz) ve kayıtlı kart
(`utoken`/`ctoken`/`require_cvv`; login şart; kart ödemenin mağazasında olmalı).
Form üretilirken Payment atomik olarak `processing`'e CLAIM edilir (mağaza +
ödeyen IP'si `metadata.payerIp` bu anda yazılır), `finally`'de `pending`'e bırakılır.

Callback'te `utoken` gelirse kartlar **fulfillment'tan önce** senkronlanır
(mağaza + vekâlet IP'si = `payerIp`): üyelik aktivasyonu `autoRenew`'i
"kullanılabilir üyelik kartı var mı" ile belirler, kartını kaydeden üye böylece
oto-yenilemeli başlar. Oto-yenileme `user_ip` olarak bu IP'yi gönderir.

**3DS**: `createDirectPaymentForm` içinde `non_3d = "0"` sabittir — alıcı
başlatan her ödeme 3D Secure'dür. `non_3d=1` yalnız `chargeRecurring`'de, üyelik
mağazasında (`PAYTR_RECURRING_ENABLED` arkasında) vardır.

**Kartsız oto-yenileme**: yenileme zamanı gelmiş (dönem sonuna ≤1 saat) ve
üyelik mağazasında CVV'siz aktif kartı olmayan üyenin `autoRenew`'i kapatılır ve
`membership_renewal_card_required` bildirimi gider (sessizce free'ye düşmez).
Geçişte aynı işlem tüm üyelere bir kez `notify-membership-card-readd` ile yapılır
(bkz. OPERATIONS.md).

**Kart verisi sınırı** (`payment-card-data-boundary.spec.ts` sözleşmesi):
API PAN/CVV'yi asla görmez. (1) Eski `process-direct` rotası yoktur;
(2) `DirectPaymentDto` kart alanı bildirmez; (3) `assertNoRawCardData(req.body)`
gövdeyi tarar ve kart alanı görürse 400 fırlatır.

**Misafir OTP** bir ödeme akışı değildir: `POST /orders/guest/send-verification-code`
ile sipariş oluşturma anında e-posta doğrulamasıdır (Redis'te tek kullanımlık;
idempotency kontrolünden **sonra** tüketilir, replay kodu yakmaz). Misafir
ödemesi `userId = null` ile sıradan `initiate`/`direct-form`'dur.

### Return URLs and virtual orders

Membership and boost are **virtual orders**: an ordinary Order on a virtual
product (`membership-<tierId>`, `boost-<boostId>`, origin
`platform_service`). `virtualOrderKind` (`payment/helpers/virtual-order-kind.ts`)
is the one reader of those prefixes (`VIRTUAL_ORDER_KINDS` in
`@tarodan/types`); the older prefix checks in fulfilment, refunds and
invoicing are a backlog item.

- **Return URLs.** `createDirectPaymentForm` builds
  `merchant_ok_url = <FRONTEND_URL>/payment/success?<query>` and
  `merchant_fail_url = <FRONTEND_URL>/payment/fail?<query>` with the same
  query (`paymentReturnQuery`): `paymentId` always, `type=membership|boost`
  for a virtual order, `guest=true` for a guest order or cart. A trade cash
  payment carries `paymentId` only. Mobile matches only the path of these
  URLs, so the query is safe for every app version.
- **Fail page.** With the `paymentId` the web fail page calls
  `POST /payments/:id/confirm-failed` while the payment is still `pending`.
  It is a no-op while the 3DS charge may be live
  (`metadata.lastChargeStartedAt` within `paymentFailTimeoutMinutes`); after
  that it runs `processFailedPayment`, the same path as the PayTR failure
  callback and the expiry cron (CAS to `failed`, order cancelled,
  reservation released). A 3DS failure therefore needs a new checkout, as
  before.
- **Payment status.** `GET /payments/:id/status`, `/status-guest` and
  `GET /payments/:id` add `isMembershipOrder: true` for a membership payment
  and `isBoostOrder: true` with `boost: { id, productId, productTitle,
endsAt }` for a boost payment (`endsAt` null until activation;
  `VirtualOrderPaymentFields` in `@tarodan/types`). Orders of goods get
  neither.
- **Boost purchase consents.** `POST /products/:id/boost/initiate` needs the
  pre-contract information and withdrawal waiver consents and writes the
  boost, its virtual product, its order and both consents in one
  transaction; `direct-form` refuses a boost order without them
  (`400 server.product.boostConsentRequired`). Details and the legal release
  blocker: `CONSENTS.md`, "Platform services (boost)".
- **Boost price at consent.** The initiate body carries `expectedPrice`, the
  price the dialog showed for the chosen package and duration (TL, VAT
  included; required, a JSON number with at most two decimals, text is a
  400). The server resolves the price itself (package tier for the listing's
  price band and the seller's audience, campaign price inside its window: the
  same rule `GET /products/:id/boost/options` shows) and compares the two in
  whole kuruş (`boostPriceMatches` in `@tarodan/types`, the only comparison
  rule). A mismatch (the package and duration are still offered, at another
  price) is `409 server.product.boostPriceChanged` before any order lookup,
  reference or write, so no boost, order, consent or payment row exists for
  terms the seller did not see. The refusals that come before it win:
  consents, boost off, listing, owner, status, package, tier, a zero price; so
  a package or duration that is no longer offered at all is the 400
  `boostPackageNotFound` or `boostPriceUndefined`, not the 409. On a match the
  resolved price is what the boost, the order and the payment carry; the
  client's number is never written. On the 409 the dialog reloads the prices
  and asks for both consents again; it also refuses to open the pay page for
  a started order whose price is not the one shown (same rule), which covers
  an API that does not check the price yet while a release rolls out.
- **Boost tier band.** A package tier prices one duration for a band of
  listing prices (`boostTierBasePrice`). The band is half-open:
  `minAmount <= price < maxAmount`, a null `maxAmount` has no upper bound,
  the same rule as the commission bands. So 1000-5000 and 5000-(none) touch
  without overlapping, and a listing priced exactly 5000 is in the second
  band only. The rule lives in one file,
  `product/helpers/boost-tier-band.ts`, read by the options, the purchase
  start and the one-time offer. The admin save (create, and an update that
  sends `tiers`) refuses, before any write, a band whose upper bound is not
  above its lower bound (`400 server.admin.commission.maxAboveMin`) and two
  active tiers of one duration whose bands share a price
  (`400 server.admin.adPackage.tierOverlap`, with both ranges in the
  message); both name the rows in `tierIndexes` (positions in `tiers`).
  Inactive rows and other durations may overlap. For rows saved before the
  check, the options and the purchase start read the covering tiers with the
  same filter and the same order (`BOOST_TIER_PRECEDENCE`: highest lower
  bound, then the narrower band, then the older row, then the id) and take
  the first one per duration, so the options show one price per duration and
  initiate resolves that same tier. `maintenance/check-ad-package-tiers.ts`
  lists such rows (`OPERATIONS.md`, "Check: ad package tier bands").
- **Tracing.** The boost purchase start tags its request `flow=boost`;
  the purchase and the activation leave `boost.*` breadcrumbs with ids only
  (boost, order, order number, listing; `boost.price_mismatch` carries the
  listing, package and duration, no amount). Activation sets no tag because it
  also runs in worker jobs, which share the process scope. A paid boost
  order without its boost row is a Sentry error event.

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
- **Çekim ↔ iptal dışlaması** (`payment/helpers/payment-order-lock.ts`):
  ödenmemiş siparişi kapatan yollar (alıcı / yönetici iptali, 24s süpürmesi)
  sipariş satırını yazar. Direct-form claim'i ödeme satırını, sonra
  siparişleri `FOR SHARE` kilitleyip hepsi hâlâ `pending_payment` mı diye
  claim'le aynı işlemde bakar — değilse çekim başlamaz
  (`orderNotAwaitingPayment`). Başarı callback'i ödeme claim'inden sonra
  siparişleri `FOR UPDATE` kilitleyip durumu öyle okur: iptal edilmiş sipariş
  canlandırılmaz, otomatik iadeye (`processRefund`) gider. Claim commit
  ettikten sonra gelen iptal, `lastChargeStartedAt` damgasını canlı çekim
  olarak görür: ödenmemiş iptal çekirdeği (`cancelUnpaidOrderInTx`, alıcı —
  misafir dahil — ve yönetici iptali) çağıranın sipariş kilidi altında
  `orderHasLiveCharge` ile bakar ve 409 `server.order.cancelPaymentInFlight`
  ("ödeme sürüyor, birazdan tekrar deneyin") döner; 24s süpürmesi atlar.
  - **Kilit sırası** — hem ödeme hem sipariş satırı kilitleyen yollar ÖNCE
    ödemeyi, SONRA siparişi kilitler (sepette ikisi de id sırasıyla): claim
    (ödeme `FOR UPDATE` → siparişler `FOR SHARE`), callback (ödeme CAS →
    siparişler `FOR UPDATE`), iade sonlandırması (ödeme `FOR UPDATE` →
    sipariş yazımı), 24s süpürmesi (`lockOrderPaymentRows`: siparişin ve
    sepetinin ödemeleri `FOR UPDATE` → sipariş `FOR UPDATE` → ödeme yazımı).
    Yalnız sipariş kilitleyen yollar (alıcı / yönetici iptali, hazırlama
    süresi süpürmesi, rezerv bırakma) ödeme satırını kilitlemez, yalnız okur
    — bekledikleri tek kilit sipariş kilididir, döngü kurulamaz.

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
`Order.returnWindowEndsAt = deliveredAt + returnWindowDays (14)` ve `releaseAt = returnWindowEndsAt + payoutGraceDays (1)` yazar (Süreler ve Kurallar; iade uygunluğu da aynı damgayı okur — bkz. `TIMING_RULES.md`).

**Release**: `releaseHoldsDue()` saatlik `payment-release-holds` cron'unda;
yalnız `held`, vadesi gelmiş, iade ile dondurulmamış hold'lar — ayrıca sipariş
`{delivered, awaiting_buyer_confirmation, completed}` içinde ve açık iade talebi
yoksa. Şüphede para **tutulur**, yanlış ödenmez. Takas nakit escrow'u aynı
geçişte açılır.

**Kalıntı (iade/iptal sonrası)**: iade satıcının kargo payını hold'da bırakırsa
(`holdRetainedAmount`) sipariş `cancelled`/`refunded` olur ama hold
`amount − refundedAmount > 0` ile `held` kalır. Bu kalıntı, sonuçlanmış iade
talebinde kusur satıcıda **değilse** (`RefundRequest.faultParty`; v1'de
`seller_fault_*` politika kodu) bırakılır ve ödenir; satıcıdaysa ya da kusur
belirlenemiyorsa asla. Damgasız kalıntı (kargoya verilmeden iptal) hemen
vadelidir. Karar tek yüklemde: `payout/helpers/hold-release-eligibility.ts` —
manuel bırakma, cron, payout yolları ve admin hold listesinin `releasable`
rozeti aynı fonksiyonu okur. Cron kalıntı adayını **siparişin kapanmış
olmasından** seçer (`payout/helpers/closed-order-hold-candidates.ts`),
`refundedAmount > 0`'dan değil: bırakılacak pay hold'u aşarsa iade hiç tüketmez
ve kalıntı hold'un tamamıdır.

**Satıcı kusurlu kalıntı platformun parasıdır, alıcının değil.** Alıcının
ödediği `T = ürün + alıcı kargo payı + alıcı ücretleri (+KDV)`; satıcının kargo
payı T'de **yoktur**, satıcının hak edişinden düşülür. Örnek: ürün 1000, alıcı
kargo 60, satıcı kargo 40, alıcı ücretleri 80, satıcı ücretleri 100 →
T = 1140, hold = T − ücretler − tam kargo = 1140 − 80 − 100 − 100 = 860.
Satıcı kusurlu kargo öncesi iptalde alıcıya **1140 (T'nin tamamı)** döner.
Satıcı payı tazmin edilseydi hold yalnız 820 tüketilir, 40 kalırdı; o 40
satıcıya ödenemez (kusurlu) ve alıcıya da iade edilemez (PSP tavanı T, alıcı
zaten T'yi aldı). Hold tam tüketildiğinde alıcı, satıcı ve platform 0'da
kapanır — kalıntı, platformun alıcıya T'yi öderken kendi payından koyduğu
paradır.

- **Kaynak**: satıcı kusurlu kargo öncesi iptal satıcının kargo payını artık
  tazmin **etmez** (v2 `!hasShipped` dalında `faultParty === "seller"` iken
  `outbound_shipping / seller_refund` üretilmez; v1 `seller_fault_cancellation`
  → `compensateSellerShipping: false`). Alıcı iadesi değişmez (T), hold tamamen
  tüketilir. Satıcı kusurlu iade (kargolanmış) zaten kalıntı üretmiyordu
  (satıcıya tam kargo borcu, tazmin yok). Alıcı/kargo/platform kusurunda
  davranış aynıdır.
- **Units returned one at a time** (v2): the seller's share is carried by the
  refund that completes the line, after earlier partial refunds consumed their
  slices. `holdRetainedAmount` is what must be **left** in the hold after that
  refund, so it caps the cumulative consumption at `amount − retained`
  (`payment/helpers/hold-consumption.ts`). If an earlier slice already reached
  past the cap (a cheap item whose hold is small next to the share), that part
  is given back; a share above the whole hold leaves the whole hold. The same
  cap keeps an earlier goodwill refund from eating the share of a later full
  refund.
  Whether the order stays `delivered` (normal release) or closes because the
  cash refund reached T (residual release), the non-faulty seller is paid
  `amount − refundedAmount`.
- **Mixed faults (D20)**: once ANY finalized refund of the order is seller
  fault (`sellerShareForfeited`, v1 and v2), the seller's own shipping share
  stays with the platform, whatever the fault of the line-completing refund:
  the v2 calculation emits no `seller_refund` share (and, on a buyer-fault
  refund, no `buyer_charge` of it either: the seller already paid it from the
  hold) and `processRefund` retains nothing, counting the request's own fault
  too (also for a request finalized before the rule). For requests computed
  under D20, neither release path sees a share, whether the order stays
  `delivered` or closes. One exception for requests decided under the old
  rule: when the request's own components charge the buyer the share (its
  cash already reduced by it), the hold keeps what the buyer was charged (at
  most the share) for the seller, so it is collected once. That kept share
  goes out on the normal release; on an order that later closes, the residual
  rule would block it (`seller_at_fault`), so it must not be settled to the
  platform (see OPERATIONS.md).
- **Unknown fault (D20)**: a residual on a closed order without a finalized
  refund that names the fault (none at all, or only a `legacy` request
  without a fault party: `isNamedSellerFaultRefund`) is decided by a person. The release cron never pays it and the batch
  script never settles it (listed as `manual_decision`); only the per-hold
  endpoint below settles it.
- **Birikmiş kalıntılar**: `PaymentHoldResidualService` PSP'ye gitmeden
  platforma **kapatır** — tek işlemde hold `cancelled` +
  `refundedAmount = amount` (CAS: tutuluyor, kilitsiz, okunan `refundedAmount`
  değişmemiş) ve dengeli `adjustment` defter grubu (`seller_escrow` alacak →
  `platform_commission` borç, anahtar `hold-residual-settle:<holdId>`, memo
  hold/sipariş numarasını taşır). Uygunluk tek yüklemde:
  `holdResidualSettleable` (kapanmış sipariş + kalıntı > 0,01 + bırakmayı
  engelleyen tek neden `seller_at_fault`; kusur belirlenemeyen kalıntı da
  dahil). Yüzeyler: `POST /admin/payouts/holds/:id/settle-residual`
  (super_admin/admin, `payouts` izni, sebep zorunlu, denetim kaydı aynı
  işlemde; uygun değilse 409) ve bakım script'i
  `settle-seller-fault-residuals` (bkz. OPERATIONS.md). Hold listesi satırı
  `residualAmount` ve `residualSettleable` taşır; `seller_at_fault` rozeti
  ("Satıcı kusurlu — ödenmez") doğru kalır ama durum **geçicidir**.

---

## 6. Payout

`modules/payout/payout.service.ts`; scheduler: `payout-process` every 15 min,
`payout-check-returned` daily at 06:00. Kill switch: `PAYOUTS_DISABLED=true`.

1. **Creation**: for every `released`, unfrozen hold without a blocking
   refund, a transfer with a `PYT…` reference (no hyphen: PayTR `trans_id`
   rule, see docs/CODE_SCHEME.md); `netPayout = hold − refunded`.
2. **Seller debt offset**: open `sellerAccountAdjustment` rows are
   allocated FIFO (`FOR UPDATE`), `netAmount = max(0, net − Σallocations)`;
   balanced ledger group `seller_debt_recovery / seller_escrow`.
3. **Processing checks**: eligibility and refunds are checked again;
   **stale-net guard** (only lowers; `fully_refunded` → failed); the IBAN is
   read from the current `SellerBankAccount` every time (never the
   snapshot); `isValidTrIban` (mod-97) failures → failed; **3-day IBAN change
   cooldown** → stays pending; **same-day guard** (PayTR refuses an
   instruction on the payment day; `paidAt` today in the Turkish calendar →
   stays pending, the retry counter does not move); legacy hyphenated
   `PYT-…` trans ids are regenerated without the hyphen; atomic
   `pending → processing` claim plus a TOCTOU re-read after the claim.
4. **Transfer total (`total_amount`)**: the slice of the payment
   (`merchant_oid`) this transfer settles. PayTR rejects a total above what
   the oid has left (`err_no 010`); a cart payment pays several sellers from
   one oid and refunds lower its balance. Computed on every attempt in
   `payout/helpers/transfer-total.ts`, one formula for order and trade-cash
   payouts, in kuruş:
   `allowed = min(source total − cash refunded on it, payment − all refunds
on the payment − totals the other transfers on the oid took)`.
   - Refunds: `RefundAttempt`s that are not `failed` (one in flight reserves
     its room), or `Payment.metadata.refundedOrders` when larger (refunds
     before 2026-07-28 exist only there).
   - Other transfers count when `processing`, `completed`, `returned` (PayTR
     returns a bounced transfer to the merchant balance, not to the oid) or
     `failed / transfer_outcome_unknown`, by `submittedTotalAmount`; rows
     sent before 2026-10-23 count `amount` (what they sent), a zero net
     counts 0. The total is stamped on `submittedTotalAmount` in the claim.
   - The net (`submerchant_amount`) is never changed by this. If it does
     not fit (including nothing left, e.g. a residual after a full refund)
     PayTR is not called: `failed / transfer_needs_manual_decision`, inputs
     in `providerResponse.transferTotal`, error log, no seller e-mail. The
     platform pays such a payout from its own bank account and records it
     in admin (decision of 2026-10-23); a non-faulty seller is paid as §5
     says. A payout without a payment fails closed the same way.
5. **Outcomes and retries**: `failureReason` is a code
   (`PAYOUT_FAILURE_REASONS` in `@tarodan/types`); PayTR's answer or the
   network cause goes to `providerResponse` and the log, never to the
   seller.

   | Outcome                                                                                                                                                                                                           | Action                                                                                                                                                         |
   | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | PayTR `err_no 010`                                                                                                                                                                                                | `retry_pending` (60 min, then 4 h) with a recomputed total, 3 attempts, then `transfer_total_exceeds_remaining`                                                |
   | Other PayTR rejection                                                                                                                                                                                             | `failed` at once: `bank_details_rejected` when `err_msg` says the IBAN or holder name is wrong (a detail word next to a defect word), else `provider_rejected` |
   | Request not sent (connect phase: `UND_ERR_CONNECT_TIMEOUT`, `ECONNREFUSED`, `ENOTFOUND`, `EAI_AGAIN`, `ENETUNREACH`, `EHOSTUNREACH`, a connect syscall error; HTTP 4xx other than 408/409 without a PayTR answer) | `retry_pending`, same `trans_id`, 3 attempts, then `provider_unreachable`                                                                                      |
   | Outcome unknown (reset or timeout after sending, our 20 s timeout, HTTP 5xx, 408 or 409, unreadable answer)                                                                                                       | `failed / transfer_outcome_unknown` at once, never resent by a cron; total and net stay on the row                                                             |

   Final failures log at `error` with the payout id, `trans_id` and cause
   code (Sentry). The classifier is `classifyPaytrFetchError`
   (`payment-providers/paytr/paytr-fetch-retry.util.ts`); the read-path retry
   in that file is not for money writes. Only the PayTR call itself is
   treated as the transfer: an error in the bookkeeping after PayTR
   accepted is logged at `error`, leaves the row `processing` (zombie
   alarm) and is never retried; the run goes on with the next payout. A
   failure while building the request (credentials, signing, endpoint)
   is a configuration problem: the claim is released and the run stops,
   so no payout burns its retries. Saving the bank account puts the
   seller's `failed / no_bank_account` rows back to `pending`, and also
   `invalid_iban_format` and `bank_details_rejected` when the IBAN or
   holder name changed. Admin retry puts a `failed` row back to
   `pending` (same `trans_id`; `returned` gets a new one) and the processor
   recomputes net and total (see 9).

6. **Submitted / processed**: PayTR `success` only means the _instruction
   was accepted_. With `PAYTR_TRANSFER_CALLBACK_ENABLED=true` the payout stays
   `processing` with `submittedAt` (**submitted**); it completes only in the
   callback. With the flag off (default) the synchronous acceptance counts
   as `completed`. Both paths meet in `applyPayoutCompletionEffects()`
   (seller e-mail, ledger settle).
7. **Callback**: `POST /payouts/callback/paytr-transfer` (public, hash
   verified, must answer a plain `"OK"`). It completes `processing` rows and
   also `failed / transfer_outcome_unknown` rows (PayTR confirms a transfer
   we did not hear back about), and `pending` / `retry_pending` rows (an
   admin retried an unknown outcome before this late result came; the
   money moved, so it is settled instead of sent again, error log), each
   once by CAS. Other rows are never revived; a callback for one logs an
   error (check the PayTR panel before paying it any other way), and so does
   a callback for a row an admin paid from the bank (`external_bank`):
   possible double payment. A row without a send snapshot (unknown outcome, or
   bookkeeping failed after acceptance) gets the send time and net
   stamped, so a later bank return still matches. A callback later than 3 days raises an alarm. Daily
   returned-transfer scan plus a 30-minute stuck-`processing` check.
   **Returned transfer matching**: PayTR's list carries its own `ref_no`,
   not our `trans_id`; the instruction answer's `reference` is stored in
   `PayoutTransfer.providerReference` and matching uses it (the migration
   filled old rows from `provider_response->>'reference'`; old rows without
   a reference fall back to IBAN + amount + date; ambiguous rows are left
   alone and logged). PayTR repeats the same row every day of the window: a
   row whose payout is no longer completed/processing counts as handled and
   never falls back to the heuristic. A resend (admin retry, requeue) clears
   the reference; `providerResponse` stays until the next send and the admin
   retry's audit record keeps the previous reference and answer.
8. **Seller e-mails**: `payout-failed-seller` only for the seller-fixable
   codes `no_bank_account`, `invalid_iban_format` and `bank_details_rejected`,
   with the mapped text of `payout/helpers/payout-failure-reasons.ts`
   (masked IBAN last 4); never PayTR's text or an oid. Platform-side reasons
   send nothing; the team resolves them. `payout-returned-seller` goes out
   when the bank returns a transfer.
9. **Manual resolution (admin → Finance → Payouts → Transfers)**, in the
   payout domain (`payout/resolution/payout-resolution.service.ts`); one
   policy (`payout/helpers/payout-resolution-policy.ts`) drives the API
   guards and the list row's `resolution` flags. Every write is a CAS on the
   row as read (status, reason, `updatedAt`), with the required audit record
   in the same transaction (`payout_retry`, `payout_mark_paid`).
   - **Retry** (`POST /admin/payouts/:transferId/retry`, super_admin/admin
     with the `payouts` permission): `failed` or `returned` → `pending`,
     retry counter and reference cleared (an earlier manual settlement too);
     net and total are never set here. `submittedTotalAmount` and
     `submittedAmount` stay: a pending row is not counted against the oid,
     the next claim overwrites them, and a late callback settles with them.
     A row PayTR may have taken needs `confirmProviderChecked: true` and a
     reason (the PayTR panel shows no transfer with that `trans_id`), else
     409: `transfer_outcome_unknown`, and rows from before the reason codes
     with a free-text reason after more than one attempt (the old handler
     resent the same `trans_id` and kept only the last attempt's reason and
     answer, so an earlier attempt may have reached PayTR) or after one
     attempt without a stored PayTR answer (a thrown error, e.g. "Bad
     Request Exception"). One attempt answered by PayTR (`status: "error"`)
     is a rejection, and a free-text row without an attempt failed before
     sending; neither needs the check. A checked retry of a legacy row
     records the net it may have sent (`submittedAmount`), so the row keeps
     saying an earlier send is unconfirmed (a net without `submittedAt`)
     until PayTR accepts a later attempt.
   - **Mark as paid** (`POST /admin/payouts/transfers/:id/mark-paid`,
     super_admin/admin with the `payouts` permission; body `method`,
     `reference`, `reason`, `expectedNetAmount`). One method fits a row:
     - `paytr_confirmed` for a row PayTR may have taken (as above) when the
       panel shows it arrived. Net = `submittedAmount ?? netAmount`. Stamps
       like the callback: `submittedAt` = the failure time, total kept.
     - `external_bank` for `transfer_needs_manual_decision` (not a missing
       payment or source: that is a data problem, fix and retry) and
       `transfer_total_exceeds_remaining`, after finance paid the net from the
       company account (decision of 2026-10-23). The processor's guards run
       again inside the transaction, under the payment and then the order
       row lock (refund attempts and refund requests take them) on the row
       read after the locks: order payable, no refund in flight, the hold
       still entitles the seller to the net; for trade cash, the cash payment
       completed, released, not refunded and not below the net. Else 409 and
       a retry recomputes. `submittedTotalAmount
= 0` (siblings on the oid do not count it), `submittedAt` and
       `submittedAmount` null (no PayTR transfer for the PSP comparison or
       the returned-transfer scan, which never matches a row without a send
       time).
     - `expectedNetAmount` must equal the net to the kuruş (409 otherwise),
       so a stale screen never books a different amount.
     - `external_bank` on a row whose earlier send PayTR never confirmed
       (`resolution.markPaidRequiresProviderCheck`) also needs
       `confirmProviderChecked: true`: the panel shows no transfer with its
       `trans_id` (409 `markPaidProviderCheckRequired` otherwise).
     - Ledger, in the same transaction: `external_bank` first funds what the
       escrow no longer holds, `F = max(0, net − max(0, seller_escrow))` per
       order (per trade and recipient for trade cash): `adjustment`
       `seller_escrow` debit / `platform_commission` credit, key
       `payout-platform-funding:<payoutId>`. Then both methods book
       `payout_completed` (`seller_escrow` credit / `payout` debit, net, key
       `payout-completed:<payoutId>`, metadata method and reference). If
       that key already exists (a transfer the bank returned, then retried)
       nothing is booked again. The order's escrow ends at 0.
     - The row keeps `providerResponse.manualSettlement` (method, reference,
       admin, time, net, funded amount). The seller gets the normal "payout
       released" e-mail after commit. A repeated request returns the first
       result (`alreadySettled: true`) and writes nothing; a row a callback
       or retry moved first gives 409.
   - Runbook: OPERATIONS.md, "Payout transfers needing a decision".

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
verilmeden maliyet gerçek değildir → iki taraf da bütünlenir; **satıcı
kusurunda (`delivery_delayed`) satıcı payı tazmin edilmez** — alıcı yine T'nin
tamamını alır, hold tamamen tüketilir (bkz. §5 Kalıntı). Verildikten sonra
maliyet kusurlu tarafa gider: `delivery_delayed`'de gidiş satıcıya yansır;
cayma nedenlerinde alıcının kargo payı iade edilmez ve koruma bedeli hep kalır.

**Platform (admin) iptali** — `POST /admin/orders/:id/cancel`
(`AdminOrderCancelService`), sipariş (sepet kalemi) başına; sepet siparişi,
teklif siparişi ve grup ödemesi için TEK uç. Yeni para yolu yoktur: iptalin
türü mevcut bir çekirdeği seçer, admin yolu yalnız aktörü (`platform`), nedeni,
denetimi ve duyuruyu ekler. Uygunluk kuralı `@tarodan/types`
`adminOrderCancelEligibility`'dir (kargo öncesi kuralın — `preShipmentCancelBlocker`
— üstüne kurulu; API önizleme, iptal ve kilit altı yeniden değerlendirme, panel
dosya düğmesi, satır menüsü ve teklif ekranı aynısını okur).

| Sipariş durumu                                                 | İzin                                       | Çekirdek                                                                                                                 | Para / stok                                                                                                                                                                     | Taraflar ne alır                                                                                                                             |
| -------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `pending_payment` (sepet ya da teklif)                         | ✔ tür `unpaid`                             | `OrderLifecycleService.cancelUnpaidOrderInTx` (alıcı iptaliyle aynı; `ledgerReason: admin_cancelled` → aktör `platform`) | para hareketi yok; stok rezervasyonu (tutuluyorsa — teklif siparişi rezervi ilk ödeme başlatmada alır) + kupon rezervasyonu serbest; bağlı teklif yönetici gerekçesiyle kapanır | alıcı + satıcı: birer zil (+push) + birer e-posta, "Tarodan iptal etti", neden etiketi, "ödeme alınmamıştı"                                  |
| `paid` / `preparing`, koli taşıyıcıya geçmemiş (sepet/teklif)  | ✔ tür `paid_pre_handover`                  | `RefundService.createPlatformCancellationRefund` → `executePreShipmentCancellation` (alıcı iptaliyle aynı para yolu)     | tam iade (platform kusuru, aşağıda); stok geri; kupon hakkı döner; defter/fatura düzeltmesi/kargo iptali processRefund'da                                                       | alıcı + satıcı: birer zil + birer e-posta, neden etiketi, alıcıya iade tutarı + "bankanızın olağan iade süresi"; satıcıya "kargoya vermeyin" |
| kargoya verildi / yolda (`shipped`, hareket ya da `shippedAt`) | ✘ `handed_over`                            | —                                                                                                                        | —                                                                                                                                                                               | iade talebi akışı                                                                                                                            |
| `delivered` / `awaiting_buyer_confirmation`                    | ✘ `delivered`                              | —                                                                                                                        | —                                                                                                                                                                               | iade talebi akışı                                                                                                                            |
| `completed` (satıcı ödemesi yapıldı/yapılacak)                 | ✘ `completed`                              | —                                                                                                                        | —                                                                                                                                                                               | —                                                                                                                                            |
| açık iade talebi (`refund_requested` ya da aktif talep)        | ✘ `active_refund` / `pending_cancellation` | —                                                                                                                        | —                                                                                                                                                                               | talebin kendi onay/ret/kapat aksiyonları; yarıda kalmış iptal İade Talepleri'nde tamamlanır                                                  |
| `cancelled` / `refunded`                                       | ✘ `closed`                                 | —                                                                                                                        | —                                                                                                                                                                               | —                                                                                                                                            |

Admin tarafından başlatılan **iade** (kargodan sonra) yoktur; toplu iptal yoktur.

- **Neden zorunlu**: `AdminCancelRequest` — paylaşılan katalogdan kod
  (`ADMIN_CANCEL_REASON_CODES`) + iç not ("Diğer"de zorunlu; kural
  `adminCancelRequestProblem`). Taraflara yalnız kodun etiketi söylenir
  (`Order.cancelReason` / `Offer.cancelReason` / iade talebi açıklaması =
  "Yönetici tarafından iptal edildi: <etiket>"); not yalnız denetim kaydındadır,
  hiçbir taraf-yüzlü alana (bildirim, e-posta, talep, iade geçmişi) girmez.
  Kod `Order.adminCancelReasonCode`'a YALNIZ iptal tamamlanınca yazılır:
  ödenmemişte iptalle aynı yazımda; ödenmişte kod iade talebinin
  `metadata.adminCancelReasonCode`'unda taşınır ve iadeyi kim kesinleştirirse
  (eşzamanlı başarı, İade Talepleri'nde admin onayı, takılı deneme
  kurtarması) `processRefund` siparişi KAPATTIĞI işlemde yazar
  (`ProcessRefundOptions.adminCancelReasonCode`). PSP hatasında yazılmaz.
  İptal & İade ekranı nedeni oradan gösterir ve "Yönetici iptali" süzgeci
  onunla — platform aktörüyle birlikte — süzer.
- **Önizleme → onay**: `GET …/cancel-preview` türü ve sonucu döner (iade tutarı
  ya da "ödeme yok", serbest kalan/geri eklenen adet). Onay `expectedKind`
  taşır; sipariş arada ödendiyse (ön okumada ya da kilit altında) iptal 409
  `cancelKindChanged` ile durur — "para yok"tan "iade"ye sessiz geçiş yoktur,
  panel önizlemeyi tazeler. Ödenmemiş siparişte canlı bir 3DS çekimi varsa
  (`paymentFailTimeoutMinutes` penceresi) çekirdek 409
  `server.order.cancelPaymentInFlight` döner (alıcı iptaliyle aynı kontrol).
- **Yarışlar**: ödenmemiş yol sipariş satırını `FOR UPDATE` ile kilitler ve
  yeniden değerlendirir (alıcı iptali / 24s süpürmesi → `closed`, callback →
  tür değişti); çekirdeğin `version` koşullu yazımı ikinci kapıdır. Ödenmiş yol
  çekirdeğin satır kilidi + kilit altı devir kontrolü + aktif-talep tekil
  indeksi + talep-bazlı idempotency anahtarına dayanır (satıcı az önce
  kargoladıysa / ikinci gönderim → hata, ikinci iade yok).
- **Denetim (zorunlu)**: `order_cancel` (aktör, hedef, tür, önce/sonra, kod,
  not, taraflar; ödenmişte iade talebi id/no/tutar). Ödenmemiş yolda kayıt
  iptalle AYNI işlemdedir (yazılamazsa iptal geri alınır). Ödenmiş yolda PSP
  çağrısı tek işleme sığmaz: para yoluna girmeden ÖNCE zorunlu
  `order_cancel_requested` niyet kaydı yazılır (yazılamazsa çekirdek hiç
  çağrılmaz); para çıktıktan sonra tamamlanma kaydı yazılamazsa iptal geri
  alınamaz — hata loglanır, iz niyet kaydı + iade talebinde (`decidedBy` =
  admin) kalır. Engellenen ya da PSP'de düşen deneme `order_cancel_failed`
  olarak (best-effort) kaydedilir.
- **Duyuru**: iki tarafa TEK platform duyurusu
  (`NotificationService.notifyOrderCancelledByPlatform`; tipler
  `order_cancelled_by_platform` / `…_seller`, e-postalar
  `order-cancelled-by-platform-buyer` / `…-seller`). Çekirdekler bu iptalde
  kendi genel iptal duyurularını göndermez (platform spec'i
  `notifyParties: []`); misafir alıcıya zil gönderilmez (ortak sistem hesabı),
  e-posta `orderBuyerContact` ile gerçek adrese gider. Kupon iadesi olduğunda
  ayrıca "kuponunuz geri verildi" (`COUPON_RETURNED`) gider — iptal duyurusu
  değil, ayrı bir olgudur. İptal anında PSP düştüyse duyuru O AN gitmez;
  iptal sonradan tamamlanınca aynı platform duyurusu (genel iptal/iade metni
  yerine) tamamlayan yoldan bir kez gider: admin onayında
  `RefundDecisionService`, kurtarmada `processRefund`. Her gönderen yol
  duyuruyu `processRefund`'ın döndürdüğü `closedWithAdminReason`'a bağlar —
  yalnız siparişi BU çağrının iadesi platform iptali olarak kapattıysa dolu
  olur. Sipariş arada başka yoldan iptal edildiyse ya da aynı denemeyi başka
  bir çağrı (ör. kurtarma cron'u, eşzamanlı yönetici iptali) sonlandırıp
  duyuruyu gönderdiyse null'dır ve bu yol sessiz kalır; taraf başına tek
  mesaj.
- **Teklif**: siparişi OLMAYAN teklifin iptali `POST /admin/offers/:id/cancel`
  ile kalır; canlı siparişi olan teklif o uçta 409 `useOrderCancel` döner ve
  panel sipariş iptal diyaloğunu açar.

Ödenmiş türün para kuralı: spec (`helpers/pre-shipment-cancellation.ts`)
kusuru platforma yazar (v2 `faultParty: "platform"`, v1
`resolvePlatformCancellationPolicy`) → alıcı ürün + alıcı komisyonu/hizmet
bedeli + (paketin son canlı kalemiyse) gidiş kargosunu geri alır, kupon hakkı
döner; satıcı kesintileri terslenir. Talep alıcı adına açılır, kararı admin
verir. Önizleme aynı hesabı koşar. İptal aktörü (`Order.cancelledBy`) spec'in
`initiator`'ıdır (alıcı / platform) ve talebin `metadata.cancellationActor`'ına
yazılır; talep sonradan admin onayı ya da takılı deneme kurtarmasıyla iade
edilirse aktör oradan okunur (`refundRequestCancelActor`). Alıcı iptalinde
duyuru yalnız satıcıya gider ("kargoya vermeyin"). Kargo öncesi siparişte açık
kalmış bir talep yarıda kalmış iptaldir (PSP hatası): yeniden iptal 409 döner
ve İade Talepleri'ne yönlendirir.

**Grup ödemesinde iade tavanı** (`payment/helpers/group-refund-limit.ts`,
processRefund'da tek hesap): sepette kolinin alıcı kargo payı yalnız satıcının
ilk satırına yazılır, v2 ise kargoyu paketin SON canlı kalemini kapatan
iadede bir kez iade eder — bu kalem kargoyu taşımayan bir kardeş olabilir.
Tavan = min(sipariş tutarı + kapanan koli kargosu, ödemede kalan iade
edilebilir). Kapanan koli kargosu yalnız paketteki diğer bütün kalemler
iptal/iade edilmişse doğar; miktarı kardeş satırlarda tahsil edilip o satırla
iade EDİLMEMİŞ kargo payıdır (brüt), kardeşlerde kendi payını aşan iade kadar
düşülür (kargo iki kez iade edilemez). Örnek: A = 1000 + 130 kargo = 1130,
B = 500, ödeme 1630. A, B giderken iptal → 1000 iade (kargo tutulur). B son
kalem → 500 + 130 = 630 iade; eski tavan (500) bunu reddedip talebi incelemeye
düşürüyordu. Varsayılan tutar ve "tam iade" anahtarı sipariş tutarına bakmaya
devam eder.

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

### Boost refund and stop (admin)

A boost (`BST-` order, `origin = platform_service`, the platform seller sells
the virtual `boost-<id>` product) is refunded only from the admin Boost
purchases screen: `POST /admin/ad-packages/purchases/:id/refund
{ amount?, reason }` (`super_admin`, `admin`; the `ads` **and** `payments`
permissions, `@RequireAllPermissions`). Every other refund path refuses an
order that carries a boost, before any money moves (decision D16):

- admin, `400 server.admin.payment.boostRefundUseBoostScreen`: the manual
  refund (`POST /admin/payments/:id/manual-refund`), the order cancel and its
  preview (`POST /admin/orders/:id/cancel`, `GET .../cancel-preview`; an
  unpaid boost order still cancels, no money moves, and a closed one keeps
  `cancelAlreadyClosed`), and approving or force-finalizing a refund request
  (`POST /admin/refund-requests/:id/approve`, `.../force-finalize`). One
  gate, `assertNotBoostOrderRefund`: a boost order (`virtualOrderKind`, so an
  ordinary order costs no query) that still has its boost row
  (`ProductBoost.orderId`). A boost order paid without its boost row has
  nothing to stop and the boost screen cannot see it, so these paths still
  settle it.
- buyer: a refund request on any platform service order (`virtualOrderKind`)
  answers `400 server.refund.orderStatusNotEligible` for a boost
  (`membershipOrderNotEligible` for a membership). An order cancel is refused
  as for any completed order (`server.order.cannotCancelShipped`), and one
  still in a paid status (a boost order without its boost row) with
  `400 server.refund.cancelPaidPreShipmentOnly`.
- system paths still refund a boost order and stop its boost in the same
  transaction: the auto-refund of a late payment on a cancelled order and the
  stuck-refund recovery cron.

- **Refundable**: a paid (`source = purchase`) boost that is `active` or
  `paused` with a `completed` payment; not an ended boost (decision D2). The
  maximum is `boostRefundableAmount` (`admin/finance/boost/`): the price minus
  `refundedAmount`, never above what the payment still holds. The admin may
  enter less (D1); empty means the maximum.
- **Order of operations**: `processRefund` runs as for any order (the attempt
  is written before PayTR, the refund goes to the store the boost was paid on,
  the payment and the order record it, a full refund cancels the order with
  `cancelledBy = platform`). Its finalize transaction also stops the boost
  (`BoostTimelineService.stopForRefund`): status `cancelled`, the amount added
  to `refundedAmount`, the admin and reason written, the boost's unused time
  taken off the listing and the boosts queued behind it moved up. If PayTR
  refuses or the outcome is uncertain, the boost is unchanged. Whichever path
  finalizes the attempt (the admin call, a retry, the stuck-refund recovery
  cron) stops the boost with the money.
- **No ledger lines**: a virtual order never had a capture group, so the
  refund writes no `refund_issued` group, no hold change, no seller debt and no
  stock on the virtual product (this holds for membership orders too).
- **Invoice**: the boost e-Arşiv is reversed through the outbox like any order
  refund (`OUTBOX_INVOICE_REFUND_REVERSE`): cancelled within 8 days for a full,
  unadjusted refund, otherwise a RETURN invoice per attempt in the refund's
  ratio.
- **Never twice**: every try gets a fresh attempt key
  (`boost-refund:<boostId>:<n>`, `n` = the boost's earlier attempts), so a try
  PayTR refused can be repeated with another amount. The attempt claim refuses
  a new attempt while an earlier one is unresolved, and the claim guard
  (`claimGuard`, under the payment lock) refuses a boost that a finished
  refund stopped meanwhile. A retry after a finished refund answers with the
  stopped boost.
- **Notices**: `processRefund` itself sends no order refund or cancel notice,
  no staff "order cancelled" mail and no shipment cancel for a boost order,
  whichever path finalizes it (the platform's own services never ship).
- **Audit and notice**: one `boost_refund` audit row with the real outcome
  (`refunded`, `failed`, `pending_reconciliation` when this call's own
  attempt, its key, may be moving money, also when the stuck-refund recovery
  took it over; `in_flight_elsewhere` when the attempt claim turned it away
  before anything was sent because another attempt of the order, another
  key, is unresolved: `RefundAttemptInFlightException`, still a 503
  `RefundPendingReconciliationException` for the admin); `refunded` is
  written only when that call refunded; a failed audit write after the
  money went back is reported
  (`BOOST_REFUND_AUDIT_MISSING`, Sentry) and not turned into an error. The
  seller gets `BOOST_REFUNDED` through the outbox. Sentry: tag `flow=boost`,
  boost id and order number.
- **One refund per boost**: the refund stops the boost, and a stopped boost
  is not refundable again, so a partial refund leaves the rest of the payment
  with no admin path (open product decision).

A free grant (`source = admin_grant`, `POST /admin/ad-packages/purchases/grant`)
has no order, payment or invoice and is not revenue (D3); it is stopped
without money by `POST /admin/ad-packages/purchases/:id/revoke`. Boost
revenue, counts and uplift in analytics read bought boosts only
(`admin/analytics/sold-boost.predicate.ts`).

### Boost end, reminder and the seller's view

No money moves here; these rules only read and announce the boost timeline
(`BoostTimelineService`, product domain).

- **End of a boost** (`expire-boosts` cron, every 15 minutes, one
  transaction per listing under its lock, `BoostExpiryService`): the ended
  `active` boosts become `expired` with the listing's final counters, the
  listing's promotion is rebuilt, and `BOOST_EXPIRED` goes out **once per
  listing**, when no running boost of it ends later and none waits paused
  (stacked boosts used to send one per boost). The notice is an outbox row
  (`boost.notice`, kind `expired`, keyed by the boost that ended last)
  written with the change.
- **Ending-soon reminder** (premium only, decision D7; a reminder, never an
  automatic charge): the switch is the listing's (on while any running or
  paused boost of it has `autoRenew`). When the listing's last running boost
  (its "tail") ends within `BOOST_REMINDER_LEAD_HOURS` (24), the
  cron claims it with a compare-and-set on `reminderSentAt` and queues
  `BOOST_ENDING_SOON` (outbox kind `ending_soon`, keyed by the stamp). It is
  due again only when that end moves past the window the reminder announced
  (a stacked purchase is a new tail; a staff extension or a resume moves the
  end). A seller who is no longer premium gets none; the handler drops a
  late reminder that no longer holds (the boost stopped, is no longer the
  tail, or its end moved past the lead time).
- **My boosts** (`GET /products/boost/my?state=current|history`, web only,
  ADR 0015): the caller's `active` and `paused` boosts, or the `expired` and
  `cancelled` ones, in the `{ data, meta }` envelope, with the order number,
  source, refunded amount and the listing's real end (`boostedUntil`).
  `pending` and `failed` rows (abandoned checkouts) are never shown. There is
  no seller cancel. `PATCH /products/:id/boost/reminder` sets `autoRenew` on
  the owner's running and paused boosts of the listing; turning it on needs
  premium (`server.product.boostReminderPremiumOnly`).
- **New-listing offer** (`GET /products/boost/offers`,
  `POST /products/boost/offers/dismiss`): computed, never stored, for the
  seller's live listings created after `boost_offer_since` and in the last 30
  days, never boosted (`pending`/`failed` do not count), not dismissed, with a
  package tier for the price (`boostTierBasePrice`) and the seller's
  audience; at most 20, newest first. Only dismissals are stored
  (`boost_offer_dismissals`, own listings only, idempotent).

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
v1 satırı `trade_commission` (KDV hariç matrah). **Kargo payı da ayrı bir belge
alır** (`trade_shipping`, o da KDV dahil): takas toplamının üstüne KDV
EKLENMEDİĞİ için tahsil edilen tutar KDV dahildir. Ayrı belge olmasının nedeni
iade yollarının AYRIŞMASIdır — bedel hiçbir iptalde iade edilmez, kargo
kargolanmamış iptalde iade edilir.

**Belgelerin ters kaydı** iade tx'iyle atomik olarak kuyruğa alınır
(`invoice.trade_cash_refund_reverse`) ve hangi belgenin terslendiğine
`InvoiceReversalService.tradeReversalKeys` karar verir; kural yine
`trade-refund-policy.ts`'tir: hizmet bedeli yalnız KUSURSUZ tarafın tam
iadesinde (`fullRefundEntitled`), kargo ise koli yola çıkmadıysa terslenir.
Eskiden ters kayıt hiç kuyruğa alınmıyordu ("iade edilen kısım faturalanan
hizmet bedeli değil" gerekçesiyle); kargo faturalanınca bu gerekçe geçersiz
kaldı.

**v1 takaslar** eski kuralla biter: ayrım tek yerde, `Trade.pricingVersion`
alanındadır.

### Admin (platform) takas iptali

Admin → Takas dosyası → "Takası iptal et" (`GET /admin/trades/:id/cancel-preview`,
`POST /admin/trades/:id/cancel`, gövde `AdminCancelRequest`). **Yalnız
super_admin**, toplu iptal yok. Yeni bir para ya da kargo yolu YOKTUR: iptal,
süre dolumu taramasının kargo öncesi çekirdeğiyle yapılır
(`trade/helpers/trade-pre-shipment-cancel.ts` →
`cancelPreShipmentTradeInTx` + `settlePreShipmentCancellation`); değişen yalnız
aktör (`CancellationActor.platform`), gerekçe, kusur ataması, denetim ve
duyurudur. Uygunluk kuralı `@tarodan/types` → `adminTradeCancelBlocker`
(API ve panel aynı kuralı okur; API onu satır kilidi altında yeniden çalıştırır).

| Aşama                                                    | İzin?                            | Çekirdek         | İade                                                                                           | Rezervasyon / kargo                                                                          | Duyuru                      |
| -------------------------------------------------------- | -------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------- |
| `pending`                                                | evet                             | tarama çekirdeği | yok (para alınmadı)                                                                            | rezervasyon yok                                                                              | iki tarafa in-app + e-posta |
| `accepted` (legacy)                                      | evet                             | tarama çekirdeği | yok                                                                                            | rezervasyon çözülür                                                                          | iki tarafa in-app + e-posta |
| `awaiting_payment`                                       | evet                             | tarama çekirdeği | ödemiş taraf **tam** iade (taramanın ödeme-süresi sonucuyla aynı); ödememiş tarafın iadesi yok | rezervasyon çözülür                                                                          | iki tarafa; ödeyene tutar   |
| `shipping_to_warehouse`, hiçbir koli taşıyıcıya geçmemiş | evet                             | tarama çekirdeği | iki taraf da **tam** iade (hizmet bedeli + kargo dahil)                                        | rezervasyon çözülür; basılmış ama devredilmemiş etiketler Sürat iptal göreviyle iptal edilir | iki tarafa; ödeyene tutar   |
| `shipping_to_warehouse`, bir koli yolda / depoda         | **hayır** (`parcel_handed_over`) | —                | —                                                                                              | force-cancel-stuck / kayıp koli akışı                                                        | —                           |
| `at_warehouse`, `admin_reviewing`                        | hayır (`at_warehouse`)           | —                | —                                                                                              | depo reddi (`reject`)                                                                        | —                           |
| `shipping_to_recipients`                                 | hayır                            | —                | —                                                                                              | itiraz akışı                                                                                 | —                           |
| `returning`                                              | hayır                            | —                | —                                                                                              | `mark-return-delivered` / `mark-return-lost`                                                 | —                           |
| `disputed`                                               | hayır                            | —                | —                                                                                              | `resolve-dispute`                                                                            | —                           |
| legacy `*_shipped` / `*_received`                        | hayır (`legacy_shipped`)         | —                | —                                                                                              | —                                                                                            | —                           |
| `completed`, `cancelled`, `rejected`                     | hayır (`closed`, 409)            | —                | —                                                                                              | —                                                                                            | —                           |

- **"Kargoya verildi" tanımı** takasın diğer iptal kapılarıyla aynıdır: bir
  `to_warehouse` bacağının devri (`isShipmentHandedToCarrier`: hareket eden
  durum ya da `shippedAt`), bacağın teslim damgası veya takasın
  `firstWarehouseArrivalAt` / `cancelLockedAt` damgası. `pending` /
  `label_created` etiket devir sayılmaz.
- **Neden taramanın çekirdeği, kullanıcı iptali değil:** kullanıcı iptali
  vazgeçen tarafı kusurlu sayar (hizmet bedelini kaybeder) ve aktörü bir
  taraftan türetir. Tarama çekirdeği aktörü ve kusuru dışarıdan alır.
- **Kusursuzluk:** platform iptali kimsenin kusuru değildir → çekirdek
  `faultless: "all"` ile takasın HER ödeme satırına `fullRefundEntitled` yazar
  (iade politikasının mevcut bayrağı; kayıp koli çözümünün kararıyla aynı).
  Tutar yine `tradePaymentRefundableAmountFor`'dan gelir; önizleme, denetim
  kaydı ve iade aynı fonksiyonu çağırır. Takas e-belgeleri (`trade_service_fee`,
  `trade_shipping`) depoya varışta kesildiği için bu aşamalarda terslenecek
  belge yoktur; iade yolu ters kayıt sinyalini yine her zamanki gibi kuyruğa
  alır.
- **Gerekçe:** katalog kodu `Trade.adminCancelReasonCode`'a yazılır (admin
  listesi bununla gösterir/filtreler); `Trade.cancelReason` taraflara görünen
  metindir ("Tarodan tarafından iptal edildi: <etiket>"). Adminin iç notu YALNIZ
  denetim kaydındadır.
- **Denetim:** `trade_admin_cancel` zorunlu ve iptalle aynı tx'te (yazılamazsa
  iptal, rezervasyon çözümü, commit sonrası iş ve duyurular geri alınır).
  Reddedilen denemeler `trade_admin_cancel_failed`.
- **Commit sonrası iş dayanıklıdır:** iade harici sağlayıcı çağrısıdır,
  iptalle atomik olamaz. Bu yüzden iade + önbellek + etiket iptali iptalle
  aynı tx'te `trade.cancel_settle` outbox satırı olarak yazılır ve commit
  sonrası anlık yoldan (`OutboxService.runInline`: drainer'ın CAS'ıyla satırın
  sahibi olur) hemen çalışır. Süreç commit ile anlık yol arasında ölürse satır
  pending kalır ve drainer tamamlar; admin aynı iptali yeniden gönderirse de
  bekleyen iş o istekte tamamlanır (iş sahipliği tek: ikisi aynı anda
  çalışmaz; iade ödeme başına idempotent). Sağlayıcı hatasında takasa
  `refundFailureReason` yazılır (takas dosyasında "İadeyi yeniden dene" +
  `retryFailedTradeRefunds` cron'u); bu istekte çalışan işin sonucu
  `trade_admin_cancel_refund` satırına düşer.
- **Duyuru:** iptalle aynı tx'te outbox'a, **alıcı × kanal başına bir satır**
  (`trade.platform_cancel_notice`, `dedupeKey` = takas:alıcı:kanal). Her satır
  tek bir gönderim yapar: in-app bildirim (`trade_cancelled_by_platform`,
  push'u dahil) ya da e-posta (`trade-cancelled-platform`). Gönderim
  gerçekleşmezse handler fırlatır ve outbox yalnız o satırı yeniden dener —
  kısmi başarıdan sonra başka bir alıcıya / kanala ikinci gönderim olmaz.
  Gönderilecek bir şey yoksa (kullanıcı yok, bildirim kategorisi kapalı,
  ortamda e-posta sağlayıcısı yok) satır kapanır. Taramanın "otomatik iptal"
  push'u gitmez. İade core'u başarılı iadede ayrıca kendi "iade tamamlandı"
  push'unu gönderir (iade sonucu sinyali; her iptal yolunda aynı).
- **Yarışlar:** taraf iptali, süre dolumu taraması, uzatma hakkı ve ödeme
  geçişi aynı takas satırı kilidinde sıraya girer; kilit altında ortak kural
  yeniden çalışır. Kargo poller'ı devri bacak satırına yazdığı için bacaklar da
  kilitlenir (sıra: takas → bacak). Aynı kodla ikinci gönderim yeni bir iptal
  üretmez.

**İptalden sonra tamamlanan takas ödemesi (bütün iptal yolları).** İptal
yolları iadeyi iptal anında tamamlanmış ödeme satırlarına yapar; ödemesi o an
PayTR'da olan tarafın callback'i iptalden sonra gelirse satır `completed`
olurdu ve hiçbir yol iade etmezdi. Ödemenin tamamlandığı tek yer
(`payment-fulfillment` → takas nakit ödemesi) artık takas satırını ödeme
satırından önce kilitler (iptal yollarıyla aynı sıra: takas → ödeme satırı) ve
takas `cancelled` ise ödemeyi mevcut izlenen iadeye
(`refundTradeCashTracked`, ödeyene kapsamlı) verir. İş ödeme tx'iyle atomik
`trade.cancelled_payment_refund` outbox satırı olarak yazılır ve **yalnız
drainer** (`PaymentOutboxHandlers`, callback yanıtlandıktan sonra, ~1 dk
içinde) işler: iade PayTR callback'inin içinden, ödeme henüz "siteye
bildirilmeden" denenmez — PayTR bu durumda iadeyi "odeme henuz siteye
bildirilmemis" ile reddeder ve callback-içi iadenin kabul edildiğine dair bir
kanıt yoktur (sipariş grup yolundaki callback-içi `processRefund` da başarısını
kaydetmiyor, yalnız hatada elle müdahale ister). Handler erken denemeyi
ertelemeli çağırır: bu red bir başarısızlık sayılmaz, işaret yazılmaz, yanlış
"iade başarısız" alarmı gitmez ve satır drainer backoff'uyla yeniden denenir;
SON denemede erteleme yapılmaz ve iş `refundFailureReason` + retry cron'una
devredilir. Diğer sağlayıcı hataları da aynı işarete düşer. Tutar yeni bir
hesap değildir: satırdaki kusur kararıyla (`fullRefundEntitled`) iade
politikası. Platform iptalinde her satır kusursuz işaretlendiği için tam
tutardır. Duyuru tarafında bu ödeme, iptal anında sabitlenen duyuruda
görünmez; ödeyen taraf iade core'unun "iade tamamlandı" push'unu alır.

**Kapsamlı iade ve hata işareti.** Tek tarafa kapsamlı bir iade
(`refundTradeCashTracked(tradeId, { payerId })`) başarılı olunca takasın
`refundFailureReason` işaretini yalnız başka bir tarafın iade borcu kalmadıysa
temizler (iade yolunun kendi aday filtresiyle sayılır; okunamazsa işaret
korunur). Aksi halde geç gelen B ödemesinin iadesi, A'nın başarısız iadesinin
işaretini silerdi ve `retryFailedTradeRefunds` A'yı bir daha görmezdi.
Kapsamsız çağrı takasın tüm borcunu ele aldığı için bugünkü gibi temizler.

**Karar (2026-10-05) — iptalden sonra tamamlanan ödemenin kusur kararı.**

- **Ödeme süresi dolumu iptali (tarama):** ödemesi iptalden SONRA tamamlanan
  taraf da kusursuzdur ve **hizmet bedeli dahil tam** iade alır. Tarama
  (`faultless: "paid"`) yalnız iptal anında `completed` olan satırları
  işaretleyebildiği için bayrak, geç ödemeyi tespit eden yolda
  (`payment-fulfillment` → iptal edilmiş takas dalı) iade satırıyla AYNI tx'te
  yazılır; tutar yine iade politikasından (`fullRefundEntitled`) gelir. Takas
  satırı aşamayı ayrıca kaydetmediği için karar en dar sinyallerin
  birleşimidir (`isPaymentExpiryCancellation`): aktör `system`, gerekçe süre
  dolumu sabiti (yalnız tarama yazar), ödeme son tarihi kurulu ve kargolama son
  tarihi kurulu değil. Stok tükenmesi, ban, üyelik düşüşü gibi diğer sistem
  iptalleri bu kümeye girmez.
- **Taraf iptali:** takası kendisi iptal eden tarafın ödemesi sonradan
  tamamlanırsa **hizmet bedeli düşülerek** iade edilir — bu yürürlükteki
  kuraldır (iptal eden kusurludur). Karşı tarafın satırı iptal anında zaten
  kusursuz işaretlenir ve tam iade alır.
- **Platform iptali:** her satır iptal anında kusursuz işaretlenir (değişmedi).

---

## 8b. Gelir e-belgeleri

Belgeler sağlayıcıdan bağımsız tek hattan geçer (`modules/invoicing`, tablo
`elogo_invoices`, model `FiscalInvoice`); entegratör (bugün eLogo, sonra Logo Netsis) bir portun
arkasındadır ve her kayıt kendisini kesen sağlayıcıyı `provider` kolonunda
taşır — bkz. [INVOICING_PROVIDERS.md](INVOICING_PROVIDERS.md).

Düzenleyen **hep platform firmasıdır**, satıcı adına değil; ürün bedelinin
beyanı satıcıya aittir (platform satışı hariç — orada satıcı zaten Tarodan'dır).

**Her hizmet kaleminin kendi e-belgesi vardır.** Bir alım-satımda taraf başına
üç belge kesilir:

| Muhatap | Belge türü            | Matrah (`Order` / `CommissionLedger`)    |
| ------- | --------------------- | ---------------------------------------- |
| Alıcı   | `buyer_commission`    | `buyerCommissionAmount`                  |
| Alıcı   | `buyer_service_fee`   | `buyerPlatformFeeAmount` (koruma bedeli) |
| Alıcı   | `buyer_shipping`      | `buyerShippingAmount`                    |
| Satıcı  | `seller_commission`   | `sellerCommissionAmount`                 |
| Satıcı  | `seller_platform_fee` | `sellerPlatformFeeAmount`                |
| Satıcı  | `seller_shipping`     | `sellerShippingAmount`                   |

Altısı da §2'deki hizmet KDV'sine tabidir ve matrahları
`order-service-tax.helper.ts`'in KDV tabanlarının BİREBİR karşılığıdır — iki
liste ayrışırsa tahsil edilen KDV ile beyan edilen KDV ayrışır. Tanım tek
yerdedir: `modules/invoicing/invoice/package-fee-components.ts`.

- **Anahtar pakettir** (`sourceId = orderPackage.id`), sipariş değil: sepette
  aynı satıcıdan iki ürün alındığında `Order` iki tanedir ama gönderi, kargo
  ücreti ve ticari ilişki tektir.
- **Belge TEK satırdır**: hizmetin adı, 1 adet, paketin o hizmet için doğan
  toplam bedeli. Fatura adedi ürün adedi değildir. Satır tek olsa da KDV
  SİPARİŞ bazında yuvarlanıp toplanır ve satıra açıkça yazılır
  (`InvoiceLineItem.taxAmount`) — checkout tahsil ederken böyle yuvarlıyor
  (`order-service-tax.helper.ts`), birleşik matrahtan yeniden hesaplamak beyanı
  tahsilattan bir kuruş ayırabilirdi.
- **İskonto**: bedel indirimleri (`DiscountTarget.*_commission` / `*_service_fee`
  / `*_platform_fee` / `*_shipping`) kesinti kolonlarına indirim SONRASI yazılır,
  bu yüzden fatura indirimi göremiyordu. Belge artık BRÜT bedeli birim fiyat
  yazar ve indirimi `cac:AllowanceCharge` + `cbc:AllowanceTotalAmount` ile ayrı
  gösterir; KDV matrahı yine indirimli tutardır. Kaynak `Order.feeDiscountBreakdown`
  snapshot'ıdır (hedef adları belge tipleriyle birebir aynı), belge toplamı
  `FiscalInvoice.discountTotal`. Kısmi iadede iskonto matrahla aynı oranda küçülür.
- **Fatura kayıt no** (`FiscalInvoice.sourceReference`) kesim anında
  snapshot'lanır: koli kodunun gövdesinden türetilen `KYT-…`
  (`invoiceRecordReference`, bkz. CODE_SCHEME.md §2); ürün faturası sipariş
  anahtarlı olduğu için sipariş numarasının gövdesinden türer. Faturaya hem
  belge notuna hem kalemin `cac:Item/cbc:Description`'ına "Kayıt No: …" olarak
  basılır ve hakediş dökümünün aynı adlı kolonunda durur; `sourceId` bir UUID
  olduğu için belgede gösterilemezdi. **eLogo XSLT tasarımının** bu alanı
  basması ayrı bir ayardır (`ELOGO_INVOICE_XSLT_UUID`).
- **Sıfır matrah belge doğurmaz.** Bedeli doğmamış hizmet faturalanmaz.
- **Tetik teslimattır** ve paketin TÜM siparişleri teslim olmadan hiçbiri
  kesilmez; belgeler sırayla kesilir (ortak numara sayacı, P2034).
- **İki nesil bir arada yaşamaz.** Kesinti kırılımı olmayan eski defterlerde
  (`componentBreakdownComplete = false`) ve daha önce birleşik belgeyle
  faturalanmış paketlerde ücretler LEGACY `commission` / `service_fee` ile
  kesilir; aksi halde aynı bedel iki belgede yer alır. Kargo payı belgeleri iki
  nesilde de kalem bazlıdır (birleşik belgeye hiç girmiyordu).
- **İade** her belgeyi kendi kaleminin iade tutarı oranında tersler
  (`RefundFinancialComponent`); satıcı kargo payının kalem karşılığı yoktur,
  genel iade oranına düşer.

**Ceza faturası** (`penalty`) iadede kusurlu taraftan tahsil edilen KARGO
bedelini belgeler. Politika parayı zaten doğru dağıtıyordu
(`refund-financial-policy-v2.ts`): kusurlunun komisyonu iade edilir, hizmet
bedeli platformda kalır (`platform_retain` → kesilmiş belgesi ayakta durur),
kargo ona yüklenir (`*_charge`) — eksik olan yalnız bu son kalemin belgesiydi.

Matrah **FARKTIR**, yeniden faturalama değil (`invoice/penalty-basis.ts`):

| Kusur            | Ceza matrahı                                                                                                          |
| ---------------- | --------------------------------------------------------------------------------------------------------------------- |
| Satıcı           | `outbound_shipping/seller_charge` − satıcıda AYAKTA DURAN `seller_shipping` belgesi + `return_shipping/seller_charge` |
| Alıcı            | `outbound_shipping/buyer_charge` + `return_shipping/buyer_charge` (ikisi de alıcıya hiç faturalanmamıştı)             |
| Kargo / platform | belge yok (`platform_absorb`)                                                                                         |

Anahtar iade TALEBİdir (`sourceId = refundRequest.id`): aynı kolinin birden
fazla iadesi ayrı ayrı cezalanır, aynı talebin yeniden işlenmesi ikinci belge
doğurmaz. Tetik `invoice.refund_reverse` outbox handler'ıdır — ters kayıt
tamamlandıktan SONRA çalışır; düşülen tutar da bu yüzden sipariş kolonundan
değil, ters kayıttan SONRA ayakta kalan `seller_shipping` belgesinden okunur.

Diğer türler: `platform_sale` (Tarodan kendi ürününü satarken, alıcıya kalem
kalem ürün faturası), `membership`, `boost`, `trade_service_fee` /
`trade_shipping` / `trade_commission` (§8), `return_invoice`.

### Satıcı hakediş dökümü

Kesilen komisyon faturasının DAYANAĞI: hangi siparişlerden doğduğu ve o
siparişten satıcıya ne kaldığı. "Kayıt No" kolonu faturaların üstünde yazan
kodun (`KYT-…`) AYNISIDIR — belge dökümdeki satıra bununla bağlanır. Admin > Finans > Hakediş Dökümü'nden dönem
seçilip Excel indirilir (`GET /admin/settlement-report[/export]`,
`finance/settlement/`); mali müşavire fatura ile birlikte gider.

Dönem **teslimat** tarihine göredir — hak ediş ve fatura teslimatla doğar.
Satıcı hakedişi `sellerNetAmountOf` ile hesaplanır (payout ile tek formül).
İki kolonun tanımı dosyanın "Aciklama" sayfasında da yazar:

- **Komisyon Oranı** SATICI komisyonunun oranıdır; sipariş üzerinde
  saklanmadığı için tahsil edilen tutardan geri hesaplanır.
- **Tarodan Hakedişi** satıcıdan yapılan kesintidir (satıcı komisyonu +
  platform hizmet bedeli, KDV hariç); alıcıdan alınan komisyon/koruma bedeli
  buraya GİRMEZ — o alıcının kendi belgelerinin konusudur.

**Stopaj** dökümde kolon olarak durur, e-belgeye girmez: satıcının vergisinden
kaynakta kesilen tutardır ve muhtasar ile beyan edilir (aylık satıcı bazlı
toplam: `GET /admin/tax/withholding-report`).

---

## 9. Ledger ve mutabakat

`modules/ledger/ledger.service.ts` append-only çift kayıt defteridir:
Σborç == Σalacak değilse kayıt reddedilir. `payment_captured`, `refund_issued`,
`psp_fee_accrued`, payout settle ve satıcı borcu tahsili kaydedilir.

Çapraz kontrol iki hat: (1) **PayTR rapor senkronu**
(`paytr-report-sync.service.ts`, `PAYTR_REPORT_SYNC_ENABLED=true` iken):
işlem ekstresi 3 günlük kayan pencereyle (05:00), settlement raporları 31 günle
(05:30) `paytr_statement_lines`/`paytr_settlements` tablolarına idempotent
çekilir — kimliği tanımlı **her mağaza için ayrı**, satırlar `paytr_merchant` ile
damgalanır (tekillik anahtarları mağazayı içerir). Ters tarama kapsamı da mağaza
başınadır. (2) **Eşleme + sapma**
(`paytr-report-matching.service.ts`): her ekstre satırı oid üzerinden Payment/
RefundAttempt'e eşlenir (±0.05 TL toleransla `matched`/`amount_mismatch`/
`unmatched`); ters tarama bizim `completed` deyip PayTR'nin hiç raporlamadığı
ödemeleri bulur (en yüksek alarm); settlement'lar `satış − iade == net` ile
doğrulanır; PSP ücretleri ledger'a damgalanır. `ledger-reconciliation.service.ts`
(her gün 04:00, salt-okuma) beş invariantı denetler ve para taşımaz, alarm basar.

### Finans Özeti sağlaması (admin → Finans → Özet)

`modules/finance-reconciliation/`: ekran defterden değil, sipariş anında dondurulan
snapshot kolonlarından hesaplanır ve her bölüm kendi kimliğini taşır (fark ≠ 0 →
kırmızı; aynı fark gece `ledger-reconcile`'da `REVENUE_SPLIT_DRIFT` alarmı):

- **Ciro nereye gitti** (tüm zaman): tahsilat (`Payment` completed|refunded + üyelik
  yenilemeleri) = satıcı hakedişi (Σ hold) + takas karşı taraf + platform ücret geliri
  (KDV hariç) + hizmet KDV'si + kargo + stopaj − kargo açığı (hold 0'a kırpılınca).
  Fiziksel sipariş kimliği kapalı formdur: `hold + (commission − pfd) + (bST+sST) +
(bShip+sShip) + wh − deficit = total`.
- **Satıcı hakedişi nerede** (anlık): Σ hold = escrow'da + yolda + ödendi (net) +
  mahsup + alıcıya iade. **Takas nakit farkı nerede**: release bekleyen + yolda +
  ödendi + iade.
- **Platform gelirinden Tarodan hak edişine** (şelale): − iade edilen ücretler −
  feragat − takas tam iadesi − sanal iadeler − platformun karşıladığı iade kalemleri
  − PayTR kesintisi (defter `psp_fee`; senkron kapalıysa rozet).
- **PayTR ile karşılaştırma**: satış/iade/kesinti ↔ döküm satırları, `tahsilat −
iade − kesinti` ↔ gerçekleşen hakediş net (satıcı payı dahil; Tarodan hak edişiyle
  KARŞILAŞTIRILMAZ), gönderilen transferler ↔ callback+dönen. "Bizim" taraf dökümün
  ilk gününden itibaren sayılır.
- **Teşhis**: siparişi olmayan ödeme, hold'u olmayan ödenmiş sipariş, sıfır olmayan
  ürün KDV'si, sipariş komisyonu ↔ komisyon defteri farkı.

Defter bilinçli olarak kaynak değildir: `payment_captured` kargo ve hizmet KDV'sini
`seller_escrow` içinde bırakır, MEM-/BST- deftere yazmaz, iade tersine kaydı oransaldır
(ayrı epik).

## 10. Para cron'ları

Tek kaynak `apps/api/src/workers/cron-catalog.ts` (Bull `scheduled` kuyruğu,
Europe/Istanbul):

| Anahtar                 | Zamanlama | Görev                                               |
| ----------------------- | --------- | --------------------------------------------------- |
| `payment-expired`       | */5 dk    | süresi dolan ödemeleri iptal, rezervasyonları bırak |
| `payment-release-holds` | saatlik   | escrow release                                      |
| `payout-process`        | */15 dk   | payout oluştur + işle                               |
| `payout-check-returned` | 06:00     | dönen transferler + silinmiş hesap IBAN temizliği   |
| `paytr-statement-sync`  | 05:00     | PayTR ekstresi                                      |
| `paytr-settlement-sync` | 05:30     | PayTR settlement                                    |
| `ledger-reconcile`      | 04:00     | sapma invariantları                                 |

Kargoyla ilgili cron'lar için [SHIPPING.md](./SHIPPING.md); kod/referans
biçimleri için [CODE_SCHEME.md](./CODE_SCHEME.md).
