# Seed ve Uygulama Başlatma Planı

## Ön Hazırlık

### 1. AWS S3 Bucket Kontrolü
Bucket'ın hazır olduğunu doğrulayın:
```bash
aws s3 ls s3://amzn-tarodan --region eu-west-1
```

Eğer bucket yoksa oluşturun:
```bash
aws s3 mb s3://amzn-tarodan --region eu-west-1
```

### 2. Environment Dosyalarını Kontrol Et
AWS credentials'ları aşağıdaki dosyalarda olmalı:
- `apps/api/.env` (veya `apps/api/env.txt` kopyalayarak oluştur)
- `infrastructure/.env` (production için)

## Adım Adım Plan

### Adım 1: Bağımlılıkları Yükle
```bash
# Proje root'unda
pnpm install
```

### Adım 2: Docker Servislerini Başlat
```bash
# PostgreSQL, Redis, Elasticsearch, MailHog'u başlat
pnpm docker:up

# Servislerin hazır olduğunu kontrol et
docker ps
```

### Adım 3: Veritabanı Migrasyonları
```bash
# Prisma Client'ı generate et
pnpm db:generate

# Migrasyonları çalıştır
pnpm db:migrate

# Veya development için direkt push (hızlı)
pnpm db:push
```

### Adım 4: Environment Dosyasını Hazırla
```bash
# apps/api/.env dosyası oluştur (eğer yoksa)
cd apps/api
cp env.txt .env
# veya
cp env.example.txt .env
```

`.env` dosyasında AWS credentials'ların olduğundan emin ol:
```env
AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key
AWS_REGION=eu-west-1
S3_BUCKET=amzn-tarodan
S3_ENV_PREFIX=dev
```

**Not:** Production ortamında bu değerler GitHub Secrets'tan otomatik alınır. Local development için kendi credentials'larınızı ekleyin.

### Adım 5: S3 Bağlantısını Test Et
```bash
# API'yi başlat (S3 bağlantısını test etmek için)
cd apps/api
pnpm start:dev

# Log'larda şunu görmelisin:
# ✅ AWS S3 connection established: amzn-tarodan
```

Eğer hata alırsan:
- AWS credentials'ları kontrol et
- Bucket'ın var olduğundan emin ol
- IAM user'ın S3 erişim izni olduğundan emin ol

### Adım 6: Seed İşlemini Çalıştır
```bash
# Proje root'unda
pnpm db:seed
```

Seed işlemi:
1. Kullanıcılar oluşturur
2. Kategoriler, markalar, modeller oluşturur
3. Ürünler oluşturur
4. **photos/** klasöründen resimleri S3'e yükler**
5. Ürünlere resimleri atar

**Önemli:** Eğer `photos/` klasöründe resimler varsa, bunlar otomatik olarak S3'e yüklenir.

### Adım 7: Admin Kullanıcısı Oluştur
```bash
pnpm seed:admin
```

Bu komut admin kullanıcısı oluşturur:
- Email: `admin@tarodan.com`
- Şifre: `Admin123!`

### Adım 8: Uygulamayı Başlat
```bash
# Proje root'unda - Tüm uygulamaları başlat
pnpm dev

# Veya sadece API
pnpm --filter @tarodan/api start:dev

# Veya sadece Web
pnpm --filter @tarodan/web dev

# Veya sadece Admin
pnpm --filter @tarodan/admin dev
```

## Hızlı Başlatma (Tek Komut)

Eğer her şey hazırsa:
```bash
# 1. Bağımlılıkları yükle
pnpm install

# 2. Docker'ı başlat
pnpm docker:up

# 3. Veritabanını hazırla
pnpm db:generate && pnpm db:push

# 4. Seed yap
pnpm db:seed && pnpm seed:admin

# 5. Uygulamayı başlat
pnpm dev
```

## Sorun Giderme

### S3 Bağlantı Hatası
```
❌ AWS S3 connection failed: ...
```

**Çözüm:**
1. AWS credentials'ları kontrol et
2. Bucket'ın var olduğundan emin ol: `aws s3 ls s3://amzn-tarodan`
3. IAM user'ın şu izinleri olduğundan emin ol:
   - `s3:PutObject`
   - `s3:GetObject`
   - `s3:DeleteObject`
   - `s3:ListBucket`

### Seed Hatası
```
⚠️ StorageService not available
```

**Çözüm:**
1. `.env` dosyasında AWS credentials'ların olduğundan emin ol
2. S3 bağlantısını test et (Adım 5)
3. Seed'i tekrar çalıştır

### Veritabanı Hatası
```
Error: Can't reach database server
```

**Çözüm:**
```bash
# Docker servislerini kontrol et
docker ps

# PostgreSQL'i yeniden başlat
docker-compose -f infrastructure/docker-compose.yml restart postgres

# Bağlantıyı test et
docker-compose -f infrastructure/docker-compose.yml exec postgres pg_isready -U postgres
```

## Erişim URL'leri

Başarıyla başlattıktan sonra:
- **Web**: http://localhost:3000
- **Admin**: http://localhost:3002
- **API**: http://localhost:3001
- **API Docs**: http://localhost:3001/api/docs
- **MailHog**: http://localhost:8025
- **Prisma Studio**: `pnpm db:studio` sonrası http://localhost:5555

## Test Hesapları

Seed sonrası oluşan test hesapları:
- `admin@tarodan.com` / `Admin123!` (Super Admin)
- `moderator@tarodan.com` / `Admin123!` (Moderator)
- `ahmet@demo.com` / `Demo123!` (Premium User)
- `mehmet@demo.com` / `Demo123!` (Basic User)

## S3 Dosya Yapısı Kontrolü

Seed sonrası S3'te dosyaların yüklendiğini kontrol et:
```bash
aws s3 ls s3://amzn-tarodan/dev/products/ --recursive --region eu-west-1
```

Veya AWS Console'dan:
1. S3 Console'a git
2. `amzn-tarodan` bucket'ını aç
3. `dev/products/` klasörünü kontrol et

## Sonraki Adımlar

1. ✅ Seed tamamlandı
2. ✅ Uygulama başlatıldı
3. 🔄 Frontend'den dosya yükleme test et
4. 🔄 Presigned URL'lerin çalıştığını test et
5. 🔄 Production için environment hazırla
