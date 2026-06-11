# Mobil Test Stratejisi

Maestro journey otomasyonu sırasında görüldü ki E2E (Maestro) tek başına yavaş ve kırılgan. Bu belge, **hangi senaryonun hangi katmanda** test edileceğini tanımlar ve mobil testi hızlandırmak için bir geçiş planı verir.

## Mevcut durum (2026-06-09)

- **Mobil birim/komponent testi: 0** — `jest` + `jest-expo` kurulu ama hiç test yok. Tüm mobil doğrulama manuel + Maestro E2E ile yapılıyor.
- **API e2e: güçlü** — `apps/api/test/e2e/*` (money-flow, refresh-token, rating, concurrency, stock-cascade, edge-cases…) + factories/mocks/test-utils. Backend iş mantığı iyi kapsanıyor.
- **Maestro E2E: 1 journey çalışıyor** (Yolculuk 1). Gerçek app → gerçek API → gerçek Postgres + driver DB manipülasyonu. Yavaş (dk), kırılgan.

## Neden Maestro yavaş/kırılgan (kanıt)

Bu sabah Maestro'da harcanan eforun tamamı **UI davranışını tüm katmanlardan** test etmekten kaynaklandı:
- RN Modal accessibility opaklığı (testID/placeholder görünmüyor, koordinat gerekiyor)
- Numeric klavyede `hideKeyboard` çalışmıyor
- Stale auth token (yanlış kullanıcı), keychain clearState'i atlatıyor
- Dev-client launcher + Expo dev menü intro overlay'leri
- Snackbar'ların geçici olması, accessibility tam-eşleşme

**Bunların hiçbiri ürün hatası değil** — E2E'nin doğasından gelen sürtünme. Aynı davranışlar komponent testinde saniyenin altında, deterministik test edilir.

## Katmanlar ve kullanım

| Katman | Araç | Hız | Backend | Simülatör | Ne test eder |
|---|---|---|---|---|---|
| **A. Komponent/ekran** | Jest + **RNTL** (eklenecek) | ~10-100ms | ❌ mock | ❌ | Render, form validasyon, buton enable/disable, hata mesajı, modal mantığı, koşullu UI, navigasyon çağrısı |
| **B. Birim** | Jest | ~1-10ms | ❌ | ❌ | zod şemaları, zustand store'lar (authStore), saf fonksiyonlar (fiyat/komisyon hesap), util'ler |
| **C. API e2e** | Jest (NestJS) | ~sn | ✅ test DB | ❌ | İş mantığı + veri kontratı: sipariş/teklif yaşam döngüsü, para akışı, hold/payout, izinler |
| **D. E2E smoke** | Maestro | ~dk | ✅ + DB | ✅ | Sadece "kablolama doğru mu": kritik birkaç uçtan uca journey |

## Karar kuralı (bir senaryo gelince)

1. **Saf mantık mı?** (validasyon, hesap, store) → **B (birim)**.
2. **Tek ekran/komponentin davranışı mı?** (form, modal, koşullu buton, hata gösterimi) → **A (RNTL)**. *Çoğu senaryo buraya gider.*
3. **Backend iş kuralı / çok-adımlı veri akışı mı?** (teklif→sipariş, ödeme→hold→payout, eşzamanlılık) → **C (API e2e)**.
4. **Gerçek cihazda uçtan uca kablolama kanıtı mı gerekiyor?** → **D (Maestro smoke)** — ama yalnızca 2-3 kritik journey.

## Worked examples — bu oturumun senaryoları doğru katmana

| Senaryo (journey) | Doğru katman | Neden |
|---|---|---|
| Kayıtlı email ile kayıt → "zaten kayıtlı" mesajı (Yolc. başı) | **A (RNTL)** | register formuna hata prop'u verip mesaj render'ını assert et |
| Teklif tutarı %50 altı → validasyon hatası (Yolc. 3/4) | **A (RNTL)** | MakeOfferModal'a değer ver, "Teklif Gönder" disabled + Alert |
| Şifre eşleşmiyor, doğum tarihi 18 altı (Yolc. 1 kayıt) | **A (RNTL)** | zod resolver + form; klavye/"u"/maske sorunu YOK |
| 2FA toggle gerçek durumu yansıtmıyor (oturum başı bug) | **A (RNTL)** | getTwoFactorStatus mock'la, toggle state assert |
| Teklif kabul → pending_payment sipariş oluşur | **C (API e2e)** | offer.service + order; UI'sız |
| Ödeme → fatura + hold + payout (Yolc. 1 adım 6-10) | **C (API e2e)** | money-flow.e2e zaten var; genişlet |
| Teklif süresi dolumu / red (Yolc. 4 adım 3,6) | **C (API e2e)** | offer status geçişi; UI'sız |
| Misafir gez → kayıt → satın al → tamamlandı | **D (Maestro)** | uçtan uca kablolama — Yolculuk 1 (zaten çalışıyor) |

> Not: Yolculuk 2/3/4'ün **bizi zorlayan kısımları** (ilan formu, IBAN, teklif modalı, ödeme entry) ya ürün boşluğu ([[mobile-coverage-gaps]] / `mobile-gaps-from-journey-automation.md`) ya da A katmanında çok daha ucuz test edilecek şeylerdi.

## Hedef dağılım

- **A (RNTL): ~%60** — ekran/komponent davranışı. En büyük yatırım buraya.
- **B (birim): ~%20** — store/şema/util.
- **C (API e2e): mevcut + genişlet** — backend kuralları.
- **D (Maestro): ~3-5 smoke journey** — Yolculuk 1 + en kritik 2-4 akış. Detay davranışı buradan ÇIKAR.

## Geçiş planı (fazlar)

**Faz 0 — Kurulum (yarım gün)**
- `@testing-library/react-native` + `@testing-library/jest-native` ekle.
- `jest.config.js` (preset: `jest-expo`) + `jest.setup.ts` (RNTL matchers, AsyncStorage/SecureStore mock, axios/api mock helper).
- `package.json`: `test`, `test:watch`, `test:cov` (jest zaten var; watch ekle).
- Örnek 1 test (MakeOfferModal veya register) ile yeşil koşum kanıtı.

**Faz 1 — Yüksek değerli komponent testleri (RNTL)**
- Auth: register validasyon, login hata banner, 2FA durum/disable.
- Teklif: MakeOfferModal validasyon + submit (mock).
- Checkout: 3-adım buton akışı, adres seçimi, "Onayla ve Öde" enable.
- Liste/kart: search-result-card render + onPress (navigasyon çağrısı).

**Faz 2 — Birim testleri**
- authStore (loadToken, login, MAESTRO guard'ları), zod şemaları, fiyat/komisyon util'leri.

**Faz 3 — API e2e genişletme**
- Teklif yaşam döngüsü (expire/reject/counter→accept→order), payout doğrulama.

**Faz 4 — Maestro'yu sadeleştir**
- Yalnız smoke journey'ler kalsın; detay senaryolar A/C'ye taşınınca Maestro flow'ları arşivle/etiketle.

## Mock stratejisi

- **API**: `apps/mobile/src/services/api.ts` axios instance'ını jest ile mock'la (veya MSW). Komponent testleri ağ yapmaz; deterministik fixture döner.
- **Native**: SecureStore, AsyncStorage, expo-image-picker, datetimepicker → jest setup'ta mock.
- **Navigasyon**: `expo-router`'ın `router.push` vb. mock'lanıp "çağrıldı mı" assert edilir (gerçek geçiş gerekmez).

## Özet

Manuel + Maestro tek başına = piramidin tepesi, en yavaş yer. **RNTL komponent katmanını kurmak** en büyük hız kazancı; Maestro'yu birkaç smoke'a indir, backend kurallarını mevcut güçlü API e2e'ye bırak.
