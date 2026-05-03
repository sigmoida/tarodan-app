# Sentry Kurulumu — Üretim Hata İzleme

Sentry, üretim ortamında oluşan crash/exception/yavaşlama vakalarını otomatik yakalar. Bu repo'da **API + Admin + Web** için kod tarafı **zaten yapılandırılmış**, sadece DSN env değişkeni eklenince devreye girer. **Mobile** için ek paket + init kodu gerek (üretim build'inde yapılır, dev Expo Go'da no-op).

## Mevcut durum

| Uygulama | Kod tarafı | Aktivasyon | Devre dışı bırakma davranışı |
|----------|-----------|-----------|----------------------------|
| **API** (`@tarodan/api`) | ✅ `@sentry/node` + `SentryModule` ([apps/api/src/modules/sentry/](apps/api/src/modules/sentry/)) | `SENTRY_DSN` env set edildiğinde | DSN yoksa: log `Sentry DSN not configured, error tracking disabled`, hata vermez |
| **Admin** (`@tarodan/admin`) | ✅ `@sentry/nextjs` + `withSentryConfig` ([apps/admin/next.config.js:148](apps/admin/next.config.js#L148)) | `NEXT_PUBLIC_SENTRY_DSN` env set edildiğinde | Build conditional: DSN yoksa Sentry wrapper hiç uygulanmaz |
| **Web** (`@tarodan/web`) | ✅ `@sentry/nextjs` + `withSentryConfig` ([apps/web/next.config.js:158](apps/web/next.config.js#L158)) | `NEXT_PUBLIC_SENTRY_DSN` env set edildiğinde | Aynı şekilde |
| **Mobile** (`@tarodan/mobile`) | ❌ Paket yok | Üretim build'inde paket eklenir (aşağıda) | Expo Go geliştirici ortamında Sentry hiç çağrılmaz |

## Adım 1 — Sentry projeleri oluştur

[sentry.io](https://sentry.io)'da hesap aç (ücretsiz tier 5K event/ay). 4 ayrı proje oluştur:

- `tarodan-api` (platform: Node.js)
- `tarodan-admin` (platform: Next.js)
- `tarodan-web` (platform: Next.js)
- `tarodan-mobile` (platform: React Native)

Her biri için **DSN** üretilir (`https://...@o123.ingest.sentry.io/456` formatında).

## Adım 2 — Üretim ortamına env ekle

Üretim ortamının yapılandırma sistemine (Railway / Vercel / Docker compose / .env) **DSN'leri ekle**:

```bash
# API (Railway / Docker / vs)
SENTRY_DSN="https://...@o123.ingest.sentry.io/api"
SENTRY_ENVIRONMENT="production"          # opsiyonel ama önerilen

# Admin + Web (Vercel / Next.js host)
NEXT_PUBLIC_SENTRY_DSN="https://...@o123.ingest.sentry.io/admin"
SENTRY_ORG="tarodan"
SENTRY_PROJECT="admin"                    # her uygulama için kendi proje slug'ı
SENTRY_AUTH_TOKEN="..."                   # source map upload için (Sentry > Settings > Auth Tokens)

# Mobile — eklendikten sonra
EXPO_PUBLIC_SENTRY_DSN="https://...@o123.ingest.sentry.io/mobile"
```

**`NEXT_PUBLIC_*`** öneki tarayıcıya servis edilecek client-side bundle'a girmesini sağlar; bu DSN'ler güvenlidir, public yapılması Sentry tarafından beklenen davranış.

## Adım 3 — Mobile için Sentry'yi etkinleştir (üretim build'inden önce)

**Şu an Expo Go'da çalıştığı için bu paket eklenmiyor** (native module yüklenemez). Üretim için EAS dev build veya release build üretirken:

### 3.1 Paketi ekle

```bash
cd apps/mobile
npx expo install @sentry/react-native
```

### 3.2 `app.json`'a plugin ekle

```jsonc
{
  "expo": {
    "plugins": [
      "expo-router",
      "@sentry/react-native/expo"
    ]
  }
}
```

### 3.3 `App.tsx`'e init kodu ekle

`SplashScreen.preventAutoHideAsync()` çağrısının hemen üstüne:

```ts
import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
const isExpoGo = Constants.executionEnvironment === 'storeClient';

if (dsn && !isExpoGo) {
  Sentry.init({
    dsn,
    environment: process.env.EXPO_PUBLIC_ENVIRONMENT ?? 'development',
    tracesSampleRate: 0.1,           // %10 transaction sampling
    enableNative: true,
  });
}
```

DSN yoksa veya Expo Go'da koşuluyorsa `Sentry.init` hiç çağrılmaz — geliştirme ortamı bozulmaz.

### 3.4 Sentry wizard (opsiyonel — source map upload için)

EAS build'in source map'leri Sentry'ye otomatik yüklemesi için:

```bash
npx @sentry/wizard@latest -i reactNative
```

Wizard `metro.config.js` ve EAS hooks'unu yapılandırır.

## Adım 4 — Doğrulama

DSN eklendikten sonra her uygulama için bir **deneme hatası** üret:

```bash
# API: bir endpoint'e bilerek 500 ürettirip Sentry dashboard'a düşmesini gör.
curl -X POST http://your-api/api/_test/error  # (varsa test endpoint'i)

# Admin / Web: tarayıcı konsolundan
Sentry.captureMessage('test from production')

# Mobile: dev menü → "Send test event"
```

Sentry > [proje] > Issues sayfasında 5-30 saniye içinde event görünmeli.

## Adım 5 — Alarm yapılandırması (önerilen)

Sentry > Alerts > New Alert Rule:

| Olay | Eşik | Aksiyon |
|------|------|--------|
| Yeni issue üretildi | her bir | Slack `#alerts` |
| Issue 100+ event aldı | 5 dk içinde | E-posta + Slack |
| Performance > p95 yanıt 5sn'yi geçti | 10 dk | Slack |
| Crash-free user oranı %95'in altına düştü | saatlik | E-posta + PagerDuty |

## Adım 6 — Source map upload doğrulaması

Bir hata fırlatıldığında stack trace'de **bundle minified isimleri yerine orijinal kaynak konumları** görmelisin. Görmüyorsan:
- API: `@sentry/node` source map otomatik (sorun olmaz)
- Admin/Web: `SENTRY_AUTH_TOKEN` env'i build sırasında set olmalı (Vercel > Project > Settings > Environment Variables)
- Mobile: EAS build hooks'u source map'leri yüklüyor olmalı (Adım 3.4'teki wizard yaptıysa otomatik)

## Maliyet planı

- **Free tier**: 5K event/ay, 1 ekip üyesi
- **Team**: $26/ay başlangıç, 50K event
- **Business**: $80/ay, 100K event + advanced features

İlk üretim çıkışında free tier yeter — kullanım büyüdükçe Team plan'a geç.

## Karar matrisi

| Senaryo | Sentry kurulumu öncelik mi? |
|---------|----------------------------|
| Üretime ilk çıkış | ✅ Şart — bug'ları kullanıcı bildiremez, sen göremezsin |
| Sürüm öncesi staging testi | ✅ Şart — production'a tıpatıp aynı koşulda |
| Solo geliştirici, sadece dev | ❌ Free tier bile gereksiz; logları yerelde takip et |
| Ekip 2+ kişi, ortak crash görünürlüğü | ✅ Önerilir |
| Mobile App Store review hazırlığı | ✅ Şart — store reviewer crash'i sana bildirmez |
