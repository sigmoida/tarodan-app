# Stok / Quantity Mantığı Denetimi (Teklif · Ödeme · İade · İptal · Takas)

> Tarih: 2026-06-19 · Kapsam: `apps/api` stok mutasyonları (quantity, reservedQuantity, status).
> Amaç: tüm akışlardaki stok mantığını haritalamak + olası hataları işaretlemek. **Bu dokümanda kod DÜZELTİLMEDİ**, yalnız tespit + önerilen çözüm var. ✅ = denetçi tarafından koddan birebir teyit edildi.

## 1. Model
- `quantity` = fiziksel stok (`null` = sınırsız). **Yalnız ödeme/takas TAMAMLANINCA düşer.**
- `reservedQuantity` = tutulan (ödeme bekleyen / takas süren) adet.
- `available = max(0, quantity − reservedQuantity)` (`getAvailableQuantity`).
- `status`: draft|pending|active|reserved|sold|inactive|rejected|deleted.
- Yardımcılar: `safeDecrementReserved` (0'a clamp'ler), `getProductStatusFromQuantity` (**yalnız quantity'ye bakar**: >0→active, 0→inactive, null→active — `reserved` ÜRETMEZ).

## 2. Doğru çalışan çekirdek (teyitli)
- **Rezerve tam 1 kez alınıyor**, takas kabulünde (cash + non-cash ortak); cash ödeme başarısında TEKRAR rezerve etmez. ✅
- **quantity tam 1 kez düşüyor**, sadece ödeme başarısında / takas tamamlanmasında; sipariş/teklif oluşturmada quantity'ye dokunulmaz. ✅
- Takas tamamlanması her iki tarafın ürünlerini doğru düşürüyor (tradeItem'ların tümü, taraf filtresi yok). ✅
- `reservedQuantity` decrement'leri (takas + payment tarafında) `safeDecrementReserved`/`GREATEST` ile clamp'li → negatife düşmez. ✅
- Üyelik/boost siparişleri stoğa hiç dokunmuyor. ✅

---

## 3. Öncelikli Hatalar

### 🔴 A. Görünürlük desync'i — rezerve olan ürün hâlâ görünüyor/satın alınabiliyor (SİSTEMİK)
**Kök neden** (✅): `checkAndReserve` (`product/product-lock.service.ts:130-133`) `reservedQuantity++` yapar ama **status'a dokunmaz**; `getProductStatusFromQuantity` reserved'ı yok sayar. Sonuç: `available=0` olsa bile ürün `status=active` kalır. Bu yüzden HER liste sorgusu `quantity−reserved`'ı kendi başına yeniden hesaplamak zorunda — unutan endpoint sızdırır:

| Endpoint | dosya:satır | reserved'a bakıyor mu | sonuç |
|---|---|---|---|
| `findOne` (detay) | `product.service.ts:851-856` | ❌ `isOutOfStock = quantity===0` | **rezerve ürün detayda açılır, "satın al" görünür** (+10 dk cache) ✅ |
| `findPopular` | `product.service.ts:476-480` | ❌ sadece `quantity>0` | **"Popüler"de stokta gibi görünür** ✅ |
| `findSimilarProducts` | `product.service.ts:946-954` | ❌ sadece `quantity>0` | **stok-bitti sayfasındaki "alternatifler"de rezerve ürün önerir** ✅ |
| Direct-buy rezervasyonu | `order/order.service.ts:962-965` | — status set etmez | satın alımda da aynı sızıntı (sadece takasta değil) ✅ |
| ES index | `search.service.ts` | index'ten gelir | rezerve değişince **re-index olmaz → bayat stok** ✅ |
| `findAllViaPostgres` | `product.service.ts:703-714` | ✅ `quantity > reservedQuantity` | doğru (en alta atar) |
| `findSellerProducts` (tradeEligible) | `product.service.ts:1694-1698` | ✅ | doğru |

> **NOT:** Son commit'te (`886d9aca`) yalnız **takas kabul** yolunda `available<=0` olunca `status=reserved` yaptık. Ama **satın alma (direct-buy/teklif) rezervasyonu hâlâ status'u active bırakıyor** → aynı sızıntı satın alımda sürüyor. Yani A kısmen açık.

**Önerilen düzeltme (tek seçim):**
- (Tercih) Rezervasyonu merkezîleştir: `checkAndReserve` + `createDirectOrder`/`guestCheckout`/`checkout` reserve noktalarında `available<=0` olunca `status=reserved`, serbest bırakınca `active` yap. Tüm `status=active` filtreleri + `findOne` otomatik düzelir. (Risk: tüm serbest-bırakma yollarının status'u geri çevirdiğini doğrulamak gerek — takas tarafı zaten çeviriyor.)
- (Alternatif, düşük risk) `quantity > reservedQuantity` koşulunu `build-product-where.ts`'e merkezî koy; `findPopular`, `findSimilarProducts`, `findOne` (canView) onu kullansın. Status'a dokunmadan tüm sorgular tutarlı olur.

---

### 🔴 B. Sipariş iptalinde çift rezervasyon-bırakma → `reservedQuantity` negatife düşebilir → oversell
**dosya:satır** `order/order.service.ts:3050-3055` ✅
```ts
if (order.status === OrderStatus.pending_payment) {
  await tx.product.update({ data: { reservedQuantity: { decrement: 1 } } }); // clamp YOK, reservationReleasedAt guard YOK
}
```
30-dk cron (`releaseExpiredOrderReservations`) rezervasyonu zaten bıraktıysa `reservationReleasedAt` set olur **ama order `pending_payment` kalır**. Kullanıcı sonra iptal ederse burada **2. kez** decrement edilir. `expireUnpaidOrders` (`payment.service.ts:3765`) bu guard'ı yapıyor (`!reservationReleasedAt`), ama iptal yolu yapmıyor. Clamp da olmadığı için `reservedQuantity` **negatife** düşer → `available = quantity − (negatif) > quantity` → **oversell**.

**Önerilen:** iptalde `if (!order.reservationReleasedAt)` guard'ı + `safeDecrementReserved` kullan. (Aynı clamp eksiği `order.service.ts:1280` stale-cleanup'ta da var ama orası `reservationReleasedAt` guard'lı, düşük risk.)

---

### 🟠 C. Süre-aşımı status'u: serbest bırakınca yanlışlıkla `reserved` yapıyor
**dosya:satır** `payment.service.ts:3623-3629` (30-dk) ve `:3778-3783` (24s) ✅
```ts
status: newReserved > 0 ? reserved : (remaining > 0 ? active : reserved)
//                                                          ^^^^^^^^ remaining<=0 → "reserved"
const remaining = (product.quantity ?? 0) - newReserved; // null/sınırsız → 0'a çöker
```
- `quantity=0` (gerçekten tükenmiş): `remaining=0` → status **`reserved`** olur (oysa `sold`/`inactive` olmalı) → ölü ürün "reserved" limbo'sunda kalır.
- `quantity=null` (sınırsız stok): `(null ?? 0) − 0 = 0` → **sınırsız ürün `reserved` yapılır** → listelerden kaybolur (reconcile düzeltene kadar).

**Önerilen:** `quantity=null` ise `active`; `newReserved=0 && remaining<=0` ise `sold`/`inactive`. `getProductStatusFromQuantity`'yi reserved'a duyarlı tek yardımcıya taşı.

---

### 🟠 D. `reconcileReservedQuantities` fazla sayıyor → yanlış "stokta yok"
**dosya:satır** `payment.service.ts:3685-3714` ✅
```ts
const held = await prisma.order.count({ where: {
  productId, status: pending_payment, reservationReleasedAt: null } });
... data: { reservedQuantity: held }
```
Bu sayım **rezervasyon kuralıyla çelişiyor**: teklif-kökenli (offer) siparişler kabulde rezerve ETMEZ (rezerve ödeme başlatınca/Payment satırı oluşunca alınır). Ama reconcile, ödemesi hiç başlatılmamış offer siparişlerini de `held` sayıyor → `reservedQuantity`'yi şişiriyor → `available` düşüyor → ürün **yanlışlıkla "stokta yok"** görünüyor. (Greenlight-tipi "takılı rezerve" şikâyetinin muhtemel kaynağı.)

**Önerilen:** `held` sayımına offer siparişler için "Payment satırı var mı" koşulunu ekle (direct-buy: hep sayılır; offer: yalnız payment varsa) — `invalidatePendingOrdersForProduct`'taki kuralla aynı.

---

### 🟠 E. Ödeme başarısında `quantity--` satır kilidi YOK + clamp YOK → eşzamanlılıkta negatif quantity
**dosya:satır** `payment.service.ts:1294-1310` (regular) ve `:1664-1675` (group) ✅
```ts
const product = await tx.product.findUnique({ ... }); // FOR UPDATE YOK
if (product.quantity !== null) updateData.quantity = { decrement: 1 }; // clamp YOK
```
Cron yolları `SELECT ... FOR UPDATE` kullanıyor; sıcak ödeme yolu kullanmıyor. Normalde rezervasyon 1-stoklu üründe 2. ödemeyi engeller, ama reservedQuantity şişerse (B/D) iki ödeme aynı ürünü düşürüp `quantity=-1` yapabilir.

**Önerilen:** ödeme başarısında ürünü `FOR UPDATE` ile kilitle; quantity decrement'ini `GREATEST(quantity-1, 0)` ile clamp'le (savunma katmanı).

---

### 🟡 F. Guest + teklif siparişinde çift rezervasyon (koşullu)
**dosya:satır** `order/order.service.ts:2306-2310` (create'de reserve) + `payment.service.ts:601-606` (`if order.offerId && !reservationReleasedAt` → tekrar reserve) ✅
Guest checkout create'de rezerve ediyor; sipariş `offerId` taşıyorsa ödeme başlatmada **2. kez** rezerve edilir. Direct-buy'da (`offerId=null`) sorun yok. **Koşul:** guest siparişin `offerId` taşıması mümkünse gerçekleşir — guest-teklif akışının var olup olmadığı doğrulanmalı.

**Önerilen:** reserve-at-initiate koşulunu offerId yerine "create'de rezerve edilmedi" işaretine bağla; ya da guest-offer'ı engelle.

---

### 🟡 G. `at_warehouse` / `admin_reviewing` rezervasyonu tutuyor, otomatik bırakma yok
**dosya:satır** `autoCancelExpiredTrades` yalnız pending/accepted/awaiting_payment/shipping_to_warehouse sorgular (`trade.service.ts:~1966`); cancel bu durumlarda bloklu (`:1385-1394`). ✅
Admin incelemeye almazsa `at_warehouse`/`admin_reviewing` takas rezervasyonu **süresiz** tutulur, otomatik kurtarma yok (quantity=0 cron'u da yalnız *pending* takası iptal eder).

**Önerilen:** bu iki durum için admin-eylemsizlik zaman aşımı/uyarı; ya da bir kurtarma süpürmesi.

---

### 🟡 H. Takas iptal/red/dispute-cancel status'u koşulsuz `active` yapıyor
**dosya:satır** `trade.service.ts:1069` (reject), `:1425` (cancel), `:1944` (dispute-cancel) ✅
Bunlar ürünü koşulsuz `active` yapar; oysa scheduler/admin yolları `newReserved > 0 ? reserved : active` yapıyor. Üründe BAŞKA canlı rezervasyon kaldıysa (eşzamanlı), iptal onu `active`'e çevirip aşırı-görünür/satılabilir yapabilir.

**Önerilen:** bu üç yolda da `newReserved > 0 ? reserved : active` mantığını kullan (scheduler ile aynı).

---

### 🟡 I. `releaseProductForFailedPayment` `reservationReleasedAt` guard'ı yok
**dosya:satır** `payment.service.ts:1880-1895` ✅
`expireUnpaidOrders` `!reservationReleasedAt` kontrol ediyor; başarısız-ödeme yolu etmiyor. 30-dk cron bıraktıktan sonra ödeme fail olursa rezervasyon **2. kez** bırakılır (clamp'li, negatife düşmez ama eşzamanlı başka alıcının rezervasyonunu "çalar").

**Önerilen:** aynı `!reservationReleasedAt` guard'ını ekle.

---

## 4. İncelendi, hata DEĞİL (teyitli)
- `rejectTrade`'deki `status === 'accepted'` dalı (`trade.service.ts:1053`): modern accept asla `accepted` bırakmadığı için **ölü kod**; zarar yok (reject yalnız pending'den erişilebilir). Temizlenebilir.
- İade çift-restock (`processRefund` + `handleExpiredPreparingOrders`): `alreadyCancelled` guard'ı + sıralama sayesinde **güvenli** — ama 2300 satır arayla, örtük invariant'a dayalı; yorum/assert eklemeye değer.
- Refund quantity++ ve ödeme-başarısı quantity-- simetrisi: erken-dönüş iade yolları order'ı `cancelled` bıraktığı için tutuyor; kırılgan ama şu an doğru.

## 5. Öncelik sırası (öneri)
1. **A** (görünürlük) — kullanıcının yaşadığı aktif sorun; satın-alma tarafı hâlâ açık.
2. **D** (reconcile fazla sayım) — yanlış "stokta yok" yaratır.
3. **B** (iptalde negatif reserved) — oversell.
4. **C** (süre-aşımı yanlış `reserved` status'u) — sınırsız/tükenmiş ürün kaybolur.
5. **E** (ödeme quantity kilidi/clamp) — oversell savunması.
6. **H, I, G, F** — tutarlılık/uç durumlar.
