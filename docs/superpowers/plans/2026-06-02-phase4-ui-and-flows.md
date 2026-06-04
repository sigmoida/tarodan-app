# Sipariş Komisyon/İptal/İade — Faz 4: UI Katmanı + Senaryo D Akışı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement task-by-task.

**Goal:** Faz 3A+3B'nin backend altyapısını **kullanıcı tarafına** taşımak: admin paneli 48h pencere müdahaleleri + RefundRequest policy override + mobile alıcı "Sorun yok" butonu + Senaryo D satıcı onay akışı + checkout buyer fee placeholder + RefundService kısmi iade hesaplaması.

**Architecture:** Backend tamamen hazır (24+ commit). Faz 4 ağırlıklı olarak `apps/admin` (Next.js), `apps/mobile` (Expo React Native) ve `apps/web` (Next.js) UI işi + `apps/api/src/modules/refund` partial refund mantığı. Mevcut admin endpoint'leri (`POST /admin/orders/:id/force-complete`, `/extend-confirmation`), mevcut order endpoint (`POST /orders/:id/confirm-receipt`) kullanılır.

**Tech Stack:** Next.js 14 (admin + web), React Native + Expo (mobile), TanStack Query, shadcn/ui (admin/web), nativewind (mobile)

**Spec referansı:** `docs/superpowers/specs/2026-05-31-order-commission-cancel-refund-design.md` (Bölüm 6.2, 7.4, 8.4, 9.3)

---

## Faz 4 Sub-faz Özeti

| Alt | İçerik | Tahmin |
|---|---|---|
| **4A** | Admin web order detail: 48h rozet + geri sayım + force-complete + extend butonları | 4-6 commit |
| **4B** | Admin web refund-requests detail: 4 boolean policy override + returnShippingPayer + anlık tutar | 4-6 commit |
| **4C** | Mobile order detail: "Sorun yok" butonu + geri sayım + changed_mind uyarı modalı | 4-5 commit |
| **4D** | Mobile + Web satıcı kabul/reddet ekranı (Senaryo D — buyerInitiatedAmicable) | 3-4 commit |
| **4E** | Web checkout: buyer fee satırı placeholder + /yasal/platform-hizmet-bedeli sayfa | 2-3 commit |
| **4F** | RefundService: kısmi iade hesaplaması (PayTR'ye gerçek tutar) | 2-3 commit |

---

## Faz 4A — Admin Order Detail: 48h Pencere Müdahaleleri

**Files:**
- Modify: `apps/admin/src/app/(admin)/orders/[id]/page.tsx` (rozet + butonlar + modal)
- Modify (varsa): `packages/api-client/src/admin/orders.ts` (force-complete + extend-confirmation client)
- Create: `apps/admin/src/components/orders/AwaitingConfirmationCard.tsx` (rozet + geri sayım)
- Create: `apps/admin/src/components/orders/ExtendConfirmationDialog.tsx`
- Create: `apps/admin/src/components/orders/ForceCompleteDialog.tsx`

### Task 4A.1 — API Client metodları

- [ ] **Step 1:** `packages/api-client/src/admin/orders.ts`'a (yoksa yarat):
  - `forceCompleteOrder(id, {reason?})` → `POST /admin/orders/:id/force-complete`
  - `extendOrderConfirmation(id, {hours, reason?})` → `POST /admin/orders/:id/extend-confirmation`

- [ ] **Step 2:** Tip tanımları: `ForceCompleteResponse`, `ExtendConfirmationResponse`.

- [ ] **Step 3:** Commit: `feat(api-client): admin order 48h actions`

### Task 4A.2 — AwaitingConfirmationCard component

- [ ] **Step 1:** Order durumu `awaiting_buyer_confirmation` ise renderlanır. Props: `deliveredAt`, `confirmationDeadline`, `buyerConfirmedAt`, `buyerConfirmationType`.

- [ ] **Step 2:** Geri sayım: deadline - now hesabı; `useEffect + setInterval(1000)`. Format: "X saat Y dakika kaldı". Süresi geçtiyse "Süre doldu — cron çalıştığında tamamlanacak".

- [ ] **Step 3:** Renk kodu: >12h yeşil, 6-12h sarı, <6h kırmızı.

- [ ] **Step 4:** Commit: `feat(admin): AwaitingConfirmationCard`

### Task 4A.3 — ExtendConfirmationDialog

- [ ] **Step 1:** shadcn `Dialog` + `Form`. Alanlar: `hours` (1-168 select/input), `reason` (textarea, opsiyonel, 500 max).

- [ ] **Step 2:** Submit → `extendOrderConfirmation` mutation. Success → toast + sayfa refresh. Error → form error.

- [ ] **Step 3:** Commit: `feat(admin): ExtendConfirmationDialog`

### Task 4A.4 — ForceCompleteDialog

- [ ] **Step 1:** shadcn `AlertDialog` (yıkıcı eylem). Sadece `reason` (textarea, 500 max, opsiyonel).

- [ ] **Step 2:** Uyarı: "Bu eylem siparişi hemen tamamlar; satıcıya ödeme transferi tetiklenir. Geri alınamaz."

- [ ] **Step 3:** Submit → mutation. super_admin değilse hata göster.

- [ ] **Step 4:** Commit: `feat(admin): ForceCompleteDialog`

### Task 4A.5 — Order detail entegrasyon

- [ ] **Step 1:** `apps/admin/src/app/(admin)/orders/[id]/page.tsx` içinde status'a göre AwaitingConfirmationCard render et.

- [ ] **Step 2:** Card içinde 2 buton: "Pencereyi Uzat" → ExtendDialog açar, "Manuel Tamamla" → ForceCompleteDialog açar.

- [ ] **Step 3:** Commit: `feat(admin): order detail 48h pencere entegrasyonu`

---

## Faz 4B — Admin Refund-Requests Detail: Policy Override

**Files:**
- Modify: `apps/admin/src/app/(admin)/refund-requests/[id]/page.tsx`
- Create: `apps/admin/src/components/refunds/RefundPolicyCard.tsx`
- Modify (varsa): `packages/api-client/src/admin/refund-requests.ts`

### Task 4B.1 — Policy override API client metodu

- [ ] **Step 1:** `PATCH /admin/refund-requests/:id/override-policy` (backend Faz 3B'de henüz yok — ya Faz 4B içinde eklenecek ya da mevcut approve endpoint'i extend edilecek).

**NOT:** Backend endpoint Faz 3B'de planlandı ama yapılmadı (Task 4 admin order endpoint'lerine odaklanıldı). Faz 4B.1'in ilk task'ı **backend endpoint'i tamamlamak**: `apps/api/src/modules/admin/admin.controller.ts`'a `PATCH /admin/refund-requests/:id/override-policy` ve `PATCH /admin/refund-requests/:id/set-shipping-payer`. Bu, RefundRequest tablosundaki 4 boolean + returnShippingPayer alanlarını günceller.

- [ ] **Step 2:** RefundRequest backend endpoint genişletmesi (DTO + service + controller). Mevcut RefundService.updateAdminFields'ı kullan veya yeni metod ekle.

- [ ] **Step 3:** API client metodu: `overrideRefundPolicy(id, {refundProductAmount, refundShippingFee, refundBuyerFee, refundSellerCommission})`, `setReturnShippingPayer(id, {payer: 'buyer'|'seller'|'platform'})`.

- [ ] **Step 4:** Commit: `feat(admin,api): refund policy override endpoints`

### Task 4B.2 — RefundPolicyCard component

- [ ] **Step 1:** 4 checkbox (label: "Ürün bedeli iade", "Kargo bedeli iade", "%3 Platform fee iade", "Satıcı komisyonu iade"). Default: backend'ten gelen değerler.

- [ ] **Step 2:** Radio: returnShippingPayer (3 seçenek: Alıcı, Satıcı, Platform).

- [ ] **Step 3:** Anlık hesap: Order bilgisinden kısmi iade tutarı: `(refundProductAmount ? subtotal : 0) + (refundShippingFee ? shippingCost : 0) + (refundBuyerFee ? buyerFeeAmount : 0)`. Renderda büyük punto: "Toplam iade: XXX,XX TL".

- [ ] **Step 4:** "Kaydet" butonu → mutation. Sadece değişiklik olduysa enable.

- [ ] **Step 5:** Commit: `feat(admin): RefundPolicyCard`

### Task 4B.3 — Refund detail entegrasyon

- [ ] **Step 1:** `apps/admin/src/app/(admin)/refund-requests/[id]/page.tsx` içinde mevcut detail sayfasının yanına/altına RefundPolicyCard.

- [ ] **Step 2:** `counterfeit` reason ise üstte sarı uyarı bandı: "Sahte ürün şikayeti — satıcı yaptırımı değerlendir".

- [ ] **Step 3:** Commit: `feat(admin): refund detail policy override entegrasyonu`

---

## Faz 4C — Mobile Order Detail: "Sorun Yok" + Geri Sayım + Uyarı Modalı

**Files:**
- Modify: `apps/mobile/app/orders/[id].tsx`
- Create: `apps/mobile/components/orders/AwaitingConfirmationBanner.tsx`
- Create: `apps/mobile/components/orders/ChangedMindWarningModal.tsx`
- Modify (varsa): `packages/api-client/src/orders.ts` (`confirmReceipt` metodu)

### Task 4C.1 — API client: confirmReceipt

- [ ] **Step 1:** `packages/api-client/src/orders.ts`'a `confirmReceipt(orderId)` → `POST /orders/:id/confirm-receipt`.

- [ ] **Step 2:** Commit: `feat(api-client): orders.confirmReceipt`

### Task 4C.2 — AwaitingConfirmationBanner

- [ ] **Step 1:** Order status `awaiting_buyer_confirmation` ise sticky üst banner. Props: `confirmationDeadline`.

- [ ] **Step 2:** Geri sayım (saat:dakika). >12h yeşil, 6-12h sarı, <6h kırmızı arkaplan.

- [ ] **Step 3:** İçerikte 2 buton: "Sorun yok, onaylıyorum" (büyük) + "Sorun bildir" (link/seconary).

- [ ] **Step 4:** "Sorun yok" → confirm mutation; success → toast "Sipariş tamamlandı, teşekkürler" + ekran refresh.

- [ ] **Step 5:** "Sorun bildir" → mevcut RefundRequest açma akışına yönlendir (mevcut sayfa var).

- [ ] **Step 6:** Commit: `feat(mobile): AwaitingConfirmationBanner`

### Task 4C.3 — ChangedMindWarningModal

- [ ] **Step 1:** Mevcut RefundRequest açma sayfasında `reason === 'changed_mind'` seçildiğinde modal açılır.

- [ ] **Step 2:** Modal içeriği: "Bu sebepte sadece **ürün bedeli** iade edilir. Kargo bedeli ve %3 platform hizmet bedeli iade edilmez. Ayrıca **satıcı onayı gereklidir**. Onaylıyor musun?"

- [ ] **Step 3:** İki buton: "Vazgeç" (kapat), "Devam Et" (formu submit'e izin ver).

- [ ] **Step 4:** Commit: `feat(mobile): ChangedMindWarningModal`

### Task 4C.4 — Order detail entegrasyon + alıcı bildirim handler

- [ ] **Step 1:** Order detail sayfasında status `awaiting_buyer_confirmation` ise AwaitingConfirmationBanner render et.

- [ ] **Step 2:** Push notification handler: `ORDER_DELIVERED_CONFIRM` tipinde gelirse Order detail'e deep-link.

- [ ] **Step 3:** Commit: `feat(mobile): order detail awaiting_confirmation entegrasyonu`

---

## Faz 4D — Senaryo D Satıcı Kabul/Reddet Akışı

**Spec Bölüm 7.4:** `reason='changed_mind'` + `buyerInitiatedAmicable=true` RefundRequest'lerde **satıcı onayı zorunlu**. Şu an backend RefundRequest yaratıyor ama satıcı kabul/reddet endpoint'i yok.

**Files:**
- Modify: `apps/api/src/modules/refund/refund.controller.ts` (yeni endpoint'ler)
- Modify: `apps/api/src/modules/refund/refund.service.ts` (yeni metodlar)
- Create: `apps/mobile/app/refund-requests/[id]/seller-decision.tsx` (yeni sayfa)
- Create: `apps/web/src/app/(authenticated)/refund-requests/[id]/seller-decision/page.tsx` (yeni sayfa)

### Task 4D.1 — Backend: satıcı kabul/reddet endpoint'leri

- [ ] **Step 1:** `RefundService.sellerAcceptAmicable(requestId, sellerId)`: RefundRequest status `pending_review` + reason `changed_mind` + buyerInitiatedAmicable + requester.sellerId === seller. Status → `approved`, normal akış başlar.

- [ ] **Step 2:** `RefundService.sellerRejectAmicable(requestId, sellerId, reason)`: status → `rejected`, audit log, alıcıya bildirim.

- [ ] **Step 3:** Controller: `POST /refund-requests/:id/seller-accept`, `POST /refund-requests/:id/seller-reject` (auth: seller of order).

- [ ] **Step 4:** Commit: `feat(refund): satıcı kabul/reddet endpoint'leri (Senaryo D)`

### Task 4D.2 — Mobile satıcı karar ekranı

- [ ] **Step 1:** Mobile'da satıcının "Açık iade talepleri" listesinde Senaryo D talepleri ayrı badge ile gösterilir.

- [ ] **Step 2:** Detail ekranında 2 büyük buton: "Kabul Et" / "Reddet". Reddetme reason girilir.

- [ ] **Step 3:** Commit: `feat(mobile): satıcı kabul/reddet ekranı`

### Task 4D.3 — Web satıcı karar ekranı

- [ ] **Step 1:** Aynı pattern web'de — `apps/web/src/app/(authenticated)/refund-requests/[id]/seller-decision/page.tsx`.

- [ ] **Step 2:** Commit: `feat(web): satıcı kabul/reddet ekranı`

---

## Faz 4E — Web Checkout: Buyer Fee Placeholder + Yasal Sayfa

**Files:**
- Modify: `apps/web/src/app/(checkout)/...` (mevcut checkout component)
- Create: `apps/web/src/app/yasal/platform-hizmet-bedeli/page.tsx`

### Task 4E.1 — Checkout sayır gösterimi

- [ ] **Step 1:** Mevcut checkout/cart summary component'inde `Order.buyerFeeAmount` field'ı görüntülenir. **Şu an `0` çünkü Faz 5'te aktive olacak.**

- [ ] **Step 2:** Conditional render: `buyerFeeAmount > 0` ise satır göster. Label: "Platform Hizmet Bedeli (%3)". Tooltip: "Bu bedel ödeme altyapısı ve güvenli alışveriş hizmetimiz için alınır. Detaylı bilgi için tıklayın".

- [ ] **Step 3:** Tooltip link → `/yasal/platform-hizmet-bedeli`.

- [ ] **Step 4:** Commit: `feat(web): checkout buyer fee satırı + tooltip`

### Task 4E.2 — Yasal sayfa

- [ ] **Step 1:** `apps/web/src/app/yasal/platform-hizmet-bedeli/page.tsx`: statik içerik (hizmet kapsamı, KDV, oran).

- [ ] **Step 2:** Mevcut LEGAL_PAGES infrastructure'ı varsa onu kullan.

- [ ] **Step 3:** Commit: `feat(web): platform hizmet bedeli yasal sayfa`

---

## Faz 4F — RefundService Kısmi İade Hesaplaması

Mevcut `RefundService` tam iade yapıyor. Faz 4B'de 4 boolean policy alanı set edilebilir ama PayTR'ye gönderilen `refundAmount` hâlâ tam tutar. Bunu policy'ye göre hesaplamak gerek.

**Files:**
- Modify: `apps/api/src/modules/refund/refund.service.ts`

### Task 4F.1 — Kısmi iade hesaplama metodu

- [ ] **Step 1:** `computePartialRefundAmount(refundRequest, order)`: Order'dan subtotal, shippingCost, buyerFeeAmount, commissionAmount al. 4 boolean'a göre topla:
```typescript
let amount = 0;
if (refundRequest.refundProductAmount) amount += order.subtotal;
if (refundRequest.refundShippingFee)   amount += order.shippingCost;
if (refundRequest.refundBuyerFee)      amount += order.buyerFeeAmount;
// refundSellerCommission satıcıdan tahsil işi — Faz 5+
return amount;
```

- [ ] **Step 2:** `processRefundForRequest(requestId)` gibi mevcut metodu güncelle: `computePartialRefundAmount`'ı çağırıp `paymentService.processRefund(orderId, amount)` ver.

- [ ] **Step 3:** Commit: `feat(refund): kısmi iade tutar hesaplaması (4 boolean policy)`

### Task 4F.2 — Test (manuel)

- [ ] **Step 1:** Admin paneli'nde Senaryo D RefundRequest'i aç → policy override (kargo iade=false) → approve → return delivered → PayTR refund kontrol et: sadece subtotal iade edilmiş olmalı.

- [ ] **Step 2:** Commit yok — sadece dökümante et.

---

## Faz 4 Kapanış

### Task 4G — ESCROW notu + Faz 5 hazırlığı

- [ ] **Step 1:** `docs/ESCROW_PAYOUT_PLAN.md`'a Faz 4 kapanış paragrafı.

- [ ] **Step 2:** Faz 5 ön-not: `calculateCommission` refactor + `is_active=true` flag flip + kullanıcı duyurusu.

- [ ] **Step 3:** Commit: `docs: Faz 4 kapanış + Faz 5 hazırlık`

---

## Faz 4 Çıktı Özeti (Definition of Done)

- [x] Admin paneli: 48h pencere rozet + butonlar + RefundRequest policy override UI
- [x] Mobile: "Sorun yok" butonu + geri sayım + changed_mind uyarı modalı
- [x] Mobile + Web: satıcı kabul/reddet ekranı (Senaryo D)
- [x] Web checkout: buyer fee satırı conditional (Faz 5 aktivasyonu için hazır)
- [x] /yasal/platform-hizmet-bedeli sayfa
- [x] RefundService kısmi iade hesaplaması
- [x] Tüm sub-fazlar commit edilmiş, push edilmiş

## Bir Sonraki Faz

**Faz 5 — Aktivasyon:** `calculateCommission` refactor (BUYER + SELLER ayrı lookup), unit test, kullanıcı duyurusu, `CommissionRule.is_active=true` flip. Plan: ayrı dosya (`docs/superpowers/plans/<date>-phase5-activation.md`) Faz 4 sonrası yazılacak.
