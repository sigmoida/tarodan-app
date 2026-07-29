# Ödeme Süreci Denetimi — Bulgular

> 2026-07-22 · Branch `audit/payment-processes` (development'tan açıldı).
> 4 paralel denetim: (1) çekirdek akışlar, (2) güvenlik, (3) para yaşam döngüsü
> (escrow/payout/refund), (4) kalite + kargo bağı. Salt-okuma; kod değişmedi.
> Yüksek-önem para iddiaları kod üzerinden tek tek teyit edildi.
>
> **Önemli:** Bu branch `feat/surat-barcode-retry`'daki kargo düzeltmelerini
> İÇERMEZ. Aşağıda "✓ retry-branch'te çözülü" diye işaretli maddeler o branch'te
> zaten kapandı; kalanlar gerçek açık.

## Önem özeti

| Alan                       | 🔴 Yüksek | 🟠 Orta | 🟡 Düşük |
| -------------------------- | :-------: | :-----: | :------: |
| Çekirdek akış (FLOW)       |     4     |    5    |    4     |
| Para yaşam döngüsü (MONEY) |     6     |    9    |    7     |
| Güvenlik (SEC)             |     1     |    1    |    4     |
| Kargo bağı (SEAM)          |     3     |    4    |    3     |
| Kalite (QUAL)              |     —     | yapısal |    —     |

## ✅ Çekirdek sağlam (denetimde doğrulanan)

PayTR callback hash doğrulaması (merchant_oid+status+total_amount, timing-safe) ·
tutar bütünlüğü uçtan uca server-side (client tutar veremiyor) · callback
idempotency her yerde CAS (`updateMany status=pending`) · geç/mükerrer `failed`
callback `completed`'ı geri çeviremiyor · reconciliation iptal siparişi
diriltemez/çift-tamamlayamaz · guest OTP (CSPRNG + peppered hash + timing-safe +
brute-force cap) · admin endpoint'leri role-guard + audit-log · release
atomicity (CAS + `PayoutTransfer` unique) · `handleOrderDelivered` kanonik +
replay-safe · escrow gün-14 iade / gün-15 release grace yarışı kapalı · PayTR
kuruş (100x) tuzağı belgeli & atlanmış.

---

# A. Çekirdek Ödeme Akışı (FLOW)

## 🔴 Yüksek

- [ ] **FLOW-H1 — Çifte çekim: "zaten ödendi mi?" guard'ı `failed` durumunu ve eski oid'leri görmüyor**
      `payment-initiation.service.ts:850-859` + `payment-lifecycle.service.ts:340-358`.
      `verifyPaymentFromClient` `pending` olmayan ödemeye durum-sorgu YAPMIYOR ve yalnız
      güncel `providerConversationId`'yi soruyor, `merchantOidHistory`'yi değil.
      Senaryo: 3DS başarılı (oid B) ama callback gecikti → kullanıcı checkout'u
      yeniledi → oid C'ye döndü → kart tekrar → verify C'yi soruyor, PayTR "yok" → oid
      D ile **ikinci çekim**. Callback B history eşleşmesiyle tamamlıyor, D'nin
      yakalaması PayTR'da askıda, iade yolu/alarmı yok. → **Alıcı iki kez çekiliyor.**

- [ ] **FLOW-H2 — Sahipsiz yakalama: 35 dk expiry fitili `Payment.createdAt`'ten sayıyor ama satır retry'da yeniden kullanılıyor**
      `payment-reconciliation.service.ts:902-931`. `orderId`/`checkoutGroupId` unique →
      her retry aynı satır, `createdAt` tazelenmiyor. Kullanıcı T0'da başlatıp bırakıp
      T0+40dk'da kartı girerse, canlı 30 dk'lık 3DS oturumunun İÇİNDE cron ödemeyi
      `failed`'a çekiyor → PayTR yakalıyor → başarı callback'i CAS'e takılıp "OK" ile
      yutuluyor. **Para çekildi, ödeme `failed`, oto-iade yok.** Sonra FLOW-H1'i besler.

- [ ] **FLOW-H3 — 24s sınırında sahipsiz yakalama: `expireUnpaidOrders` canlı 3DS oturumundaki ödemeyi öldürüyor**
      `payment-reconciliation.service.ts:444-554`. 23:59:30'da başlatılan 3DS,
      24s cron'u siparişi iptal + ödemeyi `failed` yapınca; yakalama sonrası başarı
      callback'i düşüyor. **Sipariş iptal, para PayTR'da, hiçbir sweep almıyor.**

- [ ] **FLOW-H4 — `POST /payments/:id/retry` her seferinde P2002 ile 500 atıyor + state'i yarım bırakıyor**
      `payment-lifecycle.service.ts:114-135`. `payment.create({orderId})` ama
      `Payment.orderId @unique` → retry edilen siparişte satır zaten var → her çağrı
      çöküyor. İptal siparişte önce order'ı `pending_payment` yapıp ürünü `reserved`
      set ediyor (`reservedQuantity` artırmadan), sonra çöküyor → ürün diğer alıcılara
      bloke. Deklare edilen retry hikâyesi tamamen ölü. (= SEAM-B5)

## 🟠 Orta

- [ ] **FLOW-M1 — Initiation `completed` ödemeyi `pending`'e geri çevirebiliyor (CAS'siz reset)** `payment-initiation.service.ts:1101-1121,1199-1214` + grup/trade. Başarı callback'i read-write arasına düşerse tamamlanmış ödeme sıfırlanıp gerçek kargosu iptal edilebiliyor.
- [ ] **FLOW-M2 — `cancelPayment` tekil yolunda CAS yok** `payment-lifecycle.service.ts:229-245`. Başarı callback'i check-write arasına düşerse `completed` üzerine `failed` yazılıp iade kör kalıyor. (Grup yolu doğru: `processFailedPayment` CAS'i.)
- [ ] **FLOW-M3 — Reconciliation kör noktaları** `:790-811`: trade-cash ödemeleri hiç taranmıyor, yalnız güncel oid sorgulanıyor, `failed` ödemeler PayTR'a karşı hiç yeniden kontrol edilmiyor (H1/H2/H3'ün kök nedeni).
- [ ] **FLOW-M4 — Tek reddedilen deneme siparişi/grubu + sepeti yok ediyor, çalışan retry yok** `payment-fulfillment.service.ts:1305-1531`. Sepet checkout'ta silinmiş + retry bozuk (H4) → alıcı sepeti sıfırdan kurmak zorunda.
- [ ] **FLOW-M5 — Refund güncel `providerConversationId`'yi kullanıyor, çekilen oid'i değil** `payment-refund.service.ts:249-255`. Oid rotasyonu sonrası PayTR "işlem bulunamadı" → iade sonsuza dek `REFUND_MANUAL_REVIEW`. Çekilen oid `providerPaymentId`'de mevcut ama kullanılmıyor.

## 🟡 Düşük

- [ ] **FLOW-L1** SavedCard senkronu grup/trade ödemesinde düşüyor (`payment-callback.service.ts:258-269`).
- [ ] **FLOW-L2** `invalidatePendingOrdersForProduct` sipariş başına 1 birim bırakıyor (miktar-farkında değil) + zaten bırakılmışları sayıyor (`product-lock.service.ts:344-353`).
- [ ] **FLOW-L3** Üyelik sibling temizliği yalnız aynı `productId` (`payment-fulfillment.service.ts:222-247`).
- [ ] **FLOW-L4** Boost başarısızlığında `ProductBoost` `pending` + sanal ürün `active` kalıyor.

---

# B. Para Yaşam Döngüsü — Escrow / Payout / Refund (MONEY)

## 🔴 Yüksek (bugün para kaybı üretebilir)

- [ ] **MONEY-H1 — Takas-nakit iade marker'ı PayTR hatasında geri alınmıyor → sonraki deneme "sahte iade" yapıyor**
      `payment-refund.service.ts:740-788`. `refundInProgressAt` PayTR'dan ÖNCE yazılıyor;
      deterministik "ödeme henüz bildirilmemiş" hatasında catch marker'ı temizlemeden
      rethrow ediyor. Sonraki çağrı PayTR'ı ATLAYIP DB'yi `refunded` işaretliyor.
      **Ödeyen tüm tutarı kaybediyor, platform sessizce tutuyor.** (Order yolunda
      `clearRefundInProgress` var, trade yolunda yok. B3 spec'i bu atlamayı test ediyor.)

- [ ] **MONEY-H2 — `cancelTrade` iade hatasında retry yolu yok (idempotent yeniden-iptal iadeyi atlıyor)**
      `trade-lifecycle.service.ts:906-921,1016-1023`. Refund try/catch'siz + marker'sız;
      hata olursa yeniden-iptal `alreadyCancelled` → iade bloğu atlanıyor. Admin
      `retryTradeRefund` `refundFailureReason` null olduğu için reddediyor. **Ödeyenin
      parası askıda; sonraki manuel deneme H1 ile sahte-iade oluyor.**

- [ ] **MONEY-H3 — Admin tutar bazlı KISMİ iade satıcının TÜM hold'unu yakıyor**
      `admin-payment.service.ts:414-441` → `payment-refund.service.ts:384-414`. `manualRefund`
      yalnız amount geçiyor → `refundQty = tam sipariş miktarı` → `portion=1` → hold
      `cancelled`. **1000 TL siparişte 50 TL jest iadesi → alıcı 50 alır ama satıcının
      ~900 TL payout'u iptal olur; platform ~950 tutar.** (Doğrulandı.)

- [ ] **MONEY-H4 — Tekil ödemede HERHANGİ kısmi iade ödemeyi tam `refunded` işaretliyor → ikinci kısmi iade imkânsız**
      `payment-refund.service.ts:324-325`: `fullyRefunded = !isGroupPayment || ...` — tekil
      için hep true. 3 üründen 1'i iade edilince `payment.status=refunded` →
      `processRefund` "tamamlanmış ödeme yok" + `createRefundRequest` reddediyor.
      Çoklu-kısmi-iade tasarımıyla çelişiyor. **İkinci ürünün parası manuel ops'a
      kalıyor.** (Doğrulandı.)

- [ ] **MONEY-H5 — İptal edilen SEPET (grup) siparişleri hiç oto-iade edilmiyor**
      `order-lifecycle.service.ts:461-515` → sweep `payment-reconciliation.service.ts:89-97`
      `payment: { is: { status: completed } }` (SİPARİŞ-BAZLI ilişki) filtreliyor; grup
      ödemesinde `Payment.orderId=null` → ilişki null → hiç eşleşmiyor, hiç iade
      edilmiyor, log bile yok. **Alıcının parası süresiz platformda kalıyor.** (Doğrulandı.)

- [ ] **MONEY-H6 — Açık iadelerin terminal kaçışı yok → hold'lar sonsuza dek donuk**
      `refund.service.ts:293-300`. Hiçbir yer `rejected` yazmıyor, `return_shipment_open`
      için expiry yok (kod bu branch'te), `unfreezeHoldForRefund` tek çağrı yerinde.
      **Alıcı iade açıp sessizleşirse teslim edilmiş ürünün satıcısı hiç ödenmiyor.**
      Admin'de "iadeyi reddet/kapat" aracı yok. → _retry-branch'teki D25 (7 gün drop-off
      deadline) `return_shipment_open` kısmını KISMEN kapatıyor; `wait_for_delivery` +
      admin reject-tool kısmı açık._

## 🟠 Orta

- [ ] **MONEY-M1** `finalizeRefundForReturnedShipment` concurrency-safe değil (3 çağıran: cron + Sürat sync + admin); marker read-modify-write, kilitsiz → kısmi tutarlarda çift PayTR iadesi (`refund.service.ts:534-545`, `payment-refund.service.ts:207-247`).
- [ ] **MONEY-M2** Çifte-payout penceresi: iade sırasında oluşan `pending` payout void edilmiyor; `createPayoutsForReleasedHolds` `frozenByRefundId`/açık-iade kontrol etmiyor (`payout.service.ts:72-125`).
- [ ] **MONEY-M3** Payout iade başarısı bilinmeden void ediliyor, PayTR fail'de geri alınmıyor → satıcı ödenmez, alıcı iade almaz (`payment-refund.service.ts:157-163`).
- [ ] **MONEY-M4** PayTR-iade-edildi / DB-fail (order hâlâ `paid`) reconcile edilmiyor; hiçbir job `refundInProgressOrders`'ı taramıyor → **platform çifte kayıp** (satıcı ödenip alıcının parası da geri gitmiş).
- [ ] **MONEY-M5** `resolveDispute` trade'in `disputed` olduğunu doğrulamadan ÖNCE iade ediyor (`trade-lifecycle.service.ts:1456-1469`) → yanlış trade'i çözen admin `completed` trade'i iade edebiliyor.
- [ ] **MONEY-M6** Trade-cash release-vs-refund yarışı payout öncesi statü yeniden-kontrol etmiyor → iki bacak da ödenebiliyor.
- [ ] **MONEY-M7** `COOLING_OFF_DAYS=14` sabit vs `RETURN_WINDOW_DAYS` env; env <14 ise grace-gün invaryantı sessizce kırılıyor.
- [ ] **MONEY-M8** Admin `releaseTradePaymentHold` trade-status guard'ını atlıyor (`admin-payout.service.ts:339-366`) → `returning/disputed` trade'de erken release ödeyenin iadesini kalıcı blokluyor.
- [ ] **MONEY-M9** Payout retry belirsiz ağ hatasında aynı `transId`'yi yeniden gönderiyor; çifte-banka-transferi koruması yalnız PayTR tarafına dayanıyor (repo'da doğrulanmıyor).

## 🟡 Düşük

- [ ] **MONEY-L1** `manualRefund` grup/trade ödemesinde `payment.orderId` (null) geçiyor → `processRefund(null)` çöküyor.
- [ ] **MONEY-L2** `handleExpiredPreparingOrders` restock `increment:1` (miktar-farkında değil). (= FLOW-L2 sınıfı)
- [ ] **MONEY-L3** Ledger drift: `applyRefund` `waived` ledger'da çalışıyor; policy-override amount-bazlı pro-rate.
- [ ] **MONEY-L4** Stopaj kısmi iadede yeniden hesaplanmıyor (kodda kabul edilmiş).
- [ ] **MONEY-L5** `payment-trade-cash-refund.spec.ts` `describe.skip` — temel takas-iade suite'i kapalı.
- [ ] **MONEY-L6** Hold `shippingCost+taxAmount` içeriyor; Sürat platformu faturalıyorsa platform her siparişte kargo ücretini kaybeder (iş-kararı doğrulaması gerekli). (= SEAM-B6d)
- [ ] **MONEY-L7** Komisyon ledger'ı yalnız siparişleri kapsıyor; takas komisyonları yalnız ElogoInvoice'ta — birleşik gelir defteri yok.

---

# C. Güvenlik (SEC)

## 🔴 Yüksek

- [ ] **SEC-H1 — `POST /payments/:id/bypass-complete` public, sahipsiz, config-flag'li bedava-tamamlama**
      `payment.controller.ts:383-392` → `payment-initiation.service.ts:1276-1315`. `@Public()`,
      auth yok, sahiplik yok; yalnız `PAYMENT_BYPASS==="true"` guard'ı. Bayrak internete
      açık ortamda true ise **UUID'yi bilen herkes bedava ürün/üyelik/boost alır**.
      `main.ts:18-29` guard'ı yalnız `NODE_ENV==="production"` kontrol ediyor — staging/
      unset'te ateşlemiyor. `GET /payments/config` `bypassEnabled`'ı public sızdırıyor.

## 🟠 Orta

- [ ] **SEC-M1 — `POST /payments/:id/confirm-failed` public + sahipsiz, ödemeyi çekim ortasında iptal ediyor**
      `payment.controller.ts:345-360`. 3DS penceresinde `paymentId`'yi bilen saldırgan
      ödemeyi `failed` yapıp siparişi iptal ediyor; PayTR yakalayınca CAS'e takılıp
      para askıda kalıyor (griefing + fon sıkıştırma).

## 🟡 Düşük

- [ ] **SEC-L1** Kimliksiz fiyat ifşası: pending ödemede UUID'yle tam fiyat kırılımı okunuyor (`payment-query.service.ts:197-210`).
- [ ] **SEC-L2** Guest e-posta enumerasyonu: kayıtlı 409 / kayıtsız 200; rate-limit e-posta bazlı → çok adres denenebiliyor.
- [ ] **SEC-L3** Tahmin edilebilir `merchant_oid` son eki (`Date.now().slice(-6)`, ~10⁶, ~16.7 dk döngü) — istismar edilebilir değil ama benzersizlik/sır sayılmamalı.
- [ ] **SEC-L4 (INFRA)** Coolify PayTR key/salt + OTP secret'ı build ARG olarak enjekte ediyor → imaj katmanına/loglara gömülü. Uygulama kodu doğru; deploy pipeline'ı runtime-secret'a taşınmalı.

---

# D. Ödeme ↔ Kargo Dikişi (SEAM)

## 🔴 Yüksek

- [ ] **SEAM-B1 — `seller_no_ship` oto-iptal kargo durumuna hiç bakmıyor; paket yoldayken iade ediyor**
      `payment-reconciliation.service.ts:654-731`. Sorgu yalnız `status=preparing +
deadline`. Order `preparing→shipped` sadece satıcı manuel "kargoladım" veya admin
      ile oluyor; Sürat poll'u order'a yalnız teslim/iade'de dokunuyor. Satıcı etiketi
      basıp paketi verir ama "kargoladım"a basmazsa → deadline geçince cron siparişi
      iptal + hold iptal + restock + **paket yoldayken alıcıya tam iade**. Restock da
      `increment:1` (miktar-farkında değil). _retry-branch'teki `CARGO_MOVEMENT_MISSING`
      alarmı yalnız UYARIYOR; iadeyi ENGELLEMİYOR → çekirdek sorun AÇIK._ (Doğrulandı.)

- [ ] **SEAM-B2 — Alıcı iptali de order-durumu-güveni + Sürat temizliği ertelemeli/kırılgan**
      `order-lifecycle.service.ts:461-615`. Shipment yüklenmeden `preparing`'de iptale
      izin; Sürat iptali/iade */5 sweep'e ertelenmiş → ≥5 dk order `refunded` ama Sürat
      gönderisi canlı; `processRefund` kalıcı bloke olursa gönderi süresiz aktif.

- [ ] **SEAM-B3 — Sürat iade-tamamlandı oto-iadesi RefundRequest pipeline'ını atlıyor + hatada siparişi askıda bırakıyor**
      `surat-tracking.service.ts:532-556`. Order KOŞULSUZ `refund_requested`'a çekilip
      doğrudan `processRefund` çağrılıyor — RefundRequest yok, freeze yok, policy yok
      (hep tam `totalAmount`). Hata olursa sweep `[refunded,cancelled]` tarıyor,
      `refund_requested` hiç alınmıyor → **ürün satıcıda, alıcı iadesiz, escrow donuk,
      hiçbir otomasyon kurtarmıyor.** (Doğrulandı.)

## 🟠 Orta

- [ ] **SEAM-B4 (✓ retry-branch'te çözülü)** Revive/yeniden-ödenen sipariş çalışan kargo alamıyor — `feat/surat-barcode-retry`'daki H4 (`ensureSuratShipmentForOrder` + revive) bunu kapattı. Development'ta AÇIK.
- [ ] **SEAM-B5** `retryPayment` order yolu garantili bozuk (= FLOW-H4).
- [ ] **SEAM-B6 — Kargo ücreti tek-kaynak değil:** (a) üye offer→order kargo ÖDEMİYOR (`order-checkout-direct.service.ts:676`) ama guest ödüyor; (b) quote (sepet-bazlı) ≠ checkout (satır-bazlı) kargo; (c) kısmi iade tam kargoyu pro-rate ediyor; (d) hold kargoyu satıcıya ödüyor ama barkod platform hesabında (= MONEY-L6). 4 farklı kargo-iade kuralı bir arada.
- [ ] **SEAM-B7** Dördüncü, kanonik-olmayan teslim yolu: admin manuel statü değişimi `handleOrderDelivered`'ı atlıyor (`admin-analytics-order.service.ts:272-296`) — 48h dalı yok, `deliveredAt IS NULL` guard'ı yok → tekrarlanan "delivered" `releaseAt`'i kaydırıyor.

## 🟡 Düşük

- [ ] **SEAM-B8** `cancelSuratShipmentIfExists` kapsamı tutarsız (bazı iptal yolları çağırıyor, bazıları değil; bugün zararsız çünkü o durumlar `pending_payment`).
- [ ] **SEAM-B9** Trade cash refund sıralaması: `resolveDispute` doğrulamadan önce iade + `admin-staff.service.ts:477` yutulmuş `.catch` (= MONEY-M5 sınıfı).
- [ ] **SEAM-B10 (✓ retry-branch'te çözülü)** `shipping.worker` ölü kod sahte-kargo yaratıyor — retry-branch'teki M6 sildi. Development'ta AÇIK.

---

# E. Kod Kalitesi (QUAL)

- **Duplication — needs-work (fulfillment sınırda riskli):** tekil vs grup fulfillment ~450 satır kopya (CAS+audit, deadline, stock decrement, stockout cascade, hold+ledger, bildirim döngüleri, shipment bloğu); checkout direct/group/guest 5-alan adres validasyonu 3 kez, `total=...` formülü 4-5 yerde; initiation re-reserve CAS bloğu **5 kez** (hepsi qty=1 hardcoded — grup qty>1 rezerve ediyor, retry yalnız 1 birim geri alıyor).
- **God-service — riskli:** `payment-fulfillment.service.ts` 1573 satır grab-bag. Temiz ekstraksiyon dikişleri: VirtualOrderFulfillment (membership/boost), OrderStock (decrement+cascade), FulfillmentNotifier, ShipmentProvisioning, TradeCashFulfillment. En güçlü kaldıraç: direct checkout zaten her siparişi 1-siparişlik CheckoutGroup'a sarıyor → tekil yol "group-of-one" olabilir, ~500 satır silinir.
- **Facade — maintainable:** payment modülü dışından hiçbir yer alt-servise import etmiyor; `payment.service.ts` saf 255-satır delegatör. İçeride 2 lazy-resolve hack.
- **any-typing — needs-work:** `payment: any` 4 fulfillment girişinde + 5 initiation; tek `Prisma.PaymentGetPayload<...>` alias'ı hepsini tipler. `(payment.metadata as any)` ~20 yerde.
- **Config dağınık:** 24s pencere 4 yerde inline, "+3 gün" 4 yerde, `PAYMENT_BYPASS` 6+ yerde, `process.env` vs ConfigService karışık.
- **Test kapsamı — riskli:** tekil `processSuccessfulPayment` (en yoğun para yolu) SPEC YOK, `processRefund` order yolu (~550 satır) yok, `releaseHoldsDue` yok, tüm `payment-initiation` (1316 satır) yok; `modules/refund`, `modules/shipping`, `modules/surat-cargo`, `workers/` sıfır spec → **ödeme↔kargo dikişi tamamen test dışı.**

**En değerli 3 refactor:** (1) M — tekil fulfillment'ı group-of-one'a çevir (+ `ensureSuratShipmentForOrder` çıkar, ~500 satır siler, shipment drift'i kapatır); (2) S — paylaşılan `PaymentWithContext` + `PaymentMetadata` tipleri; (3) S/M — tek qty-farkında `reacquireReservation` helper'ı (5 kopyayı + bozuk retry'ı düzeltir).

---

# Önerilen düzeltme sırası

**Blok 1 — bugün para kaybı (acil):** MONEY-H1, MONEY-H2 (takas iade sahte-iade), MONEY-H5 (sepet iptali hiç iade edilmiyor), MONEY-H3/H4 (kısmi iade), SEAM-B1 (yoldayken iade).
**Blok 2 — sahipsiz yakalama / çifte çekim:** FLOW-H1/H2/H3 + FLOW-M3 (ortak kök: `failed`/eski-oid için durum-sorgu+alarm fallback'i yok), FLOW-H4 (retry).
**Blok 3 — güvenlik:** SEC-H1 (bypass), SEC-M1 (confirm-failed) — sahiplik + `NODE_ENV!=="production"` iç guard.
**Blok 4 — donuk hold / kurtarma:** MONEY-H6, SEAM-B3, MONEY-M1–M4.
**Blok 5 — orta/düşük + kalite refactor'ları.**
</content>
