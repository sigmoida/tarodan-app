# Web'de Apple ile giriş — Tasarım

Tarih: 2026-07-02
Kapsam: Web (`apps/web`) için "Apple ile giriş". Native (iOS) Apple girişi ayrı spec'te tamamlandı (`2026-07-02-ios-google-apple-signin-design.md`) ve API tarafı (endpoint, hesap-eşleme, DB) ortak kullanılıyor. Bu spec yalnız web'in eksik parçalarını ekler.

## Bağlam

- API'de "Apple ile giriş" zaten var: `POST /auth/apple` (`AppleAuthDto { identityToken, fullName? }`), `AuthService.loginWithApple`, `AppleAuthService.verifyIdentityToken` (`apple-signin-auth`), generic `OAuthAccount` (provider='apple', providerUserId=Apple `sub`). Relay email olduğu gibi kaydedilir; `email_verified` kontrolü var; yeni kullanıcı `passwordHash:null, isEmailVerified:true, isSeller:false`.
- Web Google akışı referans desen:
  - `apps/web/src/components/auth/GoogleSignInButton.tsx` → `@react-oauth/google` → `authStore.loginWithGoogle(credential)`
  - `apps/web/src/stores/authStore.ts` → `loginWithGoogle(idToken)` → `authApi.loginWithGoogle(idToken)`
  - `apps/web/src/lib/api.ts` → `loginWithGoogle: (idToken) => api.post('/auth/google', { idToken })`
  - `apps/web/src/app/login/page.tsx` → `<GoogleSignInButton onSuccess={...} />`
- Web Apple = bu deseni Apple JS SDK ile aynalamak + backend audience'ı web Services ID'yi kabul edecek şekilde genişletmek.

## Akış

1. Kullanıcı "Apple ile devam et"e tıklar.
2. Apple JS SDK (`AppleID.auth`) **popup** açar (`usePopup: true`).
3. Client'ta `response.authorization.id_token` döner (+ ilk yetkilendirmede `response.user.name`).
4. `authStore.loginWithApple(idToken, fullName?)` → `authApi.loginWithApple(...)` → `POST /auth/apple`.
5. Backend `verifyIdentityToken` token'ı doğrular (audience artık native bundle ID **veya** web Services ID kabul eder) → mevcut hesap-eşleme → httpOnly cookie + user döner.
6. Oturum açılır (Google web akışıyla birebir aynı sonuç).

## Backend değişikliği (`apps/api`) — küçük, geriye dönük uyumlu

Tek dosya: `apps/api/src/modules/auth/apple-auth.service.ts`
- `clientId(): string` (tekil) yerine `audience(): string[]` — Google servisindeki `audience()` deseniyle aynı:
  ```ts
  private audience(): string[] {
    return [
      this.configService.get<string>('APPLE_CLIENT_ID'),      // native bundle id: com.tarodan.app
      this.configService.get<string>('APPLE_SERVICES_ID'),    // web services id: örn. shop.tarodan.web
    ].filter((x): x is string => !!x);
  }
  ```
  Fallback davranışı: liste boşsa (`filter` sonrası) `['com.tarodan.app']` kullan (mevcut fallback korunur; native'i asla kırma).
- `appleSignin.verifyIdToken(identityToken, { audience: this.audience(), ignoreExpiration: false })` — `apple-signin-auth` audience dizisini kabul eder.
- Yeni endpoint / DTO / migration YOK. `POST /auth/apple` hem native hem web'e hizmet eder.
- Env: `APPLE_SERVICES_ID` eklenir (prod + local API `.env`).

## Frontend (`apps/web`)

- Apple JS SDK: Apple'ın resmi scriptini (`https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js`) login sayfasında yükle (Next `<Script>` veya bileşen içinde dinamik). `window.AppleID` global'ini sağlar.
- Yeni bileşen `apps/web/src/components/auth/AppleSignInButton.tsx`:
  - `GoogleSignInButton` desenini izler; siyah "Apple ile devam et" butonu.
  - Init: `AppleID.auth.init({ clientId: NEXT_PUBLIC_APPLE_SERVICES_ID, redirectURI: NEXT_PUBLIC_APPLE_REDIRECT_URI, usePopup: true, scope: 'name email' })`.
  - Tıklamada: `const data = await AppleID.auth.signIn()` → `data.authorization.id_token`; isim `data.user?.name` (givenName + familyName) varsa `fullName`.
  - `authStore.loginWithApple(idToken, fullName)` çağrılır; hata `toast.error(...)`, kullanıcı iptali (`error === 'popup_closed_by_user'`) sessiz geçilir.
- `authStore.ts`: `loginWithApple(idToken: string, fullName?: string): Promise<void>` — `loginWithGoogle` deseni (aynı state/cookie yönetimi, `authApi.loginWithApple`).
- `api.ts`: `loginWithApple: (idToken: string, fullName?: string) => api.post('/auth/apple', { idToken, fullName })`.
  - NOT: mevcut `loginWithGoogle` `idToken` alan adını kullanıyor; endpoint `identityToken` bekliyor. Web api client'ta `POST /auth/apple` gövdesi `{ identityToken: idToken, fullName }` olmalı (DTO alan adıyla eşleşsin).
- `login/page.tsx`: `<AppleSignInButton onSuccess={...} />` Google butonunun yanına eklenir.
- Env: `NEXT_PUBLIC_APPLE_SERVICES_ID`, `NEXT_PUBLIC_APPLE_REDIRECT_URI`.

## Dış kurulum (Apple Developer — kod değil, ekip/hesap işi)

1. **Services ID** oluştur (ör. `shop.tarodan.web`) → "Sign In with Apple" etkinleştir.
2. Primary App ID olarak `com.tarodan.app`'i bağla.
3. **Domain doğrula** (`tarodan.shop`): Apple'ın verdiği `apple-developer-domain-association.txt`'yi `https://tarodan.shop/.well-known/apple-developer-domain-association.txt` altında yayınla.
4. **Return URL** kaydet (ör. `https://tarodan.shop/login`) — popup akışında bile gerekli; `redirectURI` bununla birebir eşleşmeli.
5. `APPLE_SERVICES_ID` (backend) ve `NEXT_PUBLIC_APPLE_SERVICES_ID` (web) bu Services ID'ye set edilir.

## Test

- `apps/api/src/modules/auth/apple-auth.service.spec.ts`:
  - `audience`'ın artık dizi olduğunu ve `verifyIdToken`'a native+web audience listesiyle çağrıldığını doğrula.
  - Web Services ID'li (farklı `aud`) geçerli bir token'ın da kabul edildiğini doğrula (mock payload).
  - Mevcut native testler geçmeye devam etmeli (geriye dönük uyum).
- Web bileşeni: birim testi zorunlu değil (Google butonunda da yok); manuel doğrulama — gerçek domain doğrulaması gerektiği için tam uçtan uca test ancak `tarodan.shop` üzerinde yapılabilir.

## Kapsam dışı

- Sunucu-taraflı redirect / form_post authorization-code akışı (popup + id_token seçildi).
- Nonce replay-koruması (Google web akışında da yok; YAGNI — ileride eklenebilir).
- Android Apple girişi (web akışı gerektirir; ayrı iş).
