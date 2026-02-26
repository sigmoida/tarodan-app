# 🚀 TARODAN Proje Başlatma Komutları

Bu dosya, projeyi başlatmak için gereken tüm terminal komutlarını içerir.

## ⚡ Hızlı Başlangıç (İlk Kurulum)

Projeyi ilk kez başlatıyorsanız, aşağıdaki komutları sırayla çalıştırın:

```bash
# 1. Bağımlılıkları yükle
pnpm install

# 2. Docker servislerini başlat (PostgreSQL, Redis, Elasticsearch, MailHog)
pnpm docker:up

# 3. Veritabanı migrasyonlarını çalıştır
pnpm db:migrate

# 4. Prisma Client'ı generate et
pnpm --filter @tarodan/api prisma generate

# 5. Veritabanını seed et (Test verileri oluşturur)
pnpm db:seed

# 6. Admin kullanıcısı oluştur
pnpm seed:admin

# 7. Tüm geliştirme sunucularını başlat
pnpm dev
```

## 📝 Ortam Değişkenleri (.env Dosyaları)

Eğer `.env` dosyaları yoksa, aşağıdaki komutları çalıştırarak oluşturabilirsiniz:

### Windows PowerShell

```powershell
# API .env dosyası
@"
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
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=eu-west-1
S3_BUCKET=amzn-tarodan
S3_ENV_PREFIX=dev
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
"@ | Out-File -FilePath apps/api/.env -Encoding utf8

# Web .env.local dosyası
@"
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_API_PREFIX=/api
NEXT_PUBLIC_APP_NAME=Tarodan
NEXT_PUBLIC_APP_URL=http://localhost:3000
"@ | Out-File -FilePath apps/web/.env.local -Encoding utf8

# Admin .env.local dosyası
@"
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_API_PREFIX=/api
NEXT_PUBLIC_APP_NAME=Tarodan Admin
NEXT_PUBLIC_APP_URL=http://localhost:3002
"@ | Out-File -FilePath apps/admin/.env.local -Encoding utf8
```

### Linux/Mac

```bash
# API .env dosyası
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
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=eu-west-1
S3_BUCKET=amzn-tarodan
S3_ENV_PREFIX=dev
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

# Web .env.local dosyası
cat > apps/web/.env.local << 'EOF'
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_API_PREFIX=/api
NEXT_PUBLIC_APP_NAME=Tarodan
NEXT_PUBLIC_APP_URL=http://localhost:3000
EOF

# Admin .env.local dosyası
cat > apps/admin/.env.local << 'EOF'
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_API_PREFIX=/api
NEXT_PUBLIC_APP_NAME=Tarodan Admin
NEXT_PUBLIC_APP_URL=http://localhost:3002
EOF
```

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
# Geliştirme sunucularını durdur: Ctrl+C tuşlarına basın

# Docker servislerini durdur
pnpm docker:down
```

## 🔧 Yararlı Komutlar

### Veritabanı İşlemleri

```bash
# Veritabanı migrasyonu oluştur ve uygula
pnpm db:migrate

# Veritabanı şemasını güncelle (development için)
pnpm db:push

# Veritabanını test verileriyle doldur
pnpm db:seed

# Prisma Studio'yu aç (Veritabanını görsel olarak yönet)
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

# Tüm logları görüntüle
docker-compose -f infrastructure/docker-compose.yml logs -f

# Belirli bir servisin loglarını görüntüle
docker-compose -f infrastructure/docker-compose.yml logs -f postgres
docker-compose -f infrastructure/docker-compose.yml logs -f redis
docker-compose -f infrastructure/docker-compose.yml logs -f elasticsearch
```

### Geliştirme Sunucuları

```bash
# Tüm uygulamaları başlat (Web, Admin, API)
pnpm dev

# Sadece Web uygulamasını başlat
pnpm --filter @tarodan/web dev

# Sadece Admin panelini başlat
pnpm --filter @tarodan/admin dev

# Sadece API'yi başlat
pnpm --filter @tarodan/api start:dev
```

### Build İşlemleri

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

Kurulum tamamlandıktan sonra aşağıdaki adreslere erişebilirsiniz:

- **Web Uygulaması**: http://localhost:3000
- **Admin Paneli**: http://localhost:3002
- **API**: http://localhost:3001
- **API Dokümantasyonu (Swagger)**: http://localhost:3001/api/docs
- **MailHog (Email Test)**: http://localhost:8025
- **Prisma Studio**: `pnpm db:studio` komutunu çalıştırdıktan sonra http://localhost:5555

## 👤 Test Hesapları

Seed işleminden sonra aşağıdaki test hesaplarını kullanabilirsiniz:

| Email | Şifre | Rol |
|-------|-------|-----|
| admin@tarodan.com | Admin123! | Super Admin |
| moderator@tarodan.com | Admin123! | Moderator |
| platform@tarodan.com | Demo123! | Platform Seller |
| ahmet@demo.com | Demo123! | Premium User |
| ali@demo.com | Demo123! | Business User |
| mehmet@demo.com | Demo123! | Basic User |
| zeynep@demo.com | Demo123! | Free User |
| deniz@demo.com | Demo123! | Buyer Only |

## ⚠️ Sorun Giderme

### API başlamıyor: "Can't reach database server"

Terminalde şunları görüyorsanız:
- `PrismaClientInitializationError: Can't reach database server at localhost:5432`
- `[Bootstrap] Failed to start application`

**Sebep:** PostgreSQL çalışmıyor; API bu servise bağlanamıyor.

**Çözüm:** Önce Docker servislerini başlatın, sonra `pnpm dev` çalıştırın:

```bash
pnpm docker:up
# Birkaç saniye bekleyin (PostgreSQL ayağa kalksın)
pnpm dev
```

Veya tek komutla: `pnpm start` (önce docker:up, sonra dev çalıştırır).

---

### Port Zaten Kullanılıyor

```bash
# Windows PowerShell
netstat -ano | findstr :3001

# Linux/Mac
lsof -i :3001
```

### Docker Servisleri Çalışmıyor

```bash
# Çalışan servisleri kontrol et
docker ps

# Servisleri yeniden başlat
pnpm docker:down
pnpm docker:up

# Belirli bir servisi yeniden başlat
docker-compose -f infrastructure/docker-compose.yml restart postgres
```

### Veritabanı Bağlantı Hatası

```bash
# PostgreSQL'in hazır olduğunu kontrol et
docker-compose -f infrastructure/docker-compose.yml exec postgres pg_isready -U postgres

# Prisma Client'ı yeniden generate et
pnpm --filter @tarodan/api prisma generate

# Veritabanı bağlantısını test et
pnpm db:studio
```

### Elasticsearch Bağlantı Hatası

```bash
# Elasticsearch'in çalıştığını kontrol et
curl http://localhost:9200

# Servisi yeniden başlat
docker-compose -f infrastructure/docker-compose.yml restart elasticsearch
```

## 📚 Detaylı Dokümantasyon

- **Kurulum Rehberi**: `SETUP.md`
- **Hızlı Başlangıç**: `QUICK_START.md`
- **Proje Dokümantasyonu**: `docs/PROJECT.md`
- **API Dokümantasyonu**: `docs/API.md`
- **Veritabanı Şeması**: `docs/SCHEMA.md`

---

**Not**: Tüm komutlar proje kök dizininden çalıştırılmalıdır.
