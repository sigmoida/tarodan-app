# Kargo — Sürat Entegrasyonu, Paket Kademeleri ve Yaşam Döngüsü

> Kalıcı referans (2026-08-17, kod üzerinden doğrulandı). Doküman ile kod
> çelişirse kod doğrudur. Para tarafı (escrow/iade maliyeti dağılımının
> gerekçesi) için [PAYMENTS.md](./PAYMENTS.md), kod biçimleri için
> [CODE_SCHEME.md](./CODE_SCHEME.md).

---

## 1. Üç kimlik — yeni gelenlerin en çok karıştırdığı şey

| Kimlik                        | Biçim                | Ne                                                                                                                                                                                                                                                                                      |
| ----------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Order.orderNumber`           | `ORD-…`              | Satır sipariş                                                                                                                                                                                                                                                                           |
| `OrderPackage.packageNumber`  | `PKG-…`              | **Bir fiziksel koli.** Sürat'a referans olarak gönderilir (v1'de `OzelKargoTakipNo`, v2'de `SatisKodu` — aynı alan) ve `Shipment.trackingNumber`'a yazılır. Takip sorgusunun anahtarıdır. Türetilmez, saklanan kolondur (türetilen referans geçmişte kaymış ve mükerrer koli üretmişti) |
| `Shipment.providerTrackingId` | Sürat `KargoTakipNo` | Sürat'ın kendi numarası; UI'da gösterilen budur. Resmi iki endpoint ZPL döndürmediğinden legacy `Shipment.labelZpl` alanı boş kalır                                                                                                                                                     |

Kullanıcıya dönük ad: `packageNumber` = **"Teslimat No"**.

Sürat'a giden referans her sipariş kargosunda `OrderPackage.carrierReference ??
packageNumber`'dır — teklif siparişleri dahil (kabul tek koli açar; bkz.
`CODE_SCHEME.md` §2.1). Tek istisna, 2026-09 öncesi paketsiz yaratılmış teklif
siparişleri: backfill kolisi `carrierReference` olarak canlı `ORD-…`
referansını taşır, böylece Sürat'taki mevcut gönderi ve takip kesintisiz sürer.

---

## 2. Sürat entegrasyonu

`modules/surat-cargo/`. Ana şalter `SURAT_CARGO_ENABLED`; geriye dönük adı
korunan `SURAT_SOAP_MODE` production'da yalnız `rest` olabilir. Dış Sürat
trafiği iki resmi endpoint'le sınırlıdır.

- **Gönderi oluşturma:** `createShipmentWithBarcode()` aktif create ucuna
  idempotent create gönderir. Hangi uç olduğunu `SURAT_CREATE_API_VERSION`
  seçer:
  - `v1` = `GonderiyiKargoyaGonder`. **Gönderici alanı YOKTUR** — koli, fiilen
    kimin yolladığından bağımsız olarak Sürat'taki kurumsal cari hesabımızın
    üstüne açılır.
  - `v2` = `GonderiOlustur`. Gerçek göndericiyi taşır (satışta satıcı, iadede
    alıcı, takasta kullanıcı ya da depo) — pazaryeri için gereken budur.
    `SURAT_FIRMA_ID` zorunludur; ili **plaka koduyla** ister (`@tarodan/types`
    → `resolveTrPlateCode`), adı/soyadı ayrı ister ve `Iademi` bayrağı yoktur:
    iade artık gönderen/alıcının yer değiştirmesiyle ifade edilir.

  Taraf bilgisi `CargoProvider` portunda `sender`/`recipient` olarak taşınır;
  Sürat alan adları yalnız istemcinin içindedir. Çözülemeyen bir il ya da
  telefon **fail-closed**'dur: gönderi açılmaz. Satıcının kayıtlı adresi yoksa
  koli açılmaz, satıcıya `SELLER_ADDRESS_REQUIRED` bildirimi gider ve barkod
  retry cron'u adres eklenince tamamlar.

- **Gerçek kargo kodu:** aynı referans (v1 `OzelKargoTakipNo` / v2 `SatisKodu`),
  resmi `KargoTakipHareketDetayi` endpoint'ine `WebSiparisKodu` olarak verilir;
  yanıttaki `KargoTakipNo`, `providerTrackingId` alanına yazılır. Takip kaydı
  henüz görünmüyorsa shipment `pending`+kodsuz kalır ve retry worker tamamlar.
  Bu sözleşme ZPL döndürmediği için `labelZpl` null kalır.
- **Retry + idempotency:** `withSuratTechnicalRetries` (3 deneme, 200 ms taban,
  15 sn timeout); create başarısı Redis'te kendi referansımızla 7 gün
  cache'lenir. Takip kodu görünür olduğunda ayrıca cache'lenir; yerel iptal bu
  cache'leri geçersiz kılar.
- **Ortak fulfilment yolu:** `PaymentCommonService.ensureSuratShipmentForOrder`
  — `Shipment` satırını yaratır, yeniden ödenen siparişte `cancelled` satırı
  "diriltir" (orderId unique), yoksa no-op. **Non-blocking**: barkod çağrısı
  patlarsa satır `pending` + `providerTrackingId = null` kalır, retry cron'u
  doldurur. Koli toplaması burada yapılır (Σ`billableDesi`, tek fiziksel koli,
  birleştirilmiş ürün başlıkları).
- **İptal:** verilen resmi dokümanlarda uzaktan iptal endpoint'i yoktur. Uygulama
  yalnız yerel shipment durumunu iptal eder ve cache'i temizler; fiziksel Sürat
  kaydı gerektiğinde operasyon ekibi tarafından Sürat panelinden iptal edilir.
- **Satıcı şubeye koli koduyla gider** — gönderi ödeme anında Sürat'ta
  kayıtlıdır; `PKG-…` referansı koliyi tanımlar.
- **Poll, webhook değil:** `sync-surat-tracking` cron'u **30 dk'da bir** önce
  eksik barkodları dener (`barcode-retry.service.ts`), sonra durumları senkronlar.
  `surat-tracking.service.ts` artık ince bir facade'dır; davranış
  `order-tracking-sync` / `trade-tracking-sync` / `refund-return-tracking-sync` /
  `barcode-retry` / `cargo-alerting` servislerindedir. Genel
  `POST /shipping/webhook/:provider` **varsayılan kapalıdır**
  (`SHIPPING_WEBHOOK_ENABLED` yoksa 404) — Sürat'ın imzalı callback sözleşmesi
  olmadığından, tahmin edilebilir takip numarasıyla escrow saatini erken
  başlatma saldırısına karşı bilinçli karar. Açıksa `X-Webhook-Secret`
  `timingSafeEqual` ile doğrulanır.
- **Kardeş gönderilere fan-out:** sorgu birimi **kolidir**. Sürat'a koli başına
  tek sorgu atılır ve sonuç `packageId`'yi paylaşan **tüm** `Shipment`
  satırlarına uygulanır (eski `findFirst` kardeşleri askıda bırakıp escrow'u
  açmıyordu). Her kardeş kendi state-machine kontrolünü ve CAS güncellemesini yapar.
- **Bayat kargo alarmları:** `cargo-alerting.service.ts` uzun süre ilerlemeyen
  gönderileri alarmlar. (Koddaki `A9`/`B15`/`D27` referansları, git geçmişindeki
  eski `CARGO_HUMAN_SCENARIOS.md` senaryo kataloğunun bayat-kargo maddeleridir.)

---

## 3. Paket kademeleri ve tarife versiyonlama

- **Model** `ShippingPackageTier`: `tariffId`, `code` (`small|medium|large`),
  admin etiketi, `minDesi`, `maxDesi` (**null = üst sınırsız**), `amount`,
  örnek Ö/Y/D (cm), `sortOrder`. Kod tarafında yalnız varsayılan aralıklar var
  (`shipping-package-tier.ts`: small 0–2/temsili 2, medium 2–5/5, large 5+/**10**);
  fiyat iş verisidir, tarifeye girilir. `billableDesiForTier()` temsili desi
  olarak kademenin **üst sınırını** verir (çok ürünlü koli asla eksik
  ücretlendirilmez); `tierCodeForDesi()` yarı-açık `(min, max]` eşler.
- **Versiyonlama** (`shipping-tariff.service.ts`): `draft | active | archived`,
  sağlayıcı başına otomatik artan `version`; yalnız draft düzenlenir;
  `activate()` tek transaction'da eskisini arşivler (partial-unique index tek
  aktifi ayrıca garanti eder). `getActiveTariff` her fiyatlama isteğinde DB'den
  okur (bilinçli cache'siz — instance'lar arası invalidation yok). Aktif tarife
  yoksa **503 fail-closed**, asla gömülü fiyat yok. Snapshot `{tariffId,
tariffVersion}` tek satırdan gelir ve `OrderPackage`'a damgalanır.
- **Aktivasyon doğrulaması** (`assertActivatableTiers`): üç kod da var, ilk
  kademe `minDesi === 0`, boşluk/çakışma yok (`next.min === prev.max`),
  tutarlar ≥ 0 ve **son kademe `maxDesi === null`** — fiyatsız desi kalmaz
  (eski desi-tablosu 503'ünü kaldıran kural budur).
- **Quote'ta çözümleme** (`resolvePackageShippingDecision`,
  `shipping-tariff.helper.ts`) dört checkout yolu + önizlemenin tek kaynağıdır
  ve **sıra önemlidir**: önce kolinin toplam desisinden kademe, sonra o kademenin
  alıcı payı. Koli satırları arasında seçilen kademe için **en düşük** alıcı payı
  kazanır (sıradan bağımsız; alıcı sepette gösterilenden fazlasını ödemez).
  `splitShippingByBuyerShare` alıcı tarafını yuvarlar, satıcıyı kalan olarak
  türetir → `alıcı + satıcı === tam kargo` daima.
- **`GET /shipping/package-tiers`** (public): aktif tarifenin kademeleri —
  etiket, tutar, örnek ölçüler **ve** desi aralığı (ilan formunun net kazanç
  önizlemesi için; satıcı arayüzünde desi gösterilmez).

---

## 4. Gönderi yaşam döngüsü, deadline'lar, cron'lar

**Durumlar:** `pending → label_created → picked_up → in_transit →
at_delivery_branch → out_for_delivery → delivered`; dallar `failed`,
`return_in_progress`, `returned`, `cancelled`. Tek doğruluk kaynağı
`shipment-state-machine.ts` (`canTransitionShipmentStatus`; terminal:
`delivered/returned/cancelled`) — dört bağımsız yazar (satıcı, webhook, poll,
worker) kör yazıp `delivered → picked_up` gerilemesi yapabiliyordu; escrow
`delivered`'a bağlı olduğu için bu para-kritiktir.

**Escrow tetiği:** tüm yollar `PaymentRefundService.handleOrderDelivered`'a
akar (bkz. PAYMENTS §5). Sürat durumları `surat-status.mapper.ts` ile eşlenir,
CAS geçişi + `ShipmentEvent` kaydı transaction içinde yapılır.

**Hazırlama süresi ve `seller_no_ship`:** ödeme sonrası sipariş `preparing` +
`preparingDeadline = now + PREPARING_DEADLINE_DAYS` (varsayılan 3).
`handleExpiredPreparingOrders` iki fazlıdır: son 24 saatte **uyarı** bildirimi;
süre aşımında `FOR UPDATE` + yeniden okuma guard'ıyla **otomatik iptal + iade**
(`seller_no_ship`). Kaçış kapısı: koli Sürat'ta fiilen hareket ediyorsa
(satıcı "kargoladım" demese bile) iptal atlanır.

**Kargo cron'ları** (`workers/cron-catalog.ts`):

| Anahtar                                           | Zamanlama | Görev                                            |
| ------------------------------------------------- | --------- | ------------------------------------------------ |
| `sync-surat-tracking`                             | */30 dk   | barkod retry + takip poll'u (sipariş+takas+iade) |
| `payment-expired-preparing`                       | */30 dk   | hazırlama uyarısı + seller_no_ship iptali        |
| `refund-crons`                                    | 10 dk     | başarısız iade-kargo açılışını yeniden dener     |
| `order-auto-complete`, `process-delivered-orders` | katalogda | teslim sonrası tamamlama                         |

---

## 5. İptal/iade kargo maliyeti dağılımı

Zihinsel model: platform Sürat'a önden öder ve ödeme anında **tam** kargoyu
(alıcı+satıcı payı) escrow'dan düşmüştür (PAYMENTS §5). İade kararı üç soruyu
yanıtlar: (a) alıcının gidiş payı geri verilir mi, (b) satıcının kesilen payı
tazmin edilir mi, (c) dönüş bacağını kim öder.

- **Satıcı kusuru (iade):** gidiş alıcıya iade edilir ve aynı tutar satıcıya
  borç yazılır (Sürat faturası platformda kalamaz); dönüş de satıcıya. Satıcı
  payı tazmin edilmez.
- **Cayma / alıcı kusuru:** gidiş iade edilmez, dönüş alıcının iadesinden
  düşülür, satıcının payı tazmin edilir (yalnız tam iadede).
- **İptal `hasShipped`'e bağlı:** kargoya verilmeden maliyet yoktur → iki taraf
  bütünlenir; verildiyse maliyet kusurlu tarafa gider.
- **Kargo asla oranlanmaz** (kısmi iadede tek koli tüm adetlere hizmet eder);
  satıcıya yansıtılan gidiş, fiilen iade edilen tutarı izlediği için oranlanır.
- **İade kolisi** `RefundService.openReturnShipment` ile yine
  `createShipmentWithBarcode` üzerinden açılır; maliyeti
  `quoteReturnShipment(provider, billableDesi)`'dan gelir.

---

## 6. Takas kargoları

Takaslar eşten-eşe değil, **Tarodan deposu üzerinden iki bacak** gider:

1. **`to_warehouse`** — takas `shipping_to_warehouse`'a geçince taraf başına bir
   `TradeShipment` otomatik açılır; referans =
   `` `${tradeNumber}-WH-${INI|REC}` ``. Gönderen kullanıcı, alıcı depodur. Satırlar kısa transaction'da yaratılır,
   Sürat çağrısı commit **sonrası** taraf başına yapılır; `(tradeId, shipperId,
leg)` idempotenttir; adresi olmayan taraf uyarıyla atlanır ve kabulü
   bloklamaz (fire-and-forget).
2. **`from_warehouse`** — inceleme sonrası admin depo operasyonları açar;
   geri gönderim için üçüncü bacak `return` vardır.

`TradeShipment` sipariş modelini aynalar (`trackingNumber` = bizim referansımız,
`providerTrackingId` = Sürat, `labelZpl`, `leg`,
kayıp takibi için `lostAt`/`lostReason`). Takip aynı 30 dk cron'unda
`trade-tracking-sync.service.ts` ile senkronlanır.

**Takas nakit farkı** ayrı bir escrow'dur: `commission` KDV-hariç taban,
`commissionTaxAmount` nakit ödeyene aittir ve `totalAmount`'a dahildir; takas
tamamlanınca `holdReleaseAt` kurulur ve saatlik release cron'u açar; kendi
`PayoutTransfer` dalı vardır.

**Depo adresi tek kaynaktan gelir:** `WarehouseAddressService`
(`modules/shipping/warehouse/`) admin Ayarlar'daki `warehouse_address_id`
satırını okur; `config/warehouse.ts` env metni yalnız o satır yoksa devreye
girer. Dört takas bacağının hepsi (2 giriş + 2 çıkış) aynı adresi kullanır —
eskiden giriş env'den, çıkış DB'den okuduğu için depo taşındığında ikisi
ayrışıyordu.

**Takas kolisinin desisi** ürünün paket boyutundan (`Product.shippingDesi`)
gelir ve `calculatePackageDesi` ile toplanır — takas fiyatlamasının kullandığı
FONKSİYONUN AYNISI, böylece tahsil edilen ve bildirilen desi ayrışmaz. Hangi
tarafın ürünü olduğu koliye göre değişir: girişte taraf kendi ürününü yollar,
çıkışta karşı tarafın ürününü alır, redde kendi ürünü geri döner.

**`SHP-` yedek takip numarası yalnız takas yollarında** kullanılır (taşıyıcı
entegrasyonu kapalıyken/barkod alınamadığında). Sipariş gönderileri `SHP-`
kullanmaz — `packageNumber`/`orderNumber`'a düşer ve barkod retry cron'u
`providerTrackingId`'yi sonradan doldurur.
