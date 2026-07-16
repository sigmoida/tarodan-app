# Tarodan Mobile — TestFlight / EAS secret setup

Bu dosya, Apple Developer hesabı + EAS hesabı oluşturulduktan sonra
adım-adım ne yapılacağını gösterir. Sıralı yürütülmeli.

## 0) Tek seferlik insan adımları

- [ ] Apple Developer Program üyeliği ($99/yıl) — müşteri/şirket hesabı.
- [ ] App Store Connect → My Apps → New App
  - Bundle ID: `com.tarodan.app`
  - Primary Language: Turkish
  - SKU: `tarodan-ios-001` (örnek)
  - Apple ID, ASC App ID, Apple Team ID notlanır.
- [ ] Expo hesabı (https://expo.dev). Şirket ortak hesabı önerilir.
- [ ] Production API'nin public bir URL'de çalışıyor olması (Railway / Render).
      Şu an `apps/api/.env` lokale bağlı. TestFlight build'i URL setlenmeden
      derlenmemeli.

## 1) EAS projesini bağla

```bash
cd apps/mobile
pnpm dlx eas-cli login
pnpm dlx eas-cli init --id-method new
```

`init` sonrası `app.json` içindeki `extra.eas.projectId` otomatik dolar
(`REPLACE_WITH_EAS_PROJECT_ID` yerine gerçek UUID gelir). Commit'le.

## 2) `eas.json` placeholder'larını doldur

`apps/mobile/eas.json` → `submit.production.ios`:

- `appleId` → App Store Connect'e login olduğun e-mail
- `ascAppId` → ASC'de yeni uygulamanın "Apple ID" sayısal ID'si
- `appleTeamId` → Apple Developer membership Team ID'si

## 3) EAS secret'ları (production env)

Bu değerler EAS sunucusunda saklanır, lokal repo'ya hiçbir zaman düşmez.

```bash
# Public (bundle'a dahil edilebilir, EXPO_PUBLIC_ prefix'i şart)
eas env:create --environment production --name EXPO_PUBLIC_API_URL --value "https://api.tarodan.com/api" --visibility plaintext
eas env:create --environment production --name EXPO_PUBLIC_SENTRY_DSN --value "<sentry-dsn>" --visibility plaintext

# Preview (TestFlight'tan ayrı bir staging dağıtımı tutarsanız)
eas env:create --environment preview --name EXPO_PUBLIC_API_URL --value "https://staging-api.tarodan.com/api" --visibility plaintext
```

`eas.json` `production.env` bloğunda `EXPO_PUBLIC_ENVIRONMENT=production`
zaten setli; üstüne yazmıyoruz.

## 4) GitHub Actions secret'ları

`gh secret set` ya da Settings → Secrets and variables → Actions:

- `EXPO_TOKEN` — `https://expo.dev/accounts/<org>/settings/access-tokens` üzerinden
  oluşturulan access token. **Tüm** EAS workflow'ları (build/submit/update) buna
  bağlı — set edilene kadar hepsi guard'lı no-op.
- (opsiyonel) `EAS_BUILD_PROFILE_OVERRIDE` — manuel workflow_dispatch için.

Hem **Apple** (App Store Connect API key) hem **Google Play** (service account
JSON) submit credential'ları **EAS sunucusunda** tutulur (`eas credentials`),
GitHub'a veya repo'ya koymuyoruz. Bu yüzden `eas.json` `submit.production.android`
sadece `track` taşır — `serviceAccountKeyPath` YOK (eski `./google-services.json`
değeri yanlıştı: o dosya Firebase config'i, Play service account'ı değil).

Tam release akışı (staging OTA/preview + production tag) ve secrets tablosu:
[`docs/RELEASE.md`](./docs/RELEASE.md).

## 5) İlk manuel build (workflow'dan önce sanity check)

```bash
cd apps/mobile
eas build --platform ios --profile production
# 15-25 dk → .ipa hazır
eas submit --platform ios --latest
# 5-10 dk processing → ASC'de TestFlight altında "Ready to Test"
```

App Store Connect → TestFlight → Internal Testing group → müşterinin
Apple ID'sini ekle → davet maili gider.

## 6) Otomatik pipeline (release branch ile)

`.github/workflows/mobile-testflight.yml` aşağıdaki tetikleyicileri kabul eder:

- `release/mobile-*` branch'ine push
- `workflow_dispatch` (manuel, profile seçimi ile)

Workflow tek adımda build + submit yapar. Build tamamlanınca EAS,
ASC'ye yükler.

## 7) TestFlight'ta external public link (opsiyonel)

ASC → TestFlight → External Testing → "Add Group" → "Enable Public Link"
→ tek bir URL çıkar, kayıtsız kişi de yükleyebilir (max 10k kişi).
İlk build'de Apple Beta App Review (~24 saat).

## Doğrulama checklist'i

- [ ] `app.json` `ITSAppUsesNonExemptEncryption: false` set
- [ ] `app.json` `extra.eas.projectId` gerçek UUID
- [ ] `eas.json` `submit.production.ios` placeholder'ları gerçek
- [ ] `EXPO_TOKEN` GitHub repo secret'ı set (workflow'ları aktive eder)
- [ ] App Store Connect API key EAS'e yüklü (`eas credentials`, iOS submit)
- [ ] Google Play service account JSON EAS'e yüklü (`eas credentials`, Android submit)
- [ ] `EXPO_PUBLIC_API_URL` EAS secret'ı set (preview→staging, production→prod)
- [ ] Production API public URL'de erişilebilir (curl ile)
- [ ] App icon 1024×1024 alpha kanalsız (icon.png)
- [ ] Privacy Policy URL ASC'de doldurulu (zorunlu, app.tarodan.com/privacy gibi)
- [ ] Release akışı okundu: [`docs/RELEASE.md`](./docs/RELEASE.md)
