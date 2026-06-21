# Google ile Giriş (Web + Mobil) — Tasarım

**Tarih:** 2026-06-20
**Durum:** Onaylandı, implementasyon planı bekliyor

## Problem / Amaç

Kullanıcılar email/şifre dışında **"Google ile devam et"** ile giriş/kayıt yapabilsin.
Kapsam: **web + mobil**. **Admin hariç** (güvenlik; email/şifre kalır). **Apple ertelendi**
(Apple Developer Program $99/yıl + iOS App Store şartı geldiğinde ayrı faz).

## Mevcut durum (audit)

- Auth tamamen JWT + email/şifre. OAuth iskelesi yok.
- `apps/api/src/modules/auth/`: passport-jwt + jwt-refresh + admin-jwt stratejileri; `generateTokens`
  (access 15m + refresh 7d) `auth.service.ts`'te; `POST /auth/login` `LoginDto{email,password}`.
- Prisma `User`: `passwordHash` **NOT NULL**, `email` unique, `isEmailVerified` var; OAuth alanı/tablo yok.
- Web: `apps/web/src/app/login/page.tsx` + `authStore` (localStorage `auth_token`/`refresh_token`).
- Mobil: `apps/mobile/app/(auth)/login.tsx` + `authStore` (expo-secure-store).
- Hiçbir uygulamada Google/OAuth paketi yok. Env'de OAuth değişkeni yok.

## Temel Prensip — "ID token doğrulama"

Her platform Google SDK'sından bir **id_token** alır, backend'e gönderir; backend token'ı
doğrular, kullanıcıyı bul-veya-oluştur/bağla, **kendi JWT'mizi** döner. Redirect/passport-oauth20
server-flow yerine bu yöntem; web ve mobilde tek tip çalışır ve mobil için gereklidir.

```
Web/Mobil → Google SDK → id_token → POST /auth/google { idToken }
  → google-auth-library ile doğrula (audience = web/iOS/android client ID'lerinden biri)
  → email_verified kontrolü
  → OAuthAccount(provider=google, sub) bul → yoksa email eşleşmesiyle oto-bağla → yoksa yeni user
  → { user, tokens }  (mevcut AuthResponse)
```

## Ürün Kararları

- **Oto-bağlama:** Google e-postası mevcut email/şifre hesabıyla eşleşirse, `email_verified=true`
  şartıyla o hesaba Google bağlanır ve kullanıcı girer (ayrı hesap açılmaz).
- **İlk giriş:** Hesabı olmayan Google kullanıcısı **anında oluşturulur ve içeri alınır** —
  ek onboarding yok. Alanlar: `displayName`=Google adı, `avatarUrl`=Google resmi, `email`,
  `isEmailVerified=true`, `isSeller=false`, `passwordHash=null`. Satıcı olmak isterse mevcut
  "satıcı ol" akışını kullanır.

## Mimari

### 1. Veritabanı (Prisma)

- `User.passwordHash` → **nullable** (OAuth-only kullanıcıların şifresi yok). Mevcut kullanıcılar etkilenmez.
- Yeni tablo:
  ```prisma
  model OAuthAccount {
    id             String   @id @default(uuid())
    userId         String   @map("user_id")
    provider       String   // 'google' (ileride 'apple')
    providerUserId String   @map("provider_user_id") // Google 'sub'
    email          String?
    createdAt      DateTime @default(now()) @map("created_at")
    user           User     @relation(fields: [userId], references: [id], onDelete: Cascade)

    @@unique([provider, providerUserId])
    @@index([userId])
    @@map("oauth_accounts")
  }
  ```
  + `User`'a `oauthAccounts OAuthAccount[]` ilişki alanı.
- Migration + `prisma generate`.

### 2. Backend (apps/api)

- Bağımlılık: `google-auth-library`.
- `GoogleAuthService.verifyIdToken(idToken)`: `OAuth2Client.verifyIdToken({ idToken, audience: [web, ios, android] })`;
  `email_verified` kontrolü; payload döner (`sub`, `email`, `name`, `picture`, `email_verified`).
  Geçersiz/expired/audience uyuşmazlığı → hata.
- `AuthService.loginWithGoogle(idToken)`:
  1. token doğrula; `email_verified !== true` → `UnauthorizedException`.
  2. `OAuthAccount(provider='google', providerUserId=sub)` ara → varsa ilgili user.
  3. yoksa `User(email)` ara → varsa **oto-bağla** (OAuthAccount oluştur), o user.
  4. yoksa yeni `User` (yukarıdaki alanlarla) + `OAuthAccount`.
  5. `generateTokens(user.id, user.email, user.isSeller)` → mevcut `AuthResponseDto`.
- Controller: `POST /auth/google` (public/@Public), `GoogleAuthDto { idToken: string }`.
- Env (audience): `GOOGLE_CLIENT_ID_WEB`, `GOOGLE_CLIENT_ID_IOS`, `GOOGLE_CLIENT_ID_ANDROID`
  (tanımlı olanlar audience listesine eklenir).

### 3. Web (apps/web)

- Paket: `@react-oauth/google`.
- `GoogleOAuthProvider` (clientId = `NEXT_PUBLIC_GOOGLE_CLIENT_ID`) köke (layout/Providers).
- Login **ve** register sayfasına "Google ile devam et" butonu → `credentialResponse.credential`
  (id_token) → `authApi.loginWithGoogle(idToken)` → `authStore` token'ları kaydeder (mevcut login
  ile aynı), yönlendirme yapılır.
- `apps/web/src/lib/api.ts`: `authApi.loginWithGoogle = (idToken) => api.post('/auth/google', { idToken })`.
- Env: `NEXT_PUBLIC_GOOGLE_CLIENT_ID`.

### 4. Mobil (apps/mobile)

- Paket: `@react-native-google-signin/google-signin`.
- `GoogleSignin.configure({ webClientId, iosClientId })` (uygulama açılışında bir kez).
- Login ekranına native Google butonu → `GoogleSignin.signIn()` → `idToken` →
  `authApi.loginWithGoogle(idToken)` → SecureStore'a token (mevcut akış).
- `app.config`/plugin yapılandırması + env: `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`,
  `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`.
- **Kısıt:** native modül → Expo Go'da çalışmaz; dev client/prod build gerekir.

### 5. Hata yönetimi & uç durumlar

- `email_verified=false` → 401, net mesaj ("Google hesabınızın e-postası doğrulanmamış").
- Geçersiz/expired token / audience uyuşmazlığı → 401.
- Google girişi başarısızsa email/şifre akışı etkilenmez (graceful).
- Aynı kullanıcı tekrar giriş → mevcut `OAuthAccount` üzerinden, yeni kayıt açılmaz.

### 6. Test

- Backend birim testleri (mock `verifyIdToken`):
  - yeni kullanıcı oluşturma (alanlar doğru: passwordHash null, isEmailVerified true, isSeller false)
  - mevcut email ile oto-bağlama (yeni user açılmaz, OAuthAccount eklenir)
  - mevcut OAuthAccount ile tekrar giriş (tek user)
  - `email_verified=false` reddi
- Web/mobil buton→API akışı: gerçek Google Client ID gerektirir → manuel/E2E doğrulama (Client ID
  girildikten sonra). Kod, ID'ler env'e girilince çalışacak şekilde hazır olur.

## Kapsam dışı

- Admin'e sosyal giriş.
- Apple ile giriş (sonraki faz).
- Profilde "bağlı hesapları yönet" ekranı (YAGNI; oto-bağlama yeterli).
- Gerçek Google Cloud Client ID'lerinin oluşturulması (kullanıcı sağlar; kod hazır olur).
