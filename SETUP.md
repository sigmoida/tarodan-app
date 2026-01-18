# 🚀 TARODAN Proje Kurulum Rehberi

Bu rehber, Tarodan projesini yerel geliştirme ortamında başlatmak için gereken tüm adımları içerir.

## 📋 Gereksinimler

- **Node.js**: >= 18.0.0 (LTS önerilir)
- **pnpm**: >= 8.0.0
- **Docker**: >= 24.0.0
- **Docker Compose**: >= 2.0.0
- **Git**: Projeyi klonlamak için

## 🔧 Kurulum Adımları

### 1. Projeyi Klonlayın

```bash
git clone <repository-url>
cd diecast
```

### 2. Bağımlılıkları Yükleyin

```bash
pnpm install
```

### 3. Ortam Değişkenlerini Ayarlayın

Her uygulama için `.env` dosyalarını oluşturun:

#### API Ortam Değişkenleri

`apps/api/.env` dosyası oluşturun:

```bash
# Database (Docker Compose ile uyumlu)
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/tarodan?schema=public"

# JWT
JWT_SECRET="tarodan-jwt-secret-key-change-in-production-2024"
JWT_REFRESH_SECRET="tarodan-refresh-secret-key-change-in-production-2024"
JWT_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"

# Server
PORT=3001
NODE_ENV=development
API_URL="http://localhost:3001"
FRONTEND_URL="http://localhost:3000"
ADMIN_URL="http://localhost:3002"

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Elasticsearch
ELASTICSEARCH_NODE="http://localhost:9200"

# MinIO (Docker Compose ile uyumlu)
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=tarodan

# Payment - iyzico (Test credentials)
IYZICO_API_KEY=sandbox-test-api-key
IYZICO_SECRET_KEY=sandbox-test-secret-key
IYZICO_BASE_URL=https://sandbox-api.iyzipay.com

# Payment - PayTR (Test credentials)
PAYTR_MERCHANT_ID=test-merchant-id
PAYTR_MERCHANT_KEY=test-merchant-key
PAYTR_MERCHANT_SALT=test-merchant-salt

# Email (Mailhog for development)
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_USER=
SMTP_PASS=
MAIL_FROM="noreply@tarodan.com"

# Payment Hold
PAYMENT_HOLD_DAYS=7

# Admin
ADMIN_SESSION_TIMEOUT=1800
```

#### Web Frontend Ortam Değişkenleri

`apps/web/.env.local` dosyası oluşturun:

```bash
# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_API_PREFIX=/api

# MinIO/Storage Configuration
NEXT_PUBLIC_STORAGE_URL=http://localhost:9000

# App Configuration
NEXT_PUBLIC_APP_NAME=Tarodan
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

#### Admin Panel Ortam Değişkenleri

`apps/admin/.env.local` dosyası oluşturun:

```bash
# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_API_PREFIX=/api

# Storage Configuration
NEXT_PUBLIC_STORAGE_URL=http://localhost:9000

# App Configuration
NEXT_PUBLIC_APP_NAME=Tarodan Admin
NEXT_PUBLIC_APP_URL=http://localhost:3002
```

### 4. Docker Servislerini Başlatın

PostgreSQL, Redis, MinIO, Elasticsearch ve MailHog servislerini başlatın:

```bash
pnpm docker:up
```

Veya manuel olarak:

```bash
docker-compose -f infrastructure/docker-compose.yml up -d
```

Servislerin çalıştığını kontrol edin:

```bash
docker ps
```

Şu servisler çalışıyor olmalı:
- `tarodan-postgres` (Port: 5432)
- `tarodan-redis` (Port: 6379)
- `tarodan-minio` (Port: 9000, Console: 9001)
- `tarodan-elasticsearch` (Port: 9200)
- `tarodan-mailhog` (SMTP: 1025, Web UI: 8025)

### 5. Veritabanı Migrasyonlarını Çalıştırın

```bash
pnpm db:migrate
```

Veya manuel olarak:

```bash
pnpm --filter @tarodan/api prisma migrate dev
```

### 6. Prisma Client'ı Generate Edin

```bash
pnpm --filter @tarodan/api prisma generate
```

### 7. Veritabanını Seed Edin (Test Verileri)

```bash
pnpm db:seed
```

Bu komut:
- Kategoriler oluşturur
- Üyelik seviyeleri oluşturur
- Komisyon kuralları oluşturur
- Test kullanıcıları oluşturur
- Test ürünleri oluşturur
- Test siparişleri oluşturur
- Ve daha fazlası...

### 8. Admin Kullanıcısı Oluşturun

```bash
pnpm seed:admin
```

Veya manuel olarak:

```bash
ts-node -r tsconfig-paths/register scripts/seed-admin.ts
```

Varsayılan admin bilgileri:
- **Email**: `admin@tarodan.com`
- **Password**: `Admin123!`

### 9. Geliştirme Sunucularını Başlatın

Tüm uygulamaları aynı anda başlatmak için:

```bash
pnpm dev
```

Bu komut şunları başlatır:
- **Web**: http://localhost:3000
- **Admin**: http://localhost:3002
- **API**: http://localhost:3001

#### Tek Tek Başlatma

Sadece belirli bir uygulamayı başlatmak için:

```bash
# Sadece Web
pnpm --filter @tarodan/web dev

# Sadece Admin
pnpm --filter @tarodan/admin dev

# Sadece API
pnpm --filter @tarodan/api start:dev
```

## 🎯 Test Hesapları

Seed işleminden sonra aşağıdaki test hesapları kullanılabilir:

| Rol | Email | Şifre |
|-----|-------|-------|
| Super Admin | admin@tarodan.com | Admin123! |
| Moderator | moderator@tarodan.com | Admin123! |
| Platform Seller | platform@tarodan.com | Demo123! |
| Premium User | ahmet@demo.com | Demo123! |
| Business User | ali@demo.com | Demo123! |
| Basic User | mehmet@demo.com | Demo123! |
| Free User | zeynep@demo.com | Demo123! |
| Buyer Only | deniz@demo.com | Demo123! |

## 📍 Erişim URL'leri

Geliştirme ortamında:

- **Web Uygulaması**: http://localhost:3000
- **Admin Paneli**: http://localhost:3002
- **API**: http://localhost:3001
- **API Dokümantasyonu (Swagger)**: http://localhost:3001/api/docs
- **MinIO Console**: http://localhost:9001
  - Username: `minioadmin`
  - Password: `minioadmin`
- **MailHog (Email Test)**: http://localhost:8025
- **Prisma Studio**: `pnpm db:studio` komutu ile başlatılır

## 🔍 Veritabanı Yönetimi

### Prisma Studio

Veritabanını görsel olarak yönetmek için:

```bash
pnpm db:studio
```

Bu komut http://localhost:5555 adresinde Prisma Studio'yu açar.

### Veritabanı Migrasyonları

Yeni bir migrasyon oluşturmak için:

```bash
pnpm db:migrate
```

Veritabanı şemasını güncellemek için (development):

```bash
pnpm db:push
```

## 🐳 Docker Komutları

### Servisleri Başlatma

```bash
pnpm docker:up
```

### Servisleri Durdurma

```bash
pnpm docker:down
```

### Servisleri Yeniden Başlatma

```bash
pnpm docker:down
pnpm docker:up
```

### Logları Görüntüleme

```bash
docker-compose -f infrastructure/docker-compose.yml logs -f
```

### Belirli bir servisin loglarını görüntüleme

```bash
docker-compose -f infrastructure/docker-compose.yml logs -f postgres
```

## 🛠️ Sorun Giderme

### Port Zaten Kullanılıyor

Eğer bir port zaten kullanılıyorsa:

1. Portu kullanan process'i bulun:
   ```bash
   # Windows
   netstat -ano | findstr :3001
   
   # Linux/Mac
   lsof -i :3001
   ```

2. Process'i sonlandırın veya uygulamanın portunu değiştirin.

### Veritabanı Bağlantı Hatası

1. Docker servislerinin çalıştığından emin olun:
   ```bash
   docker ps
   ```

2. PostgreSQL'in hazır olduğunu kontrol edin:
   ```bash
   docker-compose -f infrastructure/docker-compose.yml exec postgres pg_isready -U postgres
   ```

3. `.env` dosyasındaki `DATABASE_URL`'in doğru olduğundan emin olun.

### MinIO Bağlantı Hatası

1. MinIO servisinin çalıştığını kontrol edin:
   ```bash
   docker ps | grep minio
   ```

2. MinIO Console'a giriş yapıp bucket'ların oluşturulduğunu kontrol edin:
   - http://localhost:9001
   - Username: `minioadmin`
   - Password: `minioadmin`

### Elasticsearch Bağlantı Hatası

1. Elasticsearch servisinin çalıştığını kontrol edin:
   ```bash
   curl http://localhost:9200
   ```

2. Eğer hata alıyorsanız, servisi yeniden başlatın:
   ```bash
   docker-compose -f infrastructure/docker-compose.yml restart elasticsearch
   ```

### Prisma Client Hatası

Prisma Client'ı yeniden generate edin:

```bash
pnpm --filter @tarodan/api prisma generate
```

## 📝 Önemli Notlar

1. **Geliştirme Ortamı**: Bu kurulum sadece geliştirme ortamı içindir. Production için farklı yapılandırmalar gereklidir.

2. **Güvenlik**: Production'da mutlaka güçlü şifreler ve secret key'ler kullanın.

3. **Veritabanı Yedekleme**: Production'da düzenli veritabanı yedeklemesi yapın.

4. **MinIO Bucket'ları**: Seed işlemi sırasında gerekli bucket'lar otomatik oluşturulur.

5. **Elasticsearch**: İlk başlatmada Elasticsearch'in hazır olması biraz zaman alabilir.

## 🚀 Hızlı Başlangıç (Özet)

Tüm kurulumu tek seferde yapmak için:

```bash
# 1. Bağımlılıkları yükle
pnpm install

# 2. Docker servislerini başlat
pnpm docker:up

# 3. Veritabanı migrasyonlarını çalıştır
pnpm db:migrate

# 4. Prisma Client generate et
pnpm --filter @tarodan/api prisma generate

# 5. Veritabanını seed et
pnpm db:seed

# 6. Admin kullanıcısı oluştur
pnpm seed:admin

# 7. Geliştirme sunucularını başlat
pnpm dev
```

## 📚 Ek Kaynaklar

- [Proje Dokümantasyonu](docs/PROJECT.md)
- [API Dokümantasyonu](docs/API.md)
- [Veritabanı Şeması](docs/SCHEMA.md)
- [Admin Panel Dokümantasyonu](docs/ADMIN.md)

## 💬 Destek

Sorun yaşarsanız:
1. Bu rehberi tekrar kontrol edin
2. Docker servislerinin çalıştığından emin olun
3. Log dosyalarını kontrol edin
4. GitHub Issues'da sorun bildirin

---

**Son Güncelleme**: 2024
**Versiyon**: 1.0.0
