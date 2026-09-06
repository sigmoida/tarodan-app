# Operasyon Rehberi — Ortamlar, Reset ve Launch

> `PRODUCTION_LAUNCH.md`, `production-database-reset.md` ve `STAGING_AND_SEED.md`
> 2026-08-02'de bu dosyada birleştirildi. Konular: ortam guard'ları, staging
> reset + seed-assets modeli, production launch runbook'u ve veritabanı reset'i.

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

---

## 2. Staging reset ve seed-assets modeli

### Staging Reset butonu

GitHub → Actions → **Staging Reset** → `confirm` alanına `STAGING` yaz.
`.github/workflows/staging-reset.yml` SSH ile `scripts/staging-reset-remote.sh`
çalıştırır: pg_dump yedeği (opsiyonel, `skip_backup`) → api+worker durdurulur →
`prisma migrate reset --force` + derlenmiş seed → redis flush + bayat ES
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

### seed-assets

Demo görseller repoda değil S3'te yaşar: `s3://amzn-tarodan/seed-assets/`.
Seed bunları indirip işlemez; her ortamın kendi env-prefix'li key'lerine sunucu
tarafında **CopyObject** yapar (`StorageService.copyFile`) — ortamlar kendi
kopyalarına sahiptir, uygulamadaki silme akışları paylaşılan kaynaklara dokunamaz.

Anahtar düzeni: ürün `seed-assets/products/<slugBase>-card.webp` + `-detail.webp`
· koleksiyon `seed-assets/collections/<slug>.webp` · hero
`seed-assets/hero/<dosya>.png` (web CDN'den doğrudan çeker —
`apps/web/src/lib/assetCdn.ts`, `NEXT_PUBLIC_ASSET_CDN_URL`) · avatar
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
| Demo     | `seed.ts`            | yalnız staging reset       | Demo kullanıcı/sipariş/takas senaryoları. Canlıya asla karışmaz.                                                                                                |

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
| `ELASTICSEARCH_INDEX_PREFIX`                                                           | boş veya `production`                            |                                                                                          |
| `REDIS_URL`, `REDIS_HOST`                                                              | dolu                                             | Cache ve **kuyruk** Redis'i ayrı; ikisi de temizlenir                                    |
| `ELASTICSEARCH_NODE` (veya `_URL`), `ELASTICSEARCH_USERNAME`, `ELASTICSEARCH_PASSWORD` | dolu                                             | Uygulama bunları default'lar, runtime reset ZORUNLU kılar                                |
| web `SITE_LOCKED`                                                                      | `true`                                           | ayrıca `SITE_UNLOCK_SECRET` ≥32 karakter                                                 |

Son beş satır özellikle önemli: bunlar yalnız **veritabanı silindikten sonra**
çalışan runtime reset adımının ihtiyacı olduğu için, eksiklikleri eskiden yarı
yolda patlamaya yol açıyordu. Artık dry run da kontrol eder.

**Launch'ta kapalı kalması gereken bayraklar:**
`PAYTR_TRANSFER_CALLBACK_ENABLED` (PayTR panelinde transfer-sonuç bildirim URL'i
tanımlanmadan açılırsa hiçbir payout tamamlanamaz), `PAYTR_REPORT_SYNC_ENABLED`
(panel yetkisi ister), `SHIPPING_WEBHOOK_ENABLED`,
`FEATURE_48H_CONFIRMATION_WINDOW`, `PAYTR_CARD_STORAGE_ENABLED`,
`PAYTR_RECURRING_ENABLED`, `BULLBOARD_ENABLED`, `ENABLE_SWAGGER`.

**İade politikası v2 — VARSAYILAN AÇIK:** Bileşen bazlı iade politikası (v2)
artık kod tarafında varsayılan AÇIKTIR; launch'ta env eklemek GEREKMEZ.
`REFUND_POLICY_V2_ENABLED=false` yalnız acil-durum anahtarıdır (kill-switch):
para hesabında beklenmedik sorun çıkarsa v1 oransal formüle döndürür. Birkaç
stabil haftadan sonra bayrağın ve v1 hesaplayıcının tamamen sökülmesi planlıdır
(yeni kayıtlar zaten çift yazılır, geri dönüş güvenlidir).

**PayTR panel tarafı:** ödeme bildirim URL'i
`https://<api-host>/api/payments/callback/paytr` (env'deki `PAYTR_CALLBACK_URL`
ile birebir aynı olmalı, düz `OK` döner) · payout transfer-sonuç URL'i
`https://<api-host>/api/payouts/callback/paytr-transfer` (yalnız bayrağı
açacağın gün) · mağaza canlı modda.

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
açmak için web `NEXT_PUBLIC_ALLOW_INDEXING=true`.

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
