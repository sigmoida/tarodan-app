# Operasyon Rehberi — Ortamlar, Reset ve Launch

> `PRODUCTION_LAUNCH.md`, `production-database-reset.md` ve `STAGING_AND_SEED.md`
> 2026-08-02'de bu dosyada birleştirildi. Konular: ortam guard'ları, staging
> reset + seed-assets modeli, production launch runbook'u, veritabanı reset'i ve
> doğrulama hattı (yerel hook'lar, CI kapıları, deploy'lar — §4).

---

## 1. Ortamlar ve guard'lar

| Ortam   | `APP_ENV`   | `S3_ENV_PREFIX` | Not                                                                       |
| ------- | ----------- | --------------- | ------------------------------------------------------------------------- |
| Lokal   | development | `dev`           | `pnpm dev:seed` + `pnpm db:seed:media:local`                              |
| Staging | staging     | `staging`       | API staging URL'siyle `S3_ENV_PREFIX=prod` görürse açılışı reddeder       |
| Canlı   | production  | `prod`          | `PAYMENT_BYPASS=false`, `PAYTR_TEST_MODE=false`, `PAYOUTS_DISABLED=false` |

- Staging ve production **aynı Coolify host'unda**; SSH repo seviyesindeki
  `SERVER_HOST`/`SERVER_USERNAME`/`SERVER_PASSWORD` ile yapılır. Hangi ortamın
  hedeflendiğini SSH değil, `COOLIFY_STAGING_UUIDS`/`COOLIFY_PROD_UUIDS` +
  script içi parmak izi guard'ları belirler.
- Arama indeksleri `APP_ENV`'den otomatik izole edilir
  (`production-products`, `production-collections`). **`ELASTICSEARCH_INDEX_PREFIX`'i
  elle vermek zorunda değilsin** — verirsen karşı ortamın adını ASLA yazma.
  2026-08-02'de staging'e `production` yazılmıştı: iki ortam tek indekste buluştu,
  canlı vitrinin araması staging'in demo ürünlerini gösterdi ve reset her
  temizlediğinde staging beş dakika içinde geri doldurdu. Artık API açılışta
  reddediyor; preview dağıtımlarının kendi öneki (`preview-…`) serbest.
- Web kilidi: `SITE_LOCKED=true` → tüm public rotalar `/coming-soon`.
  `SITE_UNLOCK_SECRET` (≥32 karakter) unlock cookie'lerini imzalar — rotate
  etmek verilmiş tüm cookie'leri anında geçersiz kılar; `SITE_UNLOCK_PIN`
  API'den bağımsız acil yedek koddur. Erken erişim PIN'leri admin
  `System → Early Access`'ten yönetilir (unlock cookie 10 gün).

### Canlıda test şeridi (App Review / mobil QA hesapları)

Canlıda `User.isTestAccount=true` hesaplar izole bir **test şeridi** oluşturur
(bkz. `docs/mobile-parity/21-test-lane-2026-09-08.md`). Sipariş/ödeme/takas/ledger
satırları DB trigger'ıyla `is_test` damgası alır; uygulama kodu bayrağı unutamaz.

- **Hesap açma:** admin → Sistem → Test Araçları → Test Şeridi (yalnız süper-admin,
  audit'e yazılır). Hesap doğrulanmış ve adresli açılır.
- **Consents and identity:** a new account opens with the mandatory agreements
  (terms, privacy, KVKK) accepted at the current version; otherwise mobile 1.1.0
  shows an undismissable consent screen at login. No legal identity (first name,
  last name, TCKN) is asked for: the test lane is exempt from the identity gate
  (`required: false`). To complete accounts opened BEFORE this change, and every
  time a document version changes (CONSENTS.md):
  `docker exec "$API_CID" sh -c 'cd /app && node dist-seed/maintenance/backfill-test-account-consents.js'`
  — VARSAYILAN dry-run'dır: hedef veritabanını (host/db, şifresiz), etkilenecek
  hesap / satır sayısını ve atlananları yazar, hiçbir şey yazmaz. Yazmak için aynı
  komuta `--apply --db=<veritabanı adı>` eklenir; ad, çıktıdaki hedef veritabanıyla
  birebir eşleşmezse (ya da hedef doğrulanamazsa: boş host / Unix socket URL'si)
  betik yazmaz. Eski `--confirm` artık kabul edilmez. Tablo ekleme-yalnızdır, geri
  alınamaz. Yazma sonunda "yazılan N / planlanan M" yazılır (fark uyarı verir);
  bağlantı hatasında o ana kadar yazılan raporlanır ve tekrar koşmak güvenlidir.
  İdempotent; yalnız eksik / eski sürümdeki belgeye satır ekler. En son kaydı
  `withdrawn` olan belge ATLANIR (bilinçli geri çekme yeniden onaylanmaz) ve
  raporlanır. Yeni açılan hesapların onay satırlarında IP ve kullanıcı ajanı boştur
  (yöneticinin isteği kanıt olarak damgalanmaz).
  Staging'de elle `docker exec` yerine GitHub Actions → **Staging Run UAT Accounts**
  kullanılabilir: `backfill=dry-run` (varsayılan) yazmadan raporlar, `backfill=apply` +
  `db_name=<ad>` yazar (workflow önce dry-run çıktısını da basar; ad yine betik
  tarafından hedef DB ile doğrulanır). Aynı koşu UAT hesaplarını da uygular
  (`seed-uat.js --accounts-only`).
- **Ne olmaz:** PayTR gerçek tahsilat (form `test_mode=1` — pazaryeri VE üyelik
  mağazasında; oto-yenileme de test modunda çekilir), PayTR iadesi (aşağıda),
  Sürat gönderisi (`TEST…` takip kodu), eLogo belgesi (üyelik faturası dahil),
  payout, canlı vitrinde görünürlük.
- **Raporlar test şeridini saymaz:** dashboard (dönem özeti, sabit Dün/Bu ay/Tüm
  zamanlar, stok bölgesi, para/teslimat kuyrukları ve uyarılar), `/analytics`
  sekmeleri ve dışa aktarımı, Finans Özeti ve mutabakatı, ödeme istatistikleri,
  payout özeti, satıcı hakediş dökümü, PayTR döküm mutabakatı ("dökümde yok"
  listesi, iki mağaza) ve sipariş zamanlayıcısının "kargoda takılı"/"faturasız
  teslimat" alarmları. Yüklem tek yerde: `modules/account-lane/live-lane.where.ts`.
  İnsan kararı bekleyen moderasyon kuyrukları (ilan onayı, mesaj, başvuru,
  belge, destek, şikayet) bilinçli olarak şeritten bağımsızdır — inceleme
  hesabının ilanı da onaylanmadan yayına girmez.
- **Operasyonel listeler test kaydını gösterir, "TEST" rozetiyle:** Siparişler
  ekranı (sepet, teklif ve takas sekmeleri), İptaller ve İadeler, iade talebi
  listesi ile sipariş/takas/teklif/iade detay başlıkları. Sekme ve kova
  sayaçları listeyle aynı kümeyi sayar (test dahil). İptal dökümünde (Excel)
  "Test şeridi" kolonu vardır.
- **İade PayTR'ye gitmez:** test ödemesinin iadesi (admin sipariş iptali, alıcı
  talebi, cron'lar, kısmi iade, takas nakit iadesi) canlı iade API'sini
  çağırmaz; deneme satırına sentetik `TEST-REFUND-<attemptId>` referansıyla
  başarı yazılır ve akışın geri kalanı (ödeme/sipariş durumu, hold, stok,
  `cancelledBy`, bildirimler, test damgalı defter kaydı) aynen işler. PayTR
  olay günlüğüne yazılmaz; tekrar deneme idempotenttir.
- **Sıfırlama:** aynı karttaki "Şeridi sıfırla" test hesaplarının işlem
  kayıtlarını siler; hesaplar ve ilanlar kalır. Canlı satırlar sorguya giremez
  (filtre `is_test`/test hesap kimlikleri üzerinden). İki istisna:
  - **Defter (`ledger_entries`) silinmez.** Tablo append-only (DELETE trigger'la
    yasak) ve FK taşımaz — "kaynak satır silinse de iz kalır" tasarımı gereği.
    Test satırları `is_test` damgalı olduğundan finans raporlarına girmez;
    sıfırlama sonucu bunları `retainedLedgerEntries` olarak bildirir.
  - **İade kalemleri için dar bir tahliye kapısı vardır.**
    `refund_financial_components` ve `package_shipping_settlements` de
    append-only; ama `refund_requests`'e ZORUNLU + `Restrict` ile bağlı oldukları
    için silinmeden sipariş zinciri çözülemiyor. Guard yerinde kalır ve DELETE
    yalnız iki koşul birden sağlanınca geçer: oturum `SET LOCAL
app.test_lane_purge = 'on'` demiş olacak (yalnız `resetLane` transaction'ı
    verir, commit/rollback'te düşer) **ve** satırın iade talebinin siparişi
    `is_test=true` olacak. Canlı satırda ikinci koşul asla sağlanmaz; UPDATE her
    koşulda yasaktır (`20260922150000_test_lane_purge_gate`).
- **Guard:** prod'da test-modu PayTR callback'i yalnız `Payment.isTest=true`
  ödemeler için kabul edilir; canlı ödemeye gelen `test_mode=1` başarı bildirimi
  ve test ödemesine gelen `test_mode=0` başarı bildirimi reddedilir
  (`PAYTR_TEST_MODE_CALLBACK_REJECTED`). Kural iki bildirim ucunda da geçerli;
  üyelik yenilemesinde (siparişi olmadığı için damga yok) şerit sahibin
  `isTestAccount` bayrağından okunur.
- **Migrasyonlar:** `20260922120000_production_test_lane`,
  `20260922130000_test_lane_ledger`, `20260922140000_test_lane_ledger_refs`,
  `20260922150000_test_lane_purge_gate` — `prisma migrate deploy` ile, bu
  sırayla. (PR #494'te 8–16 Eylül damgalıydılar; hiçbir ortama uygulanmadan
  development'ın 22 Eylül migrasyonlarının ardına taşındılar.)
- Yeni bir dış-dünya yan etkisi (fatura/kargo/para) eklenirse `isTest`
  kapısı zorunludur; şerit kuralları `modules/account-lane/` altında.

### eLogo ortamı: demo ile canlı arasında "test bayrağı" yok

eLogo'da PayTR/Sürat'taki gibi bir test modu yoktur; belgenin GİB'e gidip
gitmediğini yalnız **host** belirler. Demo host'unda (`pb-demo.elogo.com.tr`)
üretilen her belge sandbox'ta kalır: PDF'inde DEMO filigranı vardır, GİB'e
ulaşmaz ve **yasal olarak kesilmemiş sayılır**. 2026-09'da canlı API bir dönem
demo host'una bağlı kaldı; belgeler "sent" görünürken hiçbiri resmî değildi ve
sandbox'taki XSLT tasarımı silinince tüm gönderimler düştü.

API açılışta kilitler (`config/env.validation.ts`):

| Ortam   | `ELOGO_SOAP_URL` host'u                                                       | `ELOGO_ENABLED`  |
| ------- | ----------------------------------------------------------------------------- | ---------------- |
| Canlı   | `pb.elogo.com.tr` ZORUNLU (`ELOGO_ALLOW_NON_LIVE_HOST=true` bilinçli istisna) | `true` zorunlu   |
| Staging | `pb.elogo.com.tr` YASAK — test siparişleri GİB'e gerçek fatura keser          | `false` olabilir |

Canlı env'i doğrulamak için konteynerde `pnpm smoke:elogo -- diagnose`
(belge kesmez). Sandbox'ta üretilmiş belgeler varsa sıra:

1. Env'i canlıya çevir (host, kimlik, canlı portala yüklenmiş tasarımın
   `ELOGO_INVOICE_XSLT_UUID`'i ya da varsayılan tasarım için boş).
2. Mali müşavirle numara kararı: canlı hesapta hiç belge yoksa sayaç sıfırlanır
   (ilk belge `TRD<yıl>000000001`); yoksa GİB'de 1–N arası boşluk kalır.
3. `pnpm elogo:reissue-demo:prod -- --before=<ortamın canlıya çevrildiği ISO an>`
   önce dry-run; sonra `--apply` (gerekirse `--reset-sequence`). Script demo
   belgeleri `cancelled/demo_environment` yapar, numarayı `DEMO-`, kaynağı
   `demo:` önekiyle saklar ve yeniden kesimi outbox'a yazar (takas ücretleri
   10 dk'lık cron'da kendiliğinden kesilir).
4. Admin → Finans → Faturalar'da "Deneme Tükendi" kalan belgeler için
   "Yeniden Dene". Tükenmiş belge alarmı belge başına günde bir kez admin
   bildirimi + Sentry olayı üretir; çözülene kadar sonraki turlar yalnız warn'dır.

### Her API açılışında otomatik koşanlar

`apps/api/entrypoint.sh` → `prisma migrate deploy` + `dist-seed/prisma/seed-production.js`.
İkincisi yalnız **iskeleti** idempotent garanti eder; her upsert'in `update` dalı
boştur, yani girilmiş hiçbir değeri ezmez:

- üyelik katmanları (free/basic/premium/business);
- TR vergi bölgesi, varsayılan KDV oranı ve vergi kuralı;
- `platform@tarodan.com` platform-satıcı hesabı (rastgele şifre) — **tek
  istisna**, `update` dalı doludur: sistemin kendi servis hesabı, bozulursa
  kendini onarması istenir;
- aktif Sürat kargo tarifesi + üç paket kademesi (fiyatlar başlangıç değeri).

**Komisyon kuralı bilinçli olarak YOK.** Eskiden buradaydı ve demo config'in
yerel "Araba" senaryosu için yazılmış oranlarını her aktif kategoriye ACTIVE
olarak yayınlıyordu — kategoriler girildikten sonraki ilk redeploy'da canlı
fiyatlandırma kimse onaylamadan değişebiliyordu. Artık komisyonun kaynağı
lansman seed'i (`seed-launch.js`) ya da adminin yayınladığı kural setidir;
hiçbiri yoksa `/api/health/ready` kırmızı kalır ve ilan oluşturma 503 döner.

Demo seed (`prisma/seed.ts`, `*@demo.com`, `Admin123!`) production yollarında
asla çalışmaz; `release-production-bootstrap.spec.ts` ve
`seed-independence.spec.ts` bunu sözleşmeyle korur.

### Bir kerelik: yorum sayacı backfill'i sonrası reindex

`20260804090000_backfill_approved_only_product_rating_stats` migration'ı
`products.average_rating` / `rating_count` kolonlarını yalnız **approved**
yorumlardan yeniden hesaplar (onaysız yorum kartta sayılıyordu). SQL doğrudan
yazdığı için Prisma middleware'i tetiklenmez → **Elasticsearch dokümanlarında
eski sayaç kalır** ve "puana göre sırala" bayat sonuç verir. Deploy'dan sonra
bir kez çalıştır:

```
curl -X POST https://<api-host>/api/search/admin/reindex   # admin token gerekir
```

**Beklemek çözmez:** 5 dk'lık delta ve saatlik reconcile yalnız _eksik_ ve
_yetim_ dokümanları eşitler (`deltaSync` = ID kümesi farkı); ID'si zaten
indekste olan bir ürünün alanlarını tazelemezler. Ürün bir sonraki kez
düzenlenene kadar bayat kalır — bu yüzden tam reindex zorunlu adımdır.

### Bir kerelik: herkese açık kimlik (username) geçişi sonrası reindex

Arama dokümanlarındaki `sellerName` (ürün) ve `userName` (koleksiyon) alanları
denormalize edilmiş kopyalardır ve artık **herkese açık ad** ile doldurulur
(firma adı → kullanıcı adı → isim; bkz. `common/helpers/public-identity.ts`).
Geçişten önce indekslenmiş dokümanlarda üyelerin **gerçek adı** durur; kod
deploy edilse bile o dokümanlar aranabilir kalır. Deploy'dan sonra bir kez:

```
curl -X POST https://<api-host>/api/search/admin/reindex              # ürünler
curl -X POST https://<api-host>/api/search/admin/reindex-collections  # koleksiyonlar
```

Yukarıdaki uyarı burada da geçerli: delta/reconcile bu alanları tazelemez.
Veritabanı tarafında yapılacak bir işlem YOKTUR — şema, benzersiz indeks ve
`legacy_########` yer tutucuları zaten mevcut (`20260729180000` migration'ı).

### Deploy sonrası: satış yetkisi (seller) filtresi sonrası Elasticsearch reindex

`SearchCommonService.indexableProductWhere()` artık `seller:
saleCapableSellerWhere()` içerir (e218a720 / 7fae49213, #439): satış yetkisini
yitirmiş satıcının (süresi biten BUSINESS dönemi, geri alınan kurumsal onay)
ilanları indekslenebilir kümeden çıkar. Eski koşulla yazılmış dokümanlar
indekste kaldıkça her eşleşen istek PostgreSQL yoluna düşer (arama/liste
yavaşlar, yanlış sonuç vermez) ve `inSync` kontrolü drift raporlar. Bu
değişikliği ilk kez alan bir ortamda deploy'dan sonra bir kez çalıştır.

Mekanizma: `SearchService.reindexAll` — indekslenebilir tüm ürünleri okur,
`products` indeksini **silip** güncel mapping'le yeniden kurar, tek bulk
istekle doldurur. **Dry-run yoktur**; önce salt-okunur durum kontrolü:

```
curl -s https://api.tarodan.com.tr/api/search/status          # public, salt-okunur
# → {"documentCount":N,"dbCount":M,"inSync":true|false,...}
```

Çalıştırma — ikisinden biri:

- Admin panel → **Sistem Ayarları** başlığındaki **"Yeniden Dizinle"** butonu
  (admin / super_admin, `products` izni);
- ya da admin token'ıyla:

```
curl -X POST https://api.tarodan.com.tr/api/search/admin/reindex \
  -H "Authorization: Bearer $ADMIN_ACCESS_TOKEN"
# → {"indexed": <dbCount ile aynı>}
```

**Süre / etki:** güncel katalog boyutunda (~550 ürün) birkaç saniye. İstek
senkrondur; indeks silinip bulk tamamlanana dek arama boş/eksik dönebilir —
düşük trafikte çalıştır. Hata olursa `search_indexes.status = error` olur ve
`500 server.search.reindexFailed` döner; ES'i kontrol edip yeniden çalıştır
(idempotent). Koleksiyon indeksi bu değişiklikten etkilenmez.

**Doğrulama:** `GET /api/search/status` → `documentCount` = `dbCount` (hedef
budur; `inSync` yalnız sayıyı ±2 toleransla karşılaştırır, ID düzeyinde temizlik
kanıtı değildir); POST yanıtındaki `indexed` = `dbCount`; API logunda
`Reindexed <N> products`. Takip: `ProductQueryService`'in ES ↔ Postgres
uyuşmazlık fallback'i (`products.length !== esResult.ids.length`) normal
trafikte sık tetiklenirse, #439'daki "stale id'leri düşür, toplamı düzelt"
yumuşatması gündeme alınır.

> Bu küme farkı kendiliğinden de kapanır: saatlik `search-hourly-reconcile`
> aynı `indexableProductWhere()` ile ID kümesi farkını alıp yetim dokümanları
> siler; API açılışındaki `syncIndexIfEmpty` de mapping'de `sellerCanSell` /
> `sellerSalesEntitledUntil` / `productKind` yoksa tam reindex yapar. Elle
> reindex düzeltmeyi bir saat beklemeden anında yapar. 2026-10-17 itibarıyla
> staging 551/551; production 566/564 (`inSync: true` ama 2 doküman fark var —
> canlıya çıkışta elle reindex ile `documentCount` = `dbCount` yapılması önerilir).

### Bir kerelik: silinen hesap kimlik arşivi backfill'i

`20260909090000_deleted_user_identity` migration'ı `deleted_user_identities`
tablosunu açar ve silme yolu bundan sonra kimliği silmeden ÖNCE arşivler. Ama
**daha önce silinmiş hesaplar** için arşiv boştur; onların kimliği yalnız
kalıntı kayıtlardan (banka hesabı, kurumsal başvuru, e-belge, sipariş adres
snapshot'ı, denetim kaydı, e-posta/güvenlik logları) toparlanabilir.

Migration deploy'da **kendiliğinden** koşar (`entrypoint.sh` → `migrate deploy`),
ama backfill KOŞMAZ — elle tetiklenir. Coolify host'unda, API konteynerinde
(`production-reset.yml`'deki `docker exec` kalıbının aynısı), **önce sayım**:

```
docker exec "$API_CID" sh -c 'cd /app && node dist-seed/maintenance/backfill-deleted-user-identities.js --dry-run'
docker exec "$API_CID" sh -c 'cd /app && node dist-seed/maintenance/backfill-deleted-user-identities.js'
```

Yerelde aynı script `pnpm --filter @tarodan/api backfill:prod:deleted-identities`
ile koşar (önce `build:seed`); prod konteynerinde pnpm workspace yoktur.

Dry-run çıktısı alan bazında kurtarma oranını ve hiçbir kimlik alanı
çözülemeyen hesapların id'lerini basar; script tahmin YAZMAZ, boş bırakır.

**Beklemek maliyetli:** `email_logs` 90, `security_logs` 180 gün sonra
log-retention cron'u ile siliniyor (`admin/jobs/log-retention.service.ts`).
Her geçen hafta e-posta kurtarma oranı düşer. `audit_logs` hiç silinmediği
için yönetici silmelerinde kimlik kalıcı olarak kurtarılabilir.

Backfill idempotenttir (`upsert` + boş `update`): tekrar çalıştırmak mevcut
satırları bozmaz. Tablo satırları DB tetikleyicisiyle **silinemez**; yasal
imha gerekirse `SET LOCAL "tarodan.allow_identity_purge" = 'on'` gerekir.

### Bir kerelik: fatura taraf/işlem kolonları backfill'i

`20260910100000_elogo_invoice_parties_and_context` migration'ı
`elogo_invoices` (model: `FiscalInvoice`) tablosuna `seller_user_id`, `buyer_user_id` ve `context`
(sipariş gerçekleşme şekli) kolonlarını ekler. Yeni kesilen belgeler bunları
kesim anında yazar; **migration'dan önce kesilmiş belgelerde boştur**.

Kolonlar boşken o belgeler admin **Faturalar** ekranında görünür ama "Satıcı",
"Alıcı" ve "Sipariş Gerçekleşme Şekli" kolonları `—` gösterir, ayrıca
"Alıcıya/Satıcıya Kesilen" sekmelerine düşmezler ("Tüm Faturalar"da dururlar).

Migration deploy'da kendiliğinden koşar, backfill KOŞMAZ:

```
docker exec "$API_CID" sh -c 'cd /app && node dist-seed/maintenance/backfill-elogo-invoice-parties.js --dry-run'
docker exec "$API_CID" sh -c 'cd /app && node dist-seed/maintenance/backfill-elogo-invoice-parties.js'
```

Yerelde: `pnpm --filter @tarodan/api backfill:prod:invoice-parties` (önce
`build:seed`). Çözümleme kesim yolunun aynı fonksiyonudur
(`resolveInvoiceParties`), ikinci bir eşleme yoktur.

Idempotenttir: yalnız üç kolonu da boş olan satırlara dokunur. `--dry-run`
iade faturalarını "çözülemeyen" sayar — tarafları ters çevirdikleri belgeden
devraldıkları için kaynakları henüz yazılmamıştır; gerçek koşuda dolarlar.

### Faz 1b (Netsis geçişi): e-belge kaydı sağlayıcıdan bağımsız

`20261012120000_fiscal_invoice_provider` migration'ı YALNIZ `provider`
kolonunu (`elogo` varsayılanlı) ekler. Kod adları sağlayıcıdan bağımsızdır
(`FiscalInvoice`, `providerRef`…) ama **veritabanı adları bilerek değişmez**:
`elogo_invoices`, `elogo_doc_sequences`, `elogo_ref_id` / `elogo_result_code` /
`elogo_result_msg` ve `ElogoInvoice*` enum tipleri Prisma `@map` ile eşlenir.
Ek geriye dönük uyumludur: eski imaj kolonu yok sayar, deploy penceresi ve
geri dönüş adımı gerektirmez.

Bilinçli olarak eski adıyla kalanlar (ayrı bir ops adımı isterler, bkz.
`INVOICING_PROVIDERS.md` "Faz 5"): `/elogo/invoices*` yolları, `elogo-retry-pending`
cron kimliği, `ELOGO_*` ortam anahtarları, S3 klasörü `elogo-invoices/`, e-posta
şablonu `elogo-invoice`, bildirim türü `ELOGO_INVOICE_EXHAUSTED`.

### Bir kerelik: onay kayıtları (consent_records) geçişi

`20261005100000_consent_records` migration'ı hukuki onay kayıtları tablosunu
ekler (yalnız ekleme; ayrıntı ve sözleşme: `CONSENTS.md`). Deploy'da kendiliğinden
koşar. Ardından iki adım:

**1. Eski sepet onaylarını aktar.** Mesafeli satış onayı daha önce
`checkout_groups.distance_sales_*` kolonlarına yazılıyordu; artık tek kayıt
`consent_records`. Aktarılmayan eski onaylar Onay Kayıtları ekranında görünmez:

```
docker exec "$API_CID" sh -c 'cd /app && node dist-seed/maintenance/backfill-distance-sales-consents.js --dry-run'
docker exec "$API_CID" sh -c 'cd /app && node dist-seed/maintenance/backfill-distance-sales-consents.js'
```

Yerelde: `pnpm --filter @tarodan/api backfill:prod:distance-sales-consents`
(önce `build:seed`). İdempotent; orijinal onay anı ve sürümüyle yazar, IP /
kullanıcı ajanı o dönemde saklanmadığı için boştur.

**2. Mesafeli satış zorunluluğunu (sonra) aç.** Ödeme formu (`direct-form`)
onaysız satın almayı varsayılan olarak REDDETMEZ — onay kutusunu göndermeyen
eski mobil sürümler ödeme yapabilsin diye. Mobilin onayı gönderen sürümü
yeterince yayıldığında panelde **Ayarlar → Yasal** sekmesinden
"Mesafeli satış onayı ödemede zorunlu" açılır (platform ayarı
`distance_sales_consent_required = "true"`; deploy gerekmez). Açıkken onay
kaydı olmayan satın alma `400 server.consent.distanceSalesRequired` alır.

Hesap belgeleri (kullanım şartları / gizlilik / KVKK) için ayrı bir anahtar
yoktur: onayı olmayan ya da belge sürümü değişen üye bir sonraki girişte web'de
yeniden-onay penceresini görür. Belge metni değiştiğinde
`packages/types/src/legal-consent.ts` içindeki sürüm güncellenmelidir.

### One-off: trade consents onto the cash payment column

Migration `20261022180000_consent_records_trade_cash_payment` adds
`consent_records.trade_cash_payment_id` (nullable FK, `ON DELETE SET NULL`), a
partial unique index (one granted distance sales consent per trade cash
payment) and widens the append-only guard for that column (`CONSENTS.md`,
"Trade binding"). It runs on deploy and moves no data. Trade consents written
before it (or by the previous image during the deploy) have the reference only
in `details`; the API still finds them there. After the release is live, copy
the reference into the column, dry run first (the default, writes nothing):

```
docker exec "$API_CID" sh -c 'cd /app && node dist-seed/maintenance/backfill-consent-trade-cash-payments.js'
docker exec "$API_CID" sh -c 'cd /app && node dist-seed/maintenance/backfill-consent-trade-cash-payments.js --apply --db=<database name>'
```

`--db` must match the target database the dry run prints. Locally:
`pnpm --filter @tarodan/api backfill:prod:consent-trade-cash-payments` (run
`build:seed` first).

The dry run lists each candidate (consent id, cash payment id, outcome) and
the totals; ids only, no personal data:

- `set`: `--apply` fills the column.
- `payment_missing`: the cash payment no longer exists (test-lane purge); the
  row stays NULL and keeps its `details`.
- `duplicate`: another granted consent of the same payment holds it (an
  earlier double submit); only the earliest row is filled. Nothing to do.

Each write is a compare-and-set on the column being NULL, so a re-run is safe
and a second run reports no `set` rows. Once it is clean in production, the
legacy `details` fallback (`legacyTradeConsentDetailsWhere`) can be removed in
a later release.

### One-off: require the step-up for account deletion and e-mail change

`DELETE /users/me` and `POST /auth/email/request-change` check a step-up token
(`POST /auth/reauth`) whenever the client sends one, but by default they do
not require one: mobile versions without the step-up send none (which ones:
tarodan-ops `compat.md`). Switch the requirement on only when all three are true:

1. A mobile version that sends the token is live, and
   `min_supported_app_version_ios` and `min_supported_app_version_android` are
   at least that version, the first one that sends it. Raising them past the
   version live today is not enough: a later version without the step-up
   would lose account deletion and e-mail change.
2. The web release that sends the token is live.
3. Google sign-in on Android is live. Until then the setting stays off
   (user decision, 2026-10-21): Apple-only accounts on Android, and
   Google-only accounts while Google is off on Android, cannot pass the
   step-up in the app, so in-app account deletion would need a password set by
   e-mail first (App Store 5.1.1(v) and Play account-deletion risk).

Then, in the admin panel, **Settings -> Security**, turn on "Require step-up
confirmation for account deletion and email change" (platform setting
`auth_require_reauth_for_sensitive_actions = "true"`; no deploy). It applies
on the next request. While it is on, a request without a token gets
`403 REAUTH_REQUIRED`. To roll back, turn it off.

### Seller trust score (nightly batch)

Reference: `docs/SELLER_TRUST.md`. The repeatable `seller-trust-refresh` runs
at 02:30 Europe/Istanbul in the worker role and writes only its own table,
`seller_trust_scores`.

- **First deploy (no manual step).** Migration
  `20261021165740_seller_trust_scores` creates the empty table. On boot, an
  instance that finds the table empty queues one run with the fixed Bull job
  id `seller-trust-bootstrap`, so several instances queue it once; the worker
  runs it. If it fails, the next nightly run fills the table (the read path
  shows "new seller" until then).
- **Sentry.** The scheduled fire checks in to the cron monitor
  `seller-trust-refresh`; a failed or missed run alerts by e-mail. Bootstrap
  and manual runs are not tracked there (they show in Bull Board).
- **Manual run.** Admin, Test Tools, "Satıcı güven skorları". On staging this
  is the calibration step. In production it is a production write: only with
  the user's approval.
- **A failed run** keeps every existing row (no cleanup) and fails the Bull
  job, which retries three times. The job log names the failed batch index
  and the error class.
- **Calibration** (read-only, on staging after a run):

  ```sql
  SELECT width_bucket(score_x100, 0, 500, 10) AS bucket, count(*)
  FROM seller_trust_scores GROUP BY bucket ORDER BY bucket;
  SELECT count(*) FILTER (WHERE score_x100 IS NULL) AS new_sellers, count(*)
  FROM seller_trust_scores;
  SELECT user_id, score_x100, components FROM seller_trust_scores
  ORDER BY score_x100 DESC NULLS LAST LIMIT 20;
  ```

- **Rollback.** Revert the job code; on the next boot the repeatable is no
  longer registered (remove the leftover one from Bull Board). The table is
  harmless if left.

### One-off: saved-search tier limits

Reference: `docs/SAVED_SEARCHES.md`. Migration `20261021174800_saved_searches`
adds `membership_tiers.max_saved_searches` with DEFAULT 5 on every tier and
the empty `saved_searches` table. Until the script below runs, every tier
allows 5 saved searches. Run it once after the deploy, dry run first:

```
docker exec "$API_CID" sh -c 'cd /app && node dist-seed/maintenance/set-saved-search-limits.js'
docker exec "$API_CID" sh -c 'cd /app && node dist-seed/maintenance/set-saved-search-limits.js --apply'
```

The first command only prints the tiers and the planned changes (basic 10,
premium 20, business 50; free keeps 5). Locally: `pnpm --filter @tarodan/api
set:prod:saved-search-limits` (after `build:seed`). The script changes only
tiers still at 5 whose launch value differs, so a re-run changes nothing and
a value other than 5 set in **System -> Membership Tiers** stays. It cannot
tell a paid tier deliberately set to 5 from an untouched one: run it right
after the deploy, before anyone edits the field. If it reports fewer updated
tiers than planned, a tier changed meanwhile; run the dry run again. In production this is a production write: only with the user's
approval.

Rollback: set the values back in the admin panel. The column and table are
harmless if left; a later migration drops them.

### Listing boost settings

Reference: tarodan-ops plan `2026-10-21-listing-boost`. Migration
`20261021195258_boost_source_and_offer_dismissals` adds the boost source,
grant, cancel, refund and reminder columns to `product_boosts` and the empty
`boost_offer_dismissals` table. No data step: every existing boost is a
`purchase`.

- `boost_enabled` (on/off). Unlike the other toggles, a **missing** row means
  **on** (`isBoostEnabled` in `@tarodan/types`); only `"false"` stops new
  boost purchases. Running boosts continue either way.
- `boost_offer_since` (ISO timestamp). Listings created after it get a
  one-time boost offer once they are live. Empty or invalid means the offer
  is off, the state after the release. No step yet: the offer ships with the
  seller boost API. Setting it in production is a production write, after
  the app release and with the user's approval.
- Boost prices come only from the ad package tiers; the legacy
  `boost_price_3d`, `boost_price_7d` and `boost_price_30d` settings are no
  longer read.
- **Release blocker (boost purchase consents).** A boost purchase records
  the `platform_service_sales` and `withdrawal_waiver` consents with its
  order (`CONSENTS.md`, "Platform services (boost)"). Both texts are drafts
  (versions ending in `-draft`) until legal signs them off; do not release
  the boost purchase to production before the signed texts and their dated
  versions are merged. No data step: a boost order created before the
  release and still unpaid is refused at the card form
  (`server.product.boostConsentRequired`); the seller starts the purchase
  again from My listings.

Migration `20261021211736_boost_own_showcase_window` adds each boost's own
showcase end (`showcase_ends_at`) and its paused showcase remainder
(`paused_showcase_seconds`). No data step: a row written before it reads the
listing's `home_showcase_until` (capped by its own end) until its next
timeline change writes the column, and a remainder paused before it is capped
at the boost's bought and extended days on resume. Rollback: revert the API;
the columns are harmless if left.

### Check: ad package tier bands

Reference: `docs/PAYMENTS.md`, "Boost tier band". An ad package tier's band
of listing prices is half-open (`minAmount <= price < maxAmount`). Before
this rule the upper bound was inside the band too, and the admin save did not
refuse overlapping tiers. Two consequences for rows already in the database:

- A listing priced exactly at a band's upper bound now falls in the next
  band, or in none. The launch rows (migration `20260726234552_ad_packages`)
  are 200-999, 1000-5000 and 5000-(none) per duration: 5000 now resolves to
  the 5000-(none) tier only (before, the options showed both prices and the
  purchase start could pick either), and a listing priced exactly 999 had
  no tier until the first band's upper bound was set to 1000. The migration
  `20261022165035_ad_package_tier_band_gaps` (runs with the deploy) does
  that: it sets an active band's upper bound to the next active band's lower
  bound when they are at most 1 apart and the widened band overlaps no other
  active tier of the duration. It writes only `max_amount`, a second run
  changes nothing, and its header carries the rollback SQL.
- Overlapping active tiers of one duration still resolve, deterministically
  (`BOOST_TIER_PRECEDENCE`), but the price may not be the one meant.

**Before the deploy (dry run and rollback record).** The migration runs at
boot, so its dry run is this read-only query, the migration's UPDATE as a
SELECT. Run it with a read-only SQL session against the database of the
environment about to be deployed (staging before the push, production before
the release; production only with the user's approval) and keep the output:
each row is a tier the migration will widen, with its old upper bound, which
is also the rollback record for rows other than the launch ones.

```sql
SELECT t."id", t."package_id", t."duration_days", t."min_amount",
       t."max_amount" AS "old_max_amount", gap."next_min" AS "new_max_amount"
FROM "ad_package_tiers" AS t
JOIN (
  SELECT cur."id", (
    SELECT MIN(nxt."min_amount") FROM "ad_package_tiers" AS nxt
    WHERE nxt."package_id" = cur."package_id"
      AND nxt."duration_days" = cur."duration_days"
      AND nxt."is_active"
      AND (nxt."max_amount" IS NULL OR nxt."max_amount" > nxt."min_amount")
      AND nxt."min_amount" > cur."max_amount"
  ) AS "next_min"
  FROM "ad_package_tiers" AS cur
  WHERE cur."is_active" AND cur."max_amount" IS NOT NULL
    AND cur."max_amount" > cur."min_amount"
) AS gap ON gap."id" = t."id"
WHERE gap."next_min" - t."max_amount" <= 1
  AND NOT EXISTS (
    SELECT 1 FROM "ad_package_tiers" AS other
    WHERE other."package_id" = t."package_id"
      AND other."duration_days" = t."duration_days"
      AND other."id" <> t."id"
      AND other."is_active"
      AND (other."max_amount" IS NULL OR other."max_amount" > other."min_amount")
      AND other."min_amount" < gap."next_min"
      AND (other."max_amount" IS NULL OR other."max_amount" > t."min_amount")
  )
ORDER BY t."package_id", t."duration_days", t."min_amount";
```

On the launch data it lists the four 200-999 rows with `new_max_amount` 1000.

After the deploy, run the read-only check on staging, then on production:

```
docker exec "$API_CID" sh -c 'cd /app && node dist-seed/maintenance/check-ad-package-tiers.js'
```

Locally: `pnpm --filter @tarodan/api check:prod:ad-package-tiers` (after
`build:seed`). It never writes and has no `--apply`. Per package it prints
`OK` or the findings: `OVERLAP` (two active tiers of one duration that cover
the same prices), `EMPTY` (an upper bound not above the lower bound),
`GAP` (prices between two bands that no tier covers) and
`UPPER BOUND NOW OUTSIDE` (a band's upper bound that no other active band of
the duration covers, the 999 case). After the migration the launch packages
should report no `GAP` or `UPPER BOUND NOW OUTSIDE` line; one that remains is a
wider gap, or a band the migration left alone because widening it would
overlap another tier. Fix each finding in **Marketing -> Ad packages**; the save
refuses a package whose tiers still overlap, so a saved package is clean. A
production fix is a production write: only with the user's approval. Run the
check again until every package is `OK` or its remaining `GAP` lines are
intended.

Rollback: revert the API. An API from before the half-open rule reads the
upper bound as inclusive, so a listing priced exactly 1000 then matches two
bands (as 5000 always did); with such a revert, run the rollback SQL in the
header of `20261022165035_ad_package_tier_band_gaps` and set any other row the
dry run listed back to its `old_max_amount` (production only with the user's
approval).

### Bir kerelik: reklam platformu (web / uygulama) geçişi

`20261016110000_ad_platform_popup` migration'ı reklamlara `platform`
(`web` / `app` / `all`), popup gösterim sıklığı ve popup sürümü ekler. Göç
yalnız şemadır: deploy'da kendiliğinden koşar ve TÜM reklamlar `platform =
all` ile başlar. Eski "Cihaz" hedefini (`device_type`: masaüstü → web, mobil
→ uygulama) taşıyan backfill KENDİLİĞİNDEN KOŞMAZ — **deploy'dan hemen sonra**
elle çalıştırılır; çalışana dek yalnız masaüstüne hedeflenmiş eski bir reklam
uygulamada da görünür:

```
docker exec "$API_CID" sh -c 'cd /app && node dist-seed/maintenance/backfill-ad-platform.js --dry-run'
docker exec "$API_CID" sh -c 'cd /app && node dist-seed/maintenance/backfill-ad-platform.js'
```

Yerelde: `pnpm --filter @tarodan/api backfill:prod:ad-platform` (önce
`build:seed`). İdempotent; admin'in sonradan seçtiği platformu ezmez (API her
yazımda `device_type`'ı platformdan türetir, script yalnız `platform = all`
iken `device_type` hâlâ masaüstü / mobil olan satırlara dokunur).

Ardından panelde **Pazarlama → Reklamlar** listesine bakın: aynı yuvada
(pozisyon + platform) yayında birden çok reklam varsa vitrin yalnız ilkini
gösterir, ötekiler "Aynı yuvada başka reklam yayında" rozetiyle işaretlidir.
Yeni kayıtlarda bu durum oluşamaz (API `409 server.ads.slotTaken`); eskileri
admin pasife alır ya da tarihlerini ayırır.

### Bir kerelik: Süreler ve Kurallar geçişi

İş süreleri artık **Sistem → Süreler ve Kurallar** ekranından yönetilir
(ayrıntı: `TIMING_RULES.md`). Deploy hiçbir süreyi değiştirmez: admin bir
değer kaydedene kadar eski env değişkeni, o da yoksa kod varsayılanı geçerlidir.
Seed'deki eski satırlar (`offer_expiry_hours`, `payment_hold_days`; `updated_by`
boş) env değişkeninin önüne geçmez — `OFFER_EXPIRY_HOURS` canlıda 24'ten farklıysa
o değer korunur.

`20261005150000_order_return_window_ends_at` migration'ı `orders`a boş bir
kolon ekler (yalnız ekleme, geri doldurma YOK). Deploy'dan sonra teslim edilen
siparişlerin cayma penceresi sonu teslimde damgalanır; öncekiler bugünkü
pencereyle hesaplanmaya devam eder.

Deploy sonrası ekranı bir kez açıp **"sınır dışı"** uyarısı taşıyan satır var
mı bakın (ör. env'de `RETURN_WINDOW_DAYS` 14'ün altındaysa). Uyarılı değer
uygulanmaya devam eder; aralık içinde bir değer kaydederek düzeltin.

### Bir kerelik: PayTR üyelik mağazası geçişi (2026-09)

Üyelik ödemeleri (ilk satın alma + oto-yenileme) non-3D yetkili **ayrı bir PayTR
mağazasına** taşındı; sipariş/takas/öne çıkarma/payout pazaryeri mağazasında
kalır. Kartlar **taşınmaz** (token'lar mağazaya özel). Ayrıntı: `PAYMENTS.md` §1
"İki PayTR mağazası", mobil sözleşme: `mobile-parity/20-api-delta-2026-09-17.md`.

**1. Coolify secrets (production VE staging, API servisinde — worker dahil aynı env):**

| Değişken                                  | Production                                                             | Staging                                                                 |
| ----------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `PAYTR_MEMBERSHIP_MERCHANT_ID`            | yeni mağaza no (**`PAYTR_MERCHANT_ID`'den farklı**, boot kontrol eder) | yeni mağaza no                                                          |
| `PAYTR_MEMBERSHIP_MERCHANT_KEY` / `_SALT` | panelden                                                               | panelden                                                                |
| `PAYTR_MEMBERSHIP_TEST_MODE`              | `false`                                                                | `true`                                                                  |
| `PAYTR_MEMBERSHIP_CALLBACK_URL`           | `https://api.tarodan.com.tr/api/payments/callback/paytr/membership`    | `https://staging.tarodan.com.tr/api/payments/callback/paytr/membership` |
| `PAYTR_RECURRING_ENABLED`                 | `true` (yalnız üyelik mağazasını etkiler)                              | `true`                                                                  |
| `PAYTR_MEMBERSHIP_CARD_STORAGE_ENABLED`   | boş/`true` (acil kapatma: `false`)                                     | boş/`true`                                                              |

Kimlik veya callback URL eksikse API production/staging'de **açılmaz**. Bu yüzden
secrets deploy'dan ÖNCE girilir.

**2. PayTR panelleri — Bildirim URL:**

- Pazaryeri mağazası: `https://<api-host>/api/payments/callback/paytr` (değişmedi).
- Üyelik mağazası: `https://<api-host>/api/payments/callback/paytr/membership`.
  İki mağaza aynı URL'i KULLANAMAZ: her uç kendi mağazasının anahtarıyla doğrular,
  yanlış uca düşen bildirim hash uyuşmazlığına düşer.

> **UYARI — üyelik mağazasının Bildirim URL'i:** panelde yalnız
> `/api/payments/callback/paytr/membership` girilir. Eski `/api/payments/callback`
> alias'ı **ve** pazaryeri URL'i (`/api/payments/callback/paytr`) YASAKTIR: alias
> her zaman pazaryeri mağazasına eşlenir, yani iki yanlış URL de bildirimi pazaryeri
> anahtarıyla doğrular. Sonuç: **her** üyelik bildirimi hash doğrulamasından düşer,
> hiçbir üyelik ödemesi callback ile tamamlanmaz (log'da
> `PAYTR_MERCHANT_MISMATCH (invalid hash) ... route=marketplace record=membership`).
> Panele kaydettikten sonra URL'i bir kez daha harf harf karşılaştırın.

- Üyelik mağazasında canlı mod, non-3D, recurring, kart saklama (CAPI) ve Direkt
  API yetkilerinin açık olduğu teyit edilir. Rapor senkronu açıksa rapor yetkisi de.

**3. Deploy:** migration `20260917100000_paytr_membership_merchant` deploy'da
kendiliğinden koşar (tüm mevcut satırlar `marketplace` olarak işaretlenir; tablo
yeniden yazılmaz). Ayrı backfill yoktur.

**4. Duman testi (staging, sonra production'da küçük tutarla):** premium satın
al → direct-form alanlarında `merchant_id` üyelik mağazası → ödeme tamamlanır →
admin'de ödeme; `saved_cards.paytr_merchant = membership`, `mandate_ip` dolu,
üyelikte `autoRenew = true`. Log'da `PAYTR_MERCHANT_MISMATCH` görünmemeli.

**5. Mevcut oto-yenilemeli üyeler — tek seferlik bildirim:** üyelik mağazasında
kartı olmayan tüm oto-yenilemeli ücretli üyelerin `autoRenew`'i kapatılır ve
`membership_renewal_card_required` bildirimi (zil + push, tercihlere uyar) gider.
Script yapmasa da saatlik cron aynı işi yenileme zamanında yapar; script yalnız
üyeyi dönem sonunu beklemeden bilgilendirir. Tekrar çalıştırmak güvenlidir.

```
docker exec "$API_CID" sh -c 'cd /app && node dist-seed/maintenance/notify-membership-card-readd.js'
docker exec "$API_CID" sh -c 'cd /app && node dist-seed/maintenance/notify-membership-card-readd.js --apply'
```

Bayraksız koşu kurudur (yalnız sayar); yazma ve bildirim yalnız `--apply` ile.

**Büyük olasılıkla no-op:** eski (pazaryeri) mağazanın non-3D yetkisi hiç olmadı,
yani recurring hiç çalışmadı; oto-yenilemeye hazır saklı kartlı üye beklenmez.
Önce **yalnız bayraksız (kuru) koşuyu** çalıştırın; sayı `0` ise `--apply`'ı
**atlayın**. Sıfırdan büyükse sayıyı kaydedip `--apply` ile devam edin.

Yerelde: `pnpm --filter @tarodan/api notify:prod:membership-card-readd -- --apply` (önce
`build` + `build:seed`; script derlenmiş `dist/` uygulamasını `PROCESS_ROLE=web`
ile başsız yükler, zamanlanmış işleri koşturmaz).

**6. Geçiş sonrası kontrol — yarım kalmış ödemeler (geçişten 24-48 saat sonra, bir
kez):** geçişten ÖNCE pazaryeri mağazasında başlatılıp geçişten SONRA yeniden
denenen bir üyelik ödemesinin satırı artık `paytr_merchant = membership` taşır;
eski oid'i `payments.metadata.merchantOidHistory`'de kalır. Eski oid için pazaryeri
mağazasından gelen (hash'i geçerli) bildirim bu yüzden **uygulanmaz** ve
`PAYTR_MERCHANT_MISMATCH` loglanır. Kullanıcı eski formda ödediyse para pazaryeri
mağazasına geçmiş ama üyelik açılmamış olabilir.

_a) Log araması:_ `PAYTR_MERCHANT_MISMATCH` `logger.error` ile yazılır; Sentry'ye
ayrı bir issue olarak **gitmez** — kaynak API konteynerinin logudur (Coolify → API
servisi → Logs'ta arama, ya da):

```
docker logs --since 72h "$API_CID" 2>&1 | grep PAYTR_MERCHANT_MISMATCH
```

Satırda `merchant_oid`, `route` (bildirimin geldiği uç), `record` (kaydın mağazası)
ve `status` bulunur. `(invalid hash)` içeren satırlar yarım ödeme değil, panelde
yanlış Bildirim URL'idir → 2. adımdaki uyarıya bakın. Aynı bilgi kalıcı olarak DB'de de
vardır: bildirimler `payment_provider_events`'e mağazasıyla kaydedilir (sorgu b).

_b) Salt-okunur SQL_ (production DB'de yalnız `SELECT`; `<GECIS_ANI>` yerine
deploy'un UTC zamanını yazın, ör. `'2026-09-18 07:30:00+00'`):

```sql
-- Geçişten önce oluşturulmuş, geçişten sonra üyelik mağazasında yeniden
-- başlatılmış (eski oid'leri geçmişte duran) ve tamamlanmamış üyelik ödemeleri.
SELECT p.id                                    AS payment_id,
       o.order_number,
       o.buyer_id,
       p.status,
       p.amount,
       p.created_at,
       p.metadata->>'lastChargeStartedAt'      AS son_cekim_basi,
       p.provider_conversation_id              AS guncel_oid,
       p.metadata->'merchantOidHistory'        AS eski_oidler,
       (SELECT json_agg(json_build_object(
                 'oid', e.merchant_oid, 'magaza', e.paytr_merchant,
                 'status', e.status, 'hash', e.hash_valid, 'at', e.created_at)
               ORDER BY e.created_at)
          FROM payment_provider_events e
         WHERE e.event_type = 'callback'
           AND e.merchant_oid IN (
                 SELECT jsonb_array_elements_text(p.metadata->'merchantOidHistory'))
       )                                       AS eski_oid_bildirimleri
  FROM payments p
  JOIN orders o ON o.id = p.order_id
 WHERE p.provider = 'paytr'
   AND p.paytr_merchant = 'membership'
   AND o.product_id LIKE 'membership-%'
   AND p.created_at < TIMESTAMPTZ '<GECIS_ANI>'
   AND jsonb_typeof(p.metadata->'merchantOidHistory') = 'array'
   AND jsonb_array_length(p.metadata->'merchantOidHistory') > 0
   AND p.status NOT IN ('completed', 'refunded')
 ORDER BY p.created_at;
```

Oid'lerin kendisinde tarih yoktur (sonek yalnız milisaniyenin son 6 hanesi); "geçiş
öncesi oid" bu yüzden satırın `created_at`'i geçişten önce olmasıyla yakalanır —
geçmişteki oid'lerden en az biri pazaryeri mağazasında başlatılmıştır. Satır
dönmezse kontrol biter. `eski_oid_bildirimleri`'nde `magaza = marketplace`,
`status = success` görülen satır **öncelikli**dir (para eski mağazada alınmış).
`p.status = 'completed'` satırlarına da bir kez göz atmak isterseniz son filtreyi
kaldırın: eski oid'de de `success` varsa çift çekimdir.

_c) Manuel çözüm (her satır için):_

1. **Eski mağazada sorgula:** `eski_oidler`'deki her oid için **pazaryeri** mağaza
   panelinde (İşlemler → sipariş no araması) ya da pazaryeri mağazasının
   kimlikleriyle PayTR durum-sorgu (`/odeme/durum-sorgu`) ile sonucu alın. Üyelik
   mağazasının kimlikleriyle sorgulamayın — o oid orada yoktur.
2. **Hiçbirinde başarılı çekim yoksa:** işlem gerekmez; ödeme kendi akışında
   (yeni deneme ya da süre dolumu) kapanır.
3. **Eski oid'de başarılı çekim varsa ve kullanıcı yeni mağazada da ödemediyse:**
   ya kullanıcıya üyeliği admin panelinden elle tanımlayın (dönem = ödenen paket;
   karar ve tutar destek kaydına yazılır) ya da tutarı **pazaryeri** mağaza
   panelinden iade edip kullanıcıya yeniden satın almasını söyleyin. Uygulama bu
   ödeme satırını eski mağazanın sonucuyla kendiliğinden tamamlamaz; iade de
   uygulamadan yapılamaz (satırın mağazası artık `membership`) — iade panelden.
4. **Hem eski hem yeni oid'de başarılı çekim varsa (çift çekim):** eski oid'in
   tutarını pazaryeri mağaza panelinden iade edin.
5. Yapılan işlemi oid, kullanıcı ve tutarla destek/muhasebe kaydına geçin (rapor
   mutabakatında pazaryeri mağazasının dökümünde eşleşmeyen satır olarak görünür).

**Bilinen sınır:** ayrı "kart ekle" akışı yoktur; kart yalnız bir üyelik
ödemesinde saklanır. Dönemi süren üye kartını bir sonraki satın almada ekler.
Geçiş öncesi alınmış üyelik ödemelerinin iadeleri eski (pazaryeri) mağazadan
yapılır — ek iş gerekmez.

### One-off: settle seller-fault escrow residuals

A seller-fault cancellation before shipment used to leave the seller's
shipping share in the hold: the order closed, but the hold stayed `held` with
`amount − refundedAmount > 0`, and because the seller was at fault it was
**never paid** (admin list: "Satıcı kusurlu — ödenmez"). The source is fixed,
and since decision D20 any earlier seller-fault refund of an order forfeits
the share at the source as well. The residuals that piled up are settled with
this script. The money does not go to the buyer, who already got back
everything they paid; the residual belongs to the platform (`PAYMENTS.md` §5).
There is no PSP call: the hold becomes `cancelled` with
`refundedAmount = amount`, and the ledger gets a balanced
`seller_escrow → platform_commission` `adjustment` group
(`hold-residual-settle:<holdId>`).

After the deploy, dry run first (the default, report only):

```
docker exec "$API_CID" sh -c 'cd /app && node dist-seed/maintenance/settle-seller-fault-residuals.js'
docker exec "$API_CID" sh -c 'cd /app && node dist-seed/maintenance/settle-seller-fault-residuals.js --apply'
```

Locally: `pnpm --filter @tarodan/api settle:prod:seller-fault-residuals` (run
`build` + `build:seed` first; the script loads the compiled application
context from `dist/`).

The report lists, per hold: hold, order, seller, residual, fault basis and
outcome.

- `seller` (a finalized refund names the seller at fault: the v2 fault
  column or a v1 `seller_fault_*` code): settled by `--apply`.
- `unknown` (closed order without a finalized refund, or only a `legacy`
  refund without a fault party): **decide manually**.
  The script lists these rows and their total but never settles them, not
  even with `--apply`, and the release cron never pays them either. Review
  each one, and if it belongs to the platform, settle it with
  `POST /admin/payouts/holds/:id/settle-residual` (admin panel, reason
  required, audit record written).

The script is idempotent: a settled hold leaves the candidate set, so a second
run settles nothing, and re-running after `failed` rows is safe. Run the dry
run again a few days after the deploy as a check. It should find nothing
new. When a request decided before the fix still carries the seller's share
in its stored components, `processRefund` checks the request's own fault and
the order's earlier finalized refunds as it consumes the hold:

- any of them is seller fault and the request's components do NOT charge the
  buyer that share: the share is forfeited, the hold is consumed in full, and
  the log says "Seller shipping share forfeited";
- any of them is seller fault but the request's components DO charge the
  buyer the share (a buyer-fault request decided under the old rule, its
  cash already reduced by it): the part the buyer was charged (at most the
  share) stays in the hold for the seller, so it is collected only once, and
  the log says "Seller shipping share kept under the pre-D20 rule". The order
  normally stays `delivered` and the normal release pays it.

The first case leaves no residual. In the second, if that order later closes
(an admin refund reaching T), the kept share shows up in the dry run as a
`seller` row. Do NOT settle it to the platform: the buyer already paid it.
Find it by the log line and leave it to the payout. Anything else the re-run
finds is settled the same way as above.

### When needed: payout transfers needing a decision

Since 2026-10-23 a payout transfer that does not go through ends in `failed`
with a reason code (`PAYOUT_FAILURE_REASONS`, `PAYMENTS.md` §6) instead of
being retried blindly, and the cron never resends it. The team resolves
these rows in **admin → Finance → Payouts → Transfers**. The row says what
fits: `resolution.retryRequiresProviderCheck`, `resolution.markPaidMethod`
and `resolution.markPaidNetAmount`; the row menu offers only those actions.
Click a row to see its PayTR `trans_id`, the reason, PayTR's message on a
rejection and, on a parked row, the transfer total snapshot (net, allowed
total, order and payment remaining). "Mark as paid" asks for the reference,
a reason and the net typed again.

| Reason                                                                                                                                                                                | What to do                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `transfer_outcome_unknown`, or a free-text reason from before 2026-10-23 after more than one send attempt, or after one attempt without a PayTR answer (e.g. "Bad Request Exception") | Find the `trans_id` in the PayTR panel (platform transfers). **Listed:** "Mark as paid", method `paytr_confirmed`, the panel reference, a reason. **Not listed:** "Retry" with "PayTR panel checked" ticked and a reason. Never retry without the check: PayTR may already have paid it. The old handler resent the same `trans_id` up to 3 times and kept only the last attempt's reason, so a legacy row showing PayTR's rejection text may still have had an earlier attempt ("fetch failed") that reached PayTR: the panel lookup is for the `trans_id`, whatever the reason says. If PayTR's result still arrives after the retry, the callback settles the row instead of sending it again (error log). |
| `transfer_needs_manual_decision`                                                                                                                                                      | The net does not fit what the payment (merchant_oid) still has, typically a residual after a full refund. If the snapshot shows a missing payment or source, it is a data problem: do **not** pay it, hand it to a developer, retry once fixed. Otherwise finance pays the net (see below), then "Mark as paid", method `external_bank`.                                                                                                                                                                                                                                                                                                                                                                      |
| `transfer_total_exceeds_remaining`                                                                                                                                                    | PayTR refused the total three times (err_no 010). Retry once: the processor recomputes against the current refunds and sibling transfers. If it then lands in `transfer_needs_manual_decision`, go on as above. Before paying it from the bank, confirm in the PayTR panel that its merchant_oid has a live payment (not test mode): err_no 010 with nothing at PayTR can also mean a test-mode payment, which owes nothing (the user decides those).                                                                                                                                                                                                                                                         |
| `provider_unreachable`                                                                                                                                                                | The request never reached PayTR. Retry; if it keeps happening, the host's outbound network to PayTR needs a look (devops).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `provider_rejected`                                                                                                                                                                   | Any other PayTR refusal; PayTR's message is in the row's details. Fix the cause with PayTR, then retry.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `no_bank_account`, `invalid_iban_format`, `bank_details_rejected`                                                                                                                     | The seller was e-mailed; saving their bank details requeues the payout. Nothing to do unless they ask.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

Retry and "Mark as paid" are for super_admin and admin with the `payouts`
permission; both write an audit record (`payout_retry`, `payout_mark_paid`).

**Paying from the company account (`external_bank`).** Decision of
2026-10-23: a non-faulty seller's residual that PayTR cannot carry is paid
by the platform. First, in the PayTR panel: the merchant_oid has a live
payment (not test mode), and no transfer is listed for the row's
`trans_id`. If PayTR lists a transfer for it, stop and hand the row to a
developer (PayTR paid it although the row says otherwise; the callback logs
an error for that). A row whose earlier send PayTR never confirmed (an
unknown outcome that was retried, `resolution.markPaidRequiresProviderCheck`)
cannot be marked `external_bank` without ticking "PayTR panel checked"
(409 otherwise). If PayTR confirms a transfer for a row already paid from
the bank, the callback logs "possible double payment": check the PayTR panel
and the bank transfer and recover the duplicate from the seller.
Otherwise finance transfers exactly `markPaidNetAmount` to the seller's IBAN (admin → Users → seller → bank account; its last 4 digits must
match the transfer row), then the admin marks the row as paid with the bank
reference and a reason. The API checks again, under the payment and order
row locks, that the order (or trade cash payment) is payable, no refund is
in flight and the net has not changed (409 otherwise: retry, so the
processor recomputes, and do not pay a different amount). It writes in
one transaction: the platform funding of what the order's escrow no longer
holds (`payout-platform-funding:<payoutId>`), the payout
(`payout-completed:<payoutId>`), the row (`completed`, nothing taken from
the oid) and the audit record `payout_mark_paid`. The seller gets the normal
"payout released" e-mail. A double click is harmless (the second request
returns the first result).

#### Recovery of the payouts that failed before the 2026-10-23 hotfix

The payouts that failed before the fix carry PayTR's raw text or "Bad
Request Exception" as reason. The list of affected transfers is kept in the
hub plan, not here. **Every production step below needs the user's approval,
each time.** Nothing is retried before the hotfix is live: the cron never
picks `failed` rows, so they wait safely.

1. **Read-only checks first** (approval: production DB read, `SELECT`
   only). Per transfer:

   ```sql
   -- the transfer and its siblings on the same payment (merchant_oid)
   SELECT id, trans_id, status, amount, net_amount, merchant_oid, failure_reason,
          retry_count, submitted_at, submitted_total_amount, provider_response
     FROM payout_transfers
    WHERE merchant_oid = (SELECT merchant_oid FROM payout_transfers WHERE trans_id = :trans_id);
   -- hold, order and payment behind it
   SELECT h.amount, h.refunded_amount, h.status, o.order_number, o.status, o.total_amount,
          p.id AS payment_id, p.amount AS payment_amount, p.is_test, p.paid_at, p.checkout_group_id
     FROM payout_transfers t
     JOIN payment_holds h ON h.id = t.payment_hold_id
     JOIN orders o ON o.id = h.order_id
     JOIN payments p ON p.id = h.payment_id
    WHERE t.trans_id = :trans_id;
   -- refunds on that payment, per order and status
   SELECT order_id, trade_id, status, SUM(amount) FROM refund_attempts
    WHERE payment_id = :payment_id GROUP BY order_id, trade_id, status;
   -- the order's escrow in the ledger (debit +, credit -)
   SELECT SUM(CASE direction WHEN 'debit' THEN amount ELSE -amount END)
     FROM ledger_entries WHERE account = 'seller_escrow' AND order_id = :order_id;
   ```

   For a cart (`GRP…`) payment also compare the sum of its orders'
   `total_amount` with the payment amount, and look up the finalized refund
   requests (`fault_party`) of closed orders.

2. **PayTR panel check** (user or finance, read-only), per merchant_oid: a
   live payment (not test mode), its refunds, the platform transfers with
   their `trans_id`, the remaining balance. For **every** affected row, not
   only the "Bad Request Exception" one: is there a transfer with its
   `trans_id`? The old handler kept only the last of up to 3 attempts, so a
   row showing PayTR's 010 text may have had an earlier "fetch failed"
   attempt (the Sentry history shows it) that reached PayTR. The admin retry
   asks for this check on every legacy row with more than one attempt.
3. **Classify** each transfer:
   - partial refund, the net fits what the payment has left: retry after
     the deploy (automatic from then on);
   - residual larger than what the payment has left: `external_bank` after
     the retry has parked it as `transfer_needs_manual_decision`, with the
     panel check ticked again (the earlier sends stay unconfirmed);
   - payment taken in PayTR test mode (no money at PayTR): the user decides
     (nothing may be owed); leave the row `failed` until then;
   - cart over-allocation: retry; if it still does not fit, `external_bank`;
   - unknown outcome: `paytr_confirmed` if the panel lists the transfer,
     otherwise retry with the panel check;
   - a residual of a seller-fault order: not payable; settle it with
     `settle-residual` (above) instead.
4. **Deploy the hotfix** (approvals: push, PR merge to `master`, tag, deploy).
   The migration runs on boot. Check the API health and, on the next
   15-minute tick, a `Payouts processed` log line without errors.
5. **Retry** the transfers that fit, one at a time (approval per batch).
   Expect `completed` (or `processing` with `submitted_at` and a callback the
   next day when `PAYTR_TRANSFER_CALLBACK_ENABLED=true`); the log shows the
   computed total. One that lands in `transfer_needs_manual_decision` moves
   to the next step.
6. **Pay the residuals** from the company account and mark them
   `external_bank` (approval per transfer), as described above.
7. **Verify**: each affected order's `seller_escrow` sum in the ledger is 0;
   the Finance overview shows no new mismatch; the related Sentry issues are
   resolved with the release; the sellers got the "payout released" e-mail.
   Support writes once to these sellers, because they earlier received a
   "payout failed" e-mail with PayTR's raw text (decision U4).

### Gerektiğinde: Apple token iptali DLQ'su (hesap silme)

Hesap silme, Sign in with Apple refresh token'ının Apple'da iptalini outbox'a
yazar (`apple.token_revoke`; App Store 5.1.1(v)). Silme bu işe bağlı değildir;
iş yeniden denenir. DLQ'ya (`outbox_events.status = 'dead'`, log:
`OUTBOX_DEAD type=apple.token_revoke`) şu durumlarda düşer:

- `invalid_grant`, `unauthorized_client`, `invalid_request` vb. kalıcı Apple
  reddi; `invalid_client` ise 3 denemeden sonra. Apple `invalid_grant`ı
  geçersiz token kadar yanlış/uyuşmayan client id için de döndürür; şifreli
  token bu yüzden **silinmez** (`apple_sign_in_tokens.last_revoke_error`
  teşhistir).
- `APPLE_TEAM_ID` / `APPLE_KEY_ID` / `APPLE_PRIVATE_KEY` /
  `APPLE_TOKEN_ENCRYPTION_KEY` eksik ya da anahtar okunamıyor: iş ~1 gün
  (30 deneme) yeniden denenir, sonra düşer. **Kendiliğinden toparlanmaz** —
  düşmüş işi aşağıdaki script geri getirir.

Önce nedeni düzeltin (Apple anahtarının `com.tarodan.app` ana App ID'ye
bağlanması, env değerleri), sonra yeniden kuyruğa alın. Dedupe upsert'i ölü
işe dokunmadığı için başka yol yoktur. Varsayılan kuru koşudur (yalnız sayar):

```
docker exec "$API_CID" sh -c 'cd /app && node dist-seed/maintenance/redrive-apple-token-revocations.js'
docker exec "$API_CID" sh -c 'cd /app && node dist-seed/maintenance/redrive-apple-token-revocations.js --apply'
```

Yerelde: `pnpm --filter @tarodan/api redrive:prod:apple-token-revocations`.
Yalnız şifreli token'ı duran ve `revoked_at` boş satırların işleri alınır;
yapılandırma hâlâ eksikse `--apply` reddedilir. Yeniden kuyruğa alınan iş taze
deneme hakkıyla bir sonraki drain turunda (en geç 1 dk) koşar. İdempotenttir.

### Her ay: silinen hesap bildirimi

Panelde **Kullanıcılar → Silinen Kimlikler** ekranından dönem seçilip Excel
indirilir (`GET /api/admin/deleted-identities/export`). Dosya, o ay **silinen**
hesapları içerir (arşiv satırının oluşturulma tarihini değil, `deleted_at`'i
esas alır — backfill satırlarının hepsi aynı güne düşer). Ay sınırları
**Türkiye takvimindedir** (ayın son gecesi 21:00'den sonra silinen hesap o
aydadır). Her indirme `deleted_identity_export` adıyla denetim kaydına yazılır;
kayda kimlik DEĞERLERİ değil yalnız dönem ve satır sayısı düşer.

Dosya düzeni (biçim sürümü 2): 1. sayfa **Özet**, 2. sayfa **Bildirim
YYYY-AA** (portala yüklenecek veri; kolon sırası değişmedi), son sayfa
**Bilgi**. Portal ilk sayfayı okuyorsa yüklemeden önce Bildirim sayfasını
ayrı kaydedin. Bkz. `docs/ADMIN_EXPORTS.md`.

### Sentry for web and admin (Coolify)

Sentry is compiled into web and admin only when `NEXT_PUBLIC_SENTRY_DSN` is
set **at build time** (`apps/{web,admin}/sentry.build.js`); server and edge
init run from `src/instrumentation.ts`, the browser init from
`sentry.client.config.ts`. Every event passes the shared scrubber
(`scrubSentryEvent` in `@tarodan/logger`): cookies dropped, credential
headers, client-IP proxy headers (`x-forwarded-for`, `x-real-ip`, ...) and
query parameters masked, user reduced to its id, card, IBAN, TCKN, TR phone
and e-mail values removed.

Per app (web -> project `tarodan-web`, admin -> project `tarodan-admin`, org
`tarodan`) and per environment:

| Variable                         | Build / runtime        | Value                                                  |
| -------------------------------- | ---------------------- | ------------------------------------------------------ |
| `NEXT_PUBLIC_SENTRY_DSN`         | build (and runtime)    | the project's DSN (public; it ships in the JS bundle)  |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | build                  | `staging` or `production`, never derived from NODE_ENV |
| `NEXT_PUBLIC_SENTRY_RELEASE`     | build, optional        | leave unset: the short `SOURCE_COMMIT` is used         |
| `SENTRY_AUTH_TOKEN`              | build only, **secret** | org auth token with release + source map upload scope  |
| `SENTRY_ORG`, `SENTRY_PROJECT`   | build, optional        | defaults `tarodan` / `tarodan-web` or `tarodan-admin`  |

Coolify settings, per app (Advanced > Build):

- **Source commit availability: Available during build**, so the release is the
  deployed short sha (the API tags its events the same way).
- **Build secrets: Docker BuildKit secrets** _before_ adding `SENTRY_AUTH_TOKEN`.
  In that mode Coolify passes every build variable with `--secret` and mounts
  it on each `RUN` (`--mount=type=secret,id=<KEY>,env=<KEY>`), so nothing lands
  in the image history. In the default build-arg mode Coolify injects an
  `ARG` for every build variable and the token would be readable with
  `docker history`; without the token the build still succeeds and only the
  source map upload is skipped. Check the first deploy log for `--secret` (if
  the build server has no BuildKit, Coolify silently falls back to build args).
- `SENTRY_AUTH_TOKEN` is **build-time only**: untick "Available at runtime",
  so the running container never holds it.
- The Dockerfiles declare the public values as `ARG` only (no `ENV` re-export)
  and must not mount secrets themselves; Coolify skips `RUN` lines that already
  have a secret mount. `apps/*/src/sentry-build.test.ts` pins both rules.
- In BuildKit secrets mode a secret's **value** is not part of the Docker layer
  cache key. After changing only a variable's value (a new DSN, `staging` ->
  `production`) on an already-built commit, deploy with **Force deploy
  (without cache)**, or the cached `next build` layer keeps the old inlined
  value. A new commit or a newly added variable rebuilds anyway.

Sentry project settings (both projects): turn on "Prevent Storing of IP
Addresses" and the server-side data scrubber; the client SDK does not send IPs
(`sendDefaultPii: false`), this covers what Sentry would infer itself.

---

## 2. Staging reset ve seed-assets modeli

### Staging Reset butonu

GitHub → Actions → **Staging Reset** → `confirm` alanına `STAGING` yaz.
`.github/workflows/staging-reset.yml` SSH ile `scripts/staging-reset-remote.sh`
çalıştırır: pg_dump yedeği (opsiyonel, `skip_backup`) → api+worker durdurulur →
`prisma migrate reset --force` + derlenmiş UAT seed (+ görsel senkronu) → redis flush + bayat ES
indeksleri silinir → container'lar açılır (API boş indeksleri taze DB'den
kendisi doldurur, `syncIndexIfEmpty`).

Prod guard'ları (üçü de geçmeden reset yok): (1) API `FRONTEND_URL`/`API_URL`
staging host içermeli; (2) görselli seed için `S3_ENV_PREFIX=staging` zorunlu;
(3) `RESET_CONFIRM=STAGING`. Haftalık otomatik reset için
`STAGING_WEEKLY_RESET=true` (Pazartesi 06:00 TRT; tanımsızsa no-op).

> **Dev notu:** Lokalde `pnpm db:reset` sonrası Elasticsearch bayat kalır.
> Hızlı çözüm: `curl http://localhost:3001/api/search/dev/reindex`
> (+ `.../dev/reindex-collections`) ya da 5 dk'lık delta / saatlik reconcile
> cron'unu bekle. Listedeki sayı = `active` + `sold` ürünler; pending/rejected/
> suspended/reserved indexlenmez.

### Staging / UAT

Staging artık gerçek bir kabul (UAT) ortamıdır: Staging Reset **demo seed'ini
(`seed.ts`) değil UAT seed'ini (`apps/api/prisma/seed-uat.ts`) koşar**. Demo seed
yalnız lokal geliştirme içindir (`pnpm dev:seed`); silinmedi.

**Seed neyi içerir**

| Katman                        | İçerik                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Referans (production'la aynı) | Üyelik katmanları, vergi, kargo tarifesi, ayarlar, katalog (`data/launch/*.json`) ve ACTIVE komisyon kural seti. Lansman seed'iyle aynı fonksiyonlar (`seed-launch-core.ts`) — ikinci kopya yok.                                                                                                                                           |
| Üyeler (düz kullanıcı)        | `nur@tarodan.com.tr`, `serhat@tarodan.com.tr`: e-posta doğrulanmış, aktif, bireysel satıcı. Varsayılan katmanda (üyelik satırı yok = Free) alır/satar; takas Free'de kapalıdır. **Yasal ad/TCKN, onay kayıtları ve kullanıcı adı bilerek boş**: kişiler zorunlu onay/kimlik/kullanıcı-adı diyaloglarını kendileri geçer (UAT'nin parçası). |
| Personel (admin panel)        | `tarodan@tarodan.com.tr`, `developers@tarodan.com.tr`: `super_admin`. `users` + `admin_users` satırı (bootstrap-production-admin ile aynı biçim); personel web vitrinine giremez, üye hesabıyla karışmaz.                                                                                                                                  |
| Başlangıç ilanları            | Her üyeye 4 ACTIVE ilan (`data/uat/listings.json`), lansman kataloğundan; ilan sahipleri birbirinden alışveriş yapabilsin diye. Free katman kotasının (5) altında — spec bunu kilitler.                                                                                                                                                    |
| Depo adresi                   | İlk süper adminin adresi (`/health/ready` ister); adminlerin görünen adına dokunulmaz.                                                                                                                                                                                                                                                     |

Sipariş, teklif, takas, ödeme, bildirim vb. operasyonel veri **yoktur**. Kayıt
herkese açıktır: izin listesi yok, yeni kişiler staging'e normal kayıt olur.

**İlan görselleri.** Seed yalnız Postgres'e yazar; reset workflow'u ardından
mevcut mekanizmayı (`seed-media.js`, `seed-assets/` → env-prefix'li S3 kopyası)
koşar. İlan slug'ları `<seed-assets taban adı>-<n>` biçimindedir (spec doğrular)
ve görseller **kategori/model olarak yakın ama birebir aynı olmayan** demo
fotoğraflarıdır (katalogda yalnız Mini GT var). `skip_images` görsel adımını
atlar; ilanlar görselsiz kalır. `S3_ENV_PREFIX=prod` iken görselli reset zaten
reddedilir.

**Yeni kişi eklemek** = `apps/api/prisma/data/uat/accounts.json` içindeki
`members` (düz kullanıcı) ya da `staff` (`role` ile) listesine tek satır:

```json
{ "email": "yeni@tarodan.com.tr", "displayName": "Yeni" }
```

Üye ve personel listeleri ayrıdır; aynı adres ikisinde olamaz (spec/doğrulama
reddeder). Değişiklik bir sonraki reset'te devreye girer; reset yapmadan eklemek
için derlenmiş seed'i elle koş (aşağıda) — mevcut hesaplara dokunmaz.

**Gerekli secret / env**

| Ad                                  | Nerede                              | Not                                                                                                                                                   |
| ----------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UAT_SEED_PASSWORD`                 | GitHub `staging` environment secret | Zorunlu; 16+ karakter, en çok 72 bayt. Tüm sabit hesapların **başlangıç** şifresi; asla commit'lenmez/loglanmaz. Kişiler girişten sonra değiştirmeli. |
| `UAT_SEED_RESET_PASSWORDS=1`        | yalnız elle koşuda                  | Verilmezse var olan hesabın şifresi DEĞİŞMEZ. Workflow bunu geçmez (reset zaten DB'yi sıfırlıyor).                                                    |
| `SERVER_*`, `COOLIFY_STAGING_UUIDS` | GitHub secrets                      | Mevcut reset secret'ları (değişmedi).                                                                                                                 |

Staging api imajı bu commit'i içermeli (`dist-seed/prisma/seed-uat.js`): önce
staging'i deploy et, sonra reset çalıştır. Eksikse pre-flight, veritabanına
dokunmadan durur.

**Reset nasıl yapılır.** Actions → **Staging Reset** → `confirm=STAGING`. Önce
`dry_run` ile dene: tüm guard'ları ve UAT seed pre-flight'ını (`seed-uat.js
--check`: production reddi, şifre kuralı, veri dosyaları) veritabanına dokunmadan
koşar. Guard'lar eskisi gibi: onay kelimesi, staging host kontrolü, S3 prefix
kontrolü, yedek (`skip_backup`), ek olarak api `APP_ENV` tam olarak `staging`
olmalı ve `UAT_SEED_PASSWORD` set olmalı. Seed de kendisi reddeder: derlenmiş
konteynerde `APP_ENV=staging` değilse (boşsa bile) çalışmaz.

Elle (reset'siz) koşu, yalnız api konteynerinde:

```bash
docker exec -e UAT_SEED_PASSWORD "$API_CID" sh -c 'cd /app && node dist-seed/prisma/seed-uat.js'
```

İdempotent: eksik hesabı/ilanı ekler, var olanın şifresini ve ilanını ezmez;
mevcut personelin `admin_users` satırını veriyle eşitler.

**Reset neyi yok eder.** Staging veritabanının TAMAMI (kayıt olan herkes dahil,
siparişler, mesajlar, yüklenen içerik satırları) ve Redis'in seçili db'si
silinir; ES indeksleri bayat kalır ve yeniden dolar. UAT'de testçilerin elle
girdiği her şey gider — haftalık otomatik reset (`STAGING_WEEKLY_RESET=true`)
açıksa bu her Pazartesi olur; UAT sürerken kapalı tut. Reset öncesi pg_dump
yedeği `~/tarodan-staging-backups` altında son 5 kopya tutulur.

**Elasticsearch.** Seed ES'e yazmaz. Workflow Redis'i temizleyip api'yi yeniden
başlatır; açılışta api indeksleri garantiler ve 5 dakikada bir
`search-periodic-sync` (DB↔ES fark > 2 ise delta senkron) ile saatlik
`search-hourly-reconcile` işleri ACTIVE ilanları indeksler — ilanlar yeniden
başlatmadan yaklaşık 5 dk içinde aranabilir olur. Bu işler worker rolünde
koşar; staging'de worker (veya `PROCESS_ROLE=all`) ayakta olmalı.

### Staging'i production'dan yenile (maskeli)

Staging Reset'in tamamlayıcısı: staging veritabanını UAT seed'i yerine
**production'ın maskeli kopyasıyla** değiştirir. Staging admin panelinde
Sistem → Test Araçları düğmesi (ya da GitHub → Actions → **Staging Refresh From
Production**, `confirm=STAGING`). Kişisel veri `masking-catalog.ts`'teki tek
katalogla maskelenir (e-posta `@uat.invalid`, şifre/oturum/OAuth/2FA/kart/push
token'ı silinir); sabit UAT hesapları `seed-uat.js --accounts-only` ile yeniden
yazılır; başlangıç ilanları yazılmaz. Production dökümü sunucudan çıkmaz.
Staging Reset ile aynı `concurrency` grubundadır. Önce **dry run**. Tasarım,
maskeleme tablosu, secret'lar ve runbook: [UAT_REFRESH.md](./UAT_REFRESH.md).

### seed-assets

Demo görseller repoda değil S3'te yaşar: `s3://amzn-tarodan/seed-assets/`.
Seed bunları indirip işlemez; her ortamın kendi env-prefix'li key'lerine sunucu
tarafında **CopyObject** yapar (`StorageService.copyFile`) — ortamlar kendi
kopyalarına sahiptir, uygulamadaki silme akışları paylaşılan kaynaklara dokunamaz.

Anahtar düzeni: ürün `seed-assets/products/<slugBase>-card.webp` + `-detail.webp`
· koleksiyon `seed-assets/collections/<slug>.webp` · hero
`seed-assets/hero/<dosya>.png` (referans seed'in `hero_slides` satırlarına
mutlak URL olarak yazılır — `apps/api/prisma/seed-hero-content.ts`; web/mobil
yalnız API'den okur) · avatar
`seed-assets/avatars/avatar-XX.webp`.

Bucket policy: [`docs/s3-bucket-policy-public-read.json`](./s3-bucket-policy-public-read.json) —
`seed-assets/hero/*` ve `{dev,staging,prod}/{products,collections,avatars}/*`
public-read (ürün/koleksiyon görselleri doğrudan S3'ten servis edilir).
Uygulamak için: AWS Console → S3 → `amzn-tarodan` → Permissions → Bucket policy
(mevcut policy varsa `Statement`'ı birleştir), ya da CLI:
`aws s3api put-bucket-policy --bucket amzn-tarodan --policy file://docs/s3-bucket-policy-public-read.json`

`SEED_SKIP_IMAGES=1` seed'in tüm görsel adımlarını atlar (S3 erişimi gerekmez);
e2e global-setup bunu kullanır ve seed hatası yutulmaz. Lokal akış:
`pnpm dev:seed` (S3'süz veri) → `pnpm db:seed:media:local` (eksik medyayı
idempotent tamamlar); her ikisi de uzak veritabanına karşı çalışmayı reddeder.
Tam yenileme: `pnpm dev:reset`.

### Marka görselleri

`scripts/sync-brand-assets.mjs` (repo seviyesinde; her app'in `dev`/`build`
script'inin başında inline koşar) `@tarodan/brand` paketindeki kanonik marka
işaretlerini web ve admin'in `public/` dizinine gerçek görsel dosyası olarak
üretir — bu dosyalar gitignore'lu build artifact'tır. **Üretici/marka logoları
artık bucket'tan servis edilir** (`{env}/brands/…`); eski repo-içi
`photos/logolar/` kaynağı ve kopyalama adımı kaldırıldı, API `logo` alanını
mutlak S3 URL'i (veya `null`) olarak döndürür.

---

## 3. Production launch runbook'u

Hedef: **asgari lansman verisi** + tek operasyonel süper-admin'li çalışan admin
paneli. Reset, `prisma/data/launch/*.json`'daki onaylanmış veriyi yazar:
katalog (kategori, marka, araç modeli, üretici, özellik), tek kurumsal satıcı,
ACTIVE komisyon kural seti ve **görselsiz, `inactive` ilanlar**. Sipariş/takas/
ödeme gibi operasyonel veri YOKTUR.

İlanlar `inactive` olduğu için hiçbiri vitrine düşmez: görselleri eklenip admin
tarafından yayınlanana kadar public katalog ve arama boş döner — reset'in son
adımı bunu ayrıca doğrular.

> Eski plan "boş vitrin"di (katalog elle girilecekti). Bu, `/health/ready`'nin
> aktif komisyon kapsamı ve depo adresi şart koşmasıyla çelişiyordu: boş bir
> veritabanında readiness asla yeşile dönmüyor, reset "başarısız" raporlayıp
> operatörü yedekten dönmeye çağırıyordu. Lansman seed'i her ikisini de yazar.

**Seed katmanları** — hangisi neyin kaynağı:

| Katman   | Dosya                | Ne zaman                   | Ne yazar                                                                                                                                                        |
| -------- | -------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Referans | `seed-production.ts` | her API açılışında         | Uygulama açılsın diye gereken iskelet: üyelik satırları, vergi, platform hesabı, tarife kabuğu. Tüm upsert'lerin `update` dalı boş — girilen değeri ASLA ezmez. |
| Lansman  | `seed-launch.ts`     | yalnız reset workflow'unda | Onaylanmış iş değerleri + katalog + kurumsal satıcı + komisyon seti + ilanlar. Veri `data/launch/*.json`'da.                                                    |
| UAT      | `seed-uat.ts`        | yalnız staging reset       | Lansman referans verisi (aynı fonksiyonlar) + sabit gerçek kişiler + başlangıç ilanları. Production'da çalışmayı reddeder. Bkz. "Staging / UAT".                |
| Demo     | `seed.ts`            | yalnız lokal geliştirme    | Demo kullanıcı/sipariş/takas senaryoları. Canlıya asla karışmaz; staging reset artık bunu koşmaz.                                                               |

Demo ile canlı arasındaki bağ `src/common/seed-independence.spec.ts` ile CI'da
kilitli: komisyon oranları bir dönem ortak config'ten geliyordu ve yerel "Araba"
senaryosunun rakamları canlıya ACTIVE olarak yayınlanıyordu.

### Adım 1 — Kod hazırlığı

1. Lansman öncesi PR'ları `development` → `master`'a al; Coolify api/web/admin
   deploy etsin (image güncel migration'ları ve `dist-seed`'i içermeli).
2. Vitrin kilitli kalsın: `SITE_LOCKED=true`. Admin app ayrıdır, erişilebilir kalır.

### Adım 2 — Secrets ve ortam kontrolü

GitHub `production` environment'ı (korumalı, required reviewer):
`PRODUCTION_BOOTSTRAP_ADMIN_EMAIL`, `PRODUCTION_BOOTSTRAP_ADMIN_PASSWORD`
(16–72 byte), `COOLIFY_PROD_UUIDS` (`api,web,admin` sırasıyla — üçüncü UUID
verilmezse admin app restart edilmez ve cache'i temizlenmez),
`LAUNCH_SELLER_PASSWORD` (16–72 byte; lansman seed'inin açtığı kurumsal satıcı)
ve opsiyonel `LAUNCH_SELLER_EMAIL` (verilmezse `accounts.json`'daki adres).

`LAUNCH_SELLER_PASSWORD` eksikse workflow guard aşamasında, hiçbir şeye
dokunmadan reddeder — eskiden bu tür eksikler veritabanı silindikten SONRA
patlıyordu.

Reset workflow'unun API container'ında aradığı değerler (biri tutmazsa hiçbir
şeye dokunmadan reddeder):

| Değişken                                                                               | Beklenen                                         | Not                                                                                      |
| -------------------------------------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `NODE_ENV` / `APP_ENV`                                                                 | `production`                                     |                                                                                          |
| `PROCESS_ROLE`                                                                         | `all` veya `web`                                 |                                                                                          |
| `FRONTEND_URL`                                                                         | `https://tarodan.com.tr` (veya `www`)            |                                                                                          |
| `API_URL`                                                                              | `https://api.tarodan.com.tr` — **`/api` EKLEME** | Uygulama `/api`'yi kendisi ekler; sonuna yazılırsa mesaj eki URL'leri `…/api/api/…` olur |
| `S3_ENV_PREFIX`                                                                        | `prod`                                           |                                                                                          |
| `PAYMENT_BYPASS` / `PAYOUTS_DISABLED`                                                  | `false` (harfi harfine)                          |                                                                                          |
| `PAYTR_TEST_MODE`                                                                      | `false` veya `0`                                 |                                                                                          |
| `PAYTR_MEMBERSHIP_TEST_MODE`                                                           | `false`                                          | Üyelik mağazası; API boot'u da zorlar                                                    |
| `ELASTICSEARCH_INDEX_PREFIX`                                                           | boş veya `production`                            |                                                                                          |
| `REDIS_URL`, `REDIS_HOST`                                                              | dolu                                             | Cache ve **kuyruk** Redis'i ayrı; ikisi de temizlenir                                    |
| `ELASTICSEARCH_NODE` (veya `_URL`), `ELASTICSEARCH_USERNAME`, `ELASTICSEARCH_PASSWORD` | dolu                                             | Uygulama bunları default'lar, runtime reset ZORUNLU kılar                                |
| web `SITE_LOCKED`                                                                      | `true`                                           | ayrıca `SITE_UNLOCK_SECRET` ≥32 karakter                                                 |

Son beş satır özellikle önemli: bunlar yalnız **veritabanı silindikten sonra**
çalışan runtime reset adımının ihtiyacı olduğu için, eksiklikleri eskiden yarı
yolda patlamaya yol açıyordu. Artık dry run da kontrol eder.

**Web önbellek tazeleme (staging ve prod):** API'de `WEB_REVALIDATE_URL` (web'in
kökü, ör. `https://tarodan.com.tr` — API `/api/revalidate`'i kendisi ekler; tam uç da
olur) ve `REVALIDATE_SECRET`, web'de AYNI `REVALIDATE_SECRET` tanımlı olmalı. Eksikse
admin'deki hero / ana sayfa anahtarı / fiyat değişiklikleri web'e ancak ISR penceresi
(60 sn) dolunca yansır; reddedilen çağrı API logunda `WebRevalidate` uyarısı bırakır.

**Launch'ta kapalı kalması gereken bayraklar:**
`PAYTR_TRANSFER_CALLBACK_ENABLED` (PayTR panelinde transfer-sonuç bildirim URL'i
tanımlanmadan açılırsa hiçbir payout tamamlanamaz), `PAYTR_REPORT_SYNC_ENABLED`
(panel yetkisi ister), `SHIPPING_WEBHOOK_ENABLED`,
`FEATURE_48H_CONFIRMATION_WINDOW`, `PAYTR_CARD_STORAGE_ENABLED`,
`BULLBOARD_ENABLED`, `ENABLE_SWAGGER`. (`PAYTR_RECURRING_ENABLED` artık yalnız
üyelik mağazasını etkiler; üyelik mağazası geçişi runbook'una bakın.)

**İade politikası v2 — VARSAYILAN AÇIK:** Bileşen bazlı iade politikası (v2)
artık kod tarafında varsayılan AÇIKTIR; launch'ta env eklemek GEREKMEZ.
`REFUND_POLICY_V2_ENABLED=false` yalnız acil-durum anahtarıdır (kill-switch):
para hesabında beklenmedik sorun çıkarsa v1 oransal formüle döndürür. Birkaç
stabil haftadan sonra bayrağın ve v1 hesaplayıcının tamamen sökülmesi planlıdır
(yeni kayıtlar zaten çift yazılır, geri dönüş güvenlidir).

**PayTR panel tarafı:** pazaryeri mağazasının ödeme bildirim URL'i
`https://<api-host>/api/payments/callback/paytr` (env'deki `PAYTR_CALLBACK_URL`
ile birebir aynı olmalı, düz `OK` döner) · üyelik mağazasının bildirim URL'i
`https://<api-host>/api/payments/callback/paytr/membership`
(`PAYTR_MEMBERSHIP_CALLBACK_URL`) · payout transfer-sonuç URL'i
`https://<api-host>/api/payouts/callback/paytr-transfer` (yalnız bayrağı
açacağın gün) · mağaza canlı modda.

**Payout trans_id düzeltmesi sonrası sıra (2026-09):** (1) tiresiz `trans_id`
düzeltmesi canlıya çıkar; (2) panelde transfer-sonuç URL'i tanımlıysa
`PAYTR_TRANSFER_CALLBACK_ENABLED=true` eklenir; (3) admin → Finans → Payouts
→ `failed` durumundaki eski `PYT-…` kayıtları "Tekrar dene" ile pending'e
alınır — cron işleme anında transId'yi tiresiz yeniden üretir ve gönderir
(log: `trans_id yeniden üretildi`). Beklenen: satır `processing` +
`submittedAt` dolu; ertesi gün callback → `completed`.

**Sürat depo adresi:** artık **admin → Ayarlar → Warehouse** sekmesindeki adres
satırı (`warehouse_address_id`) tek kaynaktır; hem depoya gelen hem depodan
çıkan kolilerde kullanılır. `TARODAN_WAREHOUSE_*` env'leri yalnız o satır hiç
yoksa devreye giren son çare fallback'tir. **Şehri ilin tam adıyla yaz**
("İstanbul", "K.Maraş" değil): v2 create sözleşmesi ili plaka koduna çevirir ve
çözemediğinde gönderiyi açmaz.

**Sürat create sözleşmesi:** `SURAT_CREATE_API_VERSION` (`v1` varsayılan).
`v2`ye (GonderiOlustur — gerçek gönderici, pazaryeri için gereken) geçmeden önce
Sürat'tan `SURAT_FIRMA_ID` alınmış olmalı; ikisi olmadan boot fail eder. Geçiş
sırası: staging'de `SURAT_KARGO_TEST_MODE=true` + `v2` ile doğrula, sonra
production'da `v2`ye al. Geri dönüş bu tek değişkendir. Takip ucu
(`KargoTakipHareketDetayi`) her iki sözleşmede de aynıdır, dolayısıyla geçiş
takibi etkilemez.

### Adım 3-4 — Dry run + reset

**Production Database Reset** workflow'u (`workflow_dispatch`,
`confirm=RESET_PRODUCTION`) önce `dry_run=true` ile: container/guard/yedek
erişimini değiştirmeden doğrular. Sonra `dry_run=false` ile sırayla:

1. zorunlu ve doğrulanmış `pg_dump -Fc` yedeği (host'ta kalır; workflow yedeği
   `pg_restore -l` ile doğrulayamazsa devam etmez — yolu ve SHA-256'yı kaydet);
2. `prisma migrate reset --force --skip-seed`;
3. `seed-production.js` (referans iskeleti);
4. `bootstrap-production-admin.js` → secrets'taki tek süper-admin;
5. `seed-launch.js` → katalog, kurumsal satıcı, komisyon seti, depo adresi ve
   `inactive` ilanlar. **Süper adminden sonra koşmak zorunda:** depo adresini o
   hesaba bağlıyor, admin yoksa "no active super admin" ile durur;
6. Redis + production arama indeksi temizliği, web `.next/cache` silme;
7. restart, readiness beklemesi, `verify-production-launch.js`: API `ready`
   dönmeli, `/categories` ve `/manufacturers` seed'lenen sayıyı vermeli,
   `/products`, `/search/products`, `/ads/active` ise **boş** olmalı — ilanların
   gerçekten `inactive` kaldığının kanıtı budur.

Bu, bilinçli olarak `master` deploy workflow'unun **parçası olmayan**, tek
seferlik yıkıcı bir operasyondur — kod deploy'u asla veri silmez. S3 bucket'ı
silinmez; eski nesneler zararsız yetim olarak kalır (kurtarma yolu).

### Adım 5 — Admin içerik girişi (site hâlâ kilitli)

Katalog, komisyon, tarife, vergi, üyelik ve depo adresi artık lansman seed'inden
geliyor — bu adım onları **girmek** değil, **doğrulamak** ve eksik kalanları
tamamlamak içindir.

1. **İlan görselleri** — lansman ilanları görselsiz ve `inactive` geldi. API ilan
   başına **en az 3, en fazla 10** görsel şart koşuyor; görseller yüklenmeden
   ilan `active` yapılamaz. Yayına alma sırası: görselleri ekle → ilanı aktifleştir.
2. **Katalog kontrolü** — Categories / Manufacturers / Brands / Car Models /
   Attributes seed'lendi. Marka logoları ve üretici logoları seed'de YOK, elle
   eklenir. `scale` ve `material` grupları filtre kenar çubuğunu ve üst menüdeki
   "Ölçek" başlığını besler; lansman verisinde `scale` yalnız **1:64**, `material`
   yalnız **diecast** içeriyor.
3. **Kurumsal satıcı** — hesap `approved` ve 20 yıllık BUSINESS üyelikle açıldı.
   İlk satıştan önce **IBAN** (`SellerBankAccount`) girilmeli, yoksa payout
   yapılamaz. Faturalama için e-Logo yapılandırması ayrıdır.
4. **Settings** — Listing sekmesindeki min/max ilan fiyatı **bilinçli olarak
   boş** (sınır uygulanmıyor). Sınır istenirse buradan girilir. Warehouse:
   `warehouse_address_id` seed tarafından süper adminin adresine bağlandı;
   değiştirilecekse bu sekmeden.
5. **E-posta şablonları** — opsiyonel; kod varsayılanları hazır.
6. **Staff** — ek admin hesapları (geçici şifre ekranda gösterilir, SMTP
   gerekmez); süper-admin'de 2FA aç.
7. **Early-access PIN'leri** — reset mevcut pinleri siler; yeniden oluştur.
   Davet e-postası SMTP kurulu değilken de "gönderildi" der (sessiz hata) —
   güvenli yol "kodu kopyala".

Statik hukuki sayfalar (terms, privacy, cookies, mesafeli satış, iade, satıcı
sözleşmesi, fikri mülkiyet) artık **kodda**; admin CMS sayfa ekranı kaldırıldı,
girilecek bir şey yok.

#### Lansman seed'inin yazdığı iş değerleri

Hepsi `apps/api/prisma/data/launch/*.json`'dan gelir; değiştirmek için önce o
dosyayı güncelle (tek kaynak), admin panelinden yapılan düzeltme bir sonraki
reset'te geri alınır.

| Ne                         | Gelen değer                                                                                                                                                                                                                                                                            | Nerede değişir                                     |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Komisyon                   | kategori × 4 satıcı tipi × 4 fiyat bandı = 16 kural. Bantlar 0-999 / 1.000-9.999 / 10.000-24.999 / 25.000+. Alıcı komisyonu %4/%4/%3/%0, alıcı hizmet bedeli %5/%6/%4/%5, satıcı komisyonu %6, satıcı platform bedeli %5/%5/%5/%0. **Oranlar satıcı tipine göre değişmez (bilinçli).** | `commission.json` · Finance → Commission           |
| Takas hizmet bedeli        | **veren taraf 0 ₺, alan taraf 100 ₺** (KDV dahil sabit). 1'e 1 takasta iki taraf da 100 ₺ öder.                                                                                                                                                                                        | `commission.json`                                  |
| Kargo payı (kademe başına) | üçünde de alıcı %50 / satıcı %50                                                                                                                                                                                                                                                       | `commission.json`                                  |
| Kargo kademeleri           | Küçük 100 ₺ (0-2 desi) · Orta 130 ₺ (2-5) · Büyük 160 ₺ (5+)                                                                                                                                                                                                                           | `business-config.json` · System → Shipping Tariffs |
| Ücretsiz kargo             | **kapalı** (`freeShippingEnabled: false`)                                                                                                                                                                                                                                              | `business-config.json`                             |
| Üyelik                     | free 0 ₺ (**takas kapalı**), basic 49,99, premium 99,99, business 249,99 ₺/ay                                                                                                                                                                                                          | `business-config.json` · Membership Tiers          |
| Vergi                      | KDV %20 varsayılan (+%10/%1/muaf), hizmet KDV'si açık %20, stopaj %1 (yalnız kurumsal)                                                                                                                                                                                                 | `business-config.json` · System → Settings         |
| İlan fiyat sınırı          | **yok** — `min_product_price`/`max_product_price` bilinçli yazılmıyor                                                                                                                                                                                                                  | `business-config.json`                             |

### Adım 6-7 — Kademeli açılış ve sonrası

**Kademeli faz:** `SITE_LOCKED=true` kalır; davetliler PIN ile girer. Pin iptali
yeni unlock'ları keser; açılmış tarayıcılar cookie süresince girmeye devam eder —
herkesi anında düşürmek için `SITE_UNLOCK_SECRET` rotate et.

**Tam açılış:** Coolify'da `SITE_LOCKED=false` + web restart; smoke test
(anasayfa, kategori gezinme, kayıt + giriş, `/api/health/ready` yeşil — ready
kontrolü komisyon kapsamını ve depo adresini de doğrular). Arama motorlarına
açmak için web `NEXT_PUBLIC_ALLOW_INDEXING=true`. Mağaza sayfaları (App Store +
Google Play) herkese açıldığında mobil uygulama tanıtımı admin → Pazarlama → Hero'dan
bir slayt olarak yayına alınır (buton adresi mağaza bağlantısıysa web'de mağaza
butonu olur, uygulamada gizlenir) — env bayrağı ya da rebuild gerekmez.

**İlanlar yayınlanmadan önceki görünüm** (hepsi bilinçli): kategori, üretici,
marka ve ölçek menüleri katalog seed'lendiği için ÇIKAR; ama ilan listesi
"Henüz ilan yok / İlk ilanı siz verin" der, çünkü 30 lansman ilanı `inactive`
ve public sorgular yalnız `active` görür. İndirim rayı çizilmez, "popüler
aramalar" çipleri kataloğun kendi üreticilerinden türer. Filtre kenar
çubuğundaki yedek listeler yalnız API **hata verdiğinde** devreye girer — boş
yanıt boş liste demektir.

İlanlar göründüğü anda bir şey ters gitmiş demektir: seed onları `inactive`
yazar ve reset'in son adımı public katalogun boş olduğunu doğrular.

**Rollback:** vitrin kilitliyken workflow'un yazdığı yedeği production
PostgreSQL container'ından `pg_restore --clean --if-exists` ile geri yükle;
API/web restart, `/api/health/ready` + vitrin doğrulaması, sonra kilidi kaldır.
Lansman stabil ilan edilene kadar reset öncesi yedeği sakla.

---

## 4. Doğrulama hattı (CI/CD)

İlke: **development (staging) hızlı ve hafif, master (production) eksiksiz.**
development bizim alanımız: staging deploy'u yalnız typecheck + lint bekler,
kırılan şey ileri düzeltilir. Tam doğrulama (tüm unit testler, production
build, audit) master'a giderken koşar. Ağır doğrulama geliştirici makinesinde
değil, temiz bir GitHub runner'ında koşar.
Kapının içeriği tek yerde tanımlıdır: `scripts/verify-local.mjs`'in `ci`
grupları. `.github/workflows/verify.yml` her grubu ayrı bir job olarak koşar;
`pnpm verify:ci` yerelde aynı kapıyı koşar — ikisi ayrışamaz.

| Grup      | İçerik                                                                                                                                               |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `static`  | Workspace typecheck + lint (web dahil; API `--fix`'siz `lint:ci` ile) + doğrulama script'lerinin spec'leri + web/admin API kontratı + API seed build |
| `unit`    | **Tüm** API jest suite'i + jest dışı her workspace'in vitest suite'i (web, admin, listing-form, auth, logger)                                        |
| `release` | Production build + bağımlılık denetimi (`audit:prod`) — yalnız master kapısında                                                                      |
| `e2e`     | API e2e + full scenarios, yerel servislerle (Postgres/Redis/ES/Mailpit) — opsiyonel; CI'da `API E2E` workflow'u (tavsiye)                            |

### Ne nerede koşar

Süreler 2026-10 ölçümleri: runner değerleri Release Production koşularından
(typecheck ~50 sn, lint ~20 sn, 514 suite'lik API unit ~110-150 sn, build
~95-150 sn), yerel değerler M serisi Mac'te.

| Aşama                                            | Ne koşar                                                                                                                                                                       | Süre                                      | Neyi durdurur       |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- | ------------------- |
| Yerel pre-commit (`lint-staged`)                 | Staged dosyalarda `eslint --fix` + `prettier`                                                                                                                                  | saniyeler                                 | commit              |
| Yerel pre-push → `development`                   | Etkilenen app'lerin typecheck'i + web/admin API kontrat script'i, **sırayla** (tek seferde tek `tsc`, ~2,5 GB). Jest YOK. Tree önbelleği + kirli çalışma ağacı engeli korunur. | ~1 dk (api 27 sn, web 22 sn, admin 20 sn) | push                |
| Yerel pre-push → `master`                        | Ağır bir şey koşmaz; PR yolunu hatırlatan bir not basar                                                                                                                        | —                                         | hiçbir şey          |
| CI: `development` push (Deploy Staging)          | `Staging gate / Typecheck & lint` (turbo önbellekli; değişmeyen workspace'ler önbellekten gelir)                                                                               | ~1-2 dk                                   | staging deploy      |
| CI: `development` push (Development Tests)       | `Development tests / Unit tests` — tüm API suite'i + tüm vitest, **tavsiye**: deploy beklemez, kırmızısı Actions'ta ve commit'te görünür                                       | ~3-4 dk                                   | hiçbir şey          |
| Staging deploy                                   | Kapı yeşilse, **son başarılı** Deploy Staging koşusundan beri değişen app'ler Coolify'a tetiklenir ve sonucu beklenir                                                          | Coolify build ~10 dk                      | —                   |
| CI: PR → `development` (PR Checks)               | `Verify / Typecheck & lint` ∥ `Verify / Unit tests` (unit tavsiye — development'ta zorunlu check yok)                                                                          | ~1-2 dk / ~3-4 dk                         | (zorunlu değil)     |
| CI: PR → `master` (PR Checks + diğerleri)        | `Verify / Typecheck & lint` ∥ `Verify / Unit tests` ∥ `Verify / Build & audit` + `Master source guard` + `API e2e` (tavsiye, zorunlu değil)                                    | ~5 dk (e2e henüz ölçülmedi)               | merge (ruleset ile) |
| Production deploy (Release Production, `master`) | `Release gate / *` = tam kapı tekrar; yeşilse **son başarılı** release'ten beri değişen app'ler Coolify'a, sonuç beklenir                                                      | ~5 dk + ~10-15 dk rollout                 | production deploy   |

Notlar:

- **Jest neden hook'ta yok:** `--changedSince` toplu push'larda büyüyordu (son
  ölçüm ~8 dk / 313 suite); `--findRelatedTests` de sınırsız — tek bir
  controller değişikliği 195 suite çekti (yarım çekirdekle ~4,5 dk). Tüm suite
  runner'da ~2 dk sürüyor; her development push'unda tavsiye olarak, master
  PR'ında zorunlu olarak koşar. Hook typecheck'te kalır, `--no-verify`
  gerekmemeli. Kullanılsa bile staging kapısı typecheck + lint'i koşar.
- **Unit testler neden development'ta engellemiyor ama yine koşuyor:** deploy
  hızlı kalsın diye beklemiyoruz; yine de her push'ta koşması, kırılmayı master
  PR'ına kalmadan haftalar önce gösterir (runner dakikası herkese açık repoda
  ücretsiz). Ayrı bir workflow'dur (`development-tests.yml`): Deploy Staging'in
  içinde olsaydı kırmızı unit job'ı o koşuyu "başarısız" yapar, deploy diff'i
  yalnız başarılı koşuları taban aldığı için sonraki deploy'lar gereksiz yere
  büyürdü. Kırmızı bir Development Tests koşusu = ileri düzelt; master PR'ı
  onunla geçmez.
- **Staging kapısı (typecheck/lint) kırmızıysa:** staging eski sürümde kalır. Düzeltip push'la ya da
  Actions'ta "Re-run failed jobs". Sonraki başarılı koşu, iptal edilen/başarısız
  koşuların app'lerini de deploy eder: deploy job'ı `github.event.before`'a
  değil, aynı workflow'un son başarılı koşusunun commit'ine göre diff alır
  (`.github/actions/deploy-targets`). Koşu ancak Coolify her build'i bitirdi
  dediğinde başarılı sayılır. Yeni push eski bir staging koşusunu iptal eder
  (`concurrency`); production koşuları sıraya girer.
- **Doğrulanan commit = deploy edilen commit:** Coolify'ın deploy API'sinde
  commit/ref parametresi yok, her zaman dalın HEAD'ini build eder. Bu yüzden
  deploy her tetiklemeden önce `git ls-remote` ile dalın hâlâ doğrulanan
  commit'te olduğunu kontrol eder; dal ilerlemişse koşu kırmızı biter ve
  deploy etmez — yeni commit'in koşusu kendi kapısından sonra ikisini birden
  deploy eder. Elle tetikleme (`workflow_dispatch`) yalnız ilgili daldan
  (`development` / `master`) deploy eder.
- **Release tag:** after every deployment of a production run has finished,
  the `Tag the release` job of Release Production pushes the annotated tag
  `app-YYYY.MM.DD-N` on the deployed commit (the message lists the commit,
  the apps and the run). The name is computed when the tag is pushed: the
  Europe/Istanbul day of the push (a rollout that ends after midnight gets
  the new day) and `N` = the highest `N` of that day on origin + 1. A run
  that deployed nothing creates no tag; a commit that already has an
  `app-YYYY.MM.DD-N` tag keeps it. If the tag job fails (network, or the name
  was taken a moment before the push), the rollout still succeeded: use
  **Re-run failed jobs**, which retries only the tag job and takes the next
  free `N`. Never "Re-run all jobs" (it redeploys production). Re-run only
  while no other Release Production run is queued or in progress: the re-run
  joins the `release-production` concurrency group, so it cancels a pending
  run, or waits and is itself cancelled by the next push. Re-run only while
  the run is still the newest production release; once a newer release is
  tagged, leave the superseded run untagged (its changes are in the newer
  tag, and a late tag would give the older commit the higher `N`). Until the
  tag job passes, the run stays failed; if it is the newest master run, the
  next release also redeploys its apps. The tag ruleset allows creation
  only: an `app-*` tag is never moved or deleted.
- **Yerel hook doğru ağacı doğrular:** push edilen commit'in ağacı çalışma
  ağacıyla aynı değilse (ör. `git push origin baska-dal:development`) hook
  engeller: push ettiğin commit'i checkout et.
- **Branch names are checked where they are introduced:** the hook blocks a
  push that creates a remote branch, or pushes a local branch into
  `development` / `master` (`fix/x:development` checks `fix/x`), unless the
  name matches `<type>/<kebab-description>` (types: feat, fix, refactor, perf,
  chore, ci, docs, test, hotfix). `development`, `master`, `worktree-*` and
  `integration/<wave>` are allowed. Updates of existing remote branches (e.g.
  `dependabot/*`) and deletions always pass. Rules: tarodan-ops
  `docs/commit-and-branch-rules.md`.
- **Master yalnız PR ile:** `development` → `master` (sürüm) ya da `hotfix/*` →
  `master` (acil düzeltme; sonra `development`'a geri birleştir). Eski yerel
  "release marker" şartı kalktı; kapıyı ruleset'teki zorunlu check'ler ve
  Release Production'daki tekrar koşu sağlar.
- **Önbellek:** turbo görev önbelleği development kapılarında açık
  (`node_modules/.cache/turbo`; eskiden yanlış dizin önbelleğe alınıyordu, her
  koşu ıskalıyordu), tam kapıda kapalı — master kapısı hiçbir sonucu önbellekten
  oynatmaz. API jest her zaman tam koşar. Build job'ı Next'in kendi derleme
  önbelleğini (`.next/cache`) geri yükler. Yalnız yapılandırma taşıyan paketler
  (`packages/tsconfig`, `eslint-config`, `eslint-plugin`) ve kök
  yapılandırmalar turbo `globalDependencies`'te: değişince tüm önbellek düşer.
- **Secret yok:** kapılar repo secret'ı kullanmaz (unit testler tüm
  sağlayıcıları mock'lar; `NEXT_PUBLIC_*` değerleri herkese açık yer
  tutuculardır). Deploy job'ları değişmedi: `COOLIFY_URL`, `COOLIFY_TOKEN`,
  `COOLIFY_STAGING_UUIDS` / `COOLIFY_PROD_UUIDS`.

### Yerel komutlar

| Komut                       | Ne zaman                                                                                                                                                                |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm verify:push`          | Hook'un yaptığının aynısı (etkilenen app typecheck'i). Push'tan önce elle de koşulabilir; geçen tree önbelleğe yazılır, hook onu atlar.                                 |
| `pnpm verify:push --tests`  | + ilgili API spec'leri (`jest --findRelatedTests`, `--maxWorkers=50%`) + web/admin unit. Riskli bir değişikliği push'tan önce yerelde görmek için; dakikalar sürebilir. |
| `pnpm verify:watch`         | Geliştirirken canlı jest + tsc.                                                                                                                                         |
| `pnpm verify:quick`         | development'taki CI kontrollerinin aynısı (`static` = staging kapısı + `unit` = tavsiye testler). Tüm çekirdekleri kullanır — makine yükünü göze alarak.                |
| `pnpm verify:ci`            | Master kapısının birebir aynısı (+ build + audit). CI'ı yerelde yeniden üretmek için.                                                                                   |
| `pnpm verify:release:local` | **Opsiyonel** prova: tam kapı + yerel Docker altyapısı + API e2e + full scenarios + Playwright (`--paytr` ile PayTR entegrasyonu). Master push'u için şart değil.       |

Raporlar `.git/tarodan-test-results/` altına yazılır (`latest-<mod>.json`).

### GitHub settings (manual, repo admin)

Rulesets (Settings -> Rules -> Rulesets). The three below are active; the
fourth, "Code Quality Copilot review for default branch", is disabled.

**`master: production protection`** (branch `master`):

- Bypass: repository admins, "pull requests only" (an admin can merge a PR
  past failing checks, but nobody pushes to `master` directly).
- Restrict deletions; block force pushes.
- Require a pull request before merging, 0 approvals, extra approval for
  unattributed changes on; allowed merge method: **merge commit** only.
- Required status checks, each with source **GitHub Actions** so no other
  token or app can post a passing status under the same name (the live
  ruleset does not pin the source yet; set it when you next edit the
  ruleset):
  `Verify / Typecheck & lint`, `Verify / Unit tests`,
  `Verify / Build & audit`, `Master source guard`. `Master source guard`
  reports only once `master-source-guard.yml` is on `master`
  (`pull_request_target` reads the workflow from `master`); until that
  release, a master PR waits for it and needs the admin bypass. Add
  `API e2e` after it has run green on the runner a few times. "Require
  branches to be up to date" is not needed: PR checks test the merge ref.
- Do not rename the checks: the `Verify` job in `pr-checks.yml` and the job
  names in `verify.yml` must match the ruleset exactly.

**`development: no deletion or force push`** (branch `development`):
restrict deletions and block force pushes only. `development` takes direct
pushes (the staging gate runs in CI); no PR requirement.

**`release tags: no deletion or move`** (tags `app-*`, `mobile-v*`):
restrict deletions, updates and force pushes; no bypass. Creating a new tag
is allowed, so Release Production can tag a release, but a tag can never be
moved or recreated: a wrong tag stays, and the fix is a new tag.

**Güvenlik (repo herkese açık, ücretsiz):** Settings → Code security →
CodeQL "Default setup", Secret scanning + Push protection ve Dependabot
security updates — üçü de bugün kapalı.
