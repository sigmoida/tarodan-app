# Web Apple ile giriş — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Web'e (`apps/web`) Apple ile giriş eklemek; mevcut `POST /auth/apple` endpoint'ini hem native hem web audience'ı kabul edecek şekilde genişletmek.

**Architecture:** Apple JS SDK popup akışı client'ta `id_token` üretir → `authStore.loginWithApple` → `POST /auth/apple`. Backend'de tek değişiklik: `apple-auth.service` audience'ı `[APPLE_CLIENT_ID, APPLE_SERVICES_ID]` dizisine çevrilir. Yeni endpoint/DB/migration yok — hepsi native ile ortak.

**Tech Stack:** NestJS + `apple-signin-auth` (API), Next.js + Zustand + Apple JS SDK (web).

## Global Constraints

- Apple web audience env: `APPLE_SERVICES_ID` (backend), `NEXT_PUBLIC_APPLE_SERVICES_ID` (web). Native bundle audience: `APPLE_CLIENT_ID` = `com.tarodan.app`.
- Web redirect URI env: `NEXT_PUBLIC_APPLE_REDIRECT_URI`.
- Apple JS SDK URL: `https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js`.
- Endpoint gövde alan adı `identityToken` (DTO ile eşleşmeli) — web api client `idToken`'ı `identityToken` olarak gönderir.
- Kullanıcı popup iptali (`error === 'popup_closed_by_user'`) sessiz geçilir.
- Audience dizisi boşsa fallback `['com.tarodan.app']` (native asla kırılmaz).
- API testleri: `apps/api`'de `npm test`. Web tsc: `apps/web`'de `npx tsc --noEmit`.

---

## File Structure

- `apps/api/src/modules/auth/apple-auth.service.ts` — audience tekil→dizi (Task 1).
- `apps/api/src/modules/auth/apple-auth.service.spec.ts` — audience dizisi + web token testi (Task 1).
- `apps/web/src/lib/api.ts` — `authApi.loginWithApple` (Task 2).
- `apps/web/src/stores/authStore.ts` — interface + `loginWithApple` (Task 2).
- `apps/web/src/components/auth/AppleSignInButton.tsx` — yeni buton + Apple JS script (Task 3, yeni).
- `apps/web/src/app/login/page.tsx` — `<AppleSignInButton>` yerleşimi (Task 3).

---

### Task 1: API — audience'ı native + web olarak genişlet

**Files:**
- Modify: `apps/api/src/modules/auth/apple-auth.service.ts`
- Test: `apps/api/src/modules/auth/apple-auth.service.spec.ts`

**Interfaces:**
- Consumes: `ConfigService.get('APPLE_CLIENT_ID' | 'APPLE_SERVICES_ID')`
- Produces: `AppleAuthService.verifyIdentityToken` davranışı değişmez (imza aynı); artık web Services ID audience'lı token'ları da kabul eder.

- [ ] **Step 1: Testi güncelle (failing) — audience artık dizi + web token kabulü**

`apps/api/src/modules/auth/apple-auth.service.spec.ts` içinde:

`beforeEach`'teki ConfigService mock'unu şununla değiştir:
```ts
        { provide: ConfigService, useValue: { get: (k: string) => (k === 'APPLE_CLIENT_ID' ? 'com.tarodan.app' : k === 'APPLE_SERVICES_ID' ? 'shop.tarodan.web' : undefined) } },
```

Test 1'deki (`returns normalized profile...`) audience assertion satırını şununla değiştir:
```ts
    expect(verify).toHaveBeenCalledWith('tok', expect.objectContaining({ audience: ['com.tarodan.app', 'shop.tarodan.web'] }));
```

Dosyanın sonuna (son `it`'ten sonra, `});` describe kapanışından önce) yeni test ekle:
```ts
  it('passes both native and web audiences (accepts a web Services ID token)', async () => {
    verify.mockResolvedValue({ sub: 'w-1', email: 'w@b.com', email_verified: true, is_private_email: false });
    const r = await service.verifyIdentityToken('tok');
    expect(verify).toHaveBeenCalledWith('tok', expect.objectContaining({ audience: ['com.tarodan.app', 'shop.tarodan.web'] }));
    expect(r.sub).toBe('w-1');
  });
```

- [ ] **Step 2: Testi çalıştır, FAIL doğrula**

Run: `cd /Users/gorkemsubas/dev/tarodan-app/apps/api && npm test -- apple-auth.service.spec`
Expected: FAIL — test 1 ve yeni test audience'ı dizi beklerken servis hâlâ `'com.tarodan.app'` (string) geçiyor.

- [ ] **Step 3: Servisi güncelle — `clientId()` → `audience(): string[]`**

`apps/api/src/modules/auth/apple-auth.service.ts` içinde `clientId()` metodunu şununla değiştir:
```ts
  private audience(): string[] {
    const list = [
      this.configService.get<string>('APPLE_CLIENT_ID'),
      this.configService.get<string>('APPLE_SERVICES_ID'),
    ].filter((x): x is string => !!x);
    return list.length ? list : ['com.tarodan.app'];
  }
```

Ve `verifyIdToken` çağrısındaki `audience: this.clientId()` satırını şununla değiştir:
```ts
        audience: this.audience(),
```

- [ ] **Step 4: Testi çalıştır, PASS doğrula (6 test)**

Run: `cd /Users/gorkemsubas/dev/tarodan-app/apps/api && npm test -- apple-auth.service.spec`
Expected: PASS (6 test).

- [ ] **Step 5: Tüm auth testleri hâlâ yeşil mi (native loginWithApple bozulmadı)**

Run: `cd /Users/gorkemsubas/dev/tarodan-app/apps/api && npm test -- auth`
Expected: tüm auth testleri PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/gorkemsubas/dev/tarodan-app
git add apps/api/src/modules/auth/apple-auth.service.ts apps/api/src/modules/auth/apple-auth.service.spec.ts
git commit -m "feat(api/auth): Apple audience'ına web Services ID ekle (native+web ortak doğrulama)"
```

> **Kod dışı not:** Prod + local API `.env`'ine `APPLE_SERVICES_ID=<web services id, örn. shop.tarodan.web>` eklenmeli.

---

### Task 2: Web — api client + authStore `loginWithApple`

**Files:**
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/stores/authStore.ts`

**Interfaces:**
- Consumes: `POST /auth/apple` (`{ identityToken, fullName? }` → `{ user }`, cookie'ler backend'de set edilir).
- Produces:
  - `authApi.loginWithApple(idToken: string, fullName?: string)`
  - `authStore.loginWithApple(idToken: string, fullName?: string): Promise<void>`

- [ ] **Step 1: api.ts'e `loginWithApple` ekle**

`apps/web/src/lib/api.ts` içinde `authApi` objesinde `loginWithGoogle` satırının hemen altına ekle:
```ts
  loginWithApple: (idToken: string, fullName?: string) =>
    api.post('/auth/apple', { identityToken: idToken, fullName }),
```

- [ ] **Step 2: authStore interface'ine ekle**

`apps/web/src/stores/authStore.ts` içinde `loginWithGoogle: (idToken: string) => Promise<void>;` satırının hemen altına ekle:
```ts
  loginWithApple: (idToken: string, fullName?: string) => Promise<void>;
```

- [ ] **Step 3: authStore implementasyonunu ekle**

`apps/web/src/stores/authStore.ts` içinde `loginWithGoogle` implementasyonunun (`loginWithGoogle: async (idToken: string) => { ... },`) kapanışından hemen sonra ekle:
```ts
      loginWithApple: async (idToken: string, fullName?: string) => {
        const response = await authApi.loginWithApple(idToken, fullName);
        const { user: apiUser } = response.data;
        // Token'lar httpOnly cookie olarak backend tarafından set edildi; JS'te saklamıyoruz.
        if (typeof window !== 'undefined') {
          localStorage.setItem('tarodan_authed', '1');
        }

        const user = mapApiUser(apiUser);
        const limits = TIER_LIMITS[user.membershipTier];

        set({ user, token: null, refreshToken: null, isAuthenticated: true, limits });
      },
```

- [ ] **Step 4: Derleme kontrolü**

Run: `cd /Users/gorkemsubas/dev/tarodan-app/apps/web && npx tsc --noEmit`
Expected: `api.ts` / `authStore.ts` kaynaklı hata yok. (Önceden var olan alakasız hatalar olabilir; senin dosyalarından kaynaklı olmamalı.)

- [ ] **Step 5: Commit**

```bash
cd /Users/gorkemsubas/dev/tarodan-app
git add apps/web/src/lib/api.ts apps/web/src/stores/authStore.ts
git commit -m "feat(web/auth): authStore + api client loginWithApple"
```

---

### Task 3: Web — AppleSignInButton + login sayfası

**Files:**
- Create: `apps/web/src/components/auth/AppleSignInButton.tsx`
- Modify: `apps/web/src/app/login/page.tsx`

**Interfaces:**
- Consumes: `useAuthStore(s => s.loginWithApple)` (Task 2), `window.AppleID` (Apple JS SDK).
- Produces: kullanıcı görünür Apple butonu; `onSuccess?` callback'i (GoogleSignInButton ile aynı imza).

- [ ] **Step 1: AppleSignInButton bileşenini oluştur**

Create `apps/web/src/components/auth/AppleSignInButton.tsx`:
```tsx
'use client';
import { useCallback } from 'react';
import Script from 'next/script';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';

const SERVICES_ID = process.env.NEXT_PUBLIC_APPLE_SERVICES_ID;
const REDIRECT_URI = process.env.NEXT_PUBLIC_APPLE_REDIRECT_URI;
const APPLE_JS = 'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';

declare global {
  interface Window {
    AppleID?: any;
  }
}

export function AppleSignInButton({ onSuccess }: { onSuccess?: () => void }) {
  const loginWithApple = useAuthStore((s) => s.loginWithApple);

  const handleClick = useCallback(async () => {
    if (typeof window === 'undefined' || !window.AppleID) {
      toast.error('Apple girişi yüklenemedi');
      return;
    }
    try {
      window.AppleID.auth.init({
        clientId: SERVICES_ID,
        redirectURI: REDIRECT_URI,
        scope: 'name email',
        usePopup: true,
      });
      const data = await window.AppleID.auth.signIn();
      const idToken = data?.authorization?.id_token;
      if (!idToken) {
        toast.error('Apple ile giriş başarısız');
        return;
      }
      const name = data?.user?.name;
      const fullName = name
        ? [name.firstName, name.lastName].filter(Boolean).join(' ') || undefined
        : undefined;
      await loginWithApple(idToken, fullName);
      onSuccess?.();
    } catch (e: any) {
      // Kullanıcı popup'ı kapattı → sessiz geç.
      if (e?.error === 'popup_closed_by_user') return;
      toast.error(e?.response?.data?.message || 'Apple ile giriş başarısız');
    }
  }, [loginWithApple, onSuccess]);

  // Servis ID / redirect yoksa butonu hiç gösterme (geliştirmede patlamasın).
  if (!SERVICES_ID || !REDIRECT_URI) return null;

  return (
    <>
      <Script src={APPLE_JS} strategy="afterInteractive" />
      <div className="flex justify-center">
        <button
          type="button"
          onClick={handleClick}
          aria-label="Apple ile devam et"
          className="flex items-center justify-center gap-2 h-11 rounded-md bg-black text-white font-semibold"
          style={{ width: 320 }}
        >
          <svg width="16" height="16" viewBox="0 0 384 512" fill="currentColor" aria-hidden="true">
            <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/>
          </svg>
          Apple ile devam et
        </button>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Login sayfasına ekle**

`apps/web/src/app/login/page.tsx`:
- Import bölümüne, `GoogleSignInButton` importunun yanına ekle:
```tsx
import { AppleSignInButton } from '@/components/auth/AppleSignInButton';
```
- Mevcut `<GoogleSignInButton onSuccess={...} />` bloğunun kapanışından (`}} />`) hemen sonra, aynı `onSuccess` mantığıyla Apple butonunu ekle:
```tsx
              <AppleSignInButton onSuccess={() => {
                let redirect: string | null = null;
                try {
                  redirect = sessionStorage.getItem('login_redirect');
                  if (redirect) sessionStorage.removeItem('login_redirect');
                } catch (_) {}
                if (!redirect) redirect = new URLSearchParams(window.location.search).get('redirect');
                const target = redirect && redirect.startsWith('/') ? redirect : '/';
                router.push(target);
              }} />
```
(Apple butonunu Google butonunun hemen altına, aynı `mt-4` sarmalayıcı `<div>` içinde ya da hemen ardından yerleştir — Google butonuyla dikey hizalı görünsün.)

- [ ] **Step 3: Derleme kontrolü**

Run: `cd /Users/gorkemsubas/dev/tarodan-app/apps/web && npx tsc --noEmit`
Expected: `AppleSignInButton.tsx` / `login/page.tsx` kaynaklı hata yok.

- [ ] **Step 4: Prod build derlemesi (bileşen SSR/CSR uyumu)**

Run: `cd /Users/gorkemsubas/dev/tarodan-app/apps/web && npx next build 2>&1 | tail -20`
Expected: build başarılı; `login` route derlenir, `AppleSignInButton` kaynaklı hata yok. (Build ortam sorunları çıkarsa — örn. eksik env — not al; kod kaynaklı hata olmamalı.)

- [ ] **Step 5: Commit**

```bash
cd /Users/gorkemsubas/dev/tarodan-app
git add apps/web/src/components/auth/AppleSignInButton.tsx apps/web/src/app/login/page.tsx
git commit -m "feat(web/auth): login sayfasına Apple ile giriş butonu (Apple JS popup)"
```

> **Doğrulama (kod dışı):** Uçtan uca test ancak `tarodan.shop` domain'i Apple'da doğrulanıp Services ID + return URL kaydedildikten ve `NEXT_PUBLIC_APPLE_SERVICES_ID` / `NEXT_PUBLIC_APPLE_REDIRECT_URI` set edildikten sonra yapılabilir. Kurulmadan buton `null` döner (görünmez), bu beklenen davranış.

---

## Self-Review

- **Spec coverage:** Backend audience dizisi → Task 1 (+ test + env notu). Web data layer (api+store) → Task 2. Web UI (buton + Apple JS script + login) → Task 3. Dış Apple kurulumu → Task 1/3 kod-dışı notları. Test → Task 1 (audience dizisi + web token). ✓
- **Placeholder taraması:** Tüm kod blokları tam; TBD/TODO yok. ✓
- **Tip tutarlılığı:** `loginWithApple(idToken, fullName?)` imzası store interface (Task 2 Step 2), store impl (Step 3), api client (`identityToken: idToken`) ve AppleSignInButton çağrısı (Task 3) arasında tutarlı. Endpoint DTO alanı `identityToken` — api client bunu doğru gönderiyor. `onSuccess?` imzası GoogleSignInButton ile aynı. `window.AppleID` global declare edildi. ✓
