# iOS Google girişi düzeltmesi + iOS Apple ile giriş — Tasarım

Tarih: 2026-07-02
Kapsam: (A) iOS'ta Google girişini çalışır hale getirmek — config düzeltmesi; (B) iOS için Apple ile giriş — yeni geliştirme. Web Apple girişi bu spec dışıdır (sonraki aşama).

## Bağlam

- Google girişi kod olarak **hem web hem mobil hem API** tarafında zaten mevcut ve çalışıyor.
  - Mobil: `apps/mobile/src/services/googleSignin.ts` (`@react-native-google-signin/google-signin`), buton yalnız `isGoogleConfigured()` true ise gösterilir; iOS'ta bu `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`'ye bağlı.
  - API: `apps/api/src/modules/auth/google-auth.service.ts`, `POST /auth/google` idToken doğrular (`GOOGLE_CLIENT_ID_WEB/IOS/ANDROID` audience listesi).
- app.json'da google-signin plugin'inde iOS URL scheme zaten tanımlı: `com.googleusercontent.apps.243308404313-92c5475nff3874maoqes02ajakn81hvh` → iOS OAuth client Google Cloud'da mevcut.
- Apple ile giriş **hiçbir yerde yok**.
- Kullanıcı modeli: `apps/api/prisma/schema.prisma` `User` (passwordHash nullable, OAuth-only destekli) + generic `OAuthAccount` (`provider`, `providerUserId`, `email`, `@@unique([provider, providerUserId])`).

## Bölüm A — iOS Google girişi (config düzeltmesi, kod değişikliği yok)

Kök neden: TestFlight/preview build'de `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` inline'lanmadığı için `isGoogleConfigured()` iOS'ta false döner ve buton hiç render edilmez. eas.json preview/production env'lerinde yalnız `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` var.

Yapılacaklar:
1. `apps/mobile/eas.json` → `build.preview.env` ve `build.production.env` içine ekle:
   `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID = "243308404313-92c5475nff3874maoqes02ajakn81hvh.apps.googleusercontent.com"`
   (URL scheme'deki reversed client ID'nin normal biçimi.)
2. API prod ortamında `GOOGLE_CLIENT_ID_IOS` aynı değere set olmalı; backend iOS idToken'ının audience'ını kabul etsin. (Kod zaten okuyor; sadece prod env doğrulanır — Coolify paneli.)
3. Yeni preview/production build alınır → iOS'ta "Google ile devam et" butonu görünür ve giriş uçtan uca çalışır.

Kabul kriteri: iOS TestFlight build'inde Google butonu görünür, tıklanınca Google akışı açılır, dönen idToken `/auth/google`'da kabul edilir, oturum açılır.

## Bölüm B — iOS Apple ile giriş (yeni geliştirme)

### Mobil (`apps/mobile`)

- Paket: `expo-apple-authentication`.
- `app.json`:
  - `ios.usesAppleSignIn: true`
  - `plugins` içine `"expo-apple-authentication"`.
- Yeni servis `src/services/appleSignin.ts`:
  - `isAppleAvailable(): Promise<boolean>` — `Platform.OS === 'ios'` ve `AppleAuthentication.isAvailableAsync()`.
  - `signInWithApple(): Promise<{ identityToken: string; fullName?: string }>` — `AppleAuthentication.signInAsync({ requestedScopes: [FULL_NAME, EMAIL] })`; `identityToken` ve (varsa) `fullName` (givenName + familyName birleşik) döner. `ERR_REQUEST_CANCELED` sessizce yutulur (kullanıcı iptal etti).
- Login ekranı (`app/(auth)/login.tsx`): Google butonunun yanına Apple'ın marka kurallarına uygun siyah `AppleAuthentication.AppleAuthenticationButton` (veya eşdeğeri). Yalnız `isAppleAvailable()` true iken render.
- `src/stores/authStore.ts`: `loginWithApple(identityToken, fullName?)` → `authApi.loginWithApple(...)` → dönen token'lar SecureStore'a, state güncellenir (mevcut Google akışıyla aynı desen).
- API client servisi: `authApi.loginWithApple(identityToken, fullName?)` → `POST /auth/apple`.

### API (`apps/api`)

- Paket: `apple-signin-auth` (Apple identity token doğrulama; JWKS'i kendi yönetir).
- Yeni `apps/api/src/modules/auth/apple-auth.service.ts`:
  - `verifyIdentityToken(identityToken)` → `appleSignin.verifyIdToken(identityToken, { audience: APPLE_CLIENT_ID, nonce?: undefined })`. issuer/exp/JWKS doğrulaması kütüphane tarafından yapılır.
  - Döner: `{ sub, email?, isPrivateEmail? }`.
  - `APPLE_CLIENT_ID` env = bundle ID `com.tarodan.app`.
- Endpoint: `POST /auth/apple`, `AppleAuthDto { identityToken: string; fullName?: string }`.
- Hesap eşleme (Google servisindeki mantıkla birebir aynı, `apps/api/src/modules/auth/auth.service.ts` yardımcılarını yeniden kullan):
  1. `OAuthAccount(provider='apple', providerUserId=sub)` var → o kullanıcıyı döndür.
  2. Yok ve token'daki email mevcut bir `User.email` ile eşleşiyor → o kullanıcıya `OAuthAccount` bağla, döndür.
  3. Hiçbiri değil → yeni `User` oluştur (passwordHash null, email = Apple'ın verdiği — **relay olsa bile aynen** kaydedilir), `OAuthAccount` bağla.
  - **Relay email kabul edilir**; asıl kimlik anahtarı her zaman `sub`.
  - `fullName` yalnız ilk yetkilendirmede gelir: yeni kullanıcı oluşturulurken ya da `displayName` boşsa doldurmak için kullanılır; sonraki girişlerde yok sayılır.
  - Email doğrulama: Apple email'i doğrulanmış sayılır (Apple garantiler) → `isEmailVerified = true`.
- Token üretimi/refresh/cookie/response Google akışıyla aynı; ortak yardımcı fonksiyonlar paylaşılır.

### DB

Yeni model/migration yok. Mevcut `OAuthAccount` yeterli (`provider` generic).

### Test

- `apple-auth.service` unit testi: `apple-signin-auth.verifyIdToken` mock'lanır; geçerli/geçersiz/expired token davranışı.
- `/auth/apple` için üç eşleme senaryosu (yeni kullanıcı / email-eşleşen mevcut kullanıcı / mevcut OAuthAccount) — mevcut Google e2e testleri şablon alınır.
- Relay email ve "ikinci giriş fullName yok" senaryoları kapsanır.

### Konfig / dış kurulum (kod dışı, kullanıcı tarafı)

- Apple Developer: App ID'de "Sign In with Apple" capability aktif olmalı (bundle `com.tarodan.app`).
- App Store 4.8: Google sunulduğu için Apple ile giriş iOS'ta zorunlu — bu iş onu karşılar.

## Sıralama

1. Bölüm A (config) — hızlı, hemen build alınabilir.
2. Bölüm B — API önce (endpoint + test), sonra mobil.

## Kapsam dışı

- Web Apple girişi (Services ID, domain association, form_post) — ayrı spec.
- Android Apple girişi (Apple native Android'de yok; web akışı gerekir) — kapsam dışı.
