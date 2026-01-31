# Docker ile Veritabanı Bağlantısı

Bu proje Docker üzerinde PostgreSQL kullanıyor. Aşağıdaki sırayla çalıştırın.

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

## 2. Veritabanını Prisma şeması ile uyumlu hale getir

Eksik sütunları (users tablosu vb.) eklemek için:

```bash
pnpm db:sync-docker
```

veya doğrudan script:

```powershell
.\scripts\sync-db-docker.ps1
```

Bu komut Docker içindeki PostgreSQL’e bağlanıp `users` tablosuna eksik sütunları ekler; Prisma Studio ve API hatasız çalışır.

## 3. Bağlantı bilgileri (.env ile aynı)

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

## 4. Projeyi başlat

```bash
pnpm dev
```

## 5. Veritabanını görüntüle (Prisma Studio)

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

**Özet sıra:** `docker:up` → `db:sync-docker` → `dev` (ve isteğe bağlı `db:studio`).
