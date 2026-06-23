# Mobil Misafir Checkout Email OTP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Misafir checkout'a email OTP doğrulama adımı ekleyerek 400 hatasını gidermek.

**Architecture:** Misafir "Onayla ve Öde"ye basınca backend'e OTP gönderme isteği atılır, açılan modal'da 6 haneli kod alınır; mevcut sipariş+ödeme mantığı `proceedCheckout(code)` fonksiyonuna ayrılıp koddan geçirilir. Üye akışı değişmez.

**Tech Stack:** React Native (Expo), TypeScript, `@tarodan/ui-native` (Modal/Input/Button), axios (`guestApi`), Jest + @testing-library/react-native.

## Global Constraints

- Çalışma dizini: `apps/mobile` (monorepo kökü `/Users/gorkemsubas/dev/tarodan-app`).
- Misafir endpoint'leri auth header'sız `guestApi` instance'ı ile çağrılır (`api` değil).
- Kod metinleri **inline Türkçe** (checkout dosyası `useTranslation` kullanmıyor, inline TR string kullanıyor — bu desene uyulur). Spec'teki ayrı i18n JSON adımı bu nedenle uygulanmaz.
- Backend sözleşmesi sabit: `POST /orders/guest/send-verification-code` → `{ success, expiresInSeconds }`; `POST /orders/checkout/guest` `emailVerificationCode` (`/^\d{6}$/`) ister.
- Üye (`isAuthenticated && user`) checkout davranışı **değişmeyecek**.

---

### Task 1: `sendGuestVerificationCode` API helper

**Files:**
- Modify: `apps/mobile/src/services/api.ts` (ordersApi nesnesi, ~satır 324 `createGuest` yakını)
- Test: `apps/mobile/src/services/__tests__/orders-api-guest-otp.test.ts` (Create)

**Interfaces:**
- Produces: `ordersApi.sendGuestVerificationCode(data: { email: string; expectedCheckoutCount?: number }): Promise<AxiosResponse<{ success: boolean; expiresInSeconds: number }>>`

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/services/__tests__/orders-api-guest-otp.test.ts`:

```ts
// guestApi.post'u mock'layıp helper'ın doğru endpoint+payload ile çağırdığını doğrula.
const post = jest.fn(() => Promise.resolve({ data: { success: true, expiresInSeconds: 180 } }));

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: () => ({ post, get: jest.fn(), interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } } }),
    post: jest.fn(),
  },
}));

import { ordersApi } from '../api';

describe('ordersApi.sendGuestVerificationCode', () => {
  beforeEach(() => post.mockClear());

  it('doğru endpoint ve payload ile guestApi.post çağırır', async () => {
    await ordersApi.sendGuestVerificationCode({ email: 'a@b.com', expectedCheckoutCount: 2 });
    expect(post).toHaveBeenCalledWith('/orders/guest/send-verification-code', {
      email: 'a@b.com',
      expectedCheckoutCount: 2,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && npx jest src/services/__tests__/orders-api-guest-otp.test.ts`
Expected: FAIL — `ordersApi.sendGuestVerificationCode is not a function`.

- [ ] **Step 3: Write minimal implementation**

`apps/mobile/src/services/api.ts` — `ordersApi` içinde `createGuest`'ten hemen sonra ekle:

```ts
  sendGuestVerificationCode: (data: { email: string; expectedCheckoutCount?: number }) =>
    guestApi.post<{ success: boolean; expiresInSeconds: number }>(
      '/orders/guest/send-verification-code',
      data,
    ),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && npx jest src/services/__tests__/orders-api-guest-otp.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/services/api.ts apps/mobile/src/services/__tests__/orders-api-guest-otp.test.ts
git commit -m "feat(mobile): misafir OTP gönderme API helper'ı"
```

---

### Task 2: `proceedCheckout` extraction (davranış-koruyucu refactor)

Mevcut `handleCheckout` gövdesindeki sipariş+ödeme mantığını `proceedCheckout(emailVerificationCode?: string)` fonksiyonuna taşı. Bu task'ta misafir akışı hâlâ boş kodla çalışır (gating Task 3'te eklenir); amaç refactor'ın mevcut testleri bozmadığını doğrulamak.

**Files:**
- Modify: `apps/mobile/app/checkout/index.tsx:359-518` (`handleCheckout`)
- Test: `apps/mobile/app/checkout/__tests__/checkout.test.tsx` (mevcut — regression)

**Interfaces:**
- Produces: `proceedCheckout(emailVerificationCode?: string): Promise<void>` — sipariş oluşturur + ödemeyi başlatır; misafir dalında `checkoutGuest`'e `emailVerificationCode ?? ''` geçer. Üye dalında parametre yok sayılır.
- Produces: `extractApiMessage(e: any): string | null` — axios hata mesajı çıkarımı (string veya array→join).

- [ ] **Step 1: Add `extractApiMessage` helper**

`apps/mobile/app/checkout/index.tsx` içinde `showSnackbar` tanımının yakınına ekle:

```ts
  const extractApiMessage = (e: any): string | null => {
    const m = e?.response?.data?.message;
    if (Array.isArray(m)) return m.join(', ');
    if (typeof m === 'string') return m;
    if (typeof e?.response?.data?.error === 'string') return e.response.data.error;
    return null;
  };
```

- [ ] **Step 2: Rename `handleCheckout` body to `proceedCheckout(emailVerificationCode?)`**

`handleCheckout`'un imzasını ve ilk validasyon bloğunu (sepet boş / ürün ID) `handleCheckout`'ta bırak, geri kalan `if (loading) return; setLoading(true); try {...} catch {...} finally {...}` kısmını yeni fonksiyona taşı. Sonuç:

```ts
  const proceedCheckout = async (emailVerificationCode?: string) => {
    if (loading) return;
    setLoading(true);
    try {
      const shipping = buildShippingPayload();
      const billing = buildBillingPayload();
      const checkoutPayload = {
        items: items.map((item) => ({ productId: item.productId })),
        idempotencyKey: idempotencyKeyRef.current,
        shippingAddressId: shipping.id,
        shippingAddress: shipping.inline,
        billingAddressId: billing?.id,
        billingAddress: billing?.inline,
      };

      const response = isAuthenticated && user
        ? await ordersApi.checkout(checkoutPayload)
        : await ordersApi.checkoutGuest({
            items: checkoutPayload.items,
            idempotencyKey: checkoutPayload.idempotencyKey,
            email: guestEmail.trim().toLowerCase(),
            emailVerificationCode: emailVerificationCode ?? '',
            phone: normalizePhoneForPayload(guestPhone, guestPhoneCountryCode),
            guestName: guestName.trim(),
            shippingAddress: shipping.inline!,
            billingAddress: billing?.inline,
          });

      // ... mevcut payment-init mantığı (checkoutGroupId/firstOrderId, initiateGroup,
      //     bypass, paymentUrl, router.replace) AYNEN korunur ...
    } catch (error: any) {
      // ... mevcut catch gövdesi AYNEN korunur ...
    } finally {
      setLoading(false);
    }
  };

  const handleCheckout = async () => {
    if (items.length === 0) {
      showSnackbar('Sepetiniz boş');
      return;
    }
    for (const item of items) {
      if (!item.productId || typeof item.productId !== 'string' || item.productId.length < 10) {
        appAlert('Hata', `Geçersiz ürün ID: ${item.title}`);
        return;
      }
    }
    await proceedCheckout();
  };
```

> Not: `try`/`catch`/`finally` ve içindeki tüm mevcut payment mantığı birebir taşınır; yalnızca `emailVerificationCode: ''` → `emailVerificationCode: emailVerificationCode ?? ''` değişir.

- [ ] **Step 3: Run existing checkout tests (regression)**

Run: `cd apps/mobile && npx jest app/checkout/__tests__/checkout.test.tsx app/checkout/__tests__/checkout-coupon.test.tsx`
Expected: PASS (refactor davranışı değiştirmedi).

- [ ] **Step 4: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json`
Expected: 0 yeni hata (checkout dosyasıyla ilgili).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/checkout/index.tsx
git commit -m "refactor(mobile): checkout sipariş mantığını proceedCheckout'a ayır"
```

---

### Task 3: OTP modal + gating + countdown + 400 handling

Misafir akışını OTP üzerinden geçir: kod gönder → modal → kodla `proceedCheckout`. Üye akışı doğrudan `proceedCheckout()`.

**Files:**
- Modify: `apps/mobile/app/checkout/index.tsx` (state, `handleCheckout`, `proceedCheckout` catch, modal JSX, import)

**Interfaces:**
- Consumes: `ordersApi.sendGuestVerificationCode` (Task 1), `proceedCheckout` / `extractApiMessage` (Task 2)
- Produces: `handleOtpSubmit()`, `handleOtpResend()`, `closeOtpModal()`; state `otpModalOpen/otpCode/otpSending/otpExpiresIn/otpError`

- [ ] **Step 1: Import `Modal`**

`apps/mobile/app/checkout/index.tsx` — `@tarodan/ui-native` import listesine `Modal` ekle (zaten `Button`, `Input` import ediliyorsa yanına):

```ts
import { Button, Input, Modal, /* ...mevcutlar... */ } from '@tarodan/ui-native';
```

- [ ] **Step 2: Add OTP state**

`const [loading, setLoading] = useState(false);` yakınına:

```ts
  const [otpModalOpen, setOtpModalOpen] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpSending, setOtpSending] = useState(false);
  const [otpExpiresIn, setOtpExpiresIn] = useState(0);
  const [otpError, setOtpError] = useState<string | null>(null);
```

- [ ] **Step 3: Add countdown effect**

Diğer `useEffect`'lerin yanına:

```ts
  useEffect(() => {
    if (!otpModalOpen) return;
    const id = setInterval(() => {
      setOtpExpiresIn((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [otpModalOpen]);
```

- [ ] **Step 4: Gate guest flow in `handleCheckout`**

`handleCheckout` sonundaki `await proceedCheckout();` çağrısını şununla değiştir:

```ts
    if (isAuthenticated && user) {
      await proceedCheckout();
      return;
    }

    // Misafir: önce form doğrula, sonra OTP gönder ve modal aç
    const guestErr = validateGuest();
    if (guestErr) {
      showSnackbar(guestErr);
      return;
    }
    const email = guestEmail.trim().toLowerCase();
    setOtpSending(true);
    try {
      const resp: any = await ordersApi.sendGuestVerificationCode({
        email,
        expectedCheckoutCount: Math.max(1, items.length),
      });
      const expiresIn =
        resp?.data?.data?.expiresInSeconds ?? resp?.data?.expiresInSeconds ?? 180;
      setOtpCode('');
      setOtpError(null);
      setOtpExpiresIn(expiresIn);
      setOtpModalOpen(true);
    } catch (e: any) {
      appAlert('Hata', extractApiMessage(e) ?? 'Doğrulama kodu gönderilemedi.');
    } finally {
      setOtpSending(false);
    }
```

- [ ] **Step 5: Keep modal open on 400 (invalid/expired code)**

`proceedCheckout`'un `catch (error: any)` bloğunda, mevcut `captureException`'dan **sonra**, `const status = error?.response?.status;` satırını kullanarak (zaten mevcut) stockout kontrolünden **önce** şunu ekle:

```ts
      // Misafir OTP gönderimi sırasında 400 → kod hatalı/süresi dolmuş: modal açık kalsın.
      if (!isAuthenticated && emailVerificationCode && status === 400) {
        setOtpError(extractApiMessage(error) ?? 'Doğrulama kodu geçersiz veya süresi dolmuş.');
        return; // finally setLoading(false) çalışır; generic appAlert'e düşme
      }
```

> Not: Bu blok `errorMessage`/`status` zaten hesaplandıktan sonra çalışmalı. `status` hesaplaması catch içinde `errorMessage`'dan sonra geliyor; bu blok onun hemen ardına, `isStockout` kontrolünden önce konur.

- [ ] **Step 6: Add OTP handlers**

`handleCheckout`'tan sonra:

```ts
  const closeOtpModal = () => {
    setOtpModalOpen(false);
    setOtpCode('');
    setOtpError(null);
  };

  const handleOtpSubmit = async () => {
    if (otpCode.length !== 6) return;
    await proceedCheckout(otpCode);
  };

  const handleOtpResend = async () => {
    if (otpExpiresIn > 0 || otpSending) return;
    const email = guestEmail.trim().toLowerCase();
    setOtpSending(true);
    try {
      const resp: any = await ordersApi.sendGuestVerificationCode({
        email,
        expectedCheckoutCount: Math.max(1, items.length),
      });
      const expiresIn =
        resp?.data?.data?.expiresInSeconds ?? resp?.data?.expiresInSeconds ?? 180;
      setOtpExpiresIn(expiresIn);
      setOtpCode('');
      setOtpError(null);
    } catch (e: any) {
      setOtpError(extractApiMessage(e) ?? 'Kod gönderilemedi.');
    } finally {
      setOtpSending(false);
    }
  };
```

- [ ] **Step 7: Render the modal**

Ekranın en dış JSX'inin sonuna (mevcut return içindeki kök View/Screen kapanışından önce) ekle:

```tsx
      <Modal isOpen={otpModalOpen} onClose={closeOtpModal} title="E-posta Doğrulama">
        <Text style={{ marginBottom: 12, color: '#444' }}>
          {guestEmail.trim().toLowerCase()} adresine gönderilen 6 haneli kodu girin.
        </Text>
        <Input
          label="Doğrulama kodu"
          value={otpCode}
          onChangeText={(v) => setOtpCode(v.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad"
          maxLength={6}
          error={otpError ?? undefined}
          testID="guest-otp-input"
        />
        <Button
          title="Doğrula ve Öde"
          onPress={handleOtpSubmit}
          disabled={otpCode.length !== 6}
          isLoading={loading}
          testID="guest-otp-submit"
        />
        <Button
          title={otpExpiresIn > 0 ? `Tekrar gönder (${otpExpiresIn}s)` : 'Kodu tekrar gönder'}
          variant="ghost"
          onPress={handleOtpResend}
          disabled={otpExpiresIn > 0 || otpSending}
          testID="guest-otp-resend"
        />
      </Modal>
```

> `Text` zaten dosyada import edili (özet ekranında kullanılıyor). Değilse `react-native`'den import et.

- [ ] **Step 8: Typecheck + existing tests**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json && npx jest app/checkout/__tests__/checkout.test.tsx`
Expected: 0 yeni TS hatası, mevcut testler PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/mobile/app/checkout/index.tsx
git commit -m "feat(mobile): misafir checkout email OTP modal akışı"
```

---

### Task 4: Misafir OTP akışı entegrasyon testi

**Files:**
- Test: `apps/mobile/app/checkout/__tests__/checkout-otp.test.tsx` (Create)

**Interfaces:**
- Consumes: `CheckoutScreen` default export, mock `ordersApi.sendGuestVerificationCode` / `checkoutGuest`

- [ ] **Step 1: Write the failing test**

`checkout.test.tsx`'in mock kalıbını izleyerek (`renderWithProviders`, AsyncStorage mock, expo-router mock, authStore misafir mock) oluştur. `ordersApi` mock'una `sendGuestVerificationCode`, `checkoutGuest`, `getGroups` ekle:

```tsx
import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '../../../src/test-utils';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-router', () => require('../../../src/test-utils/router-mock').routerMock);

const sendGuestVerificationCode = jest.fn(() =>
  Promise.resolve({ data: { success: true, expiresInSeconds: 180 } }),
);
const checkoutGuest = jest.fn(() =>
  Promise.resolve({ data: { data: { checkoutGroupId: 'g1', orders: [{ orderId: 'o1' }] } } }),
);

jest.mock('../../../src/services/api', () => ({
  ordersApi: { checkout: jest.fn(), checkoutGuest, sendGuestVerificationCode, getGroups: jest.fn() },
  paymentsApi: {
    getPaymentMethods: jest.fn(() => Promise.resolve({ data: [] })),
    initiateGroupGuest: jest.fn(() => Promise.resolve({ data: { data: { useBypass: true, paymentId: 'p1' } } })),
    bypassComplete: jest.fn(() => Promise.resolve({ data: {} })),
  },
  shippingApi: { getRatesByCity: jest.fn(() => Promise.resolve({ data: { rate: 34.9 } })) },
  addressesApi: { getAll: jest.fn(() => Promise.resolve({ data: [] })) },
  discountsApi: { validate: jest.fn() },
}));

jest.mock('../../../src/stores/authStore', () => ({
  useAuthStore: () => ({ isAuthenticated: false, user: null }),
}));

import { useCartStore } from '../../../src/stores/cartStore';
import CheckoutScreen from '../index';

const seedCart = (items: any[]) => useCartStore.setState({ items, lastUpdated: Date.now() });

describe('Misafir checkout OTP akışı', () => {
  beforeEach(() => {
    sendGuestVerificationCode.mockClear();
    checkoutGuest.mockClear();
    seedCart([{ productId: 'prod-1234567890', title: 'Test', price: 100, quantity: 1 }]);
  });

  it('geçerli misafir formu + ödeme → OTP gönderir, kod ile checkoutGuest çağrılır', async () => {
    renderWithProviders(<CheckoutScreen />);

    // NOT: Bu adım, ekranın misafir form alanlarının ve adres/devam akışının
    // testID'lerine göre doldurulmalıdır. checkout.test.tsx'teki mevcut
    // misafir form doldurma yardımcılarını/testID'lerini birebir kullan.
    // (Form doldurma + "Onayla ve Öde"ye basma adımları buraya yazılır.)

    // OTP gönderildi mi?
    await waitFor(() => expect(sendGuestVerificationCode).toHaveBeenCalled());

    // Modal açıldı: kodu gir
    fireEvent.changeText(screen.getByTestId('guest-otp-input'), '123456');
    fireEvent.press(screen.getByTestId('guest-otp-submit'));

    await waitFor(() =>
      expect(checkoutGuest).toHaveBeenCalledWith(
        expect.objectContaining({ emailVerificationCode: '123456' }),
      ),
    );
  });
});
```

> Form doldurma adımları, `checkout.test.tsx`'te kullanılan mevcut misafir-form testID'leri/yardımcılarına göre yazılır (orada misafir adres formu inline render ediliyor). Eğer "Onayla ve Öde" butonunun testID'i yoksa, görünen metinle (`getByText`) bulunur.

- [ ] **Step 2: Run test to verify it fails (then passes)**

Run: `cd apps/mobile && npx jest app/checkout/__tests__/checkout-otp.test.tsx`
Expected: Önce form testID uyumsuzluğuyla FAIL olabilir → testID'leri mevcut ekrana göre düzelt → PASS.

- [ ] **Step 3: Run full checkout test suite**

Run: `cd apps/mobile && npx jest app/checkout`
Expected: Tüm checkout testleri PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/app/checkout/__tests__/checkout-otp.test.tsx
git commit -m "test(mobile): misafir checkout OTP akışı entegrasyon testi"
```

---

## Manuel Doğrulama (tüm task'lardan sonra)

1. Metro (8081) + API (3001) ayakta; simülatörde app açık.
2. Misafir olarak sepete ürün ekle → checkout → adres + misafir bilgilerini doldur → "Onayla ve Öde".
3. Beklenen: email'e kod gider, modal açılır. Mailhog/gerçek mailden 6 haneli kodu al.
4. Kodu gir → "Doğrula ve Öde" → ödeme akışı (PayTR/bypass) başlar, 400 alınmaz.
5. Yanlış kod gir → modal açık kalır, hata mesajı görünür.
6. Geri sayım biter → "Kodu tekrar gönder" aktif olur.
