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

## Tag stratejisi

Her flow YAML başında `tags:` bloğu ile bir öncelik kategorisine atanır:

| Tag | Ne zaman koşar | İçerdiği | Toplam koşum |
|-----|---------------|----------|-------------|
| `smoke` | Her PR (Maestro Cloud workflow) | 01-smoke, 01-01-login-happy, 03-search, 05-ilanlarim-diagnostic, D-01 | ~2 dk 30 sn |
| `regression` | Nightly + release öncesi | 01-02, 01-03, 01-12, 02-auth-login, D-02, D-03, D-04, D-05, E-03, E-07 | ~6 dk |
| `manual` | Yerel + fixture'a bağlı (CI'da koşulmaz) | E-01, E-02, E-04, E-05, E-06, E-08 | — |
| `placeholder` | Deprecated (D-01 ile kapatıldı) | 04-checkout-bypass | — |

### Yeni E-XX flow'ları (kapsam genişletme)

| Flow | Senaryo | Ön koşul / fixture |
|------|---------|--------------------|
| E-01 | Stockout dedicated page (deep link) | `STOCKOUT_PRODUCT_ID` env (gerçek satılmış ürün UUID'si) |
| E-02 | Iade talep akışı (modal → Hasarlı geldi → submit) | Zeynep'in `payment.status=completed` siparişi olmalı |
| E-03 | Tekliflerim listesi açılır | `pnpm db:seed` (default seed) |
| E-04 | `shipping_to_warehouse` takasında otomatik kargo kartı | Zeynep'te bu durumda aktif takas seed'li olmalı |
| E-05 | Üyelik Yönet ekranı (Otomatik Yenileme + İptal) | `PREMIUM_EMAIL` (ahmet@demo.com) aktif premium aboneliği |
| E-06 | Cash takas `awaiting_payment` → "Ödeme Yap" CTA | Zeynep'te `cashPayerId === user`, status `awaiting_payment` takas |
| E-07 | Bildirimler tab smoke | `pnpm db:seed` |
| E-08 | Push deep-link routing simülasyonu (`tarodan://products/unavailable/{id}`) | `STOCKOUT_PRODUCT_ID` env |

**Not (manual tag):** E-01, E-02, E-04, E-05, E-06, E-08 backend fixture'ına bağımlıdır. CI Maestro Cloud workflow `--include-tags smoke` veya `regression` koşar; `manual` tag'li flow'lar yerelde elle koşulur.

### Yeni F-XX flow'ları (comprehensive multi-step regression)

01-XX/D-XX/E-XX smoke seti ekran açılır kontrolleri yapar; F-XX seti **5–15 adımlık gerçek user journey**'ler ile state geçişlerini, recovery yollarını ve happy/error path'leri birlikte kapsar.

| Flow | Senaryo | Tag | Önkoşul / Seed user |
|------|---------|-----|---------------------|
| F-01 | Register form → verify-email gate | `manual` | timestamp-bazlı `REG_EMAIL` env (her run override) |
| F-02 | Yanlış şifre → recover with right (form reload yok) | `regression` | zeynep |
| F-03 | Forgot password → success notice | `regression` | zeynep |
| F-04 | Logout superset (input cleared, no toast error) | `regression` | zeynep |
| F-05 | Tab navigation (Ana Sayfa/Ara/Mesajlar/Profil) | `smoke` | zeynep |
| F-06 | Search → product detail → back nav | `smoke` | zeynep |
| F-07 | Category drill-down (3-deep) | `regression` | zeynep |
| F-08 | Favorite toggle (list + detail) | `manual` | zeynep — heart accessibility label kararsız |
| F-09 | Add to cart → cart screen → remove | `regression` | zeynep |
| F-10 | Make offer → Tekliflerim'de görünür | `manual` | **mehmet** (kendi listing değil) |
| F-11 | Bypass checkout end-to-end → order created | `manual` | zeynep + `PAYMENT_BYPASS=true` apps/api/.env + kayıtlı adres |
| F-12 | Stockout deep-link redirect | `manual` | `STOCKOUT_PRODUCT_ID` env |
| F-13 | Address create → edit → delete | `regression` | zeynep |
| F-14 | Initiate trade flow | `manual` | **ali** + tradeAvailable fixture |
| F-15 | Trade detail status display | `manual` | zeynep — aktif takas fixture |
| F-16 | Language toggle (TR ↔ EN) | `regression` | zeynep |
| F-17 | Notification prefs persistence | `regression` | zeynep |
| F-18 | Empty cart checkout blocked | `smoke` | zeynep |
| F-19 | Offer modal validation + recovery | `manual` | mehmet |

**CI eligible (smoke + regression):** F-02, F-03, F-04, F-05, F-06, F-07, F-09, F-13, F-16, F-17, F-18 (= 11 flow). Manual: F-01, F-08, F-10, F-11, F-12, F-14, F-15, F-19 (= 8 flow, fixture/seed user'a veya `PAYMENT_BYPASS` env'e bağımlı).

**`PAYMENT_BYPASS=true` gereksinimi:** F-11 dev modda bypass üzerinden checkout chain'i bitirir. Olmadan PayTR iframe'i Maestro'nun erişemeyeceği WebView'a düşer.

**Seed user kullanımı:**
- `zeynep@demo.com` (FREE, default) — F-02, F-03, F-04, F-05, F-06, F-07, F-09, F-11, F-12, F-13, F-15, F-16, F-17, F-18
- `mehmet@demo.com` — F-10, F-19 (kendi listing'ine offer yapmayan ikinci kullanıcı)
- `ali@demo.com` (BUSINESS) — F-14 (trade initiator)
- `ahmet@demo.com` (PREMIUM) — kullanılmıyor (E-05'te kullanılır)
- F-01: timestamp-bazlı yeni email; her run override'lı.

Çalıştırma örnekleri:
```bash
maestro test maestro/flows --include-tags smoke         # her PR
maestro test maestro/flows --include-tags regression    # nightly
maestro test maestro/flows                              # hepsi (placeholder dahil)
```

Cloud workflow (`.github/workflows/maestro-cloud.yml`) `include-tags: smoke` kullanır → secret + .app artefact eklenince her PR'da smoke set otomatik koşar.

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
    ├── login-as.yaml          # Profil → Giriş Yap formu (zeynep, hard-coded)
    ├── logout.yaml            # Profil → Çıkış Yap
    ├── open-first-order.yaml  # Profil → Siparişlerim → ilk kart
    └── open-first-trade.yaml  # Profil → Takaslarım → liste
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
