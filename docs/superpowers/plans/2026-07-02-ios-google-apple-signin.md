# iOS Google düzeltmesi + iOS Apple ile giriş — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** iOS'ta Google girişini config düzelterek çalışır hale getirmek ve iOS için Apple ile giriş özelliğini uçtan uca eklemek.

**Architecture:** Google için kod hazır; yalnız eas.json'a iOS client ID env'i eklenir. Apple için: API tarafında `apple-signin-auth` ile identity token doğrulayan yeni bir servis + `POST /auth/apple` endpoint'i, mevcut generic `OAuthAccount` tablosu ve `loginWithGoogle`'la birebir aynı hesap-eşleme mantığı; mobil tarafında `expo-apple-authentication` ile native buton.

**Tech Stack:** NestJS + Prisma (API), Expo/React Native (mobil), `apple-signin-auth`, `expo-apple-authentication`.

## Global Constraints

- Apple bundle ID / Apple token audience: `com.tarodan.app` (env `APPLE_CLIENT_ID`).
- Apple provider adı OAuthAccount'ta: `apple` (verbatim, küçük harf).
- Relay email (`@privaterelay.appleid.com`) olduğu gibi kaydedilir; asıl kimlik anahtarı Apple `sub`.
- Apple email'i doğrulanmış kabul edilir → yeni kullanıcıda `isEmailVerified: true`.
- Yeni kullanıcıda `passwordHash: null`, `isSeller: false` (Google akışıyla aynı).
- iOS Google client ID (reversed URL scheme'in düzü): `243308404313-92c5475nff3874maoqes02ajakn81hvh.apps.googleusercontent.com`.
- API testleri: `apps/api`'de `npm test`. Mobil için native build gerektiği için Apple/Google butonları yalnız gerçek iOS build'de doğrulanır.

---

## File Structure

- `apps/mobile/eas.json` — preview/production env'e iOS Google client ID (Task 1).
- `apps/api/package.json` — `apple-signin-auth` dependency (Task 2).
- `apps/api/src/modules/auth/apple-auth.service.ts` — Apple identity token doğrulama (Task 2, yeni).
- `apps/api/src/modules/auth/apple-auth.service.spec.ts` — servis unit testi (Task 2, yeni).
- `apps/api/src/modules/auth/dto/apple-auth.dto.ts` — `AppleAuthDto` (Task 3, yeni).
- `apps/api/src/modules/auth/dto/index.ts` — export (Task 3).
- `apps/api/src/modules/auth/auth.service.ts` — `loginWithApple()` (Task 3).
- `apps/api/src/modules/auth/auth-apple.service.spec.ts` — eşleme senaryoları (Task 3, yeni).
- `apps/api/src/modules/auth/auth.controller.ts` — `POST /auth/apple` (Task 3).
- `apps/api/src/modules/auth/auth.module.ts` — `AppleAuthService` provider (Task 3).
- `apps/mobile/package.json` + `apps/mobile/app.json` — expo-apple-authentication (Task 4).
- `apps/mobile/src/services/appleSignin.ts` — native Apple servisi (Task 4, yeni).
- `apps/mobile/src/services/api.ts` — `authApi.loginWithApple` (Task 5).
- `apps/mobile/app/(auth)/login.tsx` — Apple butonu + handler (Task 5).

---

### Task 1: iOS Google config düzeltmesi

**Files:**
- Modify: `apps/mobile/eas.json` (build.preview.env ve build.production.env)

**Interfaces:**
- Consumes: yok
- Produces: build anında `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` inline'lanır → `isGoogleConfigured()` iOS'ta true döner.

- [ ] **Step 1: eas.json preview env'ine iOS client ID ekle**

`apps/mobile/eas.json` içinde `build.preview.env` bloğunu şu hale getir (mevcut satırlara ekleme):

```json
      "env": {
        "EXPO_PUBLIC_ENVIRONMENT": "preview",
        "EXPO_PUBLIC_API_URL": "https://tarodan.shop/api",
        "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID": "243308404313-kdc77bd36flfhv6ujlb5tfd4qjteh94c.apps.googleusercontent.com",
        "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID": "243308404313-92c5475nff3874maoqes02ajakn81hvh.apps.googleusercontent.com"
      }
```

- [ ] **Step 2: eas.json production env'ine iOS client ID ekle**

`build.production.env` bloğunu aynı şekilde güncelle:

```json
      "env": {
        "EXPO_PUBLIC_ENVIRONMENT": "production",
        "EXPO_PUBLIC_API_URL": "https://tarodan.shop/api",
        "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID": "243308404313-kdc77bd36flfhv6ujlb5tfd4qjteh94c.apps.googleusercontent.com",
        "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID": "243308404313-92c5475nff3874maoqes02ajakn81hvh.apps.googleusercontent.com"
      }
```

- [ ] **Step 3: JSON geçerliliğini doğrula**

Run: `cd apps/mobile && node -e "require('./eas.json'); console.log('ok')"`
Expected: `ok`

- [ ] **Step 4: iOS env'in iki profilde de olduğunu doğrula**

Run: `cd apps/mobile && grep -c "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID" eas.json`
Expected: `2`

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/eas.json
git commit -m "fix(mobile/ios): eas preview+production env'e Google iOS client ID ekle"
```

> **Kod dışı not (kullanıcıya hatırlat):** API prod ortamında (Coolify paneli) `GOOGLE_CLIENT_ID_IOS` aynı değere (`243308404313-92c5475nff3874maoqes02ajakn81hvh.apps.googleusercontent.com`) set edilmeli ki backend iOS idToken audience'ını kabul etsin. Ardından yeni bir preview/production EAS build alınır.

---

### Task 2: API — AppleAuthService (identity token doğrulama)

**Files:**
- Modify: `apps/api/package.json` (dependency)
- Create: `apps/api/src/modules/auth/apple-auth.service.ts`
- Test: `apps/api/src/modules/auth/apple-auth.service.spec.ts`

**Interfaces:**
- Consumes: `ConfigService.get('APPLE_CLIENT_ID')`
- Produces:
  - `interface AppleProfile { sub: string; email: string; isPrivateEmail: boolean }`
  - `class AppleAuthService { verifyIdentityToken(identityToken: string): Promise<AppleProfile> }`

- [ ] **Step 1: apple-signin-auth bağımlılığını kur**

Run: `cd apps/api && npm install apple-signin-auth`
Expected: kurulum başarılı; `package.json` dependencies'te `apple-signin-auth` görünür.

- [ ] **Step 2: Failing test yaz**

Create `apps/api/src/modules/auth/apple-auth.service.spec.ts`:

```ts
// apps/api/src/modules/auth/apple-auth.service.spec.ts
import { Test } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import appleSignin from 'apple-signin-auth';
import { AppleAuthService } from './apple-auth.service';

jest.mock('apple-signin-auth');

describe('AppleAuthService', () => {
  let service: AppleAuthService;
  const verify = appleSignin.verifyIdToken as jest.Mock;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AppleAuthService,
        { provide: ConfigService, useValue: { get: (k: string) => (k === 'APPLE_CLIENT_ID' ? 'com.tarodan.app' : undefined) } },
      ],
    }).compile();
    service = moduleRef.get(AppleAuthService);
  });

  it('returns normalized profile for a valid token (real email)', async () => {
    verify.mockResolvedValue({ sub: 'a-1', email: 'a@b.com', email_verified: 'true', is_private_email: 'false' });
    const r = await service.verifyIdentityToken('tok');
    expect(verify).toHaveBeenCalledWith('tok', expect.objectContaining({ audience: 'com.tarodan.app' }));
    expect(r).toEqual({ sub: 'a-1', email: 'a@b.com', isPrivateEmail: false });
  });

  it('accepts relay (private) email', async () => {
    verify.mockResolvedValue({ sub: 'a-2', email: 'xyz@privaterelay.appleid.com', email_verified: true, is_private_email: true });
    const r = await service.verifyIdentityToken('tok');
    expect(r).toEqual({ sub: 'a-2', email: 'xyz@privaterelay.appleid.com', isPrivateEmail: true });
  });

  it('rejects when token has no sub or email', async () => {
    verify.mockResolvedValue({ sub: 'a-3' });
    await expect(service.verifyIdentityToken('tok')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects when verifyIdToken throws (invalid/expired token)', async () => {
    verify.mockRejectedValue(new Error('jwt expired'));
    await expect(service.verifyIdentityToken('tok')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
```

- [ ] **Step 3: Testin fail ettiğini doğrula**

Run: `cd apps/api && npm test -- apple-auth.service.spec`
Expected: FAIL — "Cannot find module './apple-auth.service'".

- [ ] **Step 4: Servisi yaz**

Create `apps/api/src/modules/auth/apple-auth.service.ts`:

```ts
// apps/api/src/modules/auth/apple-auth.service.ts
import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import appleSignin from 'apple-signin-auth';

export interface AppleProfile {
  sub: string;
  email: string;
  isPrivateEmail: boolean;
}

@Injectable()
export class AppleAuthService {
  private readonly logger = new Logger(AppleAuthService.name);

  constructor(private readonly configService: ConfigService) {}

  private clientId(): string {
    return this.configService.get<string>('APPLE_CLIENT_ID') || 'com.tarodan.app';
  }

  async verifyIdentityToken(identityToken: string): Promise<AppleProfile> {
    let payload: any;
    try {
      // apple-signin-auth: JWKS (appleid.apple.com/auth/keys), issuer, exp doğrular.
      payload = await appleSignin.verifyIdToken(identityToken, {
        audience: this.clientId(),
        ignoreExpiration: false,
      });
    } catch (e) {
      this.logger.warn(`Apple token verify failed: ${e instanceof Error ? e.message : e}`);
      throw new UnauthorizedException('Apple oturumu doğrulanamadı');
    }
    if (!payload?.sub || !payload?.email) {
      throw new UnauthorizedException('Apple oturumu geçersiz');
    }
    // Apple email_verified / is_private_email string ('true') veya boolean olabilir.
    const isPrivate = payload.is_private_email === true || payload.is_private_email === 'true';
    return {
      sub: String(payload.sub),
      email: String(payload.email),
      isPrivateEmail: isPrivate,
    };
  }
}
```

- [ ] **Step 5: Testin geçtiğini doğrula**

Run: `cd apps/api && npm test -- apple-auth.service.spec`
Expected: PASS (4 test).

- [ ] **Step 6: Commit**

```bash
git add apps/api/package.json apps/api/package-lock.json apps/api/src/modules/auth/apple-auth.service.ts apps/api/src/modules/auth/apple-auth.service.spec.ts
git commit -m "feat(api/auth): Apple identity token doğrulayan AppleAuthService"
```

---

### Task 3: API — loginWithApple + endpoint + module wiring

**Files:**
- Create: `apps/api/src/modules/auth/dto/apple-auth.dto.ts`
- Modify: `apps/api/src/modules/auth/dto/index.ts`
- Modify: `apps/api/src/modules/auth/auth.service.ts` (constructor + yeni metod)
- Test: `apps/api/src/modules/auth/auth-apple.service.spec.ts`
- Modify: `apps/api/src/modules/auth/auth.controller.ts`
- Modify: `apps/api/src/modules/auth/auth.module.ts`

**Interfaces:**
- Consumes: `AppleAuthService.verifyIdentityToken`, mevcut `AuthService.buildUserAuthResponse(userId): Promise<AuthResponseDto>`, `setAuthCookies(res, tokens, { admin })`.
- Produces:
  - `class AppleAuthDto { identityToken: string; fullName?: string }`
  - `AuthService.loginWithApple(identityToken: string, fullName?: string): Promise<AuthResponseDto>`
  - `POST /auth/apple`

- [ ] **Step 1: AppleAuthDto oluştur**

Create `apps/api/src/modules/auth/dto/apple-auth.dto.ts`:

```ts
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class AppleAuthDto {
  @IsString()
  @IsNotEmpty()
  identityToken!: string;

  @IsOptional()
  @IsString()
  fullName?: string;
}
```

- [ ] **Step 2: DTO'yu index'ten export et**

`apps/api/src/modules/auth/dto/index.ts` içine, `google-auth.dto` export'unun yanına ekle:

```ts
export * from './apple-auth.dto';
```

(Dosyada `export * from './google-auth.dto';` satırını bul; hemen altına ekle.)

- [ ] **Step 3: loginWithApple için failing test yaz**

Create `apps/api/src/modules/auth/auth-apple.service.spec.ts`:

```ts
// apps/api/src/modules/auth/auth-apple.service.spec.ts
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { GoogleAuthService } from './google-auth.service';
import { AppleAuthService } from './apple-auth.service';
import { PrismaService } from '../../prisma';
import { NotificationService } from '../notification/notification.service';
import { CacheService } from '../cache/cache.service';
import { StorageService } from '../storage/storage.service';

describe('AuthService.loginWithApple', () => {
  let service: AuthService;
  const apple = { verifyIdentityToken: jest.fn() };
  const baseUser = {
    id: 'u1', email: 'a@b.com', phone: null, displayName: 'Ali', avatarUrl: null,
    isVerified: false, isSeller: false, sellerType: null, createdAt: new Date(),
    membership: null,
  };
  const prisma: any = {
    oAuthAccount: { findUnique: jest.fn(), create: jest.fn().mockResolvedValue({ id: 'oa1' }) },
    user: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn().mockResolvedValue({}) },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: { signAsync: jest.fn().mockResolvedValue('tok') } },
        { provide: ConfigService, useValue: { get: (k: string) => (k.includes('SECRET') ? 'secret' : '15m') } },
        { provide: NotificationService, useValue: {} },
        { provide: CacheService, useValue: { del: jest.fn(), set: jest.fn(), get: jest.fn() } },
        { provide: StorageService, useValue: { getPublicAssetUrl: jest.fn().mockReturnValue(null) } },
        { provide: GoogleAuthService, useValue: { verifyIdToken: jest.fn() } },
        { provide: AppleAuthService, useValue: apple },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  it('logs in via existing OAuthAccount (no new user)', async () => {
    apple.verifyIdentityToken.mockResolvedValue({ sub: 'ap1', email: 'a@b.com', isPrivateEmail: false });
    prisma.oAuthAccount.findUnique.mockResolvedValue({ id: 'oa1', userId: 'u1' });
    prisma.user.findUnique.mockResolvedValue(baseUser);
    const res = await service.loginWithApple('tok');
    expect(prisma.oAuthAccount.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { provider_providerUserId: { provider: 'apple', providerUserId: 'ap1' } } }),
    );
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(res.tokens.accessToken).toBe('tok');
  });

  it('auto-links to existing user with same email', async () => {
    apple.verifyIdentityToken.mockResolvedValue({ sub: 'ap1', email: 'a@b.com', isPrivateEmail: false });
    prisma.oAuthAccount.findUnique.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue(baseUser);
    prisma.user.findUnique.mockResolvedValue(baseUser);
    await service.loginWithApple('tok');
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.oAuthAccount.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ provider: 'apple', providerUserId: 'ap1', userId: 'u1' }) }),
    );
  });

  it('creates a new user (relay email) using fullName as displayName', async () => {
    apple.verifyIdentityToken.mockResolvedValue({ sub: 'ap1', email: 'xyz@privaterelay.appleid.com', isPrivateEmail: true });
    prisma.oAuthAccount.findUnique.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({ ...baseUser, id: 'u2', email: 'xyz@privaterelay.appleid.com', displayName: 'Yeni Kullanıcı' });
    prisma.user.create.mockResolvedValue({ id: 'u2', email: 'xyz@privaterelay.appleid.com', isSeller: false });
    await service.loginWithApple('tok', 'Yeni Kullanıcı');
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({
        email: 'xyz@privaterelay.appleid.com', passwordHash: null, isEmailVerified: true, isSeller: false, displayName: 'Yeni Kullanıcı',
      }) }),
    );
    expect(prisma.oAuthAccount.create).toHaveBeenCalled();
  });

  it('new user without fullName falls back to email prefix', async () => {
    apple.verifyIdentityToken.mockResolvedValue({ sub: 'ap1', email: 'new@b.com', isPrivateEmail: false });
    prisma.oAuthAccount.findUnique.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({ ...baseUser, id: 'u3', email: 'new@b.com', displayName: 'new' });
    prisma.user.create.mockResolvedValue({ id: 'u3', email: 'new@b.com', isSeller: false });
    await service.loginWithApple('tok');
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ displayName: 'new' }) }),
    );
  });
});
```

- [ ] **Step 4: Testin fail ettiğini doğrula**

Run: `cd apps/api && npm test -- auth-apple.service.spec`
Expected: FAIL — "service.loginWithApple is not a function" (ve AppleAuthService import hatası yoksa).

- [ ] **Step 5: AppleAuthService'i AuthService'e enjekte et**

`apps/api/src/modules/auth/auth.service.ts` başındaki importlara ekle (google-auth.service importunun yanına):

```ts
import { AppleAuthService } from './apple-auth.service';
```

Constructor'da `private readonly googleAuthService: GoogleAuthService,` satırının hemen altına ekle:

```ts
    private readonly appleAuthService: AppleAuthService,
```

- [ ] **Step 6: loginWithApple metodunu ekle**

`apps/api/src/modules/auth/auth.service.ts` içinde `loginWithGoogle` metodunun kapanış `}`'inden hemen sonra ekle:

```ts
  /**
   * Apple identity token ile giriş: doğrula → OAuthAccount bul → email ile oto-bağla
   * → yoksa yeni kullanıcı. Relay email olduğu gibi kaydedilir; kimlik anahtarı sub.
   * fullName yalnız ilk yetkilendirmede (yeni kullanıcı) gelir.
   */
  async loginWithApple(identityToken: string, fullName?: string): Promise<AuthResponseDto> {
    const profile = await this.appleAuthService.verifyIdentityToken(identityToken);

    // 1) Mevcut OAuthAccount?
    const existing = await this.prisma.oAuthAccount.findUnique({
      where: { provider_providerUserId: { provider: 'apple', providerUserId: profile.sub } },
    });
    if (existing) {
      return this.buildUserAuthResponse(existing.userId);
    }

    // 2) Aynı e-postalı (silinmemiş) kullanıcı? → oto-bağla.
    //    Relay email genelde eşleşmez; bu yol daha çok "gerçek email paylaşıldı" durumu.
    const byEmail = await this.prisma.user.findFirst({
      where: { email: profile.email, deletedAt: null },
    });
    if (byEmail) {
      await this.prisma.oAuthAccount.create({
        data: { provider: 'apple', providerUserId: profile.sub, email: profile.email, userId: byEmail.id },
      });
      return this.buildUserAuthResponse(byEmail.id);
    }

    // 3) Yeni kullanıcı
    const displayName = fullName?.trim() || profile.email.split('@')[0];
    const created = await this.prisma.user.create({
      data: {
        email: profile.email,
        passwordHash: null,
        displayName,
        isEmailVerified: true,
        isSeller: false,
      },
    });
    await this.prisma.oAuthAccount.create({
      data: { provider: 'apple', providerUserId: profile.sub, email: profile.email, userId: created.id },
    });
    return this.buildUserAuthResponse(created.id);
  }
```

- [ ] **Step 7: Testin geçtiğini doğrula**

Run: `cd apps/api && npm test -- auth-apple.service.spec`
Expected: PASS (4 test).

- [ ] **Step 8: Endpoint'i controller'a ekle**

`apps/api/src/modules/auth/auth.controller.ts` importlarında `GoogleAuthDto,` satırının yanına `AppleAuthDto,` ekle. Ardından `google()` metodunun kapanışından sonra ekle:

```ts
  /**
   * POST /auth/apple — Apple identity token ile giriş/kayıt
   */
  @Post('apple')
  @Public()
  @HttpCode(HttpStatus.OK)
  async apple(
    @Body() dto: AppleAuthDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const result = await this.authService.loginWithApple(dto.identityToken, dto.fullName);
    if (result?.tokens) {
      setAuthCookies(res, result.tokens, { admin: false });
    }
    return result;
  }
```

- [ ] **Step 9: AppleAuthService'i module'e provider olarak ekle**

`apps/api/src/modules/auth/auth.module.ts` içinde `import { GoogleAuthService } from './google-auth.service';` altına ekle:

```ts
import { AppleAuthService } from './apple-auth.service';
```

`providers` dizisinde `GoogleAuthService,` satırının altına ekle:

```ts
    AppleAuthService,
```

- [ ] **Step 10: Tüm auth testleri + derleme geçiyor mu doğrula**

Run: `cd apps/api && npm test -- auth && npx tsc --noEmit`
Expected: Tüm auth testleri PASS, tsc hatasız.

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/modules/auth
git commit -m "feat(api/auth): POST /auth/apple — Apple ile giriş/kayıt (OAuthAccount eşleme)"
```

---

### Task 4: Mobil — expo-apple-authentication kurulumu + servis

**Files:**
- Modify: `apps/mobile/package.json` (dependency)
- Modify: `apps/mobile/app.json` (plugin + ios.usesAppleSignIn)
- Create: `apps/mobile/src/services/appleSignin.ts`

**Interfaces:**
- Produces:
  - `isAppleAvailable(): Promise<boolean>`
  - `signInWithApple(): Promise<{ identityToken: string; fullName?: string }>`

- [ ] **Step 1: Paketi kur**

Run: `cd apps/mobile && npx expo install expo-apple-authentication`
Expected: `expo-apple-authentication` package.json'a eklenir.

- [ ] **Step 2: app.json — plugin + iOS flag**

`apps/mobile/app.json`:
- `expo.ios` objesine `"usesAppleSignIn": true` ekle (bundleIdentifier'ın yanına).
- `expo.plugins` dizisine `"expo-apple-authentication"` string'ini ekle (google-signin plugin bloğunun yanına).

Sonuç `ios` bloğu şöyle olmalı (ilgili satır):

```json
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.tarodan.app",
      "usesAppleSignIn": true,
      "buildNumber": "1",
```

- [ ] **Step 3: JSON geçerliliğini doğrula**

Run: `cd apps/mobile && node -e "require('./app.json'); console.log('ok')"`
Expected: `ok`

- [ ] **Step 4: appleSignin servisini yaz**

Create `apps/mobile/src/services/appleSignin.ts`:

```ts
import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';

/**
 * Apple ile giriş bu platformda yapılabilir mi?
 * Buton yalnızca true ise gösterilmeli (yalnız iOS + destekleyen cihaz).
 */
export async function isAppleAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * Apple ile giriş; backend'e gönderilecek identityToken (+ ilk seferde fullName) döner.
 * Kullanıcı iptal ederse ERR_REQUEST_CANCELED fırlatır (çağıran sessiz geçer).
 */
export async function signInWithApple(): Promise<{ identityToken: string; fullName?: string }> {
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });
  const identityToken = credential.identityToken;
  if (!identityToken) throw new Error('Apple identityToken alınamadı');
  const parts = [credential.fullName?.givenName, credential.fullName?.familyName].filter(Boolean);
  const fullName = parts.length ? parts.join(' ') : undefined;
  return { identityToken, fullName };
}
```

- [ ] **Step 5: TypeScript derleme kontrolü**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: appleSignin.ts kaynaklı hata yok.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/package.json apps/mobile/package-lock.json apps/mobile/app.json apps/mobile/src/services/appleSignin.ts
git commit -m "feat(mobile/ios): expo-apple-authentication kurulumu + appleSignin servisi"
```

---

### Task 5: Mobil — API metodu + login ekranı Apple butonu

**Files:**
- Modify: `apps/mobile/src/services/api.ts` (`authApi.loginWithApple`)
- Modify: `apps/mobile/app/(auth)/login.tsx` (import, state, handler, buton, stil)

**Interfaces:**
- Consumes: `signInWithApple`, `isAppleAvailable` (Task 4); `authApi.loginWithApple`; store `login(accessToken, user, refreshToken)`.
- Produces: kullanıcı görünür Apple butonu + `POST /auth/apple` çağrısı.

- [ ] **Step 1: api.ts'e loginWithApple ekle**

`apps/mobile/src/services/api.ts` içinde `loginWithGoogle` satırının hemen altına ekle:

```ts
  loginWithApple: (identityToken: string, fullName?: string) =>
    api.post('/auth/apple', { identityToken, fullName }),
```

- [ ] **Step 2: login.tsx — import ve state**

`apps/mobile/app/(auth)/login.tsx`:

googleSignin import satırının (`import { signInWithGoogle, isGoogleConfigured } ...`) altına ekle:

```ts
import { signInWithApple, isAppleAvailable } from '../../src/services/appleSignin';
```

React import'unun `useState` içerdiğinden emin ol. `const [googleLoading, setGoogleLoading] = useState(false);` satırının altına ekle:

```ts
  const [appleLoading, setAppleLoading] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);
```

Component gövdesinde, mevcut bir `useEffect` yoksa, `handleGoogle` tanımının üstüne ekle (React'ten `useEffect` import edilmeli):

```ts
  useEffect(() => {
    isAppleAvailable().then(setAppleAvailable);
  }, []);
```

- [ ] **Step 3: login.tsx — handleApple handler**

`handleGoogle` fonksiyonunun kapanış `};`'inden sonra ekle:

```ts
  const handleApple = async () => {
    if (appleLoading) return;
    setAppleLoading(true);
    try {
      const { identityToken, fullName } = await signInWithApple();
      const response = await authApi.loginWithApple(identityToken, fullName);
      const { tokens, user } = response.data as any;
      await login(tokens.accessToken, user, tokens.refreshToken);
      router.push('/' as never);
    } catch (e: any) {
      // Kullanıcı iptali sessiz geçilir.
      if (e?.code === 'ERR_REQUEST_CANCELED') return;
      const apiMsg = e?.response?.data?.message;
      const detail = apiMsg || e?.message || 'Bilinmeyen hata';
      const code = e?.code ? ` (kod: ${e.code})` : '';
      appAlert('Apple ile giriş başarısız', `${detail}${code}`);
    } finally {
      setAppleLoading(false);
    }
  };
```

- [ ] **Step 4: login.tsx — Apple butonu**

Google butonu bloğunun (`{isGoogleConfigured() && ( ... )}`) hemen altına ekle:

```tsx
        {appleAvailable && (
          <TouchableOpacity
            testID="login-apple-button"
            onPress={handleApple}
            accessibilityRole="button"
            accessibilityLabel="Apple ile devam et"
            disabled={loginMutation.isPending || appleLoading}
            style={[styles.appleButton, (loginMutation.isPending || appleLoading) && { opacity: 0.6 }]}
          >
            {appleLoading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Ionicons name="logo-apple" size={18} color="#FFFFFF" />
            )}
            <Text style={styles.appleButtonText}>
              {appleLoading ? 'Giriş yapılıyor…' : 'Apple ile devam et'}
            </Text>
          </TouchableOpacity>
        )}
```

> Not: `TouchableOpacity`, `ActivityIndicator`, `Text`, `Ionicons` bu dosyada Google butonunda zaten kullanılıyor; ek import gerekmez. `styles.googleButtonText`'in adını kontrol et — Google butonundaki metin stili neyse Apple metni için `appleButtonText` ekleyeceğiz (Step 5).

- [ ] **Step 5: login.tsx — Apple buton stilleri**

StyleSheet içinde `googleButton: { ... }` bloğunun altına ekle:

```ts
  appleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    borderRadius: 12,
    backgroundColor: '#000000',
    marginTop: 12,
  },
  appleButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
```

- [ ] **Step 6: TypeScript derleme kontrolü**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: login.tsx / api.ts kaynaklı hata yok.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/services/api.ts "apps/mobile/app/(auth)/login.tsx"
git commit -m "feat(mobile/ios): login ekranına Apple ile giriş butonu + akışı"
```

> **Doğrulama (native, kod dışı):** Apple butonu ve akışı yalnız gerçek iOS build'de (development client veya TestFlight) test edilebilir; simülatör Apple Sign-In'i destekler (iOS 13+ ayarlı Apple ID ile). Yeni bir EAS development/preview build alıp iOS'ta hem Google hem Apple butonlarının göründüğünü ve giriş yapabildiğini doğrula.

---

## Self-Review

- **Spec coverage:** Bölüm A → Task 1 (+ API env notu). Bölüm B API → Task 2 (verify servisi) + Task 3 (endpoint/eşleme/relay/fullName). Bölüm B mobil → Task 4 (paket/config/servis) + Task 5 (buton/akış). DB: yeni model yok — mevcut OAuthAccount, Task 3'te kullanılıyor. Test: Task 2 servis unit + Task 3 üç+ eşleme senaryosu (relay ve fullName-yok dahil). ✓
- **Placeholder taraması:** Tüm kod blokları tam; TBD/TODO yok. ✓
- **Tip tutarlılığı:** `AppleProfile { sub, email, isPrivateEmail }` Task 2'de tanımlı, Task 3 testinde birebir kullanılıyor. `loginWithApple(identityToken, fullName?)` imzası Task 3 (service), controller ve mobil `authApi.loginWithApple(identityToken, fullName?)` ile eşleşiyor. `signInWithApple()` dönüşü `{ identityToken, fullName? }` Task 4↔Task 5 uyumlu. ✓
