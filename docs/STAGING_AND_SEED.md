# Staging Reset & Seed-Assets Modeli

## Özet

- **Demo görseller repoda değil, S3'te yaşar:** `s3://amzn-tarodan/seed-assets/`
  (products/collections variant'ları, hero, avatarlar). Seed bunları **indirip
  işlemez**; her ortamın kendi env-prefix'li key'lerine sunucu tarafında
  **CopyObject** yapar (`StorageService.copyFile`). Ortamlar kendi kopyalarına
  sahiptir — uygulamadaki silme akışları paylaşılan kaynaklara dokunamaz.
- **Staging tek tuşla bilinen temiz duruma döner:** GitHub → Actions →
  "Staging Reset" → Run workflow → `confirm` alanına `STAGING` yaz.
- **`SEED_SKIP_IMAGES=1`** seed'in tüm görsel adımlarını atlar (S3
  erişimi/credential gerekmez) — e2e bunu kullanır.

## Staging Reset butonu

`.github/workflows/staging-reset.yml` → SSH ile staging VPS'e bağlanıp
`scripts/staging-reset-remote.sh` çalıştırır: önce pg_dump yedeği (opsiyonel,
`skip_backup`), sonra api+worker durdurulur, `prisma migrate reset --force` +
derlenmiş seed koşulur, redis flush + bayat ES index'leri (products,
collections) silinir, container'lar geri açılır — API açılışta boş index'leri
taze DB'den kendisi doldurur (`syncIndexIfEmpty`).

> **Dev notu:** Lokalde `pnpm db:reset` sonrası Elasticsearch bayat kalır ve
> liste sayıları eski görünür. Hızlı çözüm:
> `curl http://localhost:3001/api/search/dev/reindex` (+ `.../dev/reindex-collections`),
> ya da 5dk'lık delta / saatlik reconcile cron'unu bekle. Listede görünen sayı
> = `active` + `sold` ürünler (sold "Stok bitti" olarak listelenir); pending/
> rejected/suspended/reserved indexlenmez.

### Prod guard'ları (üçü de geçmeden reset yok)

1. Sunucudaki `infrastructure/.env` içinde `ENV_ROLE=staging` satırı **şart**
   (bu satır YALNIZ staging sunucusuna eklenir; prod'da asla olmaz).
2. `DOMAIN` tarodan.com/tarodan.shop ise veya `S3_ENV_PREFIX=prod` ise **ret**.
3. Çağıran `RESET_CONFIRM=STAGING` geçirmek zorunda (workflow bunu, dispatch
   input'una harfiyen `STAGING` yazıldıysa geçirir).

### Kurulum (bir kez)

1. GitHub'da `staging` environment'ı oluştur (istenirse required reviewers ile
   onay kapısı eklenebilir) ve secret'ları tanımla:
   `STAGING_HOST`, `STAGING_USERNAME`, `STAGING_SSH_KEY`.
2. Staging sunucusunda `infrastructure/.env` dosyasına `ENV_ROLE=staging` ekle.
3. (Opsiyonel) Haftalık otomatik reset için repo/environment variable:
   `STAGING_WEEKLY_RESET=true` → her Pazartesi 06:00 TRT. Tanımlı değilse cron
   no-op'tur.

## seed-assets nasıl kuruldu / yeniden kurulur

`apps/api/scripts/build-seed-assets.ts` (`pnpm --filter @tarodan/api
seed:assets:build`): dev DB'deki mevcut ürün/koleksiyon görsel key'lerini okur
ve S3→S3 kopyayla `seed-assets/` altına kararlı isimlerle damıtır (lokalden
yükleme yok; eksikler lokal `photos/` fallback'inden tamamlanır). Yeni demo
görseli eklemek istersen: dosyayı `seed-assets/`e yükle ve seed'deki ilgili
listeye (productData `img` / collectionDefs `coverFile`) adını ekle.

- Ürün: `seed-assets/products/<slugBase>-card.webp` + `-detail.webp`
- Koleksiyon: `seed-assets/collections/<slug>.webp`
- Hero: `seed-assets/hero/<dosya>.png` (web doğrudan CDN URL'inden yükler —
  `apps/web/src/lib/assetCdn.ts`, `NEXT_PUBLIC_ASSET_CDN_URL`)
- Avatar: `seed-assets/avatars/avatar-XX.webp`

Bucket policy: `infrastructure/config/s3-bucket-policy-public-read.json` —
`seed-assets/hero/*` public-read olmalı (hero tarayıcıdan doğrudan çekilir);
`{dev,staging,prod}/{products,collections,avatars}/*` da public-read.
Değişiklik sonrası uygula:
`aws s3api put-bucket-policy --bucket amzn-tarodan --policy file://infrastructure/config/s3-bucket-policy-public-read.json`

## Statik marka görselleri (web)

`apps/web/scripts/sync-brand-assets.mjs` (predev/prebuild'de otomatik):
`@tarodan/brand` logolarını ve repo kökündeki `photos/logolar/` üretici
logolarını `apps/web/public/` altına kopyalar. `apps/web/public/photos/`
tamamen üretilir ve gitignore'ludur. Mobil, logoları web host'u üzerinden
`/photos/logolar/...` yollarından tüketmeye devam eder.

## SEED_SKIP_IMAGES

`SEED_SKIP_IMAGES=1` (veya `true`) ile seed: storage hiç başlatılmaz, ürün
görselleri + koleksiyon kapakları + avatarlar atlanır (key alanları boş kalır)
ve seed sonuna kadar akar. e2e global-setup bunu set eder; seed hatası artık
yutulmaz — seed patlarsa e2e setup da patlar.

Yerel geliştirmede doğrudan `pnpm dev:seed` kullanılır. Bu komut
`SEED_SKIP_IMAGES=1` değerini kendisi geçirir ve uzak bir veritabanına karşı
çalışmayı reddeder. Mevcut yerel veritabanını tamamen yenilemek için
`pnpm dev:reset` kullanılır.

## S3 çöp temizliği (dev prefix)

`apps/api/scripts/prune-dev-s3.ts`: `dev/products/product-images/` ve
`dev/collections/` altında dev DB'nin referans etmediği objeleri bulur.
Varsayılan **dry-run**; gerçekten silmek için `--delete`. `prod/` ve
`seed-assets/` kapsam dışıdır.
