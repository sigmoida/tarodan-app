<!-- @format -->

# Kargo (Sürat) Rework Planı — anında gerçek kargo kodu

> Durum: PLAN (implement edilmedi). Model B korunuyor (satıcı şubeye **numarayla** gidiyor),
> ama kod **sipariş/takas onaylanınca anında** `OrtakBarkodOlustur` ile oluşturulup UI'da
> gösteriliyor; polling yalnızca **durum** için kalıyor.

## 0. Kritik iç görü — üç kimliği ayır

| Kimlik               | Ne                                           | Nerede saklanır      | Kullanım                                                                               |
| -------------------- | -------------------------------------------- | -------------------- | -------------------------------------------------------------------------------------- |
| **OzelKargoTakipNo** | Bizim referansımız (= sipariş/takas/iade no) | `trackingNumber`     | Poller `KargoTakipHareketDetayi`'yi **WebSiparisKodu = bu** ile sorgular → DEĞİŞMEMELİ |
| **KargoTakipNo**     | Gerçek Sürat kodu (barkod)                   | `providerTrackingId` | UI'da **bu** gösterilir; satıcı şubeye **bunu** verir                                  |
| internal id          | UUID                                         | `id`                 | iç                                                                                     |

**Bugünkü hata:** gerçek kod gelince poller onu `trackingNumber`'a yazıyor (`surat-tracking.service.ts:435-437`) — bu poll sorgu anahtarını bozar. Doğrusu: `trackingNumber` = OzelKargoTakipNo sabit kalır, gerçek kod `providerTrackingId`'ye yazılır ve UI onu gösterir.

> ⚠️ **Doğrulanacak (Sürat/ops):** Şube tezgahı gönderiyi hangi numarayla buluyor — `KargoTakipNo` (barkod) mu, yoksa `OzelKargoTakipNo` (bizim ref) mi? Plan `KargoTakipNo` gösterimi üzerine kurulu; ops farklıysa gösterilen alanı değiştiririz.

## 1. Hedef akış

1. **Checkout:** Sürat'a ön-kayıt (fail-fast) **kaldırılır**; yerine adres DTO doğrulaması. Ödeme alınır. (OrtakBarkodOlustur ödeme ÖNCESİ çağrılamaz — ödenmemiş siparişe gerçek kargo açar.)
2. **Ödeme başarılı (payment-fulfillment):** Shipment satırı + `OrtakBarkodOlustur` → `KargoTakipNo` + ZPL. Persist: `trackingNumber=orderNumber` (poll ref), `providerTrackingId=gerçek kod`, `labelZpl?`. **Non-blocking:** başarısızsa shipment `pending` kalır + "kargo oluşturulamadı, yeniden dene" (retry job/admin/satıcı).
3. **UI:** `providerTrackingId` (gerçek kod) anında gösterilir + "bu numarayı şubeye verin"; henüz yoksa "oluşturuluyor/hata + yeniden dene".
4. **Poller (30 dk):** yalnız **durum** (query hâlâ `trackingNumber`=OzelKargoTakipNo ile). Kod-backfill blokları no-op olur.

## 2. İş kalemleri (file:line ile)

### A. Sürat entegrasyon katmanı (etkinleştirici)

- **Client katmanına** `callOrtakBarkodOlustur(payload,opts) -> {kargoTakipNo, labelZpl, raw}` ekle: abstract `SuratSoapClient` (`surat-soap.client.ts:12-36`) + `RestSuratClient` + `StubSuratSoapClient` (test introspection) + `LiveSuratSoapClient`. `buildRestGonderi`'yi yeniden kullan; `KargoTakipNo` + **tam** `Barcode[]` (probeBarcode'daki 200-char truncate YOK). `isError`/`IsError` casing.
- **`SuratCargoService.createShipmentWithBarcode(payload)`** — `submitShipmentWithRetry` (`surat-cargo.service.ts:63-179`) retry+idempotency sarmalayıcısını aynen kullan, ama sonuç `{ok, kargoTakipNo, labelZpl, suratMessage}`.
- `surat-cargo.types.ts` — yeni `SuratBarcodeSuccess` tipi.
- `surat-tracking.service.ts:189-260` `probeBarcode` yalnız admin-test olarak kalır (ya da yeni metoda delege).

### B. Sipariş akışı

- **Kaldır:** checkout ön-kaydı — `order-checkout-common.service.ts:73-130` (`assertSuratShipmentSucceeded`) + çağıranlar: `order-checkout-direct.service.ts:349,653`, `order-checkout-group.service.ts:461`, `order-guest-checkout.service.ts:342`.
- **Ekle:** `payment-fulfillment.service.ts:688-699` (tekil) ve `:1122-1131` (grup) — Shipment satırı oluştururken `createShipmentWithBarcode` çağır; `trackingNumber=orderNumber`, `providerTrackingId=gerçek kod`, `labelZpl?`. Hata **yutulmaya devam** ama shipment `pending` + retry işareti (bugün zaten swallow — ama artık gözlemlenebilir olmalı).
- **Retry:** gerçek kodu olmayan `pending` surat shipment'ları için retry (scheduler job + admin/satıcı "yeniden dene" aksiyonu).

### C. Poller → yalnız durum

- `syncAllActiveShipments` (`surat-tracking.service.ts:361`) query anahtarı `trackingNumber` (OzelKargoTakipNo) — **değişmez**. `:435-445` backfill blokları guarded no-op olur (kod zaten oluşturmada set edildi). Status/event/delivery/escrow/terminal-guard aynen kalır.

### D. Takas (ayrı `TradeShipment` modeli — 4 bacak)

- **Şema:** `TradeShipment`'a (`schema.prisma:640`) `providerTrackingId` + `labelZpl?` (+ ops: `trackingUrl?`, `providerStatusCode?`) ekle (migration).
- **Swap → `createShipmentWithBarcode`** ve gerçek kodu persist et:
  - Leg A (inbound, kullanıcı→depo ×2): `trade-shipment.service.ts:339` — trade **accept** (`trade-lifecycle.service.ts:505`) / nakit ödeme (`payment-fulfillment.service.ts:1266`) / reconciliation (`trade-reconciliation.service.ts:293`).
  - Leg B (outbound, depo→kullanıcı ×2): `admin-trade-warehouse.service.ts:323` — admin **approve**.
  - Leg C (red-iade ×2): `admin-trade-warehouse.service.ts:86` — admin **reject**.
  - Leg D (stuck-iade ×1): `admin-trade-resolution.service.ts:481` — force-cancel-stuck.
- **Sessiz-atlama açığını kapat:** adressiz bacak `trade-shipment.service.ts:262-267`'de sessizce atlanıyor → aksiyon alınabilir hata (row `pending`) yap; entegrasyon kapalı fake-`TRK` fallback'lerini (`admin-trade-warehouse.service.ts:320,80`; `admin-trade-resolution:528`) ve legacy `markAsShipped` fake kodunu (`trade-lifecycle.service.ts:1099-1126`) reconcile et.
- **Takas poller** (`syncAllActiveTradeShipments` `:791`) yalnız durum; dead backfill `:752-753` kaldır.
- **DTO/mapping/UI:** `trade-response.dto.ts:26-36` + `trade-common.service.ts:212-220`'ye `providerTrackingId`/label ekle; kartlar `WarehouseShipmentCard.tsx:44`, `RecipientsShipmentCard.tsx`, `ReturnShipmentCard.tsx` (web) + admin `ShipmentLegCard.tsx` gerçek kodu göstersin.

### E. İade (refund return)

- **Şema:** `RefundRequest`'e (`schema.prisma:1497`) `returnProviderTrackingId` (+ label?) ekle.
- **Swap:** `refund.service.ts:468` → `createShipmentWithBarcode`; alıcının anında gerçek iade kodu olsun (bugün `returnTrackingNumber=refundNumber`, kod yok).
- İade poller (`syncAllActiveRefundReturns` `:620`) yalnız durum.

### F. UI (web + admin)

- **web `SellerActions.tsx` "Kargo Referans Numarası" kartı:** gösterilen değer `order.orderNumber` → **`shipment.providerTrackingId`** (gerçek kod). `order.cargoRefInstructions` metnini "**bu kargo numarasını** şubeye verin" olarak güncelle. **"30 dakika içinde" vaadini kaldır** (`order.trackingAppearsAfterDropoff`). Kod yoksa "oluşturuluyor/hata + yeniden dene" durumu. i18n: `packages/i18n/src/catalog/tr.json` (`order.*`) düzenle.
- `ShippingInfoCard.tsx` / `OrderCard.tsx`: gerçek kod anında; `SHIPPED_ORDER_STATUSES` gating'i yeniden değerlendir.
- **Ortak yardımcı:** `suratkargo.com.tr/KargoTakip/?kargotakipno=` ~6 yerde tekrarlıyor → tek helper (koddan `providerTrackingId` ile kur). `order-common.service.ts:126-131` URL'i `providerTrackingId`'den kursun.
- **admin:** ops isterse `POST shipping/surat/barcode` endpoint'ini `operations.ts` + `SuratTestConsole.tsx`'e bağla (şu an unwired).

## 3. Bug'lar (rework'e dahil)

| #   | Bug                                                                                | Yer                                                         | Fix                                                                                                                                       | Öncelik            |
| --- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| a   | İptal sonrası idempotency cache invalidate edilmiyor + cache değeri kodu taşımıyor | `surat-cargo.service.ts:64,90,224-233`                      | Cache'i **OzelKargoTakipNo** ile anahtarla (ya da ondan deterministik türet), değeri `{kargoTakipNo,labelZpl}` yap, cancel'da `cache.del` | **BLOCKER**        |
| h   | Tracking'te ham `new Date()` → Invalid Date fırlatır, sync'i keser                 | `surat-tracking.service.ts:457,585,597` (+trade `:850,862`) | Hepsini `parseSuratDate` üzerinden geçir, `isNaN`→null                                                                                    | blocker-adjacent   |
| b   | Shipment status TOCTOU race (version/lock yok)                                     | `shipping.service.ts:360-432`                               | `Shipment.version` + `where:{id,version}` ya da tx-içi re-check                                                                           | blocker-adjacent   |
| e   | Ölü `ShippingWorker` (sahte tracking/label üretebilir)                             | `workers/shipping.worker.ts`                                | `create-shipment`/`generate-label`/legacy handler'ları sil ya da gerçek yola bağla                                                        | blocker-adjacent   |
| c   | Bilinmeyen status → `in_transit`                                                   | `surat-status.mapper.ts:47`, `shipping.service.ts:384`      | Bilinmeyeni **skip+warn**                                                                                                                 | ride-along         |
| g   | Eşzamanlı çift submit → 2 gerçek kargo                                             | `order-checkout-common.service.ts:101`                      | OzelKargoTakipNo + idempotencyKey'i stabil kimlikten deterministik türet + DB unique                                                      | ride-along (a ile) |
| d   | Kargo ücreti iki kaynak (checkout vs Shipment.cost)                                | `shipping.service.ts:236` vs `order-pricing.service.ts:85`  | Tek kaynak: ödenen tutarı `shipment.cost`'a geçir                                                                                         | ride-along         |
| f   | `SetShippingAddressDto` uzunluk/format yok (presence VAR)                          | `dto/set-shipping-address.dto.ts`                           | `@MaxLength` + telefon `@Matches`                                                                                                         | ride-along         |
| i   | NaN kargo ücreti 5 dk cache                                                        | `order-pricing.service.ts:70-77`                            | `Number.isFinite` guard + bozuk parse cache'leme                                                                                          | ride-along         |

## 4. Şema migration'ları (hepsi additive → güvenli, entrypoint otomatik uygular)

- `Shipment`: `labelZpl String? @db.Text` (opsiyonel, etiket saklama).
- `TradeShipment`: `providerTrackingId String?` (+ `labelZpl?`, `trackingUrl?`, `providerStatusCode?`).
- `RefundRequest`: `returnProviderTrackingId String?` (+ label?).
- (Ops) `Shipment.version Int @default(0)` — TOCTOU için.

## 5. Karar gerektiren noktalar

1. **Blocking vs non-blocking:** Öneri — kod **ödeme sonrası, non-blocking** (sipariş kaybolmaz; hata→pending+retry). Onay?
2. **UI'da hangi numara:** Öneri — gerçek `KargoTakipNo` (`providerTrackingId`). Sürat şube tezgahının hangi ref ile aradığını ops teyidiyle sabitle.
3. **ZPL etiket:** Öneri — sakla ama UI'da gösterme (satıcı numarayla gidiyor, yazıcı yok). İleride "etiket yazdır" eklenebilir.
4. **Kapsam/fazlama:** Öneri — Faz 1: katman+sipariş+poller+blocker bug'lar+UI; Faz 2: takas; Faz 3: iade. Yoksa hepsi tek seferde mi?

## 6. Rollout & doğrulama

- **Staging** (env zaten doğru: enabled/rest/creds, `TEST_MODE=true`): önce admin barcode endpoint'ini bağla → `OrtakBarkodOlustur` gerçek **test** `KargoTakipNo` dönüyor mu gör. Sonra test sipariş → `Shipment.providerTrackingId` anında dolmalı, UI gerçek kodu göstermeli. Takas + iade testleri.
- **Prod:** `SURAT_KARGO_TEST_MODE=false` + canlı creds, kanarya sipariş, logları izle.
