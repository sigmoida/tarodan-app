# Environment Variables Setup Guide

Bu dosya, Tarodan API için gerekli environment variable'ların nasıl ayarlanacağını açıklar.

## Hızlı Başlangıç

1. `env.example.txt` dosyasını `.env` olarak kopyalayın:
   ```bash
   cp env.example.txt .env
   ```

2. `.env` dosyasını açın ve aşağıdaki bölümleri kendi bilgilerinizle doldurun:
   - **Iyzico Credentials** (Ödeme için gerekli)
   - **Email Configuration** (Mail göndermek için gerekli)

## Detaylı Kurulum

### 1. Iyzico (Ödeme Gateway)

Iyzico, Türkiye'de yaygın kullanılan bir ödeme gateway'idir.

#### Adımlar:

1. **Iyzico Hesabı Oluşturun:**
   - https://merchant.iyzipay.com/ adresinden kayıt olun
   - Sandbox (test) hesabı oluşturun

2. **API Credentials Alın:**
   - Iyzico merchant panel'ine giriş yapın
   - **Ayarlar > API Bilgileri** bölümüne gidin
   - **API Key** ve **Secret Key** değerlerini kopyalayın

3. **.env Dosyasını Güncelleyin:**
   ```env
   IYZICO_API_KEY=sandbox-xxxxxxxxxxxxx
   IYZICO_SECRET_KEY=sandbox-xxxxxxxxxxxxx
   IYZICO_BASE_URL=https://sandbox-api.iyzipay.com
   ```

#### Test Kartları:
- **Başarılı Ödeme:** `4603450000000000` (Visa Credit)
- **Son Kullanma:** `12/30` (gelecek bir tarih)
- **CVV:** `123`

### 2. Email Configuration (Gmail)

#### Gmail ile Kurulum (Önerilen - Development):

1. **2 Adımlı Doğrulamayı Aktif Edin:**
   - Google Hesabınız > Güvenlik > 2 Adımlı Doğrulama

2. **App Password Oluşturun:**
   - https://myaccount.google.com/apppasswords
   - "Uygulama" seçin: **E-posta**
   - "Cihaz" seçin: **Diğer (Özel ad)**
   - Oluşturulan 16 karakterlik şifreyi kopyalayın

3. **.env Dosyasını Güncelleyin:**
   ```env
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your-email@gmail.com
   SMTP_PASS=xxxx xxxx xxxx xxxx  # App Password (boşlukları kaldırın)
   MAIL_FROM="your-email@gmail.com"
   SMTP_SECURE=false
   ```

#### Alternatif: Mailhog (Local Testing)

Eğer gerçek mail göndermek istemiyorsanız, Mailhog kullanabilirsiniz:

1. **Mailhog Kurulumu:**
   ```bash
   # macOS
   brew install mailhog
   
   # Windows
   choco install mailhog
   
   # Linux
   go get github.com/mailhog/MailHog
   ```

2. **Mailhog'u Başlatın:**
   ```bash
   mailhog
   ```

3. **.env Dosyasını Güncelleyin:**
   ```env
   SMTP_HOST=localhost
   SMTP_PORT=1025
   SMTP_USER=
   SMTP_PASS=
   MAIL_FROM="noreply@tarodan.com"
   ```

4. **Mailhog Web UI:** http://localhost:8025

#### Alternatif: SendGrid (Production)

Production ortamı için SendGrid kullanabilirsiniz:

1. **SendGrid Hesabı Oluşturun:**
   - https://sendgrid.com/ adresinden kayıt olun
   - API Key oluşturun

2. **.env Dosyasını Güncelleyin:**
   ```env
   SMTP_HOST=smtp.sendgrid.net
   SMTP_PORT=587
   SMTP_USER=apikey
   SMTP_PASS=your-sendgrid-api-key
   MAIL_FROM="noreply@yourdomain.com"
   ```

### 3. Database (PostgreSQL)

Varsayılan olarak Docker Compose ile PostgreSQL çalışır:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/tarodan?schema=public"
```

Eğer kendi PostgreSQL sunucunuzu kullanıyorsanız, connection string'i güncelleyin.

### 4. Redis

Varsayılan olarak localhost'ta Redis çalışır:

```env
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_URL=redis://localhost:6379
```

### 5. MinIO (Object Storage)

Varsayılan olarak Docker Compose ile MinIO çalışır:

```env
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=tarodan
```

## Güvenlik Notları

⚠️ **ÖNEMLİ:**
- `.env` dosyasını **ASLA** Git'e commit etmeyin
- Production ortamında güçlü secret'lar kullanın
- JWT_SECRET ve JWT_REFRESH_SECRET için `openssl rand -base64 32` komutu ile güçlü secret'lar oluşturun
- Production'da Iyzico için `https://api.iyzipay.com` kullanın (sandbox değil)

## Test Etme

Environment variable'ları ayarladıktan sonra:

1. **API'yi başlatın:**
   ```bash
   pnpm dev
   ```

2. **Test edin:**
   - Ödeme: Bir ürün satın almayı deneyin
   - Email: Sipariş oluşturun ve email'in geldiğini kontrol edin

## Sorun Giderme

### Iyzico "Geçersiz kart" hatası:
- Sandbox credentials'larınızın doğru olduğundan emin olun
- Test kartlarını kullanın (yukarıda listelenen)

### Email gönderilemiyor:
- Gmail App Password'un doğru olduğundan emin olun (boşlukları kaldırın)
- 2 Adımlı Doğrulama'nın aktif olduğundan emin olun
- Mailhog kullanıyorsanız, Mailhog'un çalıştığından emin olun

### Database bağlantı hatası:
- PostgreSQL'in çalıştığından emin olun
- Docker Compose ile başlatın: `docker-compose up -d`

## Yardım

Sorun yaşıyorsanız:
1. Terminal loglarını kontrol edin
2. `.env` dosyasındaki değerlerin doğru olduğundan emin olun
3. Gerekli servislerin (PostgreSQL, Redis, MinIO) çalıştığından emin olun
