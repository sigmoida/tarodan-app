# 🔧 Railway Prisma Sorun Giderme Rehberi

Railway'de monorepo yapısında Prisma ile ilgili yaşanan sorunlar ve çözümleri.

## ❌ Yaygın Sorunlar

### 1. "Prisma Client not found" Hatası

**Hata:**
```
Error: Cannot find module '@prisma/client'
```

**Çözüm:**
- Build command'da `prisma generate` çalıştığından emin olun
- Root directory `apps/api` olarak ayarlanmış olmalı

### 2. "Schema not found" Hatası

**Hata:**
```
Error: Can't find schema.prisma
```

**Çözüm:**
- Root directory'in `apps/api` olduğundan emin olun
- Railway Dashboard → Settings → Source → Root Directory: `apps/api`

### 3. Migration'lar Çalışmıyor

**Hata:**
```
Error: Migration failed
```

**Çözüm:**
- Start command'da `pnpm railway:deploy` kullanın
- Bu komut önce migration'ları çalıştırır, sonra uygulamayı başlatır

## ✅ Doğru Yapılandırma

### Railway Dashboard Ayarları

1. **Settings > Source**:
   ```
   Root Directory: apps/api
   ```

2. **Settings > Build**:
   ```
   Build Command: pnpm install --frozen-lockfile && pnpm prisma generate && pnpm build
   ```

3. **Settings > Deploy**:
   ```
   Start Command: pnpm railway:deploy
   ```

### Environment Variables

Railway otomatik olarak şunları ekler:
- `DATABASE_URL` (PostgreSQL için)
- `REDIS_URL` (Redis için)

Manuel eklemeniz gerekenler:
- `NODE_ENV=production`
- Diğer tüm environment variables (.env dosyasından)

## 🔍 Debug Adımları

1. **Build Logs Kontrol:**
   - Railway Dashboard → Deployments → Son deployment → Build Logs
   - `prisma generate` komutunun çalıştığını kontrol edin

2. **Runtime Logs Kontrol:**
   - Railway Dashboard → Deployments → Son deployment → Runtime Logs
   - Migration hatalarını kontrol edin

3. **Database Connection Test:**
   ```bash
   # Railway CLI ile
   railway run pnpm prisma studio
   ```

## 📝 Checklist

- [ ] Root Directory: `apps/api` olarak ayarlandı
- [ ] Build Command'da `prisma generate` var
- [ ] Start Command: `pnpm railway:deploy`
- [ ] `DATABASE_URL` environment variable mevcut
- [ ] `package.json`'da `railway:deploy` script'i var
- [ ] `postbuild` script'inde `prisma generate` var

## 🚀 Hızlı Test

Lokal olarak test etmek için:

```bash
# 1. API dizinine git
cd apps/api

# 2. Dependencies yükle
pnpm install --frozen-lockfile

# 3. Prisma generate
pnpm prisma generate

# 4. Build
pnpm build

# 5. Migration test (DATABASE_URL gerekli)
pnpm prisma migrate deploy

# 6. Start
pnpm start:prod
```

Eğer lokal olarak çalışıyorsa, Railway'de de çalışmalı (ayarlar doğruysa).
