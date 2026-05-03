# Tarodan Mobile — Maestro E2E Test Suite

Bu klasör mobil uygulamanın e2e test akışlarını barındırır. [Maestro](https://maestro.mobile.dev) kullanılır — YAML tabanlı, Expo Go ile doğrudan çalışır, dev build gerektirmez.

## Kurulum (tek seferlik)

```bash
# 1. Maestro CLI (Java gerektirir)
curl -fsSL "https://get.maestro.mobile.dev" | bash

# 2. Java (Maestro için gerekli)
brew install openjdk
echo 'export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"' >> ~/.zshrc

# Yeni terminalde doğrula:
maestro --version  # 2.5.x
```

## Ön koşullar (her test koşusu)

1. **Backend** ayakta: `curl http://localhost:3001/api/health` → 200.
2. **DB** seed'li: `pnpm db:seed` (en az bir kez).
3. **iOS Simulator** boot edili (iPhone 17 önerilen).
4. **Expo Go** kurulu sim'de + **Tarodan projesi son açılmış** (Maestro `launchApp` Expo Go'nun cache'inden son projeyi açar).
   - İlk açılış için `cd apps/mobile && pnpm ios` çalıştır, app açılana kadar bekle, sonra Maestro'yu başlat.
5. `PAYMENT_BYPASS=true` `apps/api/.env`'de (B-001 fix bypass yolunu test ettiği için).

## Çalıştırma

```bash
cd apps/mobile/maestro

# Tek flow
maestro test flows/01-smoke.yaml

# Tüm flow'lar (sıralı)
maestro test flows/

# Farklı kullanıcıyla
maestro test --env EMAIL=ahmet@demo.com flows/02-auth-login.yaml

# Studio (interactive recorder/debugger)
maestro studio
```

## Klasör yapısı

```
maestro/
├── config.yaml          # paylaşılan env (kullanıcı, şifre)
├── flows/               # numaralı, bağımsız e2e senaryolar
│   ├── 01-smoke.yaml              # ✅ Tarodan açılır, home content
│   ├── 02-auth-login.yaml         # ✅ Profil tab + login/logout idempotent
│   ├── 03-search.yaml             # ✅ Ara tab listesi yüklenir
│   ├── 04-checkout-bypass.yaml    # 🔶 PLACEHOLDER — testID eklenince aktive
│   └── 05-ilanlarim-diagnostic.yaml # ✅ İlanlarım ekranı açılır + boş hata yok
└── subflows/            # paylaşılan parça akışlar
    ├── open-tarodan.yaml      # Expo Go → Tarodan launch
    ├── login.yaml             # Profil → Giriş Yap formu
    └── logout.yaml            # Profil → Çıkış Yap
```

## Selector stratejisi (önemli)

Expo Router + React Native Paper UI'ı Maestro'nun text dump'ına `text` alanı olarak değil **`accessibilityText`** olarak çıkıyor. Maestro `tapOn: "..."` accessibility text'inde substring/regex araması yapar. Bu yüzden:

- ✅ İyi: `tapOn: text: "Profil"` (tab bar her ekrana `tabBarAccessibilityLabel` ile temiz string'i alır — bkz. [(tabs)/_layout.tsx](../app/(tabs)/_layout.tsx))
- ✅ İyi: `assertVisible: text: ".*sonuç bulundu.*"`
- ❌ Çalışmaz: `tapOn: "Profil"` (anchor'sız aramada multi-part label'a takılabilir)

Daha sağlam flow'lar için `testID` prop'larını kritik UI öğelerine eklemek (ürün kartı, "Hemen Al" buton, checkout adımları) ve Maestro'da `id:` selector'ı kullanmak en doğrusu — `04-checkout-bypass.yaml`'ı aktifleştirmek için bu yapılmalı.

## Yeni flow yazarken

- Her flow `appId: host.exp.Exponent` ile başlar (Expo Go).
- `launchApp:` `clearState: false` — Expo Go state'ini koru, yoksa proje cache'i silinir.
- `extendedWaitUntil` ile bekle, `assertVisible` ile doğrula.
- TestID henüz uygulamada yaygın değil — şimdilik **görünür metne** göre seçici yaz (`tapOn: "Profil"`).
- Her flow tek başına çalışabilir olmalı (state varsayma).

## Bilinen sınırlamalar

- **Expo Go cache'i**: Sim'de Expo Go en son Tarodan'ı açmış olmalı, yoksa `launchApp` boş Expo Go açar. Çözüm: testlerden önce manuel olarak `pnpm ios` ile bir kez yükle.
- **Push notification testleri**: Expo Go'da push çalışmaz — Maestro ile de test edilemez.
- **PayTR iframe (sandbox kart)**: WebView içine Maestro tıklayamaz; PayTR yolu için ayrı strateji (manual veya MockServer) gerekecek.
- **Java warning** (`restricted method in java.lang.System`): Maestro 2.5 + JDK 25 cosmetic uyarısı, görmezden gel.

## CI entegrasyonu

İki ayrı katmanda otomatik koruma vardır:

### 1. API e2e (her PR'da otomatik) ✅

`.github/workflows/ci.yml`'in `e2e-test` job'u Jest ile **tüm `*.e2e-spec.ts`** dosyalarını koşar — `payment-bypass.e2e-spec.ts` (B-001 regression) dahil. PR açılınca veya `development` branch'ine push edilince **otomatik tetiklenir**, ekstra ayar gerekmez.

Yerel doğrulama:
```bash
cd apps/api
pnpm test:e2e --testPathPattern=payment-bypass
```

### 2. Maestro UI Cloud (opsiyonel — secret bekliyor)

`.github/workflows/maestro-cloud.yml` hazır ama `MAESTRO_CLOUD_API_KEY` secret'ı eklenmediği sürece no-op olarak biter (notice mesajı bırakır).

**Ayrıntılı kurulum talimatı:** [CLOUD_SETUP.md](CLOUD_SETUP.md).

Şimdiye kadar: **API katmanı CI'da koşuyor; UI testleri yerelden manuel koşuluyor.** Bu pratik ayrım: para hareketleri ve veri kontratları otomatik korunuyor, UI smoke'ları sürüm öncesi spot kontrol için yerelde.
