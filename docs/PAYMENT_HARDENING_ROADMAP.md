# Ödeme Sağlamlaştırma — Yol Haritası

> Amaç: Ödeme altyapısını **doğru** (para asla kaybolmaz/çiftlenmez), **çökmeye
> dayanıklı** (Bull + ayrı worker + dayanıklı Redis + idempotent), **doğru mimari**
> (PSP kaynak + reconciliation + idempotency + state machine + outbox + ledger),
> **bakılabilir** ve **güvenli** bir hale getirmek.
>
> Kaynak denetim: [PAYMENT_AUDIT_FINDINGS.md](./PAYMENT_AUDIT_FINDINGS.md) (bulgu ID'leri oradan).
> İlerleme: çözüldükçe `[x]`. Her faz ayrı branch + kendi commit'leri.
>
> **Öncelik:** Faz 1 (para kaybı) önce. Ama kapsam TAM — 10 fazın hepsi hedeftir.
>
> **Branch stratejisi:** Bu iş `feat/surat-barcode-retry` merge edildikten SONRA
> (veya onun üstüne rebase ile) yürür; aksi halde aşağıdaki "zaten çözülü"
> maddeler çakışır. Her faz `fix/payment-hardening-fazN` gibi kendi branch'inde.

## Önce: `feat/surat-barcode-retry`'de ZATEN çözülü (bu roadmap'te TEKRAR YAPMA)

- **SEAM-B4** (revive/yeniden-ödenen sipariş kargosu) → `ensureSuratShipmentForOrder` + revive (H4 fix).
- **SEAM-B10** (`shipping.worker` ölü kod) → silindi (M6).
- **MONEY-H6 kısmen** (`return_shipment_open` süresiz donuk hold) → D25 drop-off deadline (7 gün) `return_shipment_open` kısmını kapattı. Kalan: `wait_for_delivery` + admin "iadeyi reddet/kapat" aracı.
- Referans için: bu roadmap merge sonrası çalışırsa bu satırlar doğrulanıp kapatılır.

---

## Faz 0 — Altyapı önkoşulları (Redis dayanıklılığı) · INFRA

> Kod değil; Faz 7 (Bull cutover) için önkoşul. Erken yapılabilir, paralel.

- [ ] Bull için **cache'ten AYRI** bir Redis instance (job key'leri cache eviction'ıyla karışmasın).
- [ ] `maxmemory-policy noeviction` (Bull ZORUNLU ister — yoksa bellek baskısında job kaybı).
- [ ] AOF açık (`appendonly yes`) + kalıcı volume (RDB tek başına yetersiz).
- [ ] Redis health + memory alarmı (dolunca `noeviction` job ekleme reddeder → görünür olmalı).
- [ ] Coolify checklist olarak belgele (kod tarafı `REDIS_HOST/PORT/PASSWORD` zaten var).

---

## Faz 1 — Para kaybı bug'ları (ACİL) · `fix/payment-hardening-money`

> Bugün gerçek para kaybettirebilen/çiftleyebilen bulgular. Her biri spec ister.

- [x] **1.1 — Takas-nakit iade marker rollback (MONEY-H1)** ✓
      `payment-refund.service.ts`. `refundInProgressAt` PayTR'dan önce yazılıp
      geçici hatada (`"ödeme henüz bildirilmemiş"`) temizlenmiyordu → sonraki deneme PayTR'ı
      atlayıp sahte-iade yapıyordu. **Çözüm:** `clearTradeRefundInProgress` helper'ı eklendi;
      catch bloğu (throw + non-success) marker'ı geri alıyor → PayTR başaramadıysa retry onu
      yeniden çağırıyor, PayTR başardıysa (persist-fail) marker kalıyor. Order yolundaki
      `clearRefundInProgress` ile aynı invaryant. **Spec:** 2 yeni MONEY-H1 testi (b3.spec).

- [x] **1.2 — `cancelTrade` iade retry yolu (MONEY-H2)** ✓
      `trade-lifecycle.service.ts:1016-1023,1456-1460`. Refund try/catch'siz + `refundFailureReason`
      marker'sız → hata sonrası yeniden-iptal iadeyi atlıyor, admin retry reddediyordu.
      **Çözüm:** DRY `refundTradeCashTracked` helper'ı (PaymentRefundService) — başarıda
      marker temizle + `refund-completed`, başarısızda `refundFailureReason` marker +
      `refund-failed`, throw etmez (iptal zaten commit'li). `cancelTrade` + `resolveDispute`
      onu kullanıyor. Yeni `retryFailedTradeRefunds` cron'u (trade-expired 5dk step 4)
      marker'lı takasları süpürüyor; admin `retryTradeRefund` zaten çalışıyor.
      **Spec:** 3 yeni MONEY-H2 testi (tracked.spec). (resolveDispute'un ödeme-öncesi
      sıralaması ayrı bulgu → MONEY-M5/Faz 4.5.)

- [x] **1.3 — İptal edilen SEPET (grup) siparişi oto-iade (MONEY-H5)** ✓
      `payment-reconciliation.service.ts:processRefundedOrders`. Sweep `payment.is.status=completed`
      (sipariş-bazlı ilişki) filtreliyordu; grup ödemesinde null → hiç iade edilmiyordu.
      **Çözüm:** sweep'e ikinci kol eklendi — `payment: {is:null} + checkoutGroupId + checkoutGroup.payment.status=completed`
      ile grup siparişleri yakalanıp `processRefund(orderId)`'e (zaten grup-farkında,
      sipariş-tutarı kadar kısmi iade) yönlendiriliyor. Zaten iade edilmişler grup payment
      `metadata.refundedOrders`'tan elenerek gürültüsüz idempotency. **Spec:** 3 yeni testi
      (group-refund.spec).

- [x] **1.4 — Kısmi iade tek boyut + hold kısmi tüketim (MONEY-H3 + H4)** ✓
      `payment-refund.service.ts:processRefund`. **Çözüm:** (a) H4 — kümülatif iade
      takibi tekilde de (`refundedOrders[orderId]` toplanır, her zaman persist);
      `fullyRefunded = totalRefunded >= payment.amount` → tek kısmi iade artık payment'ı
      tümden `refunded` yapmıyor, art arda kısmi iade açılabiliyor; PayTR-öncesi kümülatif
      TAVAN eklendi (fazladan iade engeli). (b) H3 — hold portion `amountToRefund/orderRefundThreshold`
      (ledger portion ile aynı formül, tek otorite) → tutar-bazlı jest hold'un tümünü değil
      oranını tüketiyor. Ek tutarlılık: sipariş cancel + stok geri-yükleme + e-Arşiv reverse
      artık siparişin KÜMÜLATİF tam iadesine bağlı (`isOrderFullyRefunded`); tutar-bazlı kısmi
      iade stok geri yüklemiyor (alıcı malı elinde tutar). **Spec:** 4 yeni testi (refund-partial.spec).
      (NOT: `manualRefund` grup/trade null-orderId ayrı bulgu → MONEY-L1/Faz 4.6.)

- [x] **1.5 — `seller_no_ship` kargo durumuna baksın (SEAM-B1)** ✓
      `payment-reconciliation.service.ts:handleExpiredPreparingOrders`. Cron yalnız
      `preparing + deadline` bakıyordu; paket Sürat'ta hareket ederken bile iptal+iade
      ediyordu. **Çözüm:** tx içinde shipment yüklenip `SHIPMENT_IN_MOTION_STATUSES`
      (`picked_up/in_transit/at_delivery_branch/out_for_delivery/delivered/return_*`) veya
      `shippedAt` varsa iptal ATLANIYOR (greplenebilir `SELLER_NO_SHIP_SKIPPED_MOVING`
      log). `pending/label_created` gerçek "göndermedi" sayılıyor (immediate-barcode her
      ödemede etiket üretir). Teslimde `handleOrderDelivered` `preparing`'i ilerlettiği için
      satıcı yine ödeniyor. Bonus: restock `increment:1` → `order.quantity`. **Spec:** 4 yeni
      testi. (Ayrı "kargoladım işaretle" bildirim tipi → Faz 10 UX.)

- [x] **1.6 — Sürat iade oto-refund'u pipeline'a soksun (SEAM-B3)** ✓
      `surat-tracking.service.ts:applyTrackingUpdate`. Koşulsuz `refund_requested` +
      doğrudan `processRefund`, hatada yalnız log → askıda (poller terminal `returned`
      shipment'ı artık pollamadığından kendi retry edemiyordu). **Not:** bu, buyer'ın
      RefundRequest'inden AYRI bir senaryo — outbound paketin göndericiye iade dönmesi
      (RefundRequest yok). **Çözüm:** (a) statü guard — order'ı ATOMİK `updateMany`
      ile refund_requested'a geçir, zaten cancelled/refunded ise dokunma (re-poll idempotency);
      (b) `processRefundedOrders`'a **returned-arm** eklendi (`status=refund_requested` +
      `shipment.status=returned`) → başarısız iade bir sonraki turda güvenilir retry ediliyor,
      askıda kalmıyor. **Spec:** returned-arm testi (group-refund.spec).

- [x] **1.7 — `retryPayment` düzelt (FLOW-H4 / SEAM-B5)** ✓
      `payment-lifecycle.service.ts:retryPayment`. `payment.create({orderId})` +
      `orderId @unique` → her çağrı P2002/500; retry HİÇ çalışmıyordu. **Çözüm:** yeni
      satır yerine mevcut `failed` ödeme CAS ile (`updateMany` + status guard) `pending`'e
      resetlenip yeniden kullanılıyor; retry audit metadata korunuyor; `assignMerchantOid`
      oid'i rotate ediyor (eski oid history'e). `newPaymentId == paymentId` (hiçbir client
      kullanmıyordu). **Spec:** 3 yeni testi (retry-flow-h4.spec). (qty-farkında
      `reacquireReservation` helper'ı Faz 8'e bırakıldı — mevcut revive korundu.)

---

## Faz 2 — Sahipsiz yakalama & çifte çekim (PSP reconciliation çekirdeği) · `fix/payment-hardening-reconcile`

> PSP'yi tek kaynak yapan mekanizma. FLOW-H1/H2/H3 + M1/M2/M3/M5'i kapatır.

- [x] **2.1 — Reconciler'ı genişlet (FLOW-M3, kök çözüm)** ✓ (kısmi — aşağıdaki not)
      **Çözüm:** (A) `reconcilePendingPaytrPayments` artık `collectPaymentOids` ile TÜM
      oid'leri (güncel + `merchantOidHistory`) tarıyor → rotate edilmiş eski oid'deki capture
      yakalanıyor. (C) Yeni `detectOrphanCapturedFailedPayments` (scheduler step): `failed`
      işaretli ama PayTR'da çekilmiş ödemeleri tüm oid'lerde tarar → sipariş ödenebilirse
      CAS ile failed→pending resetleyip TAMAMLAR (telafi), gitmişse yüksek-öncelik ALARM
      (`ORPHAN_CAPTURE_REVIEW`). Cache dedup (6s) PayTR spam'ini engeller. **Spec:** FLOW-H1 +
      FLOW-M3 (7 test). **DEFER:** (B) trade-cash reconciliation ve fulfil-EDİLEMEZ capture'ın
      OTO-İADESİ bilerek Faz 4'e bırakıldı (cron-tetikli para iadesi riski; şimdilik ALARM).

- [x] **2.2 — Expiry fitilini charge-start'tan say (FLOW-H2)** ✓
      Charge-claim anında `metadata.lastChargeStartedAt` damgalanıyor (MIGRATION YOK).
      `isChargeLikelyLive` helper'ı: charge-start `PAYMENT_FAIL_TIMEOUT_MINUTES` (35dk)
      içindeyse ödeme `cancelExpiredPayments` tarafından `failed` YAPILMIYOR (`createdAt`
      eski olsa bile). **Spec:** 3 yeni FLOW-H2 testi (live-charge.spec).

- [x] **2.3 — 24s expiry canlı 3DS'i öldürmesin (FLOW-H3)** ✓
      `expireUnpaidOrders` tx içinde siparişin (veya grubunun) pending/processing ödemesini
      yükleyip `isChargeLikelyLive` ise o turu ATLIYOR → canlı 3DS oturumundaki sipariş 24s
      kill-switch'i tarafından iptal edilmiyor (orphan capture yok). Aynı helper (FLOW-H2 ile ortak).

- [x] **2.4 — Stabil idempotency / oid history taraması (FLOW-H1)** ✓
      `verifyPaymentFromClient` artık `collectPaymentOids` ile güncel + `merchantOidHistory`'deki
      TÜM oid'leri durum-sorgu ile tarıyor; herhangi birinde capture bulursa ödemeyi tamamlayıp
      "zaten ödendi" dönüyor → initiation ikinci çekimi yapmıyor. Tutar uyuşmazlığı ayrı
      `amount_mismatch` sinyali korunuyor. **Spec:** 3 FLOW-H1 testi. (İdeal sabit idempotency
      key mimari kararı hâlâ açık — Faz 3-8.)

- [x] **2.5 — Refund çekilen oid'i kullansın (FLOW-M5)** ✓
      **Düzeltme (roadmap notundan daha temiz):** `providerPaymentId` PayTR token'ıdır,
      merchant_oid DEĞİL (callback yorumu doğruladı). Bunun yerine **capture anında**
      `providerConversationId` gerçekten çekilen oid'e SENKRONLANIR: `processSuccessfulPayment`
      (+ group/trade variant) opsiyonel `capturedMerchantOid` alıp completion CAS'inde
      `providerConversationId`'yi set ediyor; callback `dto.merchant_oid`, reconcile/hash-mismatch
      queried `oid` geçiyor. Böylece re-init sonrası bile iade (providerConversationId kullanır)
      doğru oid'e gider. Trade fallback `tradeId.replace(...)` kaldırıldı → gerçek yolda oid
      yoksa reddedilir. **Spec:** FLOW-M5 guard testi (b3.spec).

- [x] **2.6 — CAS'siz reset/cancel yollarını kapat (FLOW-M1, FLOW-M2)** ✓
      Initiation'daki 3 koşulsuz `completed→pending` reset'i (grup + tekil + trade-cash)
      `updateMany where status:{not:completed}` + count===0 → "zaten ödendi" CAS'ine çevrildi.
      `cancelPayment` tekil yolu `updateMany where status:pending` CAS'ine (count===0 →
      iptal etme, ürünü serbest bırakma). Böylece findUnique↔update arası bir başarı
      callback'i ödenmiş ödemeyi `pending`/`failed`'a ezemez. **Spec:** 2 yeni FLOW-M2 testi
      (cancel-cas.spec).

---

## Faz 3 — Güvenlik · `fix/payment-hardening-security`

- [x] **3.1 — `bypass-complete` kilitle (SEC-H1)** ✓ Üç katman: (1) servis içi SERT
      `NODE_ENV==="production"` reddi (PAYMENT_BYPASS yanlışlıkla açık olsa bile prod'da
      bedava ödeme YOK), (2) endpoint `@Public()` → `@UseGuards(JwtAuthGuard)` + ownership
      (order/grup/trade payer), (3) `GET /payments/config` `bypassEnabled`'ı yalnız non-prod'da
      `true` raporluyor. **Spec:** 4 SEC-H1 testi.
- [x] **3.2 — `confirm-failed` ownership (SEC-M1)** ✓ Endpoint public + guest checkout
      kullandığından JWT ownership uygulanamaz; en kritik kötüye kullanım kapatıldı: CANLI
      3DS çekimi (`isChargeLikelyLive`) varken ödeme fail EDİLMİYOR → payment-id enumerasyonuyla
      başkasının canlı ödemesini fail edip orphan capture tetikleme engellendi. `isChargeLikelyLive`
      PaymentCommonService'e taşındı (DRY; FLOW-H2/H3 ile ortak). **Spec:** 3 SEC-M1 testi.
      (Tam ownership için optional-auth guard gerekir → Faz 10.)
- [ ] **3.3 — Düşük (SEC-L1/L2/L3):** kimliksiz pending-fiyat ifşası (auth iste), guest e-posta
      enumerasyonu (uniform yanıt), oid entropi notu. → **Faz 10'a ertelendi** (düşük öncelik,
      Faz 10 zaten düşükleri topluyor).

---

## Faz 4 — İade/hold yapısal doğruluk + terminal kaçış · `fix/payment-hardening-refund-holds`

- [x] **4.1 — Donuk hold terminal kaçışı (MONEY-H6)** ✓ (1) Admin force-close aracı:
      `adminCloseRefundRequest` → takılı iadeyi para iade ETMEDEN cancelled yapıp
      `unfreezeHoldForRefund` çağırır (satıcı normal escrow'da ödenir); admin-refund.service
      `closeStuckRefund` + audit + `POST admin/refund-requests/:id/close`. (2) `wait_for_delivery`
      timeout: `expireStaleWaitForDelivery` sweep (REFUND_WAIT_DELIVERY_MAX_DAYS=30) refund-scheduler'a
      eklendi → sipariş hiç teslim olmayınca donuk kalan hold çözülür. (3) `return_shipment_open`
      zaten D25 (`expireStaleOpenReturns`) ile unfreeze ediyor — doğrulandı. **Spec:** 5 MONEY-H6 testi.
- [x] **4.2 — `finalizeRefundForReturnedShipment` concurrency-safe (MONEY-M1)** ✓ Atomik
      CLAIM: `updateMany where status=return_delivered → refunded` (count===0 → başka çağıran
      aldı, tekrarlama). Yalnız kazanan processRefund + finalize yan-etkilerini (order-update,
      history, çift bildirim/mail) yapar. processRefund patlarsa claim `return_delivered`'a geri
      alınır → cron retry eder. (Money-safety zaten processRefund'ın refundInProgress marker'ında.)
      **Spec:** 2 MONEY-M1 testi.
- [x] **4.3 — Payout void yarışları (MONEY-M2/M3)** ✓ (A) `createPayoutsForReleasedHolds`
      artık `frozenByRefundId: null` + siparişte AÇIK iade talebi varsa payout OLUŞTURMUYOR
      (yarış: hold release edilip hemen sonra iade açılırsa freeze `held` hedeflediğinden
      `released` hold'u kaçırıp çift-kayıp yaratıyordu). (B) processRefund `paytrRefunded`
      flag'i: PayTR iadeyi YAPMADAN patlarsa PayTR-öncesi void'lenen payout'lar
      (`order_refunded`) `pending`'e GERİ ALINIYOR (satıcı ödenebilsin); PayTR başardıysa
      void kalıyor. **Spec:** 2 MONEY-M3 testi.
- [x] **4.4 — PayTR-iade/DB-fail reconciliation (MONEY-M4)** ✓ `reconcileStuckRefundMarkers`
      sweep'i (scheduler step): PayTR iadesi yapılıp DB finalize'ı (tx) patlayan siparişleri
      (`refundInProgressOrders` marker'ı takılı, `refundedOrders`'ta yok) marker'daki TUTARLA
      finalize eder (PayTR marker sayesinde atlanır). Marker artık `{amount,at}` saklıyor (doğru
      tutar) ve başarılı finalize'da temizleniyor (undefined → sweep sorgusu şişmez). **Spec:**
      3 MONEY-M4 testi (eski timestamp formatı da destekleniyor).
- [x] **4.5 — Trade dispute/release sıralaması (MONEY-M5/M6/M8)** ✓ (M5) `resolveDispute`
      iade + Sürat iptalinden ÖNCE trade'in `disputed` olduğunu doğruluyor (eskiden tx guard'ı
      sonradan patlıyor ama para çoktan iade ediliyordu). (M8) admin `releaseTradePaymentHold`
      yalnız `completed` takasta serbest bırakıyor (disputed/returning'de recipient'e ödeyip
      sonra iade → çift kayıp). (M6) release öncesi statü re-check: releaseHoldsDue cron
      (order + trade) ve `releasePayment` (held+frozenByRefundId:null) zaten guard'lı — admin
      manuel trade yolu M8 ile kapatıldı. **Spec:** 3 MONEY-M8 testi.
- [x] **4.6 — Düşük (MONEY-L1) ✓ + L3/L4/L7 ertelendi** `manualRefund` artık orderId NULL
      grup/trade ödemelerini doğru yönlendiriyor (trade → refundTradeCashTracked; grup → net
      hata; tekil → processRefund) — eskiden `processRefund(null)` karışıktı. **Spec:** 3 L1
      testi. **Ertelenen:** L3 (ledger `waived` drift) + L4 (stopaj kısmi) → Faz 10; L7 (birleşik
      gelir defteri) → Faz 6 (ledger).

---

## Faz 4c — PayTR gözlemlenebilirlik / veri yakalama · `feat/paytr-provider-observability`

> PayTR zaten zengin işlem verisi döndürüyordu (payment_type, taksit, currency, kart
> banka/şema, ham zarf) ama BÜYÜK ÇOĞUNLUĞU ATILIYORDU. Bu, muhasebe/mutabakat, müşteri
> desteği ("hangi kart/taksit"), chargeback savunması ve raporlama için gerçek bir eksikti.
> Direkt API dokümanları (1./2. adım, kart-saklama, taksit/BIN sorgu) esas alınarak yakalandı.
> Bu faz, Faz 5.3 (outbox) ve Faz 6.5 (ledger vs PSP raporu mutabakatı) için VERİ TEMELİDİR.

- [x] **4c.1** `payment_provider_events` append-only PSP denetim günlüğü (yapısal alanlar + ham zarf).
      Her PayTR yanıtı yazılır: callback (hashValid dahil), Direkt API, recurring çekim, iade.
      GÜVENLİK: PAN/CVV asla saklanmaz (PayTR yanıtları içermez; 3DS HTML de saklanmaz).
- [x] **4c.2** Callback DTO + parseCallback zenginleştirme: PayTR'nin POST'ladığı `payment_type`,
      `installment_count`, `currency`, `payment_amount`, `test_mode` artık kabul + kayıt (whitelist
      bunları siliyordu). Payment.installmentCount + currency GERÇEK değerle güncelleniyor
      (önceden istekteki default 1'de takılıydı); metadata.paymentMethod'a da yazılıyor.
- [x] **4c.3** durum-sorgu (`queryPaymentStatus`) artık payment_type/taksit + ham zarfı döndürür.
- [x] **4c.4** Kart saklama (CAPI): `capiListCards` + SavedCard artık banka (c_bank), şema (schema),
      credit/debit (c_type), kurumsal (businessCard) meta'sını tutar; listSavedCards bunları döndürür.
- [x] **4c.5** Aylık üyelik (recurring): MembershipPayment'a merchant_oid + payment_type + ham yanıt;
      senkron `failed` (kart kapalı — callback ÜRETMEZ) artık recurring_charge olayı ile yakalanır.
- [x] **4c.6** Kayıtlı kartla ödeme (CIT) artık doküman-doğru servisle yapılır:
      `capiPaymentByRegisteredCard` (recurring_payment GÖNDERİLMEZ, require_cvv/cvv, hash Direkt API
      ile birebir). Önceden interaktif kayıtlı-kart ödemesi recurring servisine (recurring_payment=1)
      düşüyordu — bu merchant-initiated bir işlem değil; 3DS muafiyeti/itiraz sorumluluğu açısından
      yanlıştı. Oto-yenileme yalnız `chargeRecurring` kullanır. Olay `direct_payment` (savedCard:true).
- [x] **4c.7** `status_inquiry` olayı: durum-sorgu ile TELAFİ edilen (callback kaçırılmış) ödemeler
      artık kaydedilir — reconcile cron, orphan-capture taraması ve istemci-tetikli verify. Yalnız
      BULUNAN sorgu yazılır (başarısız pollingler değil → tablo gürültüsü yok).
- [x] **4c.8** BIN/taksit doküman düzeltmesi: eski `getInstallmentOptions` bin-detail'i YANLIŞ hash
      sırası + YANLIŞ yanıt şemasıyla çağırıyordu. Ayrıştırıldı: `lookupBin` (bin-detail, hash =
      bin+mid+salt) ve `getInstallmentRates` (taksit-oranlari, hash = mid+request_id+salt).
- [x] **4c.9** Frontend: kayıtlı kart listesi (web profil + checkout, mobil) artık banka + şema
      (VISA/MASTERCARD…) + kredi/banka kartı + kurumsal rozetini gösterir.
- [ ] **4c.10** (Faz 5/6'ya devir) Admin/BI: olay günlüğünden ödeme-yöntemi/taksit raporları;
      ledger entry'leri bu olayları kaynak alır.

---

## Faz 5 — Outbox pattern (para yan-etkileri) · `fix/payment-hardening-outbox-ledger-bull`

> "post-commit best-effort .catch(log)" para yan-etkilerini güvenilir kılar.

- [x] **5.1** ✓ `outbox_events` tablosu (type, payload, status, attempts, maxAttempts, nextAttemptAt,
      **dedupeKey unique** = idempotency, lastError). Migration `20260723090000_outbox_events`.
- [x] **5.2** ✓ `OutboxService.enqueue(tx, …)` para mutasyonuyla **AYNI** tx'e yazar (rollback'te geri
      alınır; dedupe hariç hata FIRLATIR — best-effort DEĞİL). `OutboxDrainerService` (`@TrackedCron`,
      `moneyCronsViaBull` gate'li → Faz 7'de Bull) `pending & nextAttemptAt<=now`'ı CAS ile claim edip
      handler'a verir: başarı→completed, hata→exp-backoff retry, maxAttempts→`dead` (DLQ + alarm).
      `OutboxHandlerRegistry` (type→idempotent handler, domain servisleri onModuleInit'te kaydeder).
      `@Global OutboxModule`. **Spec:** enqueue (dedupe/tx-güvenli) + drainer (retry/backoff/dead/CAS).
- [x] **5.3** ✓ Taşınan yan-etkiler (hepsi iade commit'iyle ATOMİK outbox satırı; anlık post-commit
      tetik hızlı-yol kalır, outbox çökmeye dayanıklı backstop; handler'lar idempotent; enjeksiyon
      `@Optional` → para testlerinde sıfır churn):
  - **Sürat gönderi iptali (iade)** → `shipment.cancel`.
  - **eLogo e-Arşiv ters kaydı (tam iade)** → `invoice.refund_reverse`.
  - **eLogo takas-nakit iade ters kaydı** → `invoice.trade_cash_refund_reverse` (persist tx'inde atomik).

  **KARAR — PayTR iade ÇAĞRISI bilinçli olarak outbox'a TAŞINMADI:** `createRefund`'ı outbox'a almak
  iadeyi senkron→async yapardı ve `refundInProgress` marker + `reconcileStuckRefundMarkers` sweep'i
  (Faz 1.1/4.4) zaten bu para çağrısının outbox-eşdeğeri güvenilirliğini SAĞLIYOR (marker = idempotency
  anahtarı). Admin/çağıranların beklediği senkron iade sonucunu bozmamak için marker-tabanlı bırakıldı.
  Fulfillment yan-etkileri (eLogo fatura, bildirim, Sürat oluşturma) → Faz 8.1 event-driven ile ele alınır.

---

## Faz 6 — Birleşik ledger (double-entry) · `fix/payment-hardening-outbox-ledger-bull`

> Bakiye/tutar tutarlılığının tek kaynağı; kısmi iade doğruluğunun yapısal temeli.

- [x] **6.1** ✓ Değişmez `ledger_entries` (entryGroupId, eventType, account, direction, amount,
      soft ref'ler). `LedgerService.record(tx, …)` DENGELİ grup zorlar (Σdebit==Σcredit, değilse
      FIRLATIR); append-only (güncelleme/silme yok; düzeltme = ters kayıt). Migration
      `20260723100000_ledger_entries`. **Spec:** denge zorlaması + negatif reddi + recordCapture.
- [x] **6.2** ✓ Ana para olayları çift-taraflı deftere yazılıyor (hepsi @Optional + best-effort;
      defter hatası para akışını BOZMAZ; reconciliation açığı yakalar):
  - **`payment_captured`** (`recordCapture`): buyer_payment = seller_escrow + platform_commission +
    withholding_tax; fulfillment tekil + grup, POST-COMMIT.
  - **`payout_completed`** (`PayoutService`): seller_escrow (credit) = payout (debit) → escrow settle;
    capture'ın escrow debit'ini dengeler → sipariş bazında escrow net 0.
  - **`refund_issued`** (`recordRefund`): dış çıkış (refund) = capture'ın ORANSAL ters kaydı
    (ratio = refund/orderTotal; komisyon/stopaj yuvarlanır, seller_escrow kalanı emer → drift'siz
    dengeli); iade finalize tx'inde. **Spec:** tam/kısmi iade denge + dejenere-null.
    **Devam (6.3'e):** hold_release (nakit değil, iç yeniden-sınıflama) + trade_commission (takas alt-sistemi,
    takas capture ledger'ı henüz yok) → tam per-hesap bakiye türetimiyle birlikte.
- [x] **6.3** ✓ Bakiyeler defterden OKUNUYOR — `LedgerBalanceService` (CQRS read-model): siparişin
      `captured` (Σ buyer_payment credit), `refunded` (Σ refund debit), `remainingRefundable` (yapısal
      kısmi-iade tavanı) ve `escrowNet` (signed seller_escrow) değerlerini Payment/Hold'dan DEĞİL,
      değişmez `ledger_entries`'ten türetir. Tek türetim otoritesi (`deriveOrderBalances` saf fonksiyonu)
      hem tek-sipariş DB sorgusunda hem de reconciliation'ın pencere satırlarında AYNI mantığı koşar (DRY).
      `LedgerReconciliationService`'e 3. invaryant eklendi: defter-native sipariş-bazlı fazla-iade
      (Σ refund > Σ capture → `LEDGER_OVER_REFUND` alarmı) — Payment metadata'ya değil deftere dayanır,
      6.5'in "ledger vs Payment" çapraz-doğrulamasını sertleştirir. **Spec:** türetim + DB + escrow +
      reconcile over-refund. **Kapsam kararı:** para YAZMA yolunu (refund tavanı/payout uygunluğu)
      defterden ZORLAMAK (Payment/Hold'u kaynak olmaktan tamamen çıkarmak) bilinçli ERTELENDİ — defter
      @Optional + best-effort (eksik/gecikmeli olabilir), onunla para akışını BLOKLAMAK "defter hatası
      parayı bozmaz" invaryantını çiğnerdi; defter OKUMA/çapraz-doğrulama kaynağıdır.
- [x] **6.4** ✓ Sipariş + takas komisyonları TEK deftere birleşti (MONEY-L7). Eski `commission_ledger`
      yalnız SİPARİŞ komisyonuydu (`orderId @unique`); takas komisyonu takas alt-sisteminde ayrıydı.
      `LedgerService.recordTradeCashCapture` takas nakit yakalamasını (payer totalAmount = recipient net +
      platform komisyon) çift-taraflı deftere yazıyor → takas komisyonu da sipariş komisyonuyla AYNI
      `platform_commission` hesabına düşer; gelir tek yerden (Σ platform_commission) sorgulanır. Takas
      escrow'u trade `payout_completed` ile kapanır → sipariş akışıyla aynı yaşam döngüsü. Fulfillment
      trade-cash yolunda POST-COMMIT best-effort (@Optional). **Spec:** takas capture denge + tradeId ref.
- [x] **6.5** ✓ `LedgerReconciliationService` GÜNLÜK drift denetimi (`@TrackedCron 0 4 * * *`,
      moneyCronsViaBull-gate → Faz 7 Bull). Yalnız OKUR; sert invaryant ihlalinde greplenebilir ALARM:
      (1) defter dengesi (her grup Σ=0), (2) fazla-iade (ΣrefundedOrders > payment.amount). **Spec:**
      dengeli/dengesiz + fazla-iade. (Tam "ledger vs Payment/Hold/Payout vs PSP" mutabakatı 6.3 sonrası
      sertleşir; PSP kaynağı Faz 4c `payment_provider_events`.)

---

## Faz 7 — Dayanıklılık: Bull migrasyonu + ayrı worker · `fix/payment-hardening-outbox-ledger-bull`

> "Sistem çökse bile çalışsın" isteğinin gerçek karşılığı. Faz 0 önkoşul.

- [x] **Yeni PARA cron'ları Bull-hazır (KRİTİK):** Faz 5 `outbox-drain` (`*/1`) ve Faz 6
      `ledger-reconcile` (`0 4`) artık `scheduled` kuyruğuna repeatable kayıt + `@Process`
      handler'a sahip (OutboxScheduledProcessor / LedgerScheduledProcessor). Aksi halde
      `MONEY_CRONS_VIA_BULL=true` flag'i bu crons'ları SESSİZCE durduracaktı (gate var, Bull
      yok). Artık payout/payment/refund ile aynı desen — tek mekanizma flag'iyle tutarlı.
- [x] **7.1** ✓ Tüm saf `@Cron`'lar dual Bull desenine taşındı: `elogo-scheduler` (EVERY_30_MIN),
      `featured-scheduler` (`15 3 * * *`), `search-sync` saatlik reconcile (EVERY_HOUR). Kod tabanında
      artık **HİÇ saf `@Cron` YOK** — her zamanlanmış iş `@TrackedCron` (gate) + Bull repeatable +
      `@Process` handler'a sahip. Flag açılınca (Faz 0 sonrası) hepsi Bull'a geçer, in-process temizlenir.
- [~] **7.2** ✓ (KOD) Process-rol ayrımı env ile yapılabilir hâle geldi (`PROCESS_ROLE`: `all`
  varsayılan tek-process | `web` yalnız HTTP | `worker` başsız). `src/process-role.ts` helper +
  spec. `AppModule` `WorkerModule`'ü artık `runsQueueWorkers()` ile koşullu import ediyor →
  `PROCESS_ROLE=web`'de API ağır kuyruk worker'larını (email/push/image/payment/search/analytics/
  moderation) YÜKLEMEZ; varsayılan `all`'da yüklenir (davranış değişmez, tek-process deploy bozulmaz).
  `worker.ts` artık `WorkerModule` yerine `AppModule`'ü BAŞSIZ application-context olarak yüklüyor →
  ayrı worker hem klasik kuyrukları hem de feature modüllerine gömülü `scheduled` processor'ları
  (outbox-drain, ledger-reconcile, payout, membership, boost, …) koşturur ("worker.ts ilgili modülleri
  yüklesin" karşılandı). `entrypoint.sh` artık ROL-FARKINDA: `PROCESS_ROLE=worker`'da migration'ı atlayıp
  `node dist/worker`, aksi halde migrate + `node dist/main` başlatır (varsayılan davranış aynı) → TEK imaj
  iki Coolify servisi olarak boot edebilir. **KALAN (OPS):** 2. Coolify servisi (aynı imaj, env
  `PROCESS_ROLE=worker`) + API servisine `PROCESS_ROLE=web` + Faz 0 (ayrı Redis) — saf deploy adımı.
- [x] **7.3** Idempotency: para job'ları Faz 1-2 CAS ile idempotent; yeni outbox (CAS claim +
      dedupeKey + idempotent handler) ve ledger (dengeli record + best-effort capture) tasarımca
      idempotent — Bull at-least-once güvenli.
- [~] **7.4** DLQ: outbox `dead` statüsü + alarm (maxAttempts). Bull kök `defaultJobOptions`
  (attempts:3 + exp backoff) mevcut. `lockDuration/stalledInterval` ince ayarı → ops.
- [x] **7.5** ✓ Cutover TAMAM — Bull artık TEK zamanlama mekanizması. Flag'ler (`CRONS_VIA_BULL` /
      `MONEY_CRONS_VIA_BULL`) ve **28 in-process `@TrackedCron` ikizi** 16 zamanlayıcı dosyasından kaldırıldı;
      `registerRepeatableCron` koşulsuz kayıt yapan 4-arg imzasına indi (her cron `onModuleInit`'te repeatable
      olarak kaydolur). Gerçek iş metotları (`run*()`) korundu — Bull `@Process` handler'ları onları
      `runTrackedJob` ile çağırıyor. Silinen ikizleri çağıran manuel-tetik yolları (admin test-araçları,
      dev controller) `run*()`'a yönlendirildi (bonus: eski butonlar flag açıkken no-op'tu, artık her zaman
      çalışır). Doğrulama: 28:28:28 twin↔registration↔@Process eşleşmesi denetlendi (hepsi COVERED, hiçbir cron
      düşmedi) + typecheck temiz + tam test paketi yeşil (yalnız 4 ÖNCEDEN-VAR alakasız hata: list/sort/order-detail).
      **Gözlemlenebilirlik korundu:** in-process ikizler gidince `@TrackedCron`'un beslediği `/admin/jobs` +
      Sentry Cron check-in kaybolacaktı → `runTrackedJob` (tek Bull yürütme yolu) artık CronTracker'ı besliyor
      (zamanlama repeatable job `opts`'undan); ölü `tracked-cron.decorator.ts` silindi. **Not:** üretimde Bull'a
      tam güven için Faz 0 (ayrı Redis + `noeviction` + AOF) hâlâ önkoşul — kod artık flag'siz Bull-only.

---

## Faz 8 — Event-driven fulfillment + god-service parçalama · `refactor/payment-fulfillment-decompose`

- [x] **8.1** ✓ Ödeme başarı akışı, para tx'i (claim + preparing + stok + escrow hold) commit olduktan
      SONRA `order.fulfillment-requested` EVENT'i yayıyor; yeni `OrderFulfillmentListener` tüketip fiziksel
      siparişin POST-COMMIT sonlandırmasını (ledger capture + order.paid + Sürat) `FulfillmentFinalizer`'a
      devrediyor. Böylece `PaymentFulfillmentService` sipariş sonlandırmasında FulfillmentFinalizer'a DOĞRUDAN
      bağlı değil (DIP) ve tekil↔grup yolu AYNI seam'i paylaşıyor (DRY). Escrow-hold ATOMİK tx'te KALDI (not'taki
      "ödeme tamam ama hold yok" penceresi açılmadı). Zamanlama korundu (`emitAsync` awaited → sonlandırma dönmeden
      önce tamamlanır; tek değişiklik dispatch); listener best-effort (try/catch) → fulfillment hatası ödemeyi
      BOZMAZ (ikinci savunma hattı; finalizer zaten adım-adım best-effort). **Spec:** listener delegasyon + hata-yutma;
      grup spec seam'i (`emitOrderFulfillmentRequested` ×2, skipBuyer) doğruluyor (finalizer efekti listener spec'inde).
- [x] **8.2** ✓ God-service parçalama TAMAMLANDI — 5 cohesive, tek-sorumluluklu servis çıkarıldı
      (her biri kendi odaklı karakterizasyon testiyle): - `FulfillmentNotifier` — stokout kaskad bildirimi (tekil=grup birebir kopya) + back-in-stock. - `FulfillmentFinalizer` — fiziksel sipariş POST-COMMIT sonlandırması (ledger capture + order.paid + Sürat). - `EscrowHoldService` — escrow hold + pending komisyon (in-tx; tekil=grup). - `FulfillmentStockService` — stok düşümü + stockout kaskadı (in-tx; FOR UPDATE + fiziksel-quantity-gate). - `VirtualOrderFulfillmentService` — üyelik/boost aktivasyonu (in-tx) + eLogo fatura (post-commit).
      Yöntem: disiplinli "önce test, sonra çıkar" — her in-tx çıkarımı odaklı unit testle kilitlendi + grup
      entegrasyon spec'i yeşil. Ölü `invoiceService` + kullanılmayan `ledger`/`commissionLedger`/`productLock`
      deps temizlendi. **PaymentFulfillmentService: 1643 → 984 satır (−659, %40, artık <1000).**
- [~] **8.3** 8.2'nin paylaşılan servisleri (stock/escrow/notifier/finalizer) tekil↔grup kopyasının BÜYÜK
  kısmını zaten sildi. Kalan tekil-vs-grup farkı KÜÇÜK ve GERÇEK (tekil: sanal sipariş + doğrudan alıcı
  bildirimi; grup: gruplu alıcı e-postası) → tam "group-of-one" collapse artık düşük-değerli + bu farklar
  yüzünden birebir birleşmiyor. Kalan boilerplate (claim + preparing) küçük; istenirse ortak bir
  `claimAndPromote(tx, payment)` helper'ı ile eritilebilir.
- [x] **8.4** ✓ Fulfillment'taki `ModuleRef` + runtime `require("../trade/trade.service")` lazy-resolve
      hack'i (Trade↔Payment döngüsünü aşmak için) KALDIRILDI. Nakit takas ödemesi temizlenince Payment
      in-process event yayınlar (`EventService.emitTradeCashCleared` → EventEmitter2 `payment.trade-cash-cleared`);
      Trade tarafındaki `TradeCashClearedListener` (@OnEvent) `createInboundTradeShipments`'ı çağırır. Payment
      artık Trade'e statik VEYA runtime bağımlılık taşımaz; `ModuleRef` fulfillment ctor'undan çıktı (spec churn
      yok — `new` spec'in fazladan arg'ı @Optional ledger'a düşüyor). **Spec:** trade + events + fulfillment yeşil.

---

## Faz 9 — Tipleme + config + test · `chore/payment-hardening-quality`

- [x] **9.1** ✓ `PaymentMetadata` interface + `asPaymentMetadata()` helper (payment-metadata.types.ts)
      — metadata'nın her yerdeki `as any` cast'lerine tipli, permissive tek kaynak. `collectPaymentOids`,
      `isChargeLikelyLive`, M4 sweep uygulandı (kalan sitelere kademeli benimsenebilir). (`PaymentWithContext`
      Prisma-payload retrofit'i + 4 fulfillment/5 initiation `any` → kademeli, Faz 8 refactor'ıyla birlikte.)
- [x] **9.2** ✓ `payment.constants.ts` — `MONEY_EPSILON` (0.01) + tüm env config anahtarları/varsayılanları
      tek referans. `MONEY_EPSILON` refund-karar epsilon'larına uygulandı. (Riskli toplu 0.01 değişimi
      yapılmadı — kademeli.)
- [x] **9.3** ✓ (kısmen — mevcut kod için tamamlandı) Faz 1-4'te eklenen ~24 spec + yeni `releaseHoldsDue`
      (4 test) ve `handleOrderDelivered` (2 test) çekirdek escrow yolları artık testli. processRefund order/partial,
      reconciler (group/orphan/M3/M4), CAS reset/cancel, canlı-3DS, verify oid-history, trade-cash iade hepsi
      kapsandı. (Outbox worker + ledger testleri → o fazlar kurulunca.)
- [x] **9.4** ✓ `payment-trade-cash-refund.spec.ts` `describe.skip` KALDIRILDI — stale/drifted spec;
      kapsamı zaten `payment-trade-cash-refund-b3.spec.ts`'te (üstelik MONEY-H1 + FLOW-M5 testleriyle) → silindi.

---

## Faz 10 — Kalan düşük-önem temizlik

- [ ] FLOW-L1 (SavedCard grup/trade), FLOW-L2/MONEY-L2 (restock miktar), FLOW-L3 (üyelik sibling), FLOW-L4 (boost debris), SEAM-B6 (kargo ücreti tek-kaynak: üye-offer kargo, quote≠checkout, kısmi-iade kargo kuralı), SEAM-B7 (admin 4. teslim yolu → `handleOrderDelivered`'a bağla), SEAM-B8/B9.

---

## Faz 11 — Kargo/Ödeme denetim bulguları (review follow-up) · `fix/payment-hardening-outbox-ledger-bull`

> 2026-07-23 kod incelemesi (payment + surat-cargo + entegrasyon, 3 paralel denetim).
> Çekirdek güvenlik (callback sahteciliği/replay/çifte-çekim, kart verisi) SAĞLAM doğrulandı;
> money→cargo yönü (event+outbox) örnek. Kalan borç: birkaç SOMUT güvenlik açığı + hâlâ duran
> god-service'ler + cargo→money yönünün concretion bağımlılığı. Sıra: önce ucuz güvenlik, sonra
> dikkatli güvenlik/doğruluk, sonra refactor.

### 11.1 — Hızlı güvenlik kazanımları (düşük risk, küçük edit)

- [~] **11.1a (G1)** ✓ (kısmi) Kimlik içeren Sürat takip/sil URL'i TEK chokepoint'e alındı
  (`buildAuthedSuratUrl`, 3× kopya birleşti) + `redactSuratUrl` ile tüm hata log'ları maskeleniyor
  (Sifre asla loglanmaz/breadcrumb'a girmez). **Ertelendi:** kimliği query'den body/header'a taşımak
  Sürat API sözleşmesi doğrulaması gerektiriyor (bu uçlar query-auth; canlı test edilemedi → wire
  formatı korundu). `surat-cargo/surat-tracking.service.ts:46-67,106,176,320`.
- [x] **11.1b (G3)** ✓ Refund bypass PROD'da ASLA aktif değil (`NODE_ENV!=='production'` konjunksiyonu) —
      completion SEC-H1 ile simetrik ikinci savunma hattı (worker refund cron'ları main.ts boot-guard'ını
      çağırmaz). Yanlış env → gerçek PayTR iadesi çalışır. `payment/payment-refund.service.ts:244,997` (order+trade).
- [x] **11.1c (G4)** ✓ Tam IBAN log'u last-4 maskeye indi (`maskIban` helper; email'le simetrik). KVKK.
      `payout/payout.service.ts:350`.
- [x] **11.1d (G5)** ✓ Webhook ham payload verbatim log kaldırıldı → yalnız `tracking`+`status` whitelist.
      `shipping/shipping.service.ts:376`.

### 11.2 — Güvenlik/doğruluk (dikkat isteyen)

- [x] **11.2a (G2)** ✓ Public delivered-webhook VARSAYILAN KAPALI: yalnız `SHIPPING_WEBHOOK_ENABLED=true` iken
      çalışır (kapalıyken 404 → uç görünmez) + gövde doğrulama (trackingNumber+status string zorunlu). Sürat
      poll-tabanlı olduğundan gerçek callback yok → forge edilmiş "delivered" ile escrow-erken-başlatma yüzeyi
      varsayılan olarak kalktı; gerçek imzalı callback gelirse flag ile açılır. `shipping/shipping.controller.ts:142`.
- [x] **11.2b (G6)** ✓ Atomik `FOR UPDATE` iade claim'i (`claimRefundSlot`): payment satırını kilitle, metadata'yı
      TX İÇİNDE TAZE oku, kümülatif tavan + order-başı marker'ı KİLİT ALTINDA kontrol et, yoksa yaz. Eşzamanlı kısmi
      iadeler artık marker'ı yarışarak oku-yaz edemez → çift-PayTR penceresi kapandı. PayTR çağrısı kilit DIŞINDA (HTTP
      gecikmesi kilidi tutmaz). Marker/recovery/reject sözleşmesi korundu; bu metod 11.3b `RefundCapPolicy`/claim
      bileşeninin tohumu. **Spec:** refund-partial mock stateful (claim yazar, finalize tazeler) → 130 test yeşil.
- [x] **11.2c** ✓ Poll `delivered`→escrow ATOMİK: CAS flip + `handleOrderDelivered(tx)` tek `$transaction`'da
      (webhook yoluyla aynı desen; hata → rollback → sonraki poll retry). Bildirim + event-sync POST-COMMIT.
      Artık çökme escrow'u askıda bırakmaz. `surat-cargo/surat-tracking.service.ts`.
- [~] **11.2d** → **11.3b'ye taşındı.** Refund tx'inden dış I/O'yu (`emitPaymentRefunded`/bildirim/e-posta)
  post-commit'e almak `RefundFinalizer` çıkarımının doğal parçası — split'le birlikte. `payment/payment-refund.service.ts:715-781`.

### 11.3 — SOLID: god-service parçalama + cargo→money event'leme

- [x] **11.3a** ✓ (böl) `SuratTrackingService` (1808 → **121 satır facade**) 6 cohesive alt-servise bölündü:
      `SuratTrackingClient` (ham HTTP + probe'lar + URL helper'ları) / `OrderTrackingSyncService` / `TradeTrackingSyncService`
      / `RefundReturnTrackingSyncService` / `BarcodeRetryService` / `CargoAlertingService`. STRICT PURE MOVE (metod
      gövdeleri birebir; yalnız wiring). Facade aynı 12 public imzayla delege; çağıranlar (shipping-scheduler, admin,
      admin-shipping) DEĞİŞMEDİ. **11.2c atomik delivered-tx birebir korundu** (order-sync'te tek `$transaction`). ModuleRef
      para hop'ları verbatim taşındı (event'e ÇEVRİLMEDİ — atomiklik korunur). tsc temiz; 152 test yeşil (0 yeni hata).
      **NOT (11.3a-event + 11.4b ertelendi):** cargo→money'yi event'e çevirmek delivered atomikliğiyle çelişir (atomiklik
      kazanır); sync-loop DRY (11.4b) logic konsolidasyonu — bu dosyanın spec'i YOK → önce karakterizasyon testi gerekir.

- [ ] **11.3b** `PaymentRefundService` (1537) böl: `RefundCapPolicy` / `RefundExecutor` / `RefundFinalizer(tx)`.
      `processRefund` tek başına ~770 satır. Büyük.
- [x] **11.3c** ✓ `PaymentReconciliationService` (1483 → **91 satır facade**) 5 cohesive alt-servise bölündü
      (`Reservation`/`PaymentExpiry`/`Psp`/`Refund`/`Misc` Reconciliation). Facade aynı public imzalarla delege
      ediyor (PaymentService/scheduler değişmedi); her alt-servis yalnız kullandığı dep'i alıyor; ölü
      `InvoiceService` inj. temizlendi; paylaşılan private helper yok. 7 spec construction güncellendi; 130 test yeşil.

### 11.4 — DRY + tipleme

- [x] **11.4a** ✓ Sürat `SuratGonderiPayload` **8 build site (6 dosya)** tek `buildStandardGonderiPayload(...)`'a
      indi (`surat-cargo/surat-address.util.ts`) — standart zarf + tek normalizasyon noktası; çağırana özgü
      sapmalar (`KisiKurum` fallback zincirleri, admin-test raw telefon) `overrides` ile BYTE-IDENTICAL korundu.
      Ölü Sürat enum import'ları temizlendi. tsc temiz; surat/payment/refund/trade 163 test yeşil.
- [ ] **11.4b** Tracking sync/apply **3× kopya** (order/trade/refund-return: `syncAllActive*` + `applyTrackingUpdate`
      / `syncTradeShipmentTracking` + `sync*Events`) → entity-adapter'lı generic sync core.
- [x] **11.4c** ✓ İkiz `portion`/`ledgerPortion` (hold tüketimi + ledger pro-rate, birebir aynı formül) tek
      `refundPortion(amount, threshold)` otoritesine indi. NOT: `ledger.recordRefund` ratio'su (refund/orderTotal)
      ve `refund.computeRefundAmount` (adet formülü) FARKLI semantik → bilinçli ayrı bırakıldı. tsc temiz; refund 28 test yeşil.
- [ ] **11.4d** Para nesneleri `any` (`payment: any`/`order: any`/`metadata as any` yaygın) → mevcut `PaymentMetadata` + tipli order shape'i tutarlı uygula (derleme-zamanı `amount`/`status` güvenliği).

### 11.5 — DIP / abstraction

- [x] **11.5a** ✓ Payment→Sürat DIP: yeni `CargoProvider` arayüzü + `CARGO_PROVIDER` token (`surat-cargo/cargo-provider.ts`);
      `SuratCargoService implements CargoProvider`; modül `{provide:CARGO_PROVIDER, useExisting:SuratCargoService}` export ediyor.
      `PaymentCommonService` artık somut servise değil `@Inject(CARGO_PROVIDER)` ile arayüze bağlı (payload inşası zaten 11.4a
      ile surat modülünde). 2 spec'e token provider eklendi. tsc temiz; 192 test yeşil (yalnız pre-existing tracking-url hatası).
- [ ] **11.5b** `IPaymentProvider` PayTR-shaped (ISP/LSP: `RestSuratClient extends SoapClient` "not supported" throw'lar;
      capi/transfer generic para-yolundan ayrık değil). Generic para metotlarını sağlayıcı-özel yeteneklerden ayır. Düşük-orta.

---

## Bağımlılık haritası (neden bu sıra)

```
Faz 0 (Redis) ───────────────┐
Faz 1 (para bug) ── acil       ├─▶ Faz 7 (Bull/worker) idempotency'ye bağlı
Faz 2 (reconcile) ── PSP kaynak │
Faz 3 (güvenlik) ── bağımsız    │
Faz 4 (hold/refund) ◀── Faz 1   │
Faz 5 (outbox) ◀── Faz 1/2      │
Faz 6 (ledger) ◀── Faz 1.4/4    │
Faz 8 (event/refactor) ◀── Faz 2/5
Faz 9 (test/tip) ── her fazla birlikte artımlı
```

- **Faz 1 önce** (kullanıcı önceliği: para kaybı).
- **Faz 2** hemen ardından (H1/H2/H3 aynı kök, PSP reconciliation).
- **Faz 3** paralel gidebilir (güvenlik, bağımsız).
- **Faz 5/6** yapısal temel; Faz 1'deki yamaları kalıcılaştırır.
- **Faz 7** en son "çökme dayanıklılığı" — Faz 0 + idempotency (Faz 1/2) tamamlanmadan bayrak açılmaz.

## Çalışma kuralı

- Her faz ayrı branch, anlamlı commit'ler, İngilizce mesaj (Co-Authored yok), her adımda typecheck + ilgili testler yeşil.
- Her madde çözülünce burada `[x]` + ilgili commit.
- Faz bitince kısa özet + "nerede olduğumuzu" bildir; sıradaki faza geçmeden önaylat.
</content>
