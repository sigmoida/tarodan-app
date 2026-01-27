# 🚀 Tarodan Deployment Rehberi

Bu dokümantasyon, Tarodan projesini production ortamına deploy etmek için en uygun platformları ve adımları içerir.

## 📋 Proje Gereksinimleri

- **Frontend**: Next.js 14 (apps/web, apps/admin)
- **Backend**: NestJS 10 (apps/api)
- **Database**: PostgreSQL 16
- **Cache/Queue**: Redis 7
- **Search**: Elasticsearch 8.12
- **Storage**: MinIO (S3 compatible)
- **Monorepo**: pnpm workspace + Turbo
- **Node.js**: 20 LTS
- **Docker**: Mevcut Dockerfile'lar

---

## 🎯 Önerilen Deployment Platformları

### 1. **Railway** ⭐ (ÖNERİLEN - En Kolay)

**Avantajlar:**
- ✅ Monorepo desteği
- ✅ PostgreSQL, Redis managed servisleri
- ✅ Otomatik deployment (Git push ile)
- ✅ Environment variables yönetimi
- ✅ Log görüntüleme
- ✅ Ücretsiz tier ($5 kredi/ay)
- ✅ Kolay scaling

**Dezavantajlar:**
- ⚠️ Elasticsearch için ayrı servis gerekir (Upstash Search veya Elastic Cloud)
- ⚠️ MinIO için ayrı servis gerekir (veya S3 kullan)

**Fiyatlandırma:**
- Starter: $5/ay (kredi)
- Developer: $20/ay
- Pro: $100/ay

**Kurulum Adımları:**
```bash
# 1. Railway CLI kurulumu
npm i -g @railway/cli

# 2. Railway'e giriş
railway login

# 3. Proje oluştur
railway init

# 4. PostgreSQL ekle
railway add postgresql

# 5. Redis ekle
railway add redis

# 6. Environment variables ayarla
railway variables set DATABASE_URL=${{Postgres.DATABASE_URL}}
railway variables set REDIS_URL=${{Redis.REDIS_URL}}
railway variables set NODE_ENV=production

# 7. Root directory ayarla (Monorepo için önemli!)
# Railway Dashboard'da Settings > Source > Root Directory: apps/api

# 8. Build Command ayarla
# Railway Dashboard'da Settings > Build:
# Build Command: pnpm install --frozen-lockfile && pnpm prisma generate && pnpm build

# 9. Start Command ayarla
# Start Command: pnpm railway:deploy
# (Bu komut önce migration'ları çalıştırır, sonra uygulamayı başlatır)

# 10. Deploy
railway up
```

**⚠️ ÖNEMLİ: Prisma için Monorepo Ayarları**

Railway'de monorepo yapısında Prisma çalışması için:

1. **Root Directory**: Railway Dashboard'da `Settings > Source > Root Directory` → `apps/api` olarak ayarlayın

2. **Build Command**:
```bash
pnpm install --frozen-lockfile && pnpm prisma generate && pnpm build
```

3. **Start Command**:
```bash
pnpm railway:deploy
```
Bu komut önce `prisma migrate deploy` çalıştırır, sonra uygulamayı başlatır.

4. **Environment Variables**:
- `DATABASE_URL` → PostgreSQL connection string (Railway otomatik ekler)
- `REDIS_URL` → Redis connection string (Railway otomatik ekler)
- `NODE_ENV=production`

**Railway Config (railway.json - Root dizinde):**
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "cd apps/api && pnpm install --frozen-lockfile && pnpm prisma generate && pnpm build"
  },
  "deploy": {
    "startCommand": "cd apps/api && pnpm railway:deploy",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

**Alternatif: Railway Dashboard'dan Ayarlama**

Eğer `railway.json` çalışmazsa, Railway Dashboard'dan manuel ayarlayın:

1. **Settings > Source**:
   - Root Directory: `apps/api`

2. **Settings > Build**:
   - Build Command: `pnpm install --frozen-lockfile && pnpm prisma generate && pnpm build`

3. **Settings > Deploy**:
   - Start Command: `pnpm railway:deploy`

**Prisma Migration Sorunları İçin:**

Eğer migration'lar çalışmıyorsa, Railway'de bir "Deploy Hook" ekleyin:

1. Railway Dashboard → Your Service → Settings → Deploy Hooks
2. Add Deploy Hook:
   - Command: `cd apps/api && pnpm prisma migrate deploy`
   - Run: After Deploy

---

### 2. **Render** ⭐ (ÖNERİLEN - İyi Dokümantasyon)

**Avantajlar:**
- ✅ PostgreSQL, Redis managed servisleri
- ✅ Docker desteği
- ✅ Auto-deploy (Git push ile)
- ✅ SSL sertifikaları otomatik
- ✅ Ücretsiz tier (sınırlı)
- ✅ İyi dokümantasyon

**Dezavantajlar:**
- ⚠️ Monorepo için özel config gerekir
- ⚠️ Elasticsearch için ayrı servis gerekir
- ⚠️ Ücretsiz tier'da sleep mode var

**Fiyatlandırma:**
- Free: $0 (sleep mode)
- Starter: $7/service/ay
- Standard: $25/service/ay

**Kurulum:**
1. Render Dashboard'a git
2. "New Web Service" oluştur
3. GitHub repo'yu bağla
4. Build Command: `cd apps/api && pnpm install && pnpm build`
5. Start Command: `cd apps/api && pnpm start:prod`
6. PostgreSQL ve Redis servisleri ekle

---

### 3. **Fly.io** ⭐ (ÖNERİLEN - Global Deployment)

**Avantajlar:**
- ✅ Global edge deployment
- ✅ Docker desteği mükemmel
- ✅ PostgreSQL, Redis managed
- ✅ Ücretsiz tier (3 shared-cpu-1x VMs)
- ✅ Hızlı deployment
- ✅ Multi-region desteği

**Dezavantajlar:**
- ⚠️ Elasticsearch için ayrı servis gerekir
- ⚠️ Monorepo için özel config

**Fiyatlandırma:**
- Free: 3 shared-cpu-1x VMs
- Paid: $1.94/VM/ay (shared-cpu-1x)

**Kurulum:**
```bash
# 1. Fly CLI kurulumu
curl -L https://fly.io/install.sh | sh

# 2. Giriş yap
fly auth login

# 3. API için app oluştur
cd apps/api
fly launch --name tarodan-api

# 4. PostgreSQL ekle
fly postgres create --name tarodan-db

# 5. Redis ekle
fly redis create --name tarodan-redis

# 6. Web için app oluştur
cd ../web
fly launch --name tarodan-web
```

**fly.toml Örneği (apps/api):**
```toml
app = "tarodan-api"
primary_region = "iad"

[build]
  dockerfile = "Dockerfile"

[env]
  NODE_ENV = "production"
  PORT = "3001"

[[services]]
  internal_port = 3001
  protocol = "tcp"
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 0

[[services.ports]]
  handlers = ["http"]
  port = 80

[[services.ports]]
  handlers = ["tls", "http"]
  port = 443
```

---

### 4. **DigitalOcean App Platform**

**Avantajlar:**
- ✅ PostgreSQL, Redis managed
- ✅ Docker desteği
- ✅ Auto-deploy
- ✅ İyi performans
- ✅ Türkiye'ye yakın datacenter (Frankfurt)

**Dezavantajlar:**
- ⚠️ Elasticsearch için ayrı servis gerekir
- ⚠️ Monorepo için özel config

**Fiyatlandırma:**
- Basic: $5/ay (512MB RAM)
- Professional: $12/ay (1GB RAM)

---

### 5. **AWS (ECS/EKS + RDS)**

**Avantajlar:**
- ✅ Tüm servisler mevcut (RDS, ElastiCache, OpenSearch, S3)
- ✅ Yüksek ölçeklenebilirlik
- ✅ Enterprise-grade

**Dezavantajlar:**
- ⚠️ Kompleks setup
- ⚠️ Yüksek maliyet
- ⚠️ DevOps bilgisi gerekir

---

### 6. **Coolify (Self-Hosted)** ⭐ (Dokümantasyonda Bahsedilen)

**Avantajlar:**
- ✅ Tam kontrol
- ✅ Ücretsiz (sadece server maliyeti)
- ✅ Tüm servisleri kendi sunucunuzda çalıştırabilirsiniz
- ✅ Docker Compose desteği

**Dezavantajlar:**
- ⚠️ Kendi sunucunuzu yönetmeniz gerekir
- ⚠️ Backup, monitoring sizin sorumluluğunuzda

**Kurulum:**
```bash
# Coolify kurulumu
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash

# Sonra Coolify web UI'dan projeyi deploy edin
```

---

## 🏆 Öneri: Railway veya Fly.io

**Küçük/Orta Ölçekli Projeler için:** Railway
- En kolay kurulum
- İyi dokümantasyon
- Hızlı başlangıç

**Global/Ölçeklenebilir Projeler için:** Fly.io
- Edge deployment
- İyi performans
- Multi-region

---

## 📝 Deployment Checklist

### Her Platform İçin Ortak Adımlar:

- [ ] Environment variables ayarla
- [ ] Database migration çalıştır (`pnpm db:migrate`)
- [ ] Prisma client generate et
- [ ] Build test et (`pnpm build`)
- [ ] Health check endpoint'leri test et
- [ ] SSL sertifikaları ayarla
- [ ] Domain name yapılandır
- [ ] Monitoring/logging kur
- [ ] Backup stratejisi oluştur

### Environment Variables:

```bash
# Database
DATABASE_URL=postgresql://...

# Redis
REDIS_URL=redis://...

# JWT
JWT_SECRET=...
JWT_REFRESH_SECRET=...

# MinIO/S3
MINIO_ENDPOINT=...
MINIO_ACCESS_KEY=...
MINIO_SECRET_KEY=...

# Elasticsearch
ELASTICSEARCH_NODE=...

# Email
SMTP_HOST=...
SMTP_PORT=...
SMTP_USER=...
SMTP_PASS=...

# Payment
PAYTR_MERCHANT_ID=...
PAYTR_MERCHANT_KEY=...
PAYTR_MERCHANT_SALT=...

# Sentry (opsiyonel)
SENTRY_DSN=...
```

---

## 🔧 Monorepo Deployment Stratejisi

### Seçenek 1: Ayrı Servisler (Önerilen)
- `apps/api` → API servisi
- `apps/web` → Web servisi
- `apps/admin` → Admin servisi

### Seçenek 2: Tek Servis (Docker Compose)
- Tüm servisleri tek bir compose file'da çalıştır
- Production için `docker-compose.prod.yml` kullan

---

## 📚 Ek Kaynaklar

- [Railway Docs](https://docs.railway.app/)
- [Render Docs](https://render.com/docs)
- [Fly.io Docs](https://fly.io/docs/)
- [Coolify Docs](https://coolify.io/docs)

---

## ❓ Sorular?

Deployment sırasında sorun yaşarsanız:
1. Platform dokümantasyonunu kontrol edin
2. Log dosyalarını inceleyin
3. Environment variables'ları doğrulayın
4. Build process'i lokal olarak test edin
