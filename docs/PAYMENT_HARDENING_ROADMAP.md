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

- [ ] **3.1 — `bypass-complete` kilitle (SEC-H1)** `payment.controller.ts:383-392`. Auth + ownership + servis içinde `NODE_ENV!=="production"` guard; `GET /payments/config` `bypassEnabled` sızdırmasın.
- [ ] **3.2 — `confirm-failed` ownership (SEC-M1)** `payment.controller.ts:345-360`. Sahiplik kontrolü ekle (griefing/fon-sıkıştırma).
- [ ] **3.3 — Düşük (SEC-L1/L2/L3):** kimliksiz pending-fiyat ifşası (auth iste), guest e-posta enumerasyonu (uniform yanıt), oid entropi notu.

---

## Faz 4 — İade/hold yapısal doğruluk + terminal kaçış · `fix/payment-hardening-refund-holds`

- [ ] **4.1 — Donuk hold terminal kaçışı (MONEY-H6)** admin "iadeyi reddet/kapat" aracı + `wait_for_delivery` timeout + `unfreezeHoldForRefund` her iade-terminal yolunda. (`return_shipment_open` kısmı retry-branch D25'te; doğrula.)
- [ ] **4.2 — `finalizeRefundForReturnedShipment` concurrency-safe (MONEY-M1)** atomik marker/CAS (3 çağıran: cron + Sürat sync + admin).
- [ ] **4.3 — Payout void yarışları (MONEY-M2/M3)** iade sırasında oluşan `pending` payout void; PayTR fail'de payout geri-al; `createPayoutsForReleasedHolds` açık-iade/frozen kontrol etsin.
- [ ] **4.4 — PayTR-iade/DB-fail reconciliation (MONEY-M4)** `refundInProgressOrders` marker'ını tarayan bir sweep (bugün hiçbir job taramıyor).
- [ ] **4.5 — Trade dispute/release sıralaması (MONEY-M5/M6/M8)** `resolveDispute` doğrulamadan önce iade etmesin; release öncesi statü re-check; admin `releaseTradePaymentHold` trade-status guard'ı.
- [ ] **4.6 — Düşük (MONEY-L1/L3/L4/L7):** `manualRefund` grup/trade null-orderId; ledger `waived` drift; stopaj kısmi; birleşik gelir defteri notu (Faz 6'ya bağlanır).

---

## Faz 5 — Outbox pattern (para yan-etkileri) · `fix/payment-hardening-outbox`

> "post-commit best-effort .catch(log)" para yan-etkilerini güvenilir kılar.

- [ ] **5.1** `outbox` tablosu (event tipi, payload, status, attempts, nextAttemptAt).
- [ ] **5.2** Para mutasyonuyla AYNI tx'te outbox satırı; ayrı worker retry+backoff+DLQ ile boşaltır.
- [ ] **5.3** Taşınacak yan-etkiler: PayTR iade çağrısı, Sürat gönderi iptali, takas nakit iadesi, fatura üretimi, bildirim fan-out. (SEAM-B2, MONEY-H1/H2 ile kesişir — outbox onların kalıcı çözümü.)

---

## Faz 6 — Birleşik ledger (double-entry) · `fix/payment-hardening-ledger`

> Bakiye/tutar tutarlılığının tek kaynağı; kısmi iade doğruluğunun yapısal temeli.

- [ ] **6.1** Değişmez `ledger_entry` (debit/credit, hesap, tutar, para olayı ref).
- [ ] **6.2** Her para olayı (ödeme, komisyon, hold, release, payout, iade, takas komisyonu) bir entry; bakiyeler türetilir.
- [ ] **6.3** Hold tüketimi/kısmi iade ledger'dan okusun (Faz 1.4'ün yapısal hâli).
- [ ] **6.4** Sipariş + takas komisyonlarını tek deftere birleştir (MONEY-L7).
- [ ] **6.5** Günlük reconciliation: ledger vs Payment/Hold/Payout vs PSP raporu; drift alarmı.

---

## Faz 7 — Dayanıklılık: Bull migrasyonu + ayrı worker · `fix/payment-hardening-resilience`

> "Sistem çökse bile çalışsın" isteğinin gerçek karşılığı. Faz 0 önkoşul.

- [ ] **7.1** Kalan saf-`@Cron`'ları Bull desenine getir: `elogo-scheduler` (EVERY_30_MIN), `featured-scheduler` (`15 3 * * *`), `search-sync:82` (EVERY_HOUR).
- [ ] **7.2** Worker'ı ayrı process olarak deploy et (`worker.ts` → `node dist/worker`, ayrı Coolify servisi) + `AppModule`'den `WorkerModule`'ü çıkar (API çift-işlemesin). → API çökse kuyruk donmaz; worker replike edilebilir (HA).
- [ ] **7.3** Her job'ın idempotentliğini doğrula (Bull at-least-once). Faz 1-2'deki CAS işi para job'larını hazırlar; tek tek onayla.
- [ ] **7.4** Bull `settings` (lockDuration/stalledInterval/maxStalledCount) + DLQ; her job "vadesi gelmiş HER ŞEYİ bul" deseninde (backfill yok kuralı).
- [ ] **7.5** Bayrakları aç (önce `CRONS_VIA_BULL`, sonra `MONEY_CRONS_VIA_BULL`), in-process `@Cron` ikizlerini kaldır → **tek mekanizma**.

---

## Faz 8 — Event-driven fulfillment + god-service parçalama · `refactor/payment-fulfillment-decompose`

- [ ] **8.1** Ödeme `paid`'e geçip **event yaysın**; fulfillment tüketsin (fulfillment hatası ödeme durumunu bozmasın).
- [ ] **8.2** Ekstraksiyon: `VirtualOrderFulfillment` (membership/boost), `OrderStock` (decrement+cascade), `FulfillmentNotifier`, `ShipmentProvisioning`, `TradeCashFulfillment`.
- [ ] **8.3** Tekil fulfillment'ı "group-of-one"a indir → ~450-500 satır kopya silinir (QUAL).
- [ ] **8.4** `ModuleRef`/`require()` lazy-resolve hack'lerini event bus ile erit.

---

## Faz 9 — Tipleme + config + test · `chore/payment-hardening-quality`

- [ ] **9.1** `Prisma.PaymentGetPayload<...>` = `PaymentWithContext` + `PaymentMetadata` interface; 4 fulfillment + 5 initiation `any`'sini tiple.
- [ ] **9.2** Config merkezileştir: 24s pencere, "+3 gün", `PAYMENT_BYPASS`, `COOLING_OFF_DAYS` vs `RETURN_WINDOW_DAYS` (tek kaynak), para epsilon → ConfigService/const.
- [ ] **9.3** Para yolu testleri (bugün SIFIR): tekil `processSuccessfulPayment`, `processRefund` order yolu, `releaseHoldsDue`, `handleOrderDelivered`, reconciler, outbox worker, ledger.
- [ ] **9.4** `payment-trade-cash-refund.spec.ts` `describe.skip` aç (MONEY-L5).

---

## Faz 10 — Kalan düşük-önem temizlik

- [ ] FLOW-L1 (SavedCard grup/trade), FLOW-L2/MONEY-L2 (restock miktar), FLOW-L3 (üyelik sibling), FLOW-L4 (boost debris), SEAM-B6 (kargo ücreti tek-kaynak: üye-offer kargo, quote≠checkout, kısmi-iade kargo kuralı), SEAM-B7 (admin 4. teslim yolu → `handleOrderDelivered`'a bağla), SEAM-B8/B9.

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
