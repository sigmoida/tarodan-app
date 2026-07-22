# Kargo Denetimi — Sorun Listesi ve Düzeltme Takibi

> 2026-07-22 tarihli 3-yüzeyli denetim (order / trade / refund + retry job).
> Branch: `feat/surat-barcode-retry`. Çözüldükçe `[x]` işaretlenir.

## 🔴 Yüksek

- [x] **H1 — `parseSuratDate` bozuk tarihte senkronu patlatıyor → satıcı ödenmiyor**
  `surat-tracking.service.ts` · `GG/AA/YYYY` dışındaki format (`25.07.2024`) → `Invalid Date` →
  `prisma.shipment.update` throw → `handleOrderDelivered` hiç çalışmaz → escrow zamanlanmaz,
  her 30 dk poll'da tekrar patlar. `new Date(h.IslemTarihi).toISOString()` (event dedupe) de
  Invalid Date'te RangeError fırlatır — aynı crash sınıfı.
  **Çözüm:** güvenli parse (`Date | null`), teslimde `?? new Date()` fallback, geçersiz
  `estimatedDelivery`/`IslemTarihi` satırlarını atla + warn.

- [ ] **H2 — Poller depoya varışta cancel-lock koymuyor (takas escrow açığı)**
  `maybeTransitionTradeToAtWarehouse` / `syncTradeShipmentTracking` `deliveredAt` yazıyor ama
  `firstWarehouseArrivalAt`'i yalnız admin-manuel `markWarehouseReceived` set ediyor →
  A'nın kolisi depodayken taraflar takası hâlâ iptal edebiliyor.
  **Çözüm:** poll path'te ilk `to_warehouse` teslimatında `firstWarehouseArrivalAt` set et
  (admin path ile aynı semantik).

- [ ] **H3 — Takas return bacakları Sürat timeout'unda kalıcı takılıyor**
  Reject DRAFT return satırı kurup Sürat'a tx dışında submit ediyor; timeout →
  idempotency guard (`returning && shipments>=2`) sonraki reject'i kısa devre yapıyor,
  retry job yalnız `to_warehouse` topluyor, poller `trackingNumber:null`'ı atlıyor →
  kullanıcı gerçek iade etiketini hiç alamıyor. (Stuck-return DRAFT'ı da aynı.)
  **Çözüm:** retry job'a trade-return yüzeyi ekle (DRAFT'ı da submit edebilen), reject
  guard'ı kodsuz leg'de re-submit'e izin verecek şekilde düzelt.

- [x] **H4 — İptal edilip yeniden ödenen sipariş kargoya bir daha kaydolmuyor**
  İptalde shipment `cancelled`; reaktivasyon+yeniden ödemede fulfillment yalnız
  "hiç shipment yoksa" create ediyor (`orderId @unique` → eski satır blokluyor) →
  ödenmiş sipariş kodsuz/takipsiz kalıyor; poller `cancelled`'ı, retry `pending`'i istiyor.
  **Çözüm:** fulfillment'ta `cancelled` shipment'ı revive et (yeni barkod + pending'e reset).

## 🟠 Orta

- [x] **M1 — Sürat'ta barkod oluştu ama lokal `shipment.create` patladı → kurtarılamaz orphan**
  Ödeme idempotent olduğu için tekrar denenmiyor; retry Shipment tablosunu taradığından
  satır yokken göremiyor.
  **Çözüm:** retry job'a "paid/preparing + shipment satırı YOK" adayı ekle → satırı oluştur
  + barkodu (idem cache sayesinde çift kayıt olmadan) doldur. MEM-/dijital siparişleri dışla.

- [ ] **M2 — Retry job: kalıcı hataya backoff yok, 48s sonrası sessiz terk**
  Bozuk adresli kayıt ~96 kez boşa denenir, sonra pencereden sessizce düşer; kimseye
  haber gitmez.
  **Çözüm:** cache-tabanlı per-kayıt backoff (migration'sız) + 48s ageout'ta tek seferlik
  ERROR log/uyarı.

- [ ] **M3 — Takas `to_warehouse` bacakları hiç `shippedAt` almıyor**
  `handedToCargo` cancel-lock hep false; `bothToWarehouseShipped` reveal hiç ateşlenmiyor.
  **Çözüm:** poll'da ilk hareket (picked_up/in_transit/...) görüldüğünde `shippedAt` set et.

- [ ] **M4 — Refund retry yüzeyi ölü kod (blocking `openReturnShipment`)**
  Aday durumu (`surat + kod null + return_shipment_open`) hiç oluşmuyor çünkü open
  başarısızsa throw edip hiçbir şey yazmıyor; kurtarma zaten 10-dk `refund-scheduler`'da.
  **Karar/Çözüm:** ölü refund yüzeyini retry'dan çıkar, kurtarma yolunu (scheduler)
  yorumla belgele.

- [ ] **M5 — Takas no-address tarafı sessiz skip → takas askıda, bildirim yok**
  Yalnız `logger.warn`; event/bildirim yok, takas deadline'a kadar asılı.
  **Çözüm:** kullanıcıya "adres ekle" bildirimi + iz bırakan kayıt (event) + belirgin log.

- [ ] **M6 — `ShippingWorker` ölü kod + latent çift-yazma tehlikesi**
  Kuyruğa hiçbir yer enqueue etmiyor; ama `handleCreateShipment` sahte tracking üretip
  ikinci Shipment yaratabilir (`orderId @unique` çakışması).
  **Çözüm:** processor'ı sil (kuyruk kaydı DI için gerekiyorsa kalabilir).

- [ ] **M7 — TOCTOU stale-snapshot penceresi (terminal-dışı statüler)**
  Poller/webhook baştaki snapshot'a göre guard'layıp blind write yapıyor →
  yarışta `delivered` üzerine `in_transit` yazılabilir.
  **Çözüm:** compare-and-swap: `updateMany({ id, status: eskiStatus })`, count 0 → skip.

## 🟡 Düşük

- [ ] **L1 — Web UI placeholder'ı gerçek kod gibi gösteriyor**
  Takas kartları + RefundRequestBanner `cargoCode ?? trackingNumber` render ediyor →
  kod yokken kullanıcı şubede geçersiz iç ref sunar.
  **Çözüm:** kod yoksa "kargo kodu hazırlanıyor" göster (manual iade hariç).

- [ ] **L2 — Bilinmeyen Sürat durum kodu sessizce `in_transit`**
  `?? in_transit` default'u; yanlış aksiyon durumu, alert yok.
  **Çözüm:** bilinmeyen kod → statüyü değiştirme + warn (raw kod yine kaydedilir).

- [ ] **L3 — Sürat payload alanlarında uzunluk/format sınırı yok**
  Aşırı uzun adres/ad → Sürat reject/truncate → sessiz kodsuzluk.
  **Çözüm:** `buildRestGonderi`'de merkezi trim+cap.

- [ ] **L4 — `applyReturnTrackingUpdate`'te terminal-regression guard yok**
  Diğer iki poll path'inde var; parite için ekle.

- [ ] **L5 — Kargo maliyetinde NaN riski**
  `parseFloat(PlatformSetting)` NaN olabilir → checkout'a `{rate: NaN}` sızar.
  **Çözüm:** `Number.isFinite` guard + default fallback.

- [ ] **L8 — Retry backlog görünürlüğü yok (25/tick cap)**
  Büyük yığın ~2400'ü aşana dek görünmez. **Çözüm:** toplam aday sayısını say + logla.

## 📋 Kayda geçen / bilinçli bırakılan

- [ ] **L6 — Webhook yalnız order Shipment'ı çözüyor** (trade/refund `ignored`) —
  Sürat push etmiyor, tüm akış polling; by-design. Şimdilik değişiklik yok, not düşüldü.
- [ ] **L7 — `TRD-TRD-` çift önek** — kozmetik; mevcut OID'ler stabil/idempotency anahtarı
  olduğu için format değişikliği riskli → wontfix, belgelendi.
- [x] **N3 — Poller `trackingNumber || orderId` fallback'i** UUID ile boş sorgu atıyor —
  zararsız ama israf; `trackingNumber` yoksa erken çık.

## ✅ Denetimde doğrulanan (zaten düzgün)

- Placeholder→gerçek kod (order + admin yüzeyleri)
- Checkout–fulfillment çift-shipment yarışı yok (checkout no-op, tek yazar)
- Cancel'da idempotency cache invalidasyonu
- Teslimde kanonik `handleOrderDelivered` (escrow) — H1 istisnası hariç
- Terminal-regresyon kilidi (order + trade poll)
- Retry idempotency anahtarları orijinal create ile birebir → çift kayıt yok
- Retry scheduler izolasyonu (yüzey başına try/catch)
- Takas privacy-nulling tutarlı (list + detail + shipments[]), labelZpl asla DTO'da değil
- `maybeTransitionTradeToAtWarehouse` FOR UPDATE + idempotent
- Manual iadeler retry/poller'dan doğru dışlanıyor

## Çözüm sırası

1. H1 → 2. H4+M1 → 3. H3 → 4. H2+M3 → 5. M4 → 6. M2, M5, M6, M7 → 7. L1–L5, L8, N3
