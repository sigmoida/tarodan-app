# 12 — Mobil Platform Konuları

Bu dosya web'de karşılığı **olmayan** ama mobilde zorunlu olan altyapı konularını kapsar.
Mobil repodaki mevcut kurulum baz alınmıştır; **yeni desen icat etme**.

---

## 1. Token saklama ve oturum

**Mevcut durum: doğru.** `expo-secure-store` (Keychain/Keystore), anahtarlar `accessToken`
ve `refreshToken`. İstek araya-girici her istekte `Authorization: Bearer` ekliyor;
`guestApi` hiç token eklemiyor.

Korunması gereken kurallar:

- **Cookie kavanozu kapalı kalmalı.** Paylaşılan bir `CookieManager` (özellikle ödeme
  WebView'i ile) API'ye cookie sızdırırsa sunucu cookie'yi başlığın **üstünde** tutar ve
  CSRF guard'ı devreye girer → 403.
- **Yenileme tek uçuşlu (single-flight).** Refresh token tek kullanımlıktır; eşzamanlı
  401'ler tek yenilemeyi beklemeli. (Mevcut kod bunu yapıyor, bozma.)
- Yenileme yanıtındaki **yeni refresh token'ı da kaydet**.
- `EMAIL_NOT_VERIFIED` (401) → oturumu kapat, doğrulama akışına yönlendir (yeni davranış).
- `USER_BANNED` (403) → tek seferlik engellendi ekranına yönlendir (mevcut guard doğru).
- Çıkışta: `POST /auth/logout` + **`POST /notifications/push-token { deactivate: true }`** +
  güvenli depoyu temizle + zustand sıfırla + `queryClient.clear()`.

**Soket:** token bağlantı anında veriliyor; **token yenilendiğinde soketi yeniden bağla** —
şu an ele alınmıyor, uzun oturumlarda realtime sessizce kopar.

---

## 2. Derin bağlantı — ⚠️ P0 eksik

**Mevcut durum: fiilen yapılandırılmamış.** `app.json` yalnız `scheme: "tarodan"` içeriyor;
`ios.associatedDomains` ve `android.intentFilters` **yok**, `expo-linking` hiç import
edilmiyor. Sonucu:

- E-posta doğrulama (`verify-email?token=`) ve şifre sıfırlama (`reset-password?token=`)
  ekranlarının **erişilebilir girişi yok** — kod var, kullanıcı ulaşamıyor.
- Kurumsal davet bağlantısı uygulamayı açamıyor (`08` §3).
- Web paylaşım bağlantıları uygulamada açılmıyor.

### Yapılacaklar

1. **Universal links / App Links** kur: iOS `associatedDomains` (`applinks:<domain>`),
   Android `intentFilters` (`autoVerify: true`) + sunucuda `apple-app-site-association` ve
   `assetlinks.json` yayınla.
2. Custom scheme'i (`tarodan://`) yedek olarak koru.
3. **Yol eşlemesi** tanımla — web yolu → mobil rota:

| Web bağlantısı                      | Mobil rota                                    |
| ----------------------------------- | --------------------------------------------- |
| `/verify-email?token=`              | `(auth)/verify-email`                         |
| `/reset-password?token=`            | `(auth)/reset-password`                       |
| `/corporate/invite?token=`          | kurumsal aktivasyon (yeni)                    |
| `/listings/:id`                     | `product/[id]`                                |
| `/collections/:id`                  | `collections/[id]`                            |
| `/profile/orders/:id`               | `orders/[id]`                                 |
| `/profile/refund-requests/:id`      | `refund-requests/[id]`                        |
| `/profile/trades/:id`               | `trade/[id]`                                  |
| `/track-order?orderNumber=&email=`  | `order-track` (otomatik sorgula)              |
| `/payment/success`, `/payment/fail` | **açma** — WebView içinde yakalanır (`04` §5) |

> Push bildirimleri için bu eşleme zaten var (`src/utils/notificationRoute.ts#toMobileRoute`).
> **Aynı eşlemeyi derin bağlantı için de kullan** — iki kopya tutma (DRY).

4. **Ödeme dönüş URL'lerini derin bağlantı sanma.** Onlar `${FRONTEND_URL}/payment/...`
   adresleridir ve WebView içinde navigasyon kesilerek yakalanır. Uygulama dışına çıkarsa
   akış kopar.

---

## 3. Force-update ve OTA

**Mevcut durum: doğru.**

- `GET /app-config?platform=&appVersion=` → `useForceUpdate` → `ForceUpdateGate`,
  **fail-open** (config alınamazsa uygulamayı kilitleme).
- `expo-updates`, `runtimeVersion: { policy: "appVersion" }`; kanallar:
  `preview` → staging, `production` → production.

Kurallar:

- Açılışta **her zaman** kontrol et; `updateRequired` ise engelleyici ekran + store bağlantısı.
- `updateAvailable` ise engellemeyen bilgi.
- OTA ile **native olmayan** düzeltmeleri dağıt; native modül/izin değişikliği store sürümü ister.

---

## 4. Bildirim izinleri ve push

`09` §4'e bakın. Platform tarafı notlar:

- Android'de 4 kanal ayrı tutulmalı (default/trades/messages/orders) — bildirim yönetimi
  kullanıcıya kanal bazlı kontrol verir.
- iOS'ta izin isteme zamanlaması: **ilk açılışta değil**, kullanıcı bir değer gördükten sonra
  (ör. ilk sipariş/teklif sonrası) sor.
- Sistem izni reddedildiyse `pushNotifications` tercihini bilgilendirici biçimde devre dışı
  göster (sessizce açık gösterme).
- Soğuk başlatmada gelen bildirim yönlendirmesi mutlaka test edilmeli.

---

## 5. i18n

**Mevcut durum: çok iyi.** i18next + ICU, katalog `tr`/`en` **4.822 anahtar tam parite**,
47 ad alanı, tipli anahtar union'ı kod üretimiyle (`pnpm i18n:codegen`).

Kurallar:

- **Ekranlarda gömülü Türkçe metin bırakma** — katalog hazır, anahtara taşı
  (`13-parity-matrix.md` #21).
- Sunucu hataları `Accept-Language`'e göre yerelleşir → dil değişince başlığı güncelle.
- Sunucu hata metnini **yeniden çevirmeye çalışma**; `i18nKey` ile dallanıp kendi metnini
  göstermek istiyorsan katalogta karşılığını tut.

---

## 6. Dosya ve görsel seçme

| İhtiyaç         | Kısıt                                                                                |
| --------------- | ------------------------------------------------------------------------------------ |
| Ürün görselleri | `POST /media/upload/product`, alan `images`, **≤15 dosya**, üyelik sınırı da geçerli |
| Avatar          | `POST /media/upload/avatar`, alan `avatar`, **≤2 MB**                                |
| Mesaj eki       | `POST /media/upload?folder=messages`, alan `file`                                    |
| İade kanıtı     | `POST /media/upload?folder=reviews`, alan `file`, **en fazla 5**                     |
| Kurumsal belge  | `POST /users/me/seller-documents`, alan `file` + `documentType`, **PDF + görsel**    |
| Satıcı faturası | `POST /orders/:id/seller-invoice`, alan `file`, **yalnız PDF**                       |

Hepsinde: **≤10 MB**, gerçek magic-byte doğrulaması (spoof reddedilir), görsellerde
**AI moderasyon** — reddedilirse sunucunun Türkçe mesajını kullanıcıya olduğu gibi göster.

PDF gereken yerlerde görsel seçici değil **belge seçici** kullan.

---

## 7. Ödeme WebView'i

`04` §5 sözleşmedir. Platform notları:

- WebView **izole** olmalı: uygulamanın cookie/veri deposunu paylaşmasın (API'ye cookie
  sızmasın).
- Navigasyon kesme (`onNavigationStateChange` / `shouldOverrideUrlLoading`) ile dönüş URL'i
  yakalanmalı; **URL ön ekiyle** karşılaştır, tam eşleşme bekleme (query parametreleri değişir).
- Kullanıcı WebView'i kapatırsa ödeme **belirsizdir** → `GET /payments/:id/status` sorgula,
  "başarısız" varsayma.
- Donanım geri tuşu ödeme sırasında yakalanmalı ve onay istemeli (mevcut davranış doğru).
- Uygulama arka plana atılıp dönerse akış kaldığı yerden devam etmeli.

---

## 8. Hata izleme ve loglama

**Mevcut durum: doğru.** Sentry (Expo Go'da ve DSN yoksa no-op), yapılandırılmış logger
(console + sentry sink), kök `ErrorBoundary`, girişte/çıkışta Sentry kullanıcı etiketi.

Kural: **PII loglamayın** — kart verisi, tam IBAN, TCKN, tam adres. Sunucu tarafı bunu
zorluyor; istemcide de aynı disiplin geçerli.

---

## 9. Test

- **Jest**: `jest-expo`, rota yanında `__tests__/`, yardımcılar `src/test-utils/`.
  Yeni bir domain dosyası uygularken **en az** hook/mantık testi ekle.
- **Maestro**: 50 akış (`maestro/flows/`). Bu dokümanlardan uygulanan her P0 için bir akış ekle
  (özellikle ödeme, 2FA girişi, kurumsal onboarding).
- `detox` bağımlılığı ölü — kullanma.
- Doğrulama: `npx tsc --noEmit` yeni hata üretmemeli, `pnpm lint` temiz, dokunulan rotanın
  testleri yeşil.

---

## 10. Mobil repodaki bayat dokümanlar (dikkat)

Bunlara güvenerek iş yapma:

| Dosya                                    | Sorun                                                                                                                                                                                                                                                                        |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLAUDE.md`                              | Hâlâ monorepo'yu anlatıyor: `@tarodan/ui-native`, `@tarodan/design-tokens`, `apps/mobile/…`, `pnpm --filter @tarodan/mobile`. **Repoda tek bir `@tarodan/*` importu yok** — her şey `@/ui`, `@/theme`, `@/i18n` altında. Kuralları zihinsel olarak çevir veya dosyayı düzelt |
| `docs/WEB_MOBILE_PARITY.md`              | 2026-03-12, **esaslı biçimde bayat** (eski dosya adları, checkout'un satır-satır döngü olduğu iddiası, Aras/Yurtiçi kargo, "mobil çoğunlukla sabit TR")                                                                                                                      |
| `docs/WEB_MOBILE_GAP_ANALYSIS.md`        | Aynı şekilde bayat                                                                                                                                                                                                                                                           |
| `docs/WEB_MOBILE_VERIFICATION_REPORT.md` | QA temeli olarak kullanılabilir                                                                                                                                                                                                                                              |

**Bu klasör (`docs/mobile-parity/`) 2026-07-30 itibarıyla geçerli kaynaktır.**

---

## 11. Ölü kod — bağlı özellik sanma

`FeaturedListingsModal` (vitrin) · `ShareModal` · `UpgradePrompt` ·
`AwaitingConfirmationBanner` · `AuthRequiredSheet` · `CommissionPreview` ·
`ReputationBadge` — hepsi export edilmiş, **hiçbiri render edilmiyor**.
Ya bağla ya sil; "var" sayma.
