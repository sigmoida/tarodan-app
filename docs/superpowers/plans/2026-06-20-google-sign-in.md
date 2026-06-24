# Google ile Giriş (Web + Mobil) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Web ve mobilde "Google ile devam et" girişi — istemci Google'dan id_token alır, backend doğrulayıp kullanıcıyı bul-veya-oluştur/bağlar ve mevcut JWT'mizi döner.

**Architecture:** "ID token doğrulama" akışı. Yeni `POST /auth/google` endpoint'i `google-auth-library` ile id_token'ı doğrular (`email_verified` + audience), `OAuthAccount` tablosu üzerinden hesabı bulur/bağlar/oluşturur, mevcut `generateTokens` ile `AuthResponseDto` döner. Web `@react-oauth/google`, mobil `@react-native-google-signin/google-signin` kullanır.

**Tech Stack:** NestJS + Prisma (PostgreSQL), `google-auth-library`, Next.js + `@react-oauth/google`, Expo + `@react-native-google-signin/google-signin`, Jest.

## Global Constraints

- Provider değeri tam olarak `'google'` (string). Google `sub` → `OAuthAccount.providerUserId`.
- `email_verified !== true` olan token REDDEDİLİR (`UnauthorizedException`).
- Oto-bağlama: Google e-postası mevcut `User.email` ile eşleşirse o hesaba `OAuthAccount` eklenir (yeni user açılmaz).
- Yeni Google kullanıcısı alanları: `displayName`=Google adı (boşsa e-postanın @ öncesi), `avatarUrl`=Google resmi, `email`, `isEmailVerified=true`, `isSeller=false`, `passwordHash=null`.
- Endpoint public (`@Public()`), `POST /auth/google`, gövde `{ idToken: string }`.
- Backend audience = tanımlı olan `GOOGLE_CLIENT_ID_WEB`, `GOOGLE_CLIENT_ID_IOS`, `GOOGLE_CLIENT_ID_ANDROID` env'lerinin listesi.
- Admin'e sosyal giriş YOK. Apple YOK (sonraki faz).
- Gerçek Google Client ID'leri kullanıcı tarafından sağlanır; kod ID'ler env'e girilince çalışır. Kod, ID yokken mevcut email/şifre akışını bozmaz.
- Mevcut email/şifre login/register akışı değişmez (sadece yanına Google butonu eklenir).

---

## File Structure

**Backend (apps/api):**
- Modify: `prisma/schema.prisma` — `User.passwordHash` nullable, `User.oauthAccounts` ilişki, yeni `OAuthAccount` model.
- Create: migration (prisma migrate dev).
- Create: `src/modules/auth/google-auth.service.ts` — id_token doğrulayıcı.
- Modify: `src/modules/auth/auth.service.ts` — `loginWithGoogle` + `buildUserAuthResponse` helper.
- Create: `src/modules/auth/dto/google-auth.dto.ts` — `GoogleAuthDto`.
- Modify: `src/modules/auth/dto/index.ts` — export GoogleAuthDto.
- Modify: `src/modules/auth/auth.controller.ts` — `POST /auth/google`.
- Modify: `src/modules/auth/auth.module.ts` — `GoogleAuthService` provider.
- Test: `src/modules/auth/google-auth.service.spec.ts`, `src/modules/auth/auth-google.service.spec.ts`.
- Modify: `.env` ve (varsa) `.env.example` — GOOGLE_CLIENT_ID_* .

**Web (apps/web):**
- Modify: `src/lib/api.ts` — `authApi.loginWithGoogle`.
- Modify: `src/stores/authStore.ts` — `loginWithGoogle(idToken)`.
- Create: `src/components/auth/GoogleSignInButton.tsx` — buton + provider sarmalayıcı kullanımı.
- Modify: `src/app/QueryProvider.tsx` veya layout — `GoogleOAuthProvider` (kökte).
- Modify: `src/app/login/page.tsx`, `src/app/register/page.tsx` — butonu ekle.
- Modify: web `.env` — `NEXT_PUBLIC_GOOGLE_CLIENT_ID`.

**Mobil (apps/mobile):**
- Modify: `package.json` — `@react-native-google-signin/google-signin`.
- Modify: `app.config.*` / `app.json` — plugin.
- Create: `src/services/googleSignin.ts` — configure + signIn helper.
- Modify: `src/services/api.ts` — `authApi.loginWithGoogle`.
- Modify: `app/(auth)/login.tsx` — Google butonu + handler.
- Modify: mobil `.env.example` — `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`.

---

## Task 1: DB — OAuthAccount tablosu + passwordHash nullable

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: migration

**Interfaces:**
- Produces: Prisma `OAuthAccount` modeli (`provider`, `providerUserId`, `userId`, `email`), `User.passwordHash` nullable, `User.oauthAccounts` ilişkisi.

- [ ] **Step 1: schema.prisma — passwordHash nullable**

`User` modelinde:
```prisma
  passwordHash          String?   @map("password_hash")
```
(eski: `String @map("password_hash")` → sonuna `?`)

- [ ] **Step 2: schema.prisma — User'a ilişki alanı ekle**

`User` modelinin ilişkiler bölümüne (diğer `[]` ilişkilerin yanına) ekle:
```prisma
  oauthAccounts         OAuthAccount[]
```

- [ ] **Step 3: schema.prisma — OAuthAccount modeli ekle**

Dosyanın uygun bir yerine (User modelinden sonra) ekle:
```prisma
model OAuthAccount {
  id             String   @id @default(uuid())
  userId         String   @map("user_id")
  provider       String
  providerUserId String   @map("provider_user_id")
  email          String?
  createdAt      DateTime @default(now()) @map("created_at")
  user           User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerUserId])
  @@index([userId])
  @@map("oauth_accounts")
}
```

- [ ] **Step 4: Migration oluştur ve uygula**

Run: `cd apps/api && npx prisma migrate dev --name add_oauth_accounts`
Expected: Migration oluşturulur, uygulanır; "Your database is now in sync". `passwordHash` nullable olduğu için mevcut satırlar etkilenmez (NOT NULL → NULL daralmaz, güvenli).

- [ ] **Step 5: Prisma client üret**

Run: `cd apps/api && npx prisma generate`
Expected: hata yok.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(api): OAuthAccount tablosu + passwordHash nullable (sosyal giriş)"
```

---

## Task 2: Backend — GoogleAuthService (id_token doğrulama)

**Files:**
- Create: `apps/api/src/modules/auth/google-auth.service.ts`
- Test: `apps/api/src/modules/auth/google-auth.service.spec.ts`
- Modify: `apps/api/package.json` (`google-auth-library`)

**Interfaces:**
- Produces: `GoogleAuthService.verifyIdToken(idToken: string): Promise<{ sub: string; email: string; name?: string; picture?: string }>` — geçersiz token / `email_verified !== true` / `email` yok → `UnauthorizedException`.

- [ ] **Step 1: Bağımlılığı ekle**

Run: `pnpm --filter @tarodan/api add google-auth-library`
Expected: `google-auth-library` `apps/api/package.json`'a eklenir.

- [ ] **Step 2: Failing test yaz**

```typescript
// apps/api/src/modules/auth/google-auth.service.spec.ts
import { Test } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleAuthService } from './google-auth.service';

describe('GoogleAuthService', () => {
  let service: GoogleAuthService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        GoogleAuthService,
        { provide: ConfigService, useValue: { get: (k: string) => (k === 'GOOGLE_CLIENT_ID_WEB' ? 'web-client-id' : undefined) } },
      ],
    }).compile();
    service = moduleRef.get(GoogleAuthService);
  });

  const mockTicket = (payload: any) => ({ getPayload: () => payload });

  it('returns normalized payload for a valid verified token', async () => {
    (service as any).client.verifyIdToken = jest.fn().mockResolvedValue(
      mockTicket({ sub: 'g-1', email: 'a@b.com', email_verified: true, name: 'Ali', picture: 'http://x/y.png' }),
    );
    const r = await service.verifyIdToken('tok');
    expect(r).toEqual({ sub: 'g-1', email: 'a@b.com', name: 'Ali', picture: 'http://x/y.png' });
  });

  it('rejects when email_verified is false', async () => {
    (service as any).client.verifyIdToken = jest.fn().mockResolvedValue(
      mockTicket({ sub: 'g-1', email: 'a@b.com', email_verified: false }),
    );
    await expect(service.verifyIdToken('tok')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects when verifyIdToken throws (invalid token)', async () => {
    (service as any).client.verifyIdToken = jest.fn().mockRejectedValue(new Error('bad token'));
    await expect(service.verifyIdToken('tok')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
```

- [ ] **Step 3: Testi çalıştır (fail)**

Run: `pnpm --filter @tarodan/api test -- google-auth.service`
Expected: FAIL — `Cannot find module './google-auth.service'`.

- [ ] **Step 4: GoogleAuthService implement et**

```typescript
// apps/api/src/modules/auth/google-auth.service.ts
import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';

export interface GoogleProfile {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
}

@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);
  private readonly client = new OAuth2Client();

  constructor(private readonly configService: ConfigService) {}

  private audience(): string[] {
    return [
      this.configService.get<string>('GOOGLE_CLIENT_ID_WEB'),
      this.configService.get<string>('GOOGLE_CLIENT_ID_IOS'),
      this.configService.get<string>('GOOGLE_CLIENT_ID_ANDROID'),
    ].filter((x): x is string => !!x);
  }

  async verifyIdToken(idToken: string): Promise<GoogleProfile> {
    let payload: any;
    try {
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: this.audience(),
      });
      payload = ticket.getPayload();
    } catch (e) {
      this.logger.warn(`Google token verify failed: ${e instanceof Error ? e.message : e}`);
      throw new UnauthorizedException('Google oturumu doğrulanamadı');
    }
    if (!payload?.sub || !payload?.email) {
      throw new UnauthorizedException('Google oturumu geçersiz');
    }
    if (payload.email_verified !== true) {
      throw new UnauthorizedException('Google hesabınızın e-postası doğrulanmamış');
    }
    return {
      sub: payload.sub,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
    };
  }
}
```

- [ ] **Step 5: Testi çalıştır (pass)**

Run: `pnpm --filter @tarodan/api test -- google-auth.service`
Expected: PASS (3 test).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/auth/google-auth.service.ts apps/api/src/modules/auth/google-auth.service.spec.ts apps/api/package.json ../../pnpm-lock.yaml
git commit -m "feat(api): GoogleAuthService — id_token doğrulama"
```

---

## Task 3: Backend — AuthService.loginWithGoogle (bul/bağla/oluştur)

**Files:**
- Modify: `apps/api/src/modules/auth/auth.service.ts`
- Test: `apps/api/src/modules/auth/auth-google.service.spec.ts`

**Interfaces:**
- Consumes: `GoogleAuthService.verifyIdToken` (Task 2), mevcut `generateTokens(userId,email,isSeller)`, `resolveAvatarUrl`.
- Produces: `AuthService.loginWithGoogle(idToken: string): Promise<AuthResponseDto>`; private `buildUserAuthResponse(userId: string): Promise<AuthResponseDto>`.

- [ ] **Step 1: GoogleAuthService'i AuthService'e enjekte et**

`auth.service.ts` importlarına ekle:
```typescript
import { GoogleAuthService } from './google-auth.service';
```
Constructor'a son parametre olarak ekle (mevcut `storageService`'ten sonra):
```typescript
    private readonly googleAuthService: GoogleAuthService,
```

- [ ] **Step 2: Failing test yaz**

```typescript
// apps/api/src/modules/auth/auth-google.service.spec.ts
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { GoogleAuthService } from './google-auth.service';
import { PrismaService } from '../../prisma';
import { NotificationService } from '../notification/notification.service';
import { CacheService } from '../cache/cache.service';
import { StorageService } from '../storage/storage.service';

describe('AuthService.loginWithGoogle', () => {
  let service: AuthService;
  const google = { verifyIdToken: jest.fn() };
  const baseUser = {
    id: 'u1', email: 'a@b.com', phone: null, displayName: 'Ali', avatarUrl: null,
    isVerified: false, isSeller: false, sellerType: null, createdAt: new Date(),
    membership: null,
  };
  const prisma: any = {
    oAuthAccount: { findUnique: jest.fn(), create: jest.fn().mockResolvedValue({ id: 'oa1' }) },
    user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn().mockResolvedValue({}) },
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
        { provide: GoogleAuthService, useValue: google },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  it('logs in via existing OAuthAccount (no new user)', async () => {
    google.verifyIdToken.mockResolvedValue({ sub: 'g1', email: 'a@b.com', name: 'Ali' });
    prisma.oAuthAccount.findUnique.mockResolvedValue({ id: 'oa1', userId: 'u1' });
    prisma.user.findUnique.mockResolvedValue(baseUser); // buildUserAuthResponse re-query
    const res = await service.loginWithGoogle('tok');
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.oAuthAccount.create).not.toHaveBeenCalled();
    expect(res.user.email).toBe('a@b.com');
    expect(res.tokens.accessToken).toBe('tok');
  });

  it('auto-links to existing user with same email', async () => {
    google.verifyIdToken.mockResolvedValue({ sub: 'g1', email: 'a@b.com', name: 'Ali' });
    prisma.oAuthAccount.findUnique.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValueOnce(baseUser).mockResolvedValueOnce(baseUser);
    await service.loginWithGoogle('tok');
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.oAuthAccount.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ provider: 'google', providerUserId: 'g1', userId: 'u1' }) }),
    );
  });

  it('creates a new user when no account/email match', async () => {
    google.verifyIdToken.mockResolvedValue({ sub: 'g1', email: 'new@b.com', name: 'Yeni', picture: 'http://x/y.png' });
    prisma.oAuthAccount.findUnique.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...baseUser, id: 'u2', email: 'new@b.com', displayName: 'Yeni' });
    prisma.user.create.mockResolvedValue({ id: 'u2', email: 'new@b.com', isSeller: false });
    await service.loginWithGoogle('tok');
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ email: 'new@b.com', passwordHash: null, isEmailVerified: true, isSeller: false }) }),
    );
    expect(prisma.oAuthAccount.create).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Testi çalıştır (fail)**

Run: `pnpm --filter @tarodan/api test -- auth-google.service`
Expected: FAIL — `loginWithGoogle is not a function`.

- [ ] **Step 4: buildUserAuthResponse + loginWithGoogle implement et**

`auth.service.ts` içine (sınıf gövdesine, `generateTokens`'ın yakınına) ekle:

```typescript
  /**
   * Verilen userId için AuthResponseDto üretir (login response ile aynı şekil).
   */
  private async buildUserAuthResponse(userId: string): Promise<AuthResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { membership: { include: { tier: true } } },
    });
    if (!user) {
      throw new UnauthorizedException('Kullanıcı bulunamadı');
    }

    const tokens = await this.generateTokens(user.id, user.email, user.isSeller);

    let membershipData = undefined;
    if (user.membership && user.membership.tier) {
      const tier = user.membership.tier;
      if (tier?.type && tier?.name) {
        membershipData = {
          tier: { type: String(tier.type), name: String(tier.name) },
          expiresAt: user.membership.currentPeriodEnd
            ? new Date(user.membership.currentPeriodEnd).toISOString()
            : undefined,
        };
      }
    }

    const resolvedAvatarUrl = await this.resolveAvatarUrl(user.avatarUrl);

    return {
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone ?? undefined,
        displayName: user.displayName,
        avatarUrl: resolvedAvatarUrl,
        isVerified: user.isVerified,
        isSeller: user.isSeller,
        sellerType: user.sellerType ?? undefined,
        createdAt: user.createdAt,
        membership: membershipData,
      },
      tokens,
    };
  }

  /**
   * Google id_token ile giriş: doğrula → OAuthAccount bul → email ile oto-bağla
   * → yoksa yeni kullanıcı. Mevcut JWT akışını kullanır.
   */
  async loginWithGoogle(idToken: string): Promise<AuthResponseDto> {
    const profile = await this.googleAuthService.verifyIdToken(idToken);

    // 1) Mevcut OAuthAccount?
    const existing = await this.prisma.oAuthAccount.findUnique({
      where: { provider_providerUserId: { provider: 'google', providerUserId: profile.sub } },
    });
    if (existing) {
      return this.buildUserAuthResponse(existing.userId);
    }

    // 2) Aynı e-postalı kullanıcı? → oto-bağla
    const byEmail = await this.prisma.user.findUnique({ where: { email: profile.email } });
    if (byEmail) {
      await this.prisma.oAuthAccount.create({
        data: { provider: 'google', providerUserId: profile.sub, email: profile.email, userId: byEmail.id },
      });
      return this.buildUserAuthResponse(byEmail.id);
    }

    // 3) Yeni kullanıcı
    const displayName = profile.name?.trim() || profile.email.split('@')[0];
    const created = await this.prisma.user.create({
      data: {
        email: profile.email,
        passwordHash: null,
        displayName,
        avatarUrl: profile.picture ?? null,
        isEmailVerified: true,
        isSeller: false,
      },
    });
    await this.prisma.oAuthAccount.create({
      data: { provider: 'google', providerUserId: profile.sub, email: profile.email, userId: created.id },
    });
    return this.buildUserAuthResponse(created.id);
  }
```

> Not: `provider_providerUserId` Prisma'nın `@@unique([provider, providerUserId])` için ürettiği composite-key adıdır.

- [ ] **Step 5: Testi çalıştır (pass)**

Run: `pnpm --filter @tarodan/api test -- auth-google.service`
Expected: PASS (3 test).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/auth/auth.service.ts apps/api/src/modules/auth/auth-google.service.spec.ts
git commit -m "feat(api): AuthService.loginWithGoogle — bul/oto-bağla/oluştur"
```

---

## Task 4: Backend — Controller endpoint + DTO + modül + env

**Files:**
- Create: `apps/api/src/modules/auth/dto/google-auth.dto.ts`
- Modify: `apps/api/src/modules/auth/dto/index.ts`
- Modify: `apps/api/src/modules/auth/auth.controller.ts`
- Modify: `apps/api/src/modules/auth/auth.module.ts`
- Modify: `apps/api/.env` (ve varsa `.env.example`)

**Interfaces:**
- Consumes: `AuthService.loginWithGoogle` (Task 3), `GoogleAuthService` (Task 2).
- Produces: `POST /auth/google` → `AuthResponseDto`.

- [ ] **Step 1: GoogleAuthDto oluştur**

```typescript
// apps/api/src/modules/auth/dto/google-auth.dto.ts
import { IsString, IsNotEmpty } from 'class-validator';

export class GoogleAuthDto {
  @IsString()
  @IsNotEmpty()
  idToken!: string;
}
```

- [ ] **Step 2: DTO'yu export et**

`apps/api/src/modules/auth/dto/index.ts` sonuna ekle:
```typescript
export * from './google-auth.dto';
```

- [ ] **Step 3: Controller endpoint ekle**

`auth.controller.ts` importuna `GoogleAuthDto`'yu dahil et (mevcut `from '...dto'` toplu importuna ekle veya satır ekle). Login route'undan sonra ekle:
```typescript
  /**
   * POST /auth/google — Google id_token ile giriş/kayıt
   */
  @Post('google')
  @Public()
  async google(@Body() dto: GoogleAuthDto): Promise<AuthResponseDto> {
    return this.authService.loginWithGoogle(dto.idToken);
  }
```
(`AuthResponseDto` zaten controller'da import'lu; değilse dto importuna ekle.)

- [ ] **Step 4: Modüle GoogleAuthService ekle**

`auth.module.ts` importuna ekle:
```typescript
import { GoogleAuthService } from './google-auth.service';
```
`providers` dizisine `GoogleAuthService` ekle (AuthService yanına).

- [ ] **Step 5: Env değişkenleri (placeholder)**

`apps/api/.env` sonuna ekle (gerçek değerler kullanıcı tarafından doldurulacak):
```
# Google Sign-In (audience). Gerçek Client ID'ler Google Cloud Console'dan.
GOOGLE_CLIENT_ID_WEB=
GOOGLE_CLIENT_ID_IOS=
GOOGLE_CLIENT_ID_ANDROID=
```
Varsa `apps/api/.env.example`'a da aynı satırları ekle.

- [ ] **Step 6: API build + smoke**

Run: `pnpm --filter @tarodan/api build`
Expected: 0 TS hatası.

- [ ] **Step 7: Endpoint smoke (geçersiz token 401 dönmeli)**

API çalışırken:
Run: `curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3001/api/auth/google -H 'Content-Type: application/json' -d '{"idToken":"invalid"}'`
Expected: `401` (audience boş olsa bile invalid token reddedilir; endpoint erişilebilir).

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/auth/ apps/api/.env apps/api/.env.example
git commit -m "feat(api): POST /auth/google endpoint + GoogleAuthDto + env"
```

---

## Task 5: Web — api + store + buton + provider

**Files:**
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/stores/authStore.ts`
- Create: `apps/web/src/components/auth/GoogleSignInButton.tsx`
- Modify: `apps/web/src/app/layout.tsx` (GoogleOAuthProvider)
- Modify: `apps/web/src/app/login/page.tsx`, `apps/web/src/app/register/page.tsx`
- Modify: `apps/web/package.json`, web `.env`

**Interfaces:**
- Consumes: `POST /auth/google` (Task 4).
- Produces: `authApi.loginWithGoogle(idToken)`, `useAuthStore().loginWithGoogle(idToken)`, `<GoogleSignInButton onSuccess?/>`.

- [ ] **Step 1: Paket ekle**

Run: `pnpm --filter @tarodan/web add @react-oauth/google`
Expected: pakete eklenir.

- [ ] **Step 2: api.ts — loginWithGoogle**

`apps/web/src/lib/api.ts` içinde `authApi` nesnesine ekle (login'in yanına):
```typescript
  loginWithGoogle: (idToken: string) =>
    api.post('/auth/google', { idToken }),
```

- [ ] **Step 3: authStore — loginWithGoogle**

`apps/web/src/stores/authStore.ts` AuthState interface'ine ekle (login yanına):
```typescript
  loginWithGoogle: (idToken: string) => Promise<void>;
```
Store gövdesine, mevcut `login` metodunun hemen ardından ekle:
```typescript
      loginWithGoogle: async (idToken: string) => {
        const response = await authApi.loginWithGoogle(idToken);
        const { user: apiUser, tokens } = response.data;
        const token = tokens.accessToken;
        const refreshToken = tokens.refreshToken;
        if (typeof window !== 'undefined') {
          localStorage.setItem('auth_token', token);
          if (refreshToken) localStorage.setItem('refresh_token', refreshToken);
        }
        const user = mapApiUser(apiUser);
        const limits = TIER_LIMITS[user.membershipTier];
        set({ user, token, refreshToken, isAuthenticated: true, limits });
      },
```

- [ ] **Step 4: GoogleSignInButton bileşeni**

```tsx
// apps/web/src/components/auth/GoogleSignInButton.tsx
'use client';
import { GoogleLogin } from '@react-oauth/google';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';

export function GoogleSignInButton({ onSuccess }: { onSuccess?: () => void }) {
  const loginWithGoogle = useAuthStore((s) => s.loginWithGoogle);
  // Client ID yoksa butonu hiç gösterme (geliştirmede patlamasın).
  if (!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) return null;
  return (
    <div className="flex justify-center">
      <GoogleLogin
        onSuccess={async (cred) => {
          if (!cred.credential) {
            toast.error('Google girişi başarısız');
            return;
          }
          try {
            await loginWithGoogle(cred.credential);
            onSuccess?.();
          } catch (e: any) {
            toast.error(e?.response?.data?.message || 'Google ile giriş başarısız');
          }
        }}
        onError={() => toast.error('Google girişi başarısız')}
        text="continue_with"
        shape="rectangular"
        width="320"
      />
    </div>
  );
}
```

- [ ] **Step 5: GoogleOAuthProvider'ı köke ekle**

`apps/web/src/app/layout.tsx` içinde, importlara:
```tsx
import { GoogleOAuthProvider } from '@react-oauth/google';
```
`<QueryProvider>` içeriğini, yalnızca client ID varsa provider ile sar; yoksa olduğu gibi bırak. En basit ve güvenli: provider'ı her durumda kullan (clientId boşsa GoogleLogin render edilmeyeceği için sorun olmaz):
```tsx
          <QueryProvider>
            <GoogleOAuthProvider clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || ''}>
              <RealtimeProvider />
              {/* ...mevcut içerik... */}
            </GoogleOAuthProvider>
          </QueryProvider>
```
(Mevcut `<RealtimeProvider />`, banner, `<LayoutShell>`, toaster içeriğini `GoogleOAuthProvider` içine al — sıralamayı bozmadan sar.)

- [ ] **Step 6: Login ve register sayfasına buton ekle**

`apps/web/src/app/login/page.tsx` — email/şifre formunun altına, mevcut ayraç/märkup tarzına uygun ekle:
```tsx
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
// ...form altında:
<div className="mt-4">
  <GoogleSignInButton onSuccess={() => router.push(redirect || '/')} />
</div>
```
`apps/web/src/app/register/page.tsx` — aynı butonu ekle:
```tsx
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
// ...form altında:
<div className="mt-4">
  <GoogleSignInButton onSuccess={() => router.push('/')} />
</div>
```
(İlgili sayfada `router`/`redirect` yoksa, o sayfanın mevcut başarı-yönlendirme mantığını kullan.)

- [ ] **Step 7: Env**

`apps/web/.env` sonuna:
```
NEXT_PUBLIC_GOOGLE_CLIENT_ID=
```

- [ ] **Step 8: Typecheck**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | grep -E "authStore|GoogleSignInButton|login/page|register/page|layout" || echo "no TS errors in changed files"`
Expected: değişen dosyalarda hata yok.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/lib/api.ts apps/web/src/stores/authStore.ts apps/web/src/components/auth/GoogleSignInButton.tsx apps/web/src/app/layout.tsx apps/web/src/app/login/page.tsx apps/web/src/app/register/page.tsx apps/web/package.json apps/web/.env ../../pnpm-lock.yaml
git commit -m "feat(web): Google ile giriş butonu + store/api entegrasyonu"
```

---

## Task 6: Mobil — google-signin config + buton

**Files:**
- Modify: `apps/mobile/package.json`
- Modify: `apps/mobile/app.config.ts` veya `app.json` (plugin)
- Create: `apps/mobile/src/services/googleSignin.ts`
- Modify: `apps/mobile/src/services/api.ts`
- Modify: `apps/mobile/app/(auth)/login.tsx`
- Modify: `apps/mobile/.env.example`

**Interfaces:**
- Consumes: `POST /auth/google` (Task 4), `useAuthStore().login(token, user, refreshToken)` (mevcut).
- Produces: `authApi.loginWithGoogle(idToken)`, `signInWithGoogle(): Promise<string>` (idToken döner).

- [ ] **Step 1: Paket ekle**

Run: `pnpm --filter @tarodan/mobile add @react-native-google-signin/google-signin`
Expected: pakete eklenir.

- [ ] **Step 2: Expo plugin ekle**

`apps/mobile/app.config.ts` (veya `app.json`) `plugins` dizisine ekle:
```
"@react-native-google-signin/google-signin"
```
(app.config.ts ise: `plugins: [..., '@react-native-google-signin/google-signin']`.)

- [ ] **Step 3: googleSignin servisi**

```typescript
// apps/mobile/src/services/googleSignin.ts
import { GoogleSignin } from '@react-native-google-signin/google-signin';

let configured = false;
function ensureConfigured() {
  if (configured) return;
  GoogleSignin.configure({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  });
  configured = true;
}

/** Google ile giriş; backend'e gönderilecek idToken döner. */
export async function signInWithGoogle(): Promise<string> {
  ensureConfigured();
  await GoogleSignin.hasPlayServices();
  const result: any = await GoogleSignin.signIn();
  const idToken = result?.idToken ?? result?.data?.idToken;
  if (!idToken) throw new Error('Google idToken alınamadı');
  return idToken;
}

export function isGoogleConfigured(): boolean {
  return !!process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
}
```

- [ ] **Step 4: api.ts — loginWithGoogle**

`apps/mobile/src/services/api.ts` `authApi` nesnesine ekle (login yanına):
```typescript
  loginWithGoogle: (idToken: string) =>
    api.post('/auth/google', { idToken }),
```

- [ ] **Step 5: Login ekranına buton + handler**

`apps/mobile/app/(auth)/login.tsx` içine:
```tsx
import { signInWithGoogle, isGoogleConfigured } from '../../src/services/googleSignin';
// component gövdesinde:
const handleGoogle = async () => {
  try {
    const idToken = await signInWithGoogle();
    const response = await authApi.loginWithGoogle(idToken);
    const { tokens, user } = response.data as any;
    await login(tokens.accessToken, user, tokens.refreshToken);
    router.push('/');
  } catch (e: any) {
    // kullanıcı iptal etabilir; sessiz geç veya toast göster
    if (e?.code !== 'SIGN_IN_CANCELLED') {
      console.warn('Google sign-in failed', e?.message);
    }
  }
};
```
Email/şifre formunun altına, yalnızca yapılandırılmışsa görünen bir buton ekle (mevcut buton stiline uygun `Pressable`):
```tsx
{isGoogleConfigured() && (
  <Pressable onPress={handleGoogle} style={/* mevcut secondary buton stili */}>
    <Ionicons name="logo-google" size={18} />
    <Text>Google ile devam et</Text>
  </Pressable>
)}
```
(`Pressable`, `Ionicons`, `Text` zaten import'lu; stil için ekrandaki mevcut buton stilini kullan.)

- [ ] **Step 6: Env örneği**

`apps/mobile/.env.example` sonuna:
```
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=
```

- [ ] **Step 7: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit 2>&1 | grep -E "googleSignin|services/api|\(auth\)/login" || echo "no TS errors in changed files"`
Expected: değişen dosyalarda hata yok.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/package.json apps/mobile/app.config.ts apps/mobile/app.json apps/mobile/src/services/googleSignin.ts apps/mobile/src/services/api.ts "apps/mobile/app/(auth)/login.tsx" apps/mobile/.env.example ../../pnpm-lock.yaml
git commit -m "feat(mobile): Google ile giriş — google-signin config + buton"
```

---

## Task 7: Uçtan uca doğrulama (Client ID gerektirir — kullanıcı sağlar)

**Files:** (yalnızca doğrulama)

- [ ] **Step 1: Backend testleri yeşil**

Run: `pnpm --filter @tarodan/api test -- google-auth.service auth-google.service`
Expected: tümü PASS.

- [ ] **Step 2: API build temiz**

Run: `pnpm --filter @tarodan/api build`
Expected: 0 TS hatası.

- [ ] **Step 3: Web manuel (Client ID girildikten sonra)**

`apps/web/.env`'e `NEXT_PUBLIC_GOOGLE_CLIENT_ID` ve `apps/api/.env`'e `GOOGLE_CLIENT_ID_WEB` gerçek değerleri girilir. Web login sayfasında "Google ile devam et" görünür; tıkla → Google hesabı seç → giriş yapılır, rozet/oturum açılır. Aynı e-postalı mevcut hesap varsa ona bağlanır.

Expected: Yeni Google kullanıcısı oluşur (passwordHash null, isSeller false); ikinci kez girişte yeni kayıt açılmaz.

- [ ] **Step 4: Mobil manuel (dev client gerekir, Expo Go değil)**

`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`/`IOS` girilir, dev client build alınır. Login ekranında Google butonu → giriş → token SecureStore'a yazılır, ana sayfaya gider.

Expected: Web ile aynı kullanıcı (aynı e-posta) tek hesapta birleşir.

> Bu task'ın 3-4. adımları gerçek Google Client ID'leri olmadan tamamlanamaz; kod hazır, ID'ler girilince doğrulanır.

---

## Notlar

- Apple ile giriş sonraki faz (Apple Developer Program $99/yıl + iOS App Store şartı).
- Admin paneline sosyal giriş eklenmez.
- Mevcut email/şifre akışı değişmez; Google butonu yanına eklenir.
- Mobil Google Sign-In native modül olduğu için Expo Go'da çalışmaz; dev client/prod build gerekir.
