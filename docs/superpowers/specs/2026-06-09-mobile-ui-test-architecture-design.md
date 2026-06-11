# Mobil UI Test Mimarisi — Tasarım

**Tarih:** 2026-06-09
**Durum:** Onaylandı (tasarım), implementation plan bekliyor
**Amaç:** 50 yolculuğun **mobil-UI'a özgü** davranışlarını sistematik kapsayacak bir test mimarisi: RNTL (form/render/buton/navigasyon) ana katman + minimal Maestro (wiring). Backend mantığı API e2e'de (ayrı spec), burada yalnız UI.

## Bağlam

- RNTL kuruldu (jest-expo + @testing-library/react-native@13, pnpm-aware transform, SafeArea/icon/SecureStore global mock). 2 örnek test yeşil: [MakeOfferModal.test.tsx](../../apps/mobile/src/components/product/__tests__/MakeOfferModal.test.tsx), [security.test.tsx](../../apps/mobile/app/settings/__tests__/security.test.tsx).
- Mobil: 126 route ekranı, ~15 bileşen, 11 zustand store, tek `services/api.ts` (axios).
- İlgili kararlar: [mobile-test-strategy.md](mobile-test-strategy.md) (piramit), [50-journey-coverage-audit-design.md](2026-06-09-50-journey-coverage-audit-design.md) (matris), [mobile-gaps-from-journey-automation.md](mobile-gaps-from-journey-automation.md) (ürün eksikleri).

## Mimari

### 1. Temel — `apps/mobile/src/test-utils/`
Her ekran testini hızlı/deterministik yazmak için yeniden-kullanılabilir altyapı:

| Dosya | Sorumluluk | Arayüz |
|---|---|---|
| `render.tsx` | Provider sarmalayıcı | `renderWithProviders(ui, { queryClient? })` → RNTL result; içinde `QueryClientProvider` (retry kapalı). SafeArea/icons jest.setup'ta global. |
| `fixtures.ts` | Deterministik veri fabrikaları | `makeProduct/makeOrder/makeOffer/makeUser/makeAddress(overrides?)` |
| `api-mock.ts` | `services/api` mock yardımcısı | `mockApi(overrides)` — her api grubunu (offersApi, ordersApi, authApi…) jest.fn ile kurar, default fixture döner; testte `.mockResolvedValue/.mockRejectedValue` ile override |
| `router-mock.ts` | `expo-router` mock | `pushMock`, `replaceMock`, `backMock` export — navigasyon assert'i (`expect(pushMock).toHaveBeenCalledWith('/checkout')`) |
| `store-mock.ts` | zustand store mock yardımcıları | `mockAuthStore({ isAuthenticated: true })`, `mockCartStore({...})` vb. |
| `index.ts` | Barrel | tek import noktası |

Mock kuralı (jest hoisting): mock fabrikaları factory **içinde** `jest.fn()` tanımlar; test, import edip `as jest.Mock` ile kontrol eder (bkz. security.test.tsx kalıbı). Out-of-scope referans için `mock`-prefiksli değişken.

### 2. Ne test edilir — UI davranış türleri
Yalnız **mobil-UI'a özgü** adımlar (backend mantığı DEĞİL):

| Tür | Ne doğrular | Örnek yolculuk-adımı |
|---|---|---|
| Form validasyonu | input → submit → hata mesajı / disabled buton | J41/J42/J46 şifre+yaş, J50 IBAN format, J32 adres, J22 kupon, J43 email kullanımda |
| Buton durumu / koşullu UI | render → enable/disable / görünür-değil | teklif (J3/J4), checkout 3-adım, 2FA toggle (J23/J47), sepet stok limiti (J33) |
| Render / durum gösterimi | fixture → ekran doğru gösteriyor | J1 sepet özeti (kargo+toplam), J21 wishlist, J38 bildirim sayacı, J27 IBAN durumu, sipariş durum rozetleri |
| Navigasyon wiring | tap → `router.push(...)` çağrıldı | "Hemen Al"→checkout, "Teklif Ver"→modal, kart→detay, "Giriş Yap"→login |
| Hata / boş durum | mock reject → UI tepkisi | login hata banner (J44), boş sepet, ağ hatası fallback (mock data) |

### 3. Organizasyon + izlenebilirlik
- **Co-located** `__tests__/`: `app/(auth)/__tests__/register.test.tsx`, `app/checkout/__tests__/checkout.test.tsx`, `src/components/product/__tests__/*.test.tsx`.
- **İzlenebilirlik:** `describe`/`it` yolculuk-adımını etiketler: `describe('J42 · 18 yaş engeli (register)')`, `it('J42.2 doğum tarihi 18 altıysa kayıt reddedilir')`. Grep ile "hangi yolculuk hangi testte" bulunur.
- **Kapsama indeksi:** `docs/superpowers/specs/mobile-ui-coverage.md` — yolculuk → UI testi (dosya::describe) → durum (✅ test var / 🚧 ürün-eksiği / — backend-only). 50-yolculuk matrisinin mobil-UI sütunu.

### 4. Kapsam dışı
- **Backend iş kuralı** → API e2e (ayrı spec). RNTL bunu test ETMEZ (api mock'lu).
- **🚧 mobil ürün-eksikleri** → test yazılmaz, indekste işaretlenir: ilan foto zorunlu (J2/J15/J18/J30/J40/J50), IBAN ekranı yok (J2/J27/J40/J50), teklif siparişi ödeme entry yok (J3/J34/J40).
- **Yeni Maestro flow YOK.** Yolculuk 1 e2e mevcut kalır (wiring kanıtı). En fazla 1-2 kritik wiring smoke ileride; per-journey değil.

## Minimal Maestro (wiring)
- Mevcut: [Yolculuk 1 orkestratörü](../../apps/mobile/maestro/journeys/run-journey-1.sh) — guest→kayıt→satın al→teslim→tamamlandı, gerçek API ile.
- Bu, "mobil UI gerçekten API'yi doğru çağırıyor" kanıtı. RNTL bunu mock'ladığı için, Maestro 1 journey wiring güvencesi olarak yeterli. Yeni Maestro yazılmaz.

## Artımlı yürütme
- **Adım 0:** `test-utils/` harness kur + mevcut 2 testi harness'a taşı (renderWithProviders/fixtures kullanacak şekilde) — kanıt.
- **Adım 1 (başla):** **Auth domaini** — register/login form validasyonu (J41, J42, J43, J44, J46). En saf RNTL uyumu, en hızlı değer. ~8-10 test + kapsama indeksine işle.
- **Sonraki batch'ler (ayrı plan):** teklif/checkout → sepet/wishlist → bildirim/profil/adres → … her domain bağımsız.
- **Kanıt:** her batch sonrası `cd apps/mobile && pnpm test` yeşil + kapsama indeksi güncel.

## Bileşenler ve sınırlar (özet)

| Birim | Görev | Bağımlılık |
|---|---|---|
| `test-utils/*` | Render + mock + fixture altyapısı | RNTL, jest |
| Ekran/komponent testleri | UI davranışını doğrula | test-utils, mock'lu api/router/store |
| Kapsama indeksi | Yolculuk → UI testi izlenebilirliği | dokümantasyon |
| Maestro J1 (mevcut) | Wiring smoke | gerçek API + simülatör |

## Riskler / notlar
- Bazı ekranlar ağır bağımlı (expo-router, çok sayıda store, react-query). Harness mock'ları bunu soğurur; ekran başına ek mock gerekebilir (örn. expo-image-picker, datetimepicker) — jest.setup'a global eklenir.
- DateField (spinner) gibi öğeler RNTL'de doğrudan etkileşime zor; form testinde değeri prop/initialValue ile ver veya ilgili onChange'i tetikle.
- Co-located testler route bundling'i etkilemez (jest testMatch yalnız `*.test.tsx`).
