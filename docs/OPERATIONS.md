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
  (`production-products`, `production-collections`).
- Web kilidi: `SITE_LOCKED=true` → tüm public rotalar `/coming-soon`.
  `SITE_UNLOCK_SECRET` (≥32 karakter) unlock cookie'lerini imzalar — rotate
  etmek verilmiş tüm cookie'leri anında geçersiz kılar; `SITE_UNLOCK_PIN`
  API'den bağımsız acil yedek koddur. Erken erişim PIN'leri admin
  `System → Early Access`'ten yönetilir (unlock cookie 10 gün).

### Her API açılışında otomatik koşanlar

`apps/api/entrypoint.sh` → `prisma migrate deploy` + `dist-seed/prisma/seed-production.js`.
İkincisi zorunlu iş referanslarını **idempotent** garanti eder:

- üyelik katmanları (free/basic/premium/business);
- catch-all komisyon kuralı (`appliesTo: BOTH` — checkout fail-closed guard'ı
  ve `/api/health/ready` bunu arar);
- TR vergi bölgesi, varsayılan KDV oranı ve vergi kuralı;
- `platform@tarodan.com` platform-satıcı hesabı (rastgele şifre);
- aktif Sürat kargo tarifesi + paket kademeleri.

Demo seed (`prisma/seed.ts`, `*@demo.com`, `Admin123!`) production yollarında
asla çalışmaz; `release-production-bootstrap.spec.ts` bunu sözleşmeyle korur.

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

Hedef: **boş vitrin** (üye/ürün yok) + tek operasyonel süper-admin'li çalışan
admin paneli. Katalog (kategori, marka, üretici, attribute) bilinçli olarak
seed'lenmez — reset sonrası admin panelinden elle girilir.

### Adım 1 — Kod hazırlığı

1. Lansman öncesi PR'ları `development` → `master`'a al; Coolify api/web/admin
   deploy etsin (image güncel migration'ları ve `dist-seed`'i içermeli).
2. Vitrin kilitli kalsın: `SITE_LOCKED=true`. Admin app ayrıdır, erişilebilir kalır.

### Adım 2 — Secrets ve ortam kontrolü

GitHub `production` environment'ı (korumalı, required reviewer):
`PRODUCTION_BOOTSTRAP_ADMIN_EMAIL`, `PRODUCTION_BOOTSTRAP_ADMIN_PASSWORD`
(16–72 byte), `COOLIFY_PROD_UUIDS` (`api,web,admin` sırasıyla — üçüncü UUID
verilmezse admin app restart edilmez ve cache'i temizlenmez).

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

**PayTR panel tarafı:** ödeme bildirim URL'i
`https://<api-host>/api/payments/callback/paytr` (env'deki `PAYTR_CALLBACK_URL`
ile birebir aynı olmalı, düz `OK` döner) · payout transfer-sonuç URL'i
`https://<api-host>/api/payouts/callback/paytr-transfer` (yalnız bayrağı
açacağın gün) · mağaza canlı modda.

**Sürat depo etiketi:** `TARODAN_WAREHOUSE_NAME/ADDRESS/CITY/DISTRICT/PHONE`
set edilmezse gönderi etiketine "Tarodan Merkez Depo Adresi / Maltepe /
05000000000" placeholder'ları basılır — admin'deki Warehouse sekmesi bunları
KAPSAMAZ, ayrı env'dir.

### Adım 3-4 — Dry run + reset

**Production Database Reset** workflow'u (`workflow_dispatch`,
`confirm=RESET_PRODUCTION`) önce `dry_run=true` ile: container/guard/yedek
erişimini değiştirmeden doğrular. Sonra `dry_run=false` ile sırayla:

1. zorunlu ve doğrulanmış `pg_dump -Fc` yedeği (host'ta kalır; workflow yedeği
   `pg_restore -l` ile doğrulayamazsa devam etmez — yolu ve SHA-256'yı kaydet);
2. `prisma migrate reset --force --skip-seed`;
3. `seed-production.js` (yukarıdaki zorunlu referanslar);
4. `bootstrap-production-admin.js` → secrets'taki tek süper-admin;
5. Redis + production arama indeksi temizliği, web `.next/cache` silme;
6. restart, readiness beklemesi, `verify-production-empty.js` (API hazırken
   `/categories`, `/manufacturers`, `/products`, `/search/products`,
   `/ads/active` boş olmalı).

Bu, bilinçli olarak `master` deploy workflow'unun **parçası olmayan**, tek
seferlik yıkıcı bir operasyondur — kod deploy'u asla veri silmez. S3 bucket'ı
silinmez; eski nesneler zararsız yetim olarak kalır (kurtarma yolu).

### Adım 5 — Admin içerik girişi (site hâlâ kilitli)

1. **İş değerlerini onayla** — seed/migration'dan gelen varsayılanlar
   çalışır durumdadır ama iş kararı DEĞİLDİR (tablo aşağıda).
2. **Katalog** (sıra önemli): Categories (ağaç + sıralama) → Manufacturers
   (logolu) → Brands → Car Models (marka ister) → Attributes (grup + değerler).
   `scale` ve `material` grupları özellikle önemli: filtre kenar çubuğu ve
   üst menüdeki "Ölçek" başlığı doğrudan bunlardan beslenir, boşken görünmezler.
3. **Statik sayfalar** — `Marketing → Pages`: **about, faq, privacy, terms**.
   Vitrin bunları DB'den okur, yoksa 404 verir; **yayınlanmamış (draft) sayfa da
   404'tür**. `/terms` ve `/privacy` kayıt formundaki onay kutusundan linklidir.
4. **Settings** — Listing sekmesini bir kez **kaydet**: min/max ürün fiyatı
   kaydedilene kadar hiç uygulanmaz (arayüzdeki 10/100000 yalnız placeholder).
   **Warehouse** sekmesini doldur (güvenli takas depo operasyonunun önkoşulu;
   boşken ilk takas onayı 400 verir ve `/health/ready` bunu kontrol etmez).
5. **E-posta şablonları** — opsiyonel; kod varsayılanları hazır.
6. **Staff** — ek admin hesapları (geçici şifre ekranda gösterilir, SMTP
   gerekmez); süper-admin'de 2FA aç.
7. **Early-access PIN'leri** — reset mevcut pinleri siler; yeniden oluştur.
   Davet e-postası SMTP kurulu değilken de "gönderildi" der (sessiz hata) —
   güvenli yol "kodu kopyala".

#### Onay bekleyen varsayılan iş değerleri

| Ne                         | Gelen değer                                                                   | Nerede değişir                                                    |
| -------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Komisyon (catch-all)       | satıcıdan **%5**, alıcıdan **%0** — alıcı komisyonu ve hizmet bedeli tanımsız | Finance → Commission                                              |
| Pasif duran kural          | `Platform Hizmet Bedeli (Alıcı)` %3, `is_active=false`                        | alıcı bedeli alınacaksa aktive et                                 |
| Kargo kademeleri           | migration'dan **üçü de 29,99 ₺**, örnek ölçüler boş                           | System → Shipping Tariffs (reset log'u "REVIEW" satırıyla uyarır) |
| Kargo payı (kademe başına) | küçük 100/0, orta 70/30, büyük 50/50 (alıcı/satıcı)                           | Finance → Commission                                              |
| Üyelik                     | free 0 ₺ (**takas kapalı**), basic 49,99, premium 99,99, business 249,99 ₺/ay | Membership Tiers                                                  |
| Vergi                      | KDV %20, hizmet KDV'si açık, stopaj %1 (yalnız kurumsal)                      | System → Settings                                                 |
| Serbest kargo eşiği        | 500 ₺                                                                         | System → Shipping Tariffs                                         |

### Adım 6-7 — Kademeli açılış ve sonrası

**Kademeli faz:** `SITE_LOCKED=true` kalır; davetliler PIN ile girer. Pin iptali
yeni unlock'ları keser; açılmış tarayıcılar cookie süresince girmeye devam eder —
herkesi anında düşürmek için `SITE_UNLOCK_SECRET` rotate et.

**Tam açılış:** Coolify'da `SITE_LOCKED=false` + web restart; smoke test
(anasayfa boş raylarla açılır, kategori gezinme, kayıt + giriş,
`/api/health/ready` yeşil — ready kontrolü catch-all komisyon kuralunu da doğrular).
Arama motorlarına açmak için web `NEXT_PUBLIC_ALLOW_INDEXING=true` — ama 4 CMS
sayfası yayınlanmadan açma, `sitemap.xml` onları listeler ve soft-404 üretir.

**Vitrin boşken beklenen görünüm** (hepsi bilinçli): üretici/kategori/ölçek
menüleri ve marka şeridi hiç çıkmaz, "popüler aramalar" çipleri kataloğun kendi
üreticilerinden türer (boşken görünmez), indirim rayı çizilmez, ilan listesi
"Henüz ilan yok / İlk ilanı siz verin" der. Filtre kenar çubuğundaki yedek
listeler yalnız API **hata verdiğinde** devreye girer — boş yanıt boş liste
demektir.

**Rollback:** vitrin kilitliyken workflow'un yazdığı yedeği production
PostgreSQL container'ından `pg_restore --clean --if-exists` ile geri yükle;
API/web restart, `/api/health/ready` + vitrin doğrulaması, sonra kilidi kaldır.
Lansman stabil ilan edilene kadar reset öncesi yedeği sakla.
