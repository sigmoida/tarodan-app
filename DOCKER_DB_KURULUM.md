# Docker ile Veritabanı Bağlantısı

Bu proje Docker üzerinde **PostgreSQL** (veritabanı), **Redis**, **Elasticsearch** ve **MailHog** kullanıyor.  
**Dosya depolama (resim, avatar, belge) MinIO değil, AWS S3** ile yapılır; S3 bilgileri `apps/api/.env` içinde tanımlanır. Aşağıdaki sırayla çalıştırın.

## 1. Docker servislerini başlat

```bash
pnpm docker:up
```

veya:

```bash
docker-compose -f infrastructure/docker-compose.yml up -d
```

PostgreSQL container adı: **tarodan-postgres**  
Port: **5432** (localhost’a yayınlanır)

## 2. Veritabanı şemasını oluştur (ilk kurulum)

İlk kez kuruyorsanız tüm tabloları oluşturmak için:

```bash
cd apps/api
npx prisma migrate deploy
```

## 3. (İsteğe bağlı) Eksik sütunları ekle

Mevcut veritabanında sadece eksik sütunları eklemek için: `pnpm db:sync-docker` veya `.\scripts\sync-db-docker.ps1`

## 4. Bağlantı bilgileri (.env ile aynı)

| Ayar      | Değer |
|-----------|--------|
| Host      | localhost |
| Port      | 5432 |
| Database  | tarodan |
| User      | postgres |
| Password  | postgres |

`apps/api/.env` içinde:

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/tarodan?schema=public"
```

## 5. Depolama (S3)

Resim/avatar yükleme için `apps/api/.env` içinde AWS S3 bilgilerini doldurun (MinIO Docker'da yok):

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION` (örn. `eu-west-1`)
- `S3_BUCKET`
- `S3_ENV_PREFIX` (örn. `dev`)

Örnek: `apps/api/env.example.txt` dosyasını `.env` olarak kopyalayıp bu alanları güncelleyin.

## 6. Projeyi başlat

```bash
pnpm dev
```

## 7. Veritabanını görüntüle (Prisma Studio)

Senkronizasyon sonrası:

```bash
pnpm db:studio
```

**pnpm tanınmıyorsa** (PowerShell'de "pnpm is not recognized"):

```bash
npx pnpm db:studio
```

veya doğrudan API klasöründen:

```bash
cd apps\api
npx prisma studio
```

Tarayıcı: **http://localhost:5555**

---

**Özet sıra (ilk kurulum):** `docker:up` → `apps/api` içinde `prisma migrate deploy` → `apps/api/.env` içinde S3 bilgilerini ayarla → `dev` (ve isteğe bağlı `db:studio`).
