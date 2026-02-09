# ⚡ TARODAN Hızlı Başlangıç

Bu dosya, projeyi başlatmak için gereken tüm terminal komutlarını içerir.

## 🚀 Tam Kurulum (İlk Kez)

```bash
# 1. Bağımlılıkları yükle
pnpm install

# 2. Docker servislerini başlat (PostgreSQL, Redis, MinIO, Elasticsearch, MailHog)
pnpm docker:up

# 3. Veritabanı migrasyonlarını çalıştır
pnpm db:migrate

# 4. Prisma Client'ı generate et
pnpm --filter @tarodan/api prisma generate

# 5. Veritabanını seed et (Test verileri)
pnpm db:seed

# 6. Admin kullanıcısı oluştur
pnpm seed:admin

# 7. Tüm geliştirme sunucularını başlat
pnpm dev
```

## 📝 Ortam Değişkenleri

Eğer `.env` dosyaları yoksa, aşağıdaki komutları çalıştırarak oluşturabilirsiniz:

### API (.env)
```bash
# apps/api/.env dosyası oluştur
cat > apps/api/.env << 'EOF'
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/tarodan?schema=public"
JWT_SECRET="tarodan-jwt-secret-key-change-in-production-2024"
JWT_REFRESH_SECRET="tarodan-refresh-secret-key-change-in-production-2024"
JWT_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"
PORT=3001
NODE_ENV=development
API_URL="http://localhost:3001"
FRONTEND_URL="http://localhost:3000"
ADMIN_URL="http://localhost:3002"
REDIS_HOST=localhost
REDIS_PORT=6379
ELASTICSEARCH_NODE="http://localhost:9200"
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=tarodan
IYZICO_API_KEY=sandbox-test-api-key
IYZICO_SECRET_KEY=sandbox-test-secret-key
IYZICO_BASE_URL=https://sandbox-api.iyzipay.com
PAYTR_MERCHANT_ID=test-merchant-id
PAYTR_MERCHANT_KEY=test-merchant-key
PAYTR_MERCHANT_SALT=test-merchant-salt
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_USER=
SMTP_PASS=
MAIL_FROM="noreply@tarodan.com"
PAYMENT_HOLD_DAYS=7
ADMIN_SESSION_TIMEOUT=1800
EOF
```

### Web (.env.local)
```bash
# apps/web/.env.local dosyası oluştur
cat > apps/web/.env.local << 'EOF'
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_API_PREFIX=/api
NEXT_PUBLIC_STORAGE_URL=http://localhost:9000
NEXT_PUBLIC_APP_NAME=Tarodan
NEXT_PUBLIC_APP_URL=http://localhost:3000
EOF
```

### Admin (.env.local)
```bash
# apps/admin/.env.local dosyası oluştur
cat > apps/admin/.env.local << 'EOF'
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_API_PREFIX=/api
NEXT_PUBLIC_STORAGE_URL=http://localhost:9000
NEXT_PUBLIC_APP_NAME=Tarodan Admin
NEXT_PUBLIC_APP_URL=http://localhost:3002
EOF
```

## 📄 Sayfalar ve E-posta Şablonları – Koşullar

Admin panelinde **Sayfalar** ve **E-posta Şablonları** kısımlarının düzgün çalışması için:

| Koşul | Nasıl sağlanır |
|-------|-----------------|
| **1. API ayakta** | `pnpm dev` ile API (port 3001) çalışıyor olmalı. Kontrol: `curl http://localhost:3001/api/health` |
| **2. Admin girişi** | Admin panele giriş yapın (http://localhost:3002). Token `localStorage`'a yazılır; Sayfalar / E-posta Şablonları bu token ile istek atar. |
| **3. Test e-postası** | E-posta Şablonları > Test gönder için API `.env` içinde `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` dolu olmalı. MailHog kullanıyorsanız: `SMTP_HOST=localhost`, `SMTP_PORT=1025`, `SMTP_USER=` ve `SMTP_PASS=` boş bırakılabilir. |
| **4. Web’de statik sayfalar** | `/sayfa/about`, `/sayfa/faq` için web `.env.local` içinde `NEXT_PUBLIC_API_URL=http://localhost:3001` (veya API adresiniz) olmalı. |

Detaylı env örnekleri: `apps/api/env.example.txt`, `apps/admin/env.example.txt`, `apps/web/env.example.txt`.

## 🔄 Günlük Kullanım

Projeyi her gün başlatmak için:

```bash
# 1. Docker servislerini başlat
pnpm docker:up

# 2. Geliştirme sunucularını başlat
pnpm dev
```

## 🛑 Durdurma

```bash
# Geliştirme sunucularını durdur: Ctrl+C

# Docker servislerini durdur
pnpm docker:down
```

## 🔧 Yararlı Komutlar

### Veritabanı İşlemleri

```bash
# Veritabanı migrasyonu oluştur
pnpm db:migrate

# Veritabanı şemasını güncelle (development)
pnpm db:push

# Veritabanını seed et
pnpm db:seed

# Prisma Studio'yu aç (Veritabanı görüntüleme)
pnpm db:studio

# Admin kullanıcısı oluştur
pnpm seed:admin
```

### Docker İşlemleri

```bash
# Servisleri başlat
pnpm docker:up

# Servisleri durdur
pnpm docker:down

# Servisleri yeniden başlat
pnpm docker:down && pnpm docker:up

# Logları görüntüle
docker-compose -f infrastructure/docker-compose.yml logs -f

# Belirli servisin loglarını görüntüle
docker-compose -f infrastructure/docker-compose.yml logs -f postgres
```

### Geliştirme

```bash
# Tüm uygulamaları başlat
pnpm dev

# Sadece Web
pnpm --filter @tarodan/web dev

# Sadece Admin
pnpm --filter @tarodan/admin dev

# Sadece API
pnpm --filter @tarodan/api start:dev
```

### Build

```bash
# Tüm uygulamaları build et
pnpm build

# Sadece Web
pnpm --filter @tarodan/web build

# Sadece Admin
pnpm --filter @tarodan/admin build

# Sadece API
pnpm --filter @tarodan/api build
```

## 🌐 Erişim URL'leri

- **Web**: http://localhost:3000
- **Admin**: http://localhost:3002
- **API**: http://localhost:3001
- **API Docs**: http://localhost:3001/api/docs
- **MinIO Console**: http://localhost:9001 (minioadmin/minioadmin)
- **MailHog**: http://localhost:8025
- **Prisma Studio**: `pnpm db:studio` sonrası http://localhost:5555

## 👤 Test Hesapları

| Email | Şifre | Rol |
|-------|-------|-----|
| admin@tarodan.com | Admin123! | Super Admin |
| moderator@tarodan.com | Admin123! | Moderator |
| platform@tarodan.com | Demo123! | Platform Seller |
| ahmet@demo.com | Demo123! | Premium User |
| mehmet@demo.com | Demo123! | Basic User |

## ⚠️ Sorun Giderme

### Port Zaten Kullanılıyor

```bash
# Windows
netstat -ano | findstr :3001

# Linux/Mac
lsof -i :3001
```

### Docker Servisleri Çalışmıyor

```bash
# Servisleri kontrol et
docker ps

# Servisleri yeniden başlat
pnpm docker:down
pnpm docker:up
```

### Veritabanı Bağlantı Hatası

```bash
# PostgreSQL'in hazır olduğunu kontrol et
docker-compose -f infrastructure/docker-compose.yml exec postgres pg_isready -U postgres

# Prisma Client'ı yeniden generate et
pnpm --filter @tarodan/api prisma generate
```

---

**Not**: Detaylı kurulum rehberi için `SETUP.md` dosyasına bakın.
