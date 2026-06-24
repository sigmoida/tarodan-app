# Mobil Misafir Checkout Email OTP Doğrulama — Tasarım

**Tarih:** 2026-06-21
**Kapsam:** `apps/mobile` — misafir (guest) checkout akışına email OTP doğrulama adımı eklemek.

## Problem

Misafir kullanıcı ödeme yapmaya çalıştığında backend 400 dönüyor:

> "Doğrulama kodu 6 haneli olmalıdır" / "emailVerificationCode should not be empty"

Kök neden: [`apps/mobile/app/checkout/index.tsx`](../../../apps/mobile/app/checkout/index.tsx) içinde misafir checkout çağrısı `emailVerificationCode: ''` (sabit boş string) gönderiyor. Backend [`guest-checkout.dto.ts`](../../../apps/api/src/modules/order/dto/guest-checkout.dto.ts) bu alanı `@IsNotEmpty()` + `@Matches(/^\d{6}$/)` ile zorunlu kılıyor.

Backend misafir checkout'u **iki adımlı** tasarlanmış:
1. `POST /orders/guest/send-verification-code` → email'e 6 haneli OTP gönderir, `{ success, expiresInSeconds }` döner.
2. `POST /orders/checkout/guest` → `emailVerificationCode` ile siparişi oluşturur.

Mobil app 1. adımı hiç uygulamıyor. Web (`apps/web`) bu akışı zaten içeriyor (modal + OTP input); mobil ona parity sağlayacak.

## Çözüm Özeti

Mobil checkout'a, misafir kullanıcı ödemeye geçerken araya giren bir **OTP modal'ı** eklenir. Modal web ile aynı UX'i izler.

## Bileşenler ve Değişiklikler

### 1. API helper — `apps/mobile/src/services/api.ts`

`ordersApi` içine yeni helper:

```ts
sendGuestVerificationCode: (data: { email: string; expectedCheckoutCount?: number }) =>
  guestApi.post<{ success: boolean; expiresInSeconds: number }>(
    '/orders/guest/send-verification-code',
    data,
  ),
```

`guestApi` (auth header'sız axios instance) kullanılır — endpoint `@Public()`.

### 2. Checkout akışı — `apps/mobile/app/checkout/index.tsx`

**Refactor:** Mevcut `handleCheckout` içindeki sipariş oluşturma + ödeme başlatma mantığı `proceedCheckout(emailVerificationCode?: string)` adlı bir fonksiyona ayrılır. Hem üye yolu hem misafir-OTP-sonrası yol bu fonksiyonu paylaşır. `proceedCheckout` misafir dalında `checkoutGuest`'e `emailVerificationCode: emailVerificationCode ?? ''` geçer.

**Yeni state:**
- `otpModalOpen: boolean`
- `otpCode: string`
- `otpSending: boolean` (kod gönderme / doğrulama sırasında)
- `otpExpiresIn: number` (geri sayım, saniye)
- `otpSentForEmail: string | null` (kodun gönderildiği normalize email; `guestEmail` değişince sıfırlanır)
- `otpError: string | null` (modal içi hata mesajı)

**Akış değişikliği — `handleCheckout`:**
- Mevcut ön validasyonlar (sepet boş mu, ürün ID geçerli mi) korunur.
- **Üye** (`isAuthenticated && user`): doğrudan `proceedCheckout()`. Davranış değişmez.
- **Misafir:** misafir form validasyonu (`validateGuest`) geçtiyse →
  `sendGuestVerificationCode({ email: guestEmail.trim().toLowerCase(), expectedCheckoutCount: Math.max(1, items.length) })`
  çağrılır → başarılıysa `otpSentForEmail` set edilir, `otpExpiresIn` yanıttaki `expiresInSeconds`'a set edilir, `otpModalOpen = true`. Ödemeye **geçilmez**.
- Gönderme hatası → mevcut snackbar/alert ile hata gösterilir, modal açılmaz.

### 3. OTP Modal (`ui-native` `Modal` + `Input`)

- İçerik: başlık + "{email} adresine 6 haneli kod gönderildi" açıklaması.
- 6 haneli numeric `Input`: `keyboardType="number-pad"`, `maxLength={6}`, sadece rakam kabul eder (`value.replace(/\D/g, '')`).
- "Doğrula ve Öde" butonu: `otpCode.length === 6` değilse disabled. Basınca `proceedCheckout(otpCode)`.
- "Kodu tekrar gönder": `otpExpiresIn > 0` iken disabled ve geri sayımı (`{n}s`) gösterir; 0 olunca aktif. Basınca `sendGuestVerificationCode` tekrar çağrılır, `otpExpiresIn` resetlenir, `otpError` temizlenir.
- Geri sayım: `useEffect` + `setInterval(1s)`, `otpExpiresIn`'i 0'a kadar azaltır. Modal kapanınca interval temizlenir.
- Kapatma: modal kapatılınca `otpCode` ve `otpError` sıfırlanır; sipariş başlatılmaz.

### 4. Hata yönetimi

- `proceedCheckout(otpCode)` sırasında `checkoutGuest` **400** dönerse (geçersiz/süresi dolmuş kod): modal **açık kalır**, `otpError` API mesajıyla doldurulur, kullanıcı yeniden deneyebilir veya kod isteyebilir. `loading`/`otpSending` sıfırlanır.
- 400 dışı hatalar: mevcut `catch` handling'ine düşer (snackbar + `captureException`), modal kapatılır.
- API hata mesajı çıkarımı web ile aynı desende: `e?.response?.data?.message` (string veya array→join).

### 5. i18n — `apps/mobile/src/i18n/messages/{tr,en}.json`

Yeni anahtarlar (`checkout` altında):
- `guestOtpTitle` — modal başlığı ("E-posta Doğrulama")
- `guestOtpDescription` — "{email} adresine gönderilen 6 haneli kodu girin"
- `guestOtpInputLabel` — "Doğrulama kodu"
- `guestOtpSubmit` — "Doğrula ve Öde"
- `guestOtpResend` — "Kodu tekrar gönder"
- `guestOtpResendCountdown` — "Tekrar gönder ({seconds}s)"
- `guestOtpSendFailed` — kod gönderilemedi hatası
- `guestOtpInvalid` — geçersiz kod fallback mesajı

(Mevcut i18n kullanım deseni neyse — `t()` veya inline tr/en — checkout dosyasındaki mevcut metin yaklaşımına uyulur.)

### 6. Test — `apps/mobile/app/checkout/__tests__/checkout-otp.test.tsx`

Mevcut `checkout.test.tsx` / `checkout-coupon.test.tsx` desenine uyumlu:
- Misafir kullanıcı "Onayla ve Öde"ye basınca `sendGuestVerificationCode`'un doğru email + `expectedCheckoutCount` ile çağrıldığı.
- Modal açıldıktan sonra 6 haneli kod girilip "Doğrula ve Öde"ye basınca `checkoutGuest`'in `emailVerificationCode` dolu olarak çağrıldığı.
- `checkoutGuest` 400 dönünce modal'ın açık kaldığı ve hata gösterildiği.

## Kapsam Dışı (YAGNI)

- Backend değişikliği yok (endpoint'ler hazır).
- Üye checkout akışı değişmez.
- Otomatik OTP okuma (SMS/email autofill) eklenmez.
- Web tarafı değişmez.

## Etkilenen Dosyalar

- `apps/mobile/src/services/api.ts` (helper ekleme)
- `apps/mobile/app/checkout/index.tsx` (refactor + modal + state)
- `apps/mobile/src/i18n/messages/tr.json`, `en.json` (string'ler)
- `apps/mobile/app/checkout/__tests__/checkout-otp.test.tsx` (yeni test)
