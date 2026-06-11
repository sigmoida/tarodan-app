# Mobil UI Test Mimarisi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** RNTL tabanlı yeniden-kullanılabilir test harness'i kurup Auth domaininin (register/login) mobil-UI davranışını yolculuk-etiketli testlerle kapsamak.

**Architecture:** `apps/mobile/src/test-utils/` altında render/fixture/mock yardımcıları; co-located `__tests__/`; saf validasyon kuralları birim testi (validation.ts), form/render/navigasyon RNTL testi; kapsama indeksi dokümanı.

**Tech Stack:** Jest + jest-expo, @testing-library/react-native@13, react-hook-form + zod, @tanstack/react-query, expo-router, zustand.

---

## Doğrulanmış gerçekler (keşiften)

- Jest kurulu: [jest.config.js](../../apps/mobile/jest.config.js) (jest-expo preset, pnpm-aware transformIgnorePatterns), [jest.setup.ts](../../apps/mobile/jest.setup.ts) (SecureStore/safe-area/vector-icons mock). `pnpm test` → `jest --forceExit`.
- Mevcut 2 test: [MakeOfferModal.test.tsx](../../apps/mobile/src/components/product/__tests__/MakeOfferModal.test.tsx), [security.test.tsx](../../apps/mobile/app/settings/__tests__/security.test.tsx) (mock kalıbı: factory içinde jest.fn, import edip `as jest.Mock`).
- **validation.ts** (`apps/mobile/src/utils/validation.ts`) export'lu şemalar: `strongPasswordSchema` (min 8 "Şifre en az 8 karakter olmalı", `/[A-Z]/` "En az 1 büyük harf içermeli", `/[a-z]/` "En az 1 küçük harf içermeli", `/\d/` "En az 1 rakam içermeli"), `emailSchema`, `displayNameSchema` (min 2 "Ad en az 2 karakter olmalı").
- **register.tsx** (`apps/mobile/app/(auth)/register.tsx`): yerel `isAdult(dateStr)` fn + `registerSchema` (zodResolver). testID'ler: `register-displayName-input`, `register-email-input`, `register-birthDate-input` (DateField/spinner), `register-password-input`, `register-confirmPassword-input`, `register-acceptTerms`, `register-submit-button`. Mutation hatası → `registerMutation.isError` ise backend mesajı (`err.response.data.message`, dizi ise [0]) gösterilir. `birthDate` defaultValues: `EXPO_PUBLIC_MAESTRO === '1'` ise `'1990-01-01'`, değilse `''`. Submit başarısı → `router.replace('/(auth)/login')`.
- **login.tsx** (`apps/mobile/app/(auth)/login.tsx`): `useAuthStore().login`, `authApi.login`, `errorMessage` state → banner `testID="login-error-banner"` ("Giriş başarısız." veya backend mesajı), `continue-as-guest-button`, `login-back-button` (← geri), `login-submit-button`. `continueAsGuest`: `router.canGoBack() ? router.back() : router.replace('/')`.
- Import yolları: register/login `from '../../src/services/api'`, `'../../src/stores/authStore'`. Testler `app/(auth)/__tests__/` içinde → mock yolu `'../../../src/services/api'`.

## Dosya yapısı

| Dosya | Sorumluluk | Create/Modify |
|---|---|---|
| `apps/mobile/jest.setup.ts` | `process.env.EXPO_PUBLIC_MAESTRO='1'` (test modu: birthDate öndolu, şifre maskesiz) | Modify |
| `apps/mobile/src/test-utils/render.tsx` | `renderWithProviders` (QueryClientProvider) | Create |
| `apps/mobile/src/test-utils/fixtures.ts` | `makeProduct/makeOrder/makeOffer/makeUser/makeAddress` | Create |
| `apps/mobile/src/test-utils/router-mock.ts` | expo-router mock + push/replace/back mock'ları | Create |
| `apps/mobile/src/test-utils/index.ts` | barrel | Create |
| `apps/mobile/src/utils/validation.ts` | `isAdult` ekle (export) | Modify |
| `apps/mobile/app/(auth)/register.tsx` | `isAdult`'ı validation.ts'ten import et | Modify |
| `apps/mobile/src/utils/__tests__/validation.test.ts` | J41/J42 saf şema birim testleri | Create |
| `apps/mobile/app/(auth)/__tests__/register.test.tsx` | J43 register form hata gösterimi | Create |
| `apps/mobile/app/(auth)/__tests__/login.test.tsx` | J44 login hata banner + misafir/geri buton | Create |
| `apps/mobile/src/components/product/__tests__/MakeOfferModal.test.tsx` | harness'a taşı | Modify |
| `docs/superpowers/specs/mobile-ui-coverage.md` | kapsama indeksi | Create |

---

## Task 1: Harness — render + fixtures + router-mock + barrel

**Files:**
- Create: `apps/mobile/src/test-utils/render.tsx`
- Create: `apps/mobile/src/test-utils/fixtures.ts`
- Create: `apps/mobile/src/test-utils/router-mock.ts`
- Create: `apps/mobile/src/test-utils/index.ts`
- Modify: `apps/mobile/jest.setup.ts`

- [ ] **Step 1: jest.setup.ts'e test modu env'i ekle**

`apps/mobile/jest.setup.ts` dosyasının EN BAŞINA (mevcut `jest.mock(...)` çağrılarından önce) ekle:

```typescript
// Test modu: register birthDate öndolu (1990-01-01), şifre alanları maskesiz.
// Uygulama EXPO_PUBLIC_MAESTRO==='1' ile bu davranışları açar.
process.env.EXPO_PUBLIC_MAESTRO = '1';
```

- [ ] **Step 2: render.tsx oluştur**

`apps/mobile/src/test-utils/render.tsx`:

```tsx
import React from 'react';
import { render, type RenderOptions } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/** Test için react-query client (retry kapalı, gcTime 0). */
export function makeTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

/** Ekran/komponenti gerekli provider'larla render eder. SafeArea/icons jest.setup'ta global. */
export function renderWithProviders(
  ui: React.ReactElement,
  options?: { queryClient?: QueryClient } & Omit<RenderOptions, 'wrapper'>,
) {
  const queryClient = options?.queryClient ?? makeTestQueryClient();
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, ...render(ui, { wrapper: Wrapper, ...options }) };
}
```

- [ ] **Step 3: fixtures.ts oluştur**

`apps/mobile/src/test-utils/fixtures.ts`:

```ts
/** Deterministik test verisi fabrikaları. overrides ile alan ezilir. */
export function makeProduct(overrides: Record<string, any> = {}) {
  return {
    id: 'prod-1',
    title: 'Test Diecast 1:18',
    price: 390,
    quantity: 5,
    reservedQuantity: 0,
    status: 'active',
    seller: { id: 'seller-1', displayName: 'Test Satıcı' },
    images: [],
    ...overrides,
  };
}

export function makeUser(overrides: Record<string, any> = {}) {
  return {
    id: 'user-1',
    email: 'test@demo.com',
    displayName: 'Test Kullanıcı',
    membershipTier: 'free',
    isEmailVerified: true,
    ...overrides,
  };
}

export function makeOrder(overrides: Record<string, any> = {}) {
  return {
    id: 'order-1',
    orderNumber: 'ORD-TEST-1',
    status: 'pending_payment',
    totalAmount: 390,
    shippingCost: 24,
    subtotal: 366,
    isBuyer: true,
    ...overrides,
  };
}

export function makeOffer(overrides: Record<string, any> = {}) {
  return {
    id: 'offer-1',
    productId: 'prod-1',
    amount: 200,
    status: 'pending',
    buyerMustAccept: false,
    ...overrides,
  };
}

export function makeAddress(overrides: Record<string, any> = {}) {
  return {
    id: 'addr-1',
    fullName: 'Test Alıcı',
    phone: '5551234567',
    city: 'İstanbul',
    district: 'Kadıköy',
    address: 'Test Mah. 1',
    isDefault: true,
    ...overrides,
  };
}
```

- [ ] **Step 4: router-mock.ts oluştur**

`apps/mobile/src/test-utils/router-mock.ts`:

```ts
/**
 * expo-router mock'u. Test dosyasında:
 *   jest.mock('expo-router', () => require('../../src/test-utils/router-mock').routerMock);
 * sonra: import { pushMock } from '...'; expect(pushMock).toHaveBeenCalledWith('/checkout');
 * beforeEach içinde resetRouterMocks() çağır.
 */
export const pushMock = jest.fn();
export const replaceMock = jest.fn();
export const backMock = jest.fn();
export const canGoBackMock = jest.fn(() => false);

export const routerMock = {
  router: {
    push: pushMock,
    replace: replaceMock,
    back: backMock,
    canGoBack: canGoBackMock,
  },
  useLocalSearchParams: () => ({}),
  useRouter: () => routerMock.router,
};

export function resetRouterMocks() {
  pushMock.mockClear();
  replaceMock.mockClear();
  backMock.mockClear();
  canGoBackMock.mockReset();
  canGoBackMock.mockReturnValue(false);
}
```

- [ ] **Step 5: index.ts barrel oluştur**

`apps/mobile/src/test-utils/index.ts`:

```ts
export * from './render';
export * from './fixtures';
export * from './router-mock';
```

- [ ] **Step 6: Harness'i mevcut testle doğrula**

Run: `cd apps/mobile && npx jest --forceExit 2>&1 | tail -6`
Expected: mevcut 2 suite hâlâ PASS (5 test). Harness eklenmesi mevcut testleri bozmaz.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/test-utils apps/mobile/jest.setup.ts
git commit -m "test(mobile): RNTL test harness (render/fixtures/router-mock) + test-mode env"
```

---

## Task 2: MakeOfferModal testini harness'a taşı

**Files:**
- Modify: `apps/mobile/src/components/product/__tests__/MakeOfferModal.test.tsx`

- [ ] **Step 1: renderWithProviders kullanacak şekilde güncelle**

`apps/mobile/src/components/product/__tests__/MakeOfferModal.test.tsx` içindeki `renderModal` fonksiyonunu, elle QueryClientProvider kurmak yerine harness kullanacak şekilde değiştir. Dosyanın başındaki importlara ekle:

```tsx
import { renderWithProviders } from '../../../test-utils';
```

`QueryClient`/`QueryClientProvider` importlarını ve `renderModal` içindeki elle client kurulumunu kaldırıp gövdeyi şununla değiştir:

```tsx
function renderModal(props: Partial<React.ComponentProps<typeof MakeOfferModal>> = {}) {
  const onDismiss = jest.fn();
  const onSuccess = jest.fn();
  renderWithProviders(
    <MakeOfferModal
      visible
      onDismiss={onDismiss}
      onSuccess={onSuccess}
      productId="prod-1"
      productTitle="Test Ürünü"
      listPrice={390}
      {...props}
    />,
  );
  return { onDismiss, onSuccess };
}
```

(`import { QueryClient, QueryClientProvider } from '@tanstack/react-query';` satırını sil — artık harness sağlıyor.)

- [ ] **Step 2: Testi koş**

Run: `cd apps/mobile && npx jest MakeOfferModal --forceExit 2>&1 | tail -8`
Expected: 3 test PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/components/product/__tests__/MakeOfferModal.test.tsx
git commit -m "test(mobile): MakeOfferModal testini harness'a taşı"
```

---

## Task 3: J41/J42 — saf validasyon birim testleri

`isAdult`'ı testlenebilir kılmak için validation.ts'e taşı, sonra şema birim testleri yaz.

**Files:**
- Modify: `apps/mobile/src/utils/validation.ts`
- Modify: `apps/mobile/app/(auth)/register.tsx`
- Create: `apps/mobile/src/utils/__tests__/validation.test.ts`

- [ ] **Step 1: isAdult'ı validation.ts'e ekle (export)**

`apps/mobile/src/utils/validation.ts` dosyasının SONUNA ekle:

```ts
/** "YYYY-MM-DD" doğum tarihi 18 yaş ve üstü mü? Geçersiz tarih → false. */
export function isAdult(dateStr: string): boolean {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const monthDiff = today.getMonth() - d.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < d.getDate())) age -= 1;
  return age >= 18;
}
```

- [ ] **Step 2: register.tsx'te yerel isAdult'ı kaldır, import et**

`apps/mobile/app/(auth)/register.tsx` içindeki yerel `function isAdult(dateStr: string): boolean { ... }` tanımını SİL. validation import bloğuna (`} from '../../src/utils/validation';` olan import) `isAdult` ekle:

```ts
import {
  displayNameSchema,
  emailSchema,
  strongPasswordSchema,
  isAdult,
} from '../../src/utils/validation';
```

(`maxBirthDate` fonksiyonu register.tsx'te yerel kalır — sadece `isAdult` taşınır.)

- [ ] **Step 3: Validasyon birim testlerini yaz**

`apps/mobile/src/utils/__tests__/validation.test.ts`:

```ts
/**
 * Saf validasyon kuralları (B katmanı). Form/UI yok — şema doğrudan test edilir.
 * J41: şifre kuralları · J42: 18 yaş kuralı.
 */
import { strongPasswordSchema, isAdult, displayNameSchema, emailSchema } from '../validation';

describe('J41 · şifre kuralları (strongPasswordSchema)', () => {
  it('8 karakterden kısa reddedilir', () => {
    const r = strongPasswordSchema.safeParse('Ab1');
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe('Şifre en az 8 karakter olmalı');
  });

  it('büyük harfsiz reddedilir', () => {
    const r = strongPasswordSchema.safeParse('demo1234');
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.map((i) => i.message)).toContain('En az 1 büyük harf içermeli');
  });

  it('rakamsız reddedilir', () => {
    const r = strongPasswordSchema.safeParse('Demoabcd');
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.map((i) => i.message)).toContain('En az 1 rakam içermeli');
  });

  it('güçlü şifre kabul edilir', () => {
    expect(strongPasswordSchema.safeParse('Demo1234').success).toBe(true);
  });
});

describe('J42 · 18 yaş kuralı (isAdult)', () => {
  it('18 yaşından küçük doğum tarihi false', () => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 17);
    expect(isAdult(d.toISOString().slice(0, 10))).toBe(false);
  });

  it('18 yaş ve üstü true', () => {
    expect(isAdult('1990-01-01')).toBe(true);
  });

  it('geçersiz tarih false', () => {
    expect(isAdult('not-a-date')).toBe(false);
  });
});

describe('yardımcı şemalar', () => {
  it('2 karakterden kısa ad reddedilir', () => {
    expect(displayNameSchema.safeParse('A').success).toBe(false);
  });
  it('geçersiz email reddedilir', () => {
    expect(emailSchema.safeParse('bad').success).toBe(false);
  });
});
```

- [ ] **Step 4: Testleri koş**

Run: `cd apps/mobile && npx jest validation --forceExit 2>&1 | tail -10`
Expected: tüm validation testleri PASS (J41 + J42 + yardımcı).

- [ ] **Step 5: register.tsx tip kontrolü**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json 2>&1 | grep "register.tsx" || echo OK`
Expected: `OK` (isAdult importu çözülür).

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/utils/validation.ts "apps/mobile/app/(auth)/register.tsx" apps/mobile/src/utils/__tests__/validation.test.ts
git commit -m "test(mobile): J41 şifre + J42 18-yaş validasyon birim testleri (isAdult validation.ts'e taşındı)"
```

---

## Task 4: J43 — register form backend hata gösterimi (RNTL)

**Files:**
- Create: `apps/mobile/app/(auth)/__tests__/register.test.tsx`

- [ ] **Step 1: Register form hata gösterimi testini yaz**

`apps/mobile/app/(auth)/__tests__/register.test.tsx`:

```tsx
/**
 * J43 · Aynı email ile kayıt → backend "Bu email adresi zaten kayıtlı" mesajı UI'da gösterilir.
 * (Form mantığının mobil-UI yüzü; backend kuralı API e2e'de.)
 * birthDate jest.setup'taki EXPO_PUBLIC_MAESTRO=1 ile '1990-01-01' öndolu.
 */
import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '../../../src/test-utils';
import { routerMock, resetRouterMocks } from '../../../src/test-utils/router-mock';

jest.mock('expo-router', () => routerMock);

jest.mock('../../../src/services/api', () => ({
  authApi: { register: jest.fn() },
}));
import { authApi } from '../../../src/services/api';
import RegisterScreen from '../register';

const mockRegister = authApi.register as jest.Mock;

function fillValidFormExceptResult() {
  fireEvent.changeText(screen.getByTestId('register-displayName-input'), 'Test Kullanıcı');
  fireEvent.changeText(screen.getByTestId('register-email-input'), 'dupe@demo.com');
  fireEvent.changeText(screen.getByTestId('register-password-input'), 'Demo1234');
  fireEvent.changeText(screen.getByTestId('register-confirmPassword-input'), 'Demo1234');
  fireEvent.press(screen.getByTestId('register-acceptTerms'));
}

describe('J43 · aynı email ile kayıt reddi (register)', () => {
  beforeEach(() => {
    mockRegister.mockReset();
    resetRouterMocks();
  });

  it('J43.2 backend "zaten kayıtlı" mesajını gösterir', async () => {
    mockRegister.mockRejectedValue({
      response: { data: { message: 'Bu email adresi zaten kayıtlı' } },
    });
    renderWithProviders(<RegisterScreen />);
    fillValidFormExceptResult();
    fireEvent.press(screen.getByTestId('register-submit-button'));

    await waitFor(() =>
      expect(screen.getByText('Bu email adresi zaten kayıtlı')).toBeOnTheScreen(),
    );
  });

  it('başarılı kayıt login ekranına yönlendirir', async () => {
    mockRegister.mockResolvedValue({ data: { id: 'u1' } });
    renderWithProviders(<RegisterScreen />);
    fillValidFormExceptResult();
    fireEvent.press(screen.getByTestId('register-submit-button'));

    await waitFor(() => expect(mockRegister).toHaveBeenCalledTimes(1));
    expect(routerMock.router.replace).toHaveBeenCalledWith('/(auth)/login');
  });
});
```

- [ ] **Step 2: Testi koş**

Run: `cd apps/mobile && npx jest "register.test" --forceExit 2>&1 | tail -20`
Expected: 2 test PASS. Eğer birthDate boş kaldığı için form submit olmuyorsa (mockRegister çağrılmıyor), `screen.getByTestId('register-birthDate-input')` öğesinin değerini kontrol et; jest.setup'taki `process.env.EXPO_PUBLIC_MAESTRO='1'` öndolduruyor olmalı. Çağrılmıyorsa: test başına `fireEvent` ile birthDate Controller onChange'ini tetiklemek yerine, register defaultValues'ün test modunda dolu geldiğini doğrula (Task 1 Step 1 env'i).

- [ ] **Step 3: Commit**

```bash
git add "apps/mobile/app/(auth)/__tests__/register.test.tsx"
git commit -m "test(mobile): J43 register backend hata gösterimi + login yönlendirme (RNTL)"
```

---

## Task 5: J44 — login hata banner + misafir/geri buton (RNTL)

**Files:**
- Create: `apps/mobile/app/(auth)/__tests__/login.test.tsx`

- [ ] **Step 1: Login testini yaz**

`apps/mobile/app/(auth)/__tests__/login.test.tsx`:

```tsx
/**
 * J44 · Yanlış şifre → hata banner. + misafir/geri butonu navigasyon wiring.
 */
import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '../../../src/test-utils';
import { routerMock, resetRouterMocks, replaceMock, backMock, canGoBackMock } from '../../../src/test-utils/router-mock';

jest.mock('expo-router', () => routerMock);

jest.mock('../../../src/services/api', () => ({
  authApi: { login: jest.fn(), getProfile: jest.fn(), resendVerification: jest.fn() },
}));
import { authApi } from '../../../src/services/api';

jest.mock('../../../src/stores/authStore', () => ({
  useAuthStore: () => ({ login: jest.fn() }),
}));

import LoginScreen from '../login';

const mockLogin = authApi.login as jest.Mock;

describe('J44 · login (auth)', () => {
  beforeEach(() => {
    mockLogin.mockReset();
    resetRouterMocks();
  });

  it('J44.2 yanlış şifre → hata banner görünür', async () => {
    mockLogin.mockRejectedValue({ response: { data: { message: 'Geçersiz kimlik bilgileri' } } });
    renderWithProviders(<LoginScreen />);
    fireEvent.changeText(screen.getByTestId('login-email-input'), 'a@b.com');
    fireEvent.changeText(screen.getByTestId('login-password-input'), 'wrong');
    fireEvent.press(screen.getByTestId('login-submit-button'));

    await waitFor(() =>
      expect(screen.getByTestId('login-error-banner')).toBeOnTheScreen(),
    );
  });

  it('geri butonu: geçmiş yoksa ana sayfaya replace eder', () => {
    canGoBackMock.mockReturnValue(false);
    renderWithProviders(<LoginScreen />);
    fireEvent.press(screen.getByTestId('login-back-button'));
    expect(replaceMock).toHaveBeenCalledWith('/');
  });

  it('misafir butonu: geçmiş varsa geri gider', () => {
    canGoBackMock.mockReturnValue(true);
    renderWithProviders(<LoginScreen />);
    fireEvent.press(screen.getByTestId('continue-as-guest-button'));
    expect(backMock).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Testi koş**

Run: `cd apps/mobile && npx jest "login.test" --forceExit 2>&1 | tail -16`
Expected: 3 test PASS. Şifre alanı testte maskeli olsa da `fireEvent.changeText` doğrudan değer set eder (klavye yok). Banner testID `login-error-banner` mevcut.

- [ ] **Step 3: Commit**

```bash
git add "apps/mobile/app/(auth)/__tests__/login.test.tsx"
git commit -m "test(mobile): J44 login hata banner + misafir/geri buton wiring (RNTL)"
```

---

## Task 6: Kapsama indeksi

**Files:**
- Create: `docs/superpowers/specs/mobile-ui-coverage.md`

- [ ] **Step 1: Kapsama indeksini oluştur**

`docs/superpowers/specs/mobile-ui-coverage.md`:

```markdown
# Mobil UI Kapsama İndeksi

50 yolculuğun **mobil-UI** adımlarının test izlenebilirliği. Backend mantığı API e2e'de (ayrı). Durum: ✅ test var · 🚧 mobil ürün-eksiği (test edilemez) · — backend-only (UI adımı yok).

| Yolculuk | UI adımı | Test (dosya::describe) | Durum |
|---|---|---|---|
| J41 | şifre kuralları | src/utils/__tests__/validation.test.ts::J41 | ✅ |
| J42 | 18 yaş engeli | src/utils/__tests__/validation.test.ts::J42 | ✅ |
| J43 | aynı email reddi (mesaj gösterimi) | app/(auth)/__tests__/register.test.tsx::J43 | ✅ |
| J44 | yanlış şifre hata banner | app/(auth)/__tests__/login.test.tsx::J44 | ✅ |
| J3/J4 | teklif validasyonu | src/components/product/__tests__/MakeOfferModal.test.tsx | ✅ |
| J23/J47 | 2FA durum/toggle | app/settings/__tests__/security.test.tsx | ✅ |

## Sonraki domain batch'leri (ayrı plan)
- Checkout (J1 sepet özeti, 3-adım buton) · Sepet/wishlist (J21/J33) · Bildirim/profil/adres (J32/J38) · Kupon (J22) · IBAN format (J50).

## Mobil ürün-eksikleri (🚧 — test yazılmaz)
- İlan foto zorunlu: J2, J15, J18, J30, J40, J50
- IBAN ekranı yok: J2, J27, J40, J50
- Teklif siparişi ödeme entry yok: J3, J34, J40
(Detay: mobile-gaps-from-journey-automation.md)
```

- [ ] **Step 2: Tüm suite yeşil mi doğrula**

Run: `cd apps/mobile && npx jest --forceExit 2>&1 | grep -E "Tests:|Suites:"`
Expected: tüm suite'ler PASS (validation + register + login + MakeOfferModal + security).

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/mobile-ui-coverage.md
git commit -m "docs(test): mobil UI kapsama indeksi (Auth domaini + mevcut)"
```

---

## Self-review notları

- **Spec kapsamı:** harness (Task 1), mevcut testi taşıma (Task 2), Auth domaini J41/J42 birim + J43/J44 RNTL (Task 3-5), kapsama indeksi (Task 6) — hepsi karşılanıyor.
- **Katman ayrımı:** saf validasyon → birim (validation.test); form/render/navigasyon → RNTL; backend → kapsam dışı. Spec ile uyumlu.
- **İsim tutarlılığı:** `renderWithProviders`, `routerMock`/`pushMock`/`replaceMock`/`backMock`/`canGoBackMock`, `resetRouterMocks`, fixture `make*` — tüm task'larda aynı.
- **Bilinen risk:** J43 form testinde birthDate öndolumu `EXPO_PUBLIC_MAESTRO=1`'e bağlı (Task 1 Step 1). Jest babel'in env'i inline edip etmediğine göre execution'da doğrulanır; Task 4 Step 2 bunun teşhisini içerir.
- **isAdult taşıma:** register.tsx davranışı değişmez (aynı fonksiyon, farklı konum); maxBirthDate yerinde kalır.
