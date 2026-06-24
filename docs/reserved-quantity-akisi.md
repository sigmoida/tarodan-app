# Reserved Quantity Akışı — Takas · Teklif · Ödeme

> Tarih: 2026-06-24 · Kapsam: `apps/api` — `Product.reservedQuantity` ne zaman artar/azalır.
> Amaç: takas (trade), teklif (offer) ve ödeme (payment) yaşam döngülerinde rezerve adedin **mevcut** davranışını birebir koddan haritalamak. Her satır koddan teyit edilmiştir; bu doküman kodu değiştirmez, **şu anki durumu** anlatır.
>
> İlgili denetim notları (hatalar + öneriler) için: [stok-quantity-denetim.md](stok-quantity-denetim.md).

---

## 1. Model

Dosya: [product-availability.helper.ts](../apps/api/src/modules/product/helpers/product-availability.helper.ts)

| Alan | Anlamı |
|---|---|
| `quantity` | Fiziksel stok. `null` = sınırsız. **Yalnız ödeme başarısında / takas tamamlanmasında düşer.** |
| `reservedQuantity` | Tutulan (ödeme bekleyen / takası süren) adet. |
| `available` | `getAvailableQuantity` = `max(0, quantity − reservedQuantity)`; `quantity=null` ise `null` (sınırsız). |
| `status` | `draft · pending · active · reserved · sold · inactive · rejected · deleted` |

**Yardımcılar:**
- `getAvailableQuantity(product)` — [satır 8-17](../apps/api/src/modules/product/helpers/product-availability.helper.ts#L8-L17)
- `safeDecrementReserved(current, by)` = `max(0, (current ?? 0) − by)` — asla negatife düşmez. [satır 23-28](../apps/api/src/modules/product/helpers/product-availability.helper.ts#L23-L28)
- `checkAndReserve(tx, productId, qty)` — rezerve almanın **tek kapısı**. [product-lock.service.ts:106-140](../apps/api/src/modules/product/product-lock.service.ts#L106-L140):
  1. Ürünü `FOR UPDATE` ile pessimistic kilitler.
  2. `status` `active` veya `reserved` değilse hata fırlatır.
  3. `available < requiredQty` ise "stokta yok" hatası fırlatır.
  4. `reservedQuantity += requiredQty` (**status'a DOKUNMAZ**).

> ⚠️ Kritik nokta: `checkAndReserve` rezerve adedi artırır ama ürün `status`'unu `reserved` yapmaz. Status'u ayrıca çağıran taraf set eder (takas kabulü yapar; satın alma yolu yapmaz — bkz. denetim notu A).

---

## 2. Temel Kural (özet)

1. **Rezerve ne zaman ALINIR?**
   - **Takas:** kabul anında (cash + non-cash ortak).
   - **Direct-buy (hemen al):** sipariş oluşturulurken.
   - **Teklif (offer):** teklif kabulünde DEĞİL → **ödeme başlatıldığında** (payment initiate).
2. **`quantity` ne zaman DÜŞER?** Yalnız ödeme **başarısında** veya takas **tamamlanmasında**. Sipariş/teklif/takas oluşturmada asla.
3. **Rezerve ne zaman BIRAKILIR?** Ödeme başarısında (quantity'ye dönüşerek), ödeme fail/iptal/süre-aşımında, takas red/iptal/expire'ında.

---

## 3. Takas (Trade) Yaşam Döngüsü

Dosya: [trade.service.ts](../apps/api/src/modules/trade/trade.service.ts)

| # | Olay | Tetikleyici | reserved | Δ | Status değişir mi? | Dosya:satır |
|---|---|---|---|---|---|---|
| 1 | **Teklif oluştur** (pending) | `POST /trades` | — | yok | hayır | — (yorum: kabule kadar rezerve etme) |
| 2 | **Takas kabul** | `acceptTrade` | **artar** | `+qty` her iki taraf | `available<=0` ise → `reserved` | [908](../apps/api/src/modules/trade/trade.service.ts#L908) / [920](../apps/api/src/modules/trade/trade.service.ts#L920) |
| 3 | **Cash ödeme başarısı** | PayTR callback | değişmez | yok (zaten kabulde alındı) | takas→`shipping_to_warehouse` | — |
| 4 | **Reddet** (accepted ise) | `rejectTrade` | **azalır** | `safeDecrementReserved(_, qty)` | → `active` (koşulsuz) | [1066-1069](../apps/api/src/modules/trade/trade.service.ts#L1066-L1069) |
| 5 | **İptal** (non-pending ise) | `cancelTrade` | **azalır** | `safeDecrementReserved(_, qty)` | → `active` (koşulsuz) | [1422-1425](../apps/api/src/modules/trade/trade.service.ts#L1422-L1425) |
| 6 | **Tamamlanma** (alıcı onayı) | `confirmReceipt` | **azalır** | `quantity-- + reserved--` | `getProductStatusFromQuantity` | [1714](../apps/api/src/modules/trade/trade.service.ts#L1714) |
| 6b | **Tamamlanma** (oto-onay) | `autoConfirmExpiredReceipts` | **azalır** | `quantity-- + reserved--` | `getProductStatusFromQuantity` | [1923](../apps/api/src/modules/trade/trade.service.ts#L1923) / [2250](../apps/api/src/modules/trade/trade.service.ts#L2250) |
| 7 | **Süre-aşımı iptal** | `autoCancelExpiredTrades` | **azalır** | `safeDecrementReserved(_, qty)` | → `active` | [1944](../apps/api/src/modules/trade/trade.service.ts#L1944) / [2083-2087](../apps/api/src/modules/trade/trade.service.ts#L2083-L2087) |

### Detaylar

**(2) Kabul — `acceptTrade`:** [trade.service.ts:906-908](../apps/api/src/modules/trade/trade.service.ts#L906-L908)
```ts
// Takas kabul: her iki taraf için reservedQuantity++ (FOR UPDATE pessimistic lock)
for (const [productId, qty] of byProduct) {
  await this.productLockService.checkAndReserve(tx, productId, qty);
}
```
Rezerve **tam 1 kez** burada alınır — hem teklif edenin hem alıcının ürünleri için. Sonrasında ([920](../apps/api/src/modules/trade/trade.service.ts#L920)) `available = quantity − reservedQuantity` yeniden okunur; `<=0` ise ürün `status=reserved` yapılır ve diğer bekleyen teklif/takas/sipariş cascade iptal edilir.
- Cash takas → `awaiting_payment` (nakit ödenmeden sevkiyat yok).
- Non-cash takas → `shipping_to_warehouse`.

**(3) Cash ödeme başarısı:** Rezerve zaten kabulde alındığı için **tekrar rezerve ETMEZ** — sadece takası `shipping_to_warehouse`'a taşır.

**(6) Tamamlanma:** [trade.service.ts:1689-1714](../apps/api/src/modules/trade/trade.service.ts#L1689-L1714) — her iki tarafın tüm `tradeItem`'ları için `quantity--` **ve** `reserved--` aynı transaction'da. `quantity` ilk kez burada düşer.

---

## 4. Teklif (Offer) + Ödeme Yaşam Döngüsü

Dosyalar: [offer.service.ts](../apps/api/src/modules/offer/offer.service.ts), [payment.service.ts](../apps/api/src/modules/payment/payment.service.ts), [order.service.ts](../apps/api/src/modules/order/order.service.ts)

| # | Olay | Tetikleyici | reserved | Δ | Dosya:satır |
|---|---|---|---|---|---|
| 1 | **Teklif oluştur** (pending) | `POST /offers` | — | yok | — |
| 2 | **Teklif kabul** → order(pending_payment) | `POST /offers/:id/accept` | — | **yok** (kasıtlı) | — (yorum: reserve ödeme başlatınca) |
| 3 | **Ödeme başlat** (offer order) | `initiatePayment` | **artar** | `+1` | [604](../apps/api/src/modules/payment/payment.service.ts#L604) |
| 3b | **Ödeme tekrar başlat** (30dk bırakma sonrası) | `initiatePayment` retry | **artar** | `+1` (CAS-gate'li) | [616](../apps/api/src/modules/payment/payment.service.ts#L616) |
| 4 | **Ödeme başarısı** | PayTR callback | **azalır** | `quantity-- + reserved--` | [1369](../apps/api/src/modules/payment/payment.service.ts#L1369) |
| 5 | **Ödeme fail / iptal** | `releaseProductForFailedPayment` | **azalır** | `safeDecrementReserved(_, 1)` | [1953-1954](../apps/api/src/modules/payment/payment.service.ts#L1953-L1954) |

### Detaylar

**(2) Kabul — rezerve YOK:** Teklif kabulü yalnız "anlaşma"dır. Stok değişmez, invalidation yapılmaz. Bunun yerine `pending_payment` order üretilir; rezerve ödeme başlatılınca alınır.

**(3) Ödeme başlat — `initiatePayment`:** [payment.service.ts:601-606](../apps/api/src/modules/payment/payment.service.ts#L601-L606)
```ts
if (order.offerId && !order.reservationReleasedAt) {
  await this.productLockService.checkAndReserve(tx, order.productId, 1);
}
```
- Guard: `order.offerId` var **ve** rezerve daha önce bırakılmamış (`!reservationReleasedAt`).
- **(3b)** 30dk cron rezerveyi bıraktıysa (`reservationReleasedAt` set), retry yolu [616](../apps/api/src/modules/payment/payment.service.ts#L616) CAS-gate ile tek seferlik yeniden rezerve eder.
- Karşılaştırma: direct-buy `offerId=null` olduğu için bu blok ona dokunmaz (o sipariş oluşumunda rezerve edilmiştir).

**(4) Ödeme başarısı:** [payment.service.ts:1355-1372](../apps/api/src/modules/payment/payment.service.ts#L1355-L1372) (group için: [1729-1730](../apps/api/src/modules/payment/payment.service.ts#L1729-L1730))
```ts
const newQuantity = product.quantity !== null ? product.quantity - 1 : null;
updateData.status = getProductStatusFromQuantity(newQuantity);
updateData.reservedQuantity = safeDecrementReserved(product.reservedQuantity, 1);
if (product.quantity !== null) updateData.quantity = { decrement: 1 };
```
Rezerve → fiziksel satışa dönüşür: `quantity--` **ve** `reserved--` aynı anda. Sonra `available<=0` ise stockout cascade ([1388-1421](../apps/api/src/modules/payment/payment.service.ts#L1388)) bekleyen diğer order/offer'ları iptal eder.
> Üyelik/boost siparişleri stoğa dokunmaz; bu blok yalnız regular ürün siparişlerinde çalışır.

**(5) Ödeme fail/iptal — `releaseProductForFailedPayment`:** [payment.service.ts:1951-1958](../apps/api/src/modules/payment/payment.service.ts#L1951-L1958)
```ts
const newReserved = safeDecrementReserved(before.reservedQuantity, 1);
updateData.reservedQuantity = newReserved;
if (before.status === ProductStatus.reserved && newReserved === 0) {
  updateData.status = ProductStatus.active;
}
```
Offer-kökenli order fail olursa teklif `payment_expired` yapılır → alıcı tekrar ödeyebilir (yeniden kabule gerek yok).

---

## 5. Direct-Buy / Grup Checkout (karşılaştırma)

Dosya: [order.service.ts](../apps/api/src/modules/order/order.service.ts)

| Olay | reserved | Δ | Dosya:satır |
|---|---|---|---|
| Direct-buy sipariş oluştur | **artar** | `+1` (oluşumda) | order.service.ts (~`reservedQuantity: { increment: 1 }`) |
| Grup checkout (per order) | **artar** | `+1` her order | order.service.ts (~grup reserve döngüsü) |
| Ödeme başarısı | **azalır** | `quantity-- + reserved--` | [payment.service.ts:1369](../apps/api/src/modules/payment/payment.service.ts#L1369) / group [1730](../apps/api/src/modules/payment/payment.service.ts#L1730) |

> Teklif yolundan **tek fark**: rezerve oluşumda alınır (offer'da ödeme başlatınca alınır). Ödeme başarısı/fail davranışı aynıdır.

---

## 6. Cron / Scheduler Etkileri

Dosya: [payment-scheduler.service.ts](../apps/api/src/modules/payment/payment-scheduler.service.ts), [payment.service.ts](../apps/api/src/modules/payment/payment.service.ts)

| Cron | Aralık | reserved etkisi | Dosya:satır |
|---|---|---|---|
| `releaseExpiredOrderReservations` | 5 dk | 30dk boşta order → `reserved--`, `reservationReleasedAt` set | [payment.service.ts:3895-3900](../apps/api/src/modules/payment/payment.service.ts#L3895-L3900) |
| `expireUnpaidOrders` | — | süresi dolan order → `reserved--` (`!reservationReleasedAt` guard'lı) | [payment.service.ts:4047-4055](../apps/api/src/modules/payment/payment.service.ts#L4047-L4055) |
| `reconcileReservedQuantities` | — | `reservedQuantity = held` (canlı pending_payment order sayımı) — ground-truth | [payment.service.ts:3943-3989](../apps/api/src/modules/payment/payment.service.ts#L3943-L3989) |
| `sweepOutOfStockProducts` | 5 dk | `quantity=0` ürünlerde bekleyen offer/trade iptal | payment-scheduler.service.ts |
| `autoCancelExpiredTrades` | — | süresi dolan takas → `reserved--` | [trade.service.ts:2083](../apps/api/src/modules/trade/trade.service.ts#L2083) |

---

## 7. Değişmezler (Invariants) — şu anki gar-antiler

1. **Asla negatif değil:** tüm decrement'ler `safeDecrementReserved` / SQL `GREATEST(...,0)` ile clamp'li.
2. **Rezerve tek kez alınır:** takas kabulünde / direct-buy oluşumunda / offer ödeme başlatmada. Cash ödeme başarısı tekrar rezerve etmez.
3. **`quantity` tek kez ve geç düşer:** yalnız ödeme başarısı + takas tamamlanması; her ikisinde de aynı transaction'da `reserved--` ile birlikte.
4. **Stockout cascade:** `available<=0` olunca ürün `reserved`'a alınır + bekleyen diğer offer/trade/order iptal edilir (oversell önlemi).
5. **Reconcile son savunma:** canlı pending_payment order'ları sayıp `reservedQuantity`'yi ground-truth'a çeker.

## 8. Bilinen açık noktalar (kısa)

Tam liste [stok-quantity-denetim.md](stok-quantity-denetim.md)'de. Reserved akışını doğrudan etkileyenler:
- **A** — `checkAndReserve` status'a dokunmaz; satın alma yolu `available<=0`'da `reserved` yapmıyor → rezerve ürün bazı listelerde "stokta" görünebilir.
- **B** — Sipariş iptalinde `reservationReleasedAt` guard + clamp eksik → çift bırakma → reserved negatif riski.
- **D** — `reconcileReservedQuantities` ödemesi başlamamış offer order'ları da `held` sayıyor → reserved şişip "stokta yok" gösterebilir.
