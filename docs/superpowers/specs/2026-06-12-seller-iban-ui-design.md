# Satıcı IBAN Giriş Arayüzü — Tasarım Dokümanı

**Tarih:** 2026-06-12
**Kapsam:** Web (apps/web) + Mobil (apps/mobile) frontend. Backend değişikliği yok.

## Problem

Satıcılara para PayTR Platform Transfer üzerinden IBAN'larına gönderiliyor. Backend tamamen
hazır: `SellerBankAccount` / `PayoutTransfer` Prisma modelleri, `GET/PATCH/DELETE
/users/me/bank-account` endpoint'leri (TR IBAN doğrulamalı), ve 15 dakikada bir çalışan
payout scheduler. **Ancak ne web'de ne mobilde satıcının IBAN'ını gireceği bir arayüz yok.**
Sonuç: banka hesabı olmayan satıcı için payout `failed` (sebep: `no_bank_account`) durumunda
oluşuyor ve para asla gönderilemiyor.

## Hedef

Satıcının IBAN/banka hesabını girip yönetebileceği arayüzü web ve mobile eklemek, ve banka
hesabı olmadan ilan yayınlanmasını engelleyerek `no_bank_account` payout başarısızlığını
baştan önlemek.

## Mevcut Durum (referans)

- **Prisma:** `SellerBankAccount` (userId unique, accountHolder, iban, tcKimlikNo?, taxId?,
  isVerified, verifiedAt) — `apps/api/prisma/schema.prisma:1122-1136`.
- **API endpoint'leri** — `apps/api/src/modules/user/user.controller.ts:557-585`:
  - `GET /users/me/bank-account` (yoksa null)
  - `PATCH /users/me/bank-account` (upsert; güncellemede `isVerified=false`'a döner)
  - `DELETE /users/me/bank-account`
- **DTO** — `apps/api/src/modules/user/dto/bank-account.dto.ts`: `accountHolder` (2–150),
  `iban` (`@Matches(/^TR\d{24}$/)`), `tcKimlikNo?` (11 hane), `taxId?` (≤20). Service IBAN'ı
  büyük harfe çevirip boşlukları siliyor.
- **Payout** — `apps/api/src/modules/payout/payout.service.ts`: released hold için seller'ın
  `bankAccount`'ından `transferIban`/`transferName` kopyalanıyor; yoksa `failed` +
  `no_bank_account`.

## Karar

**Yaklaşım A — Profil menüsünde ayrı "Banka Hesabı / IBAN" sayfası.** Mevcut adres yönetimi
(`/profile/addresses`, `/settings/...`) deseniyle bire bir uyumlu. (B: ödeme ekranına gömme
ve C: sadece inline — elendi.)

## Bileşenler

### 1. Ortak — IBAN doğrulama & format yardımcısı
- API ile birebir kural: normalize edilmiş IBAN `/^TR\d{24}$/` (26 karakter, boşluksuz, büyük harf).
- Giriş UX: kullanıcıya `TR12 3456 ...` boşluklu gösterim; submit'te `replace(/\s/g,'').toUpperCase()`.
- Alan kuralları DTO ile aynı: accountHolder 2–150, tcKimlikNo opsiyonel 11 hane, taxId opsiyonel ≤20.
- Web ve mobil kendi mevcut kalıplarını kullanır (web: manuel/zod; mobil: zod). Mantık kopya
  değil, ufak bir paylaşılan saf fonksiyon (`normalizeIban`, `isValidTrIban`, `formatIbanDisplay`)
  her uygulamanın utils'inde aynı imzayla.

### 2. Web — `/profile/bank-account` sayfası
- **Dosya:** `apps/web/src/app/profile/bank-account/page.tsx`
- Profil menüsüne (profil sayfası / navigasyon) "Banka Hesabı / IBAN" linki.
- `useQuery(['bank-account'])` → `GET /users/me/bank-account`; null ise boş form.
- Form alanları: accountHolder, iban (boşluklu gösterim), tcKimlikNo (opsiyonel), taxId (opsiyonel).
- Kaydet: `api.patch('/users/me/bank-account', payload)`; başarı/hata `react-hot-toast`.
- Sil: `DELETE` + onay; query invalidation.
- Güncellemenin `isVerified`'ı sıfırlayacağı kullanıcıya bilgi notu olarak gösterilir (isVerified
  read-only rozet; bu işte onay akışı YOK).
- **API client:** `apps/web/src/lib/api.ts` içine `bankAccountApi = { get, upsert, delete }`.

### 3. Web — ilan-verme gate'i
- **Dosya:** `apps/web/src/app/listings/new/page.tsx`
- Mount'ta `bankAccountApi.get()` sorgulanır. Banka hesabı yoksa: ilan formunu kilitleyen bir
  uyarı kartı + "IBAN Ekle" CTA'sı (`/profile/bank-account`). Mevcut `canCreateListing` gate
  deseninin yanında. Hesap dönünce form açılır.

### 4. Mobil — `/settings/bank-account.tsx` ekranı
- **Dosya:** `apps/mobile/app/settings/bank-account.tsx`; `apps/mobile/app/settings/_layout.tsx`
  stack'ine eklenir; profil/ayarlar listesinden link.
- react-hook-form + zod (mevcut `edit-profile` kalıbı). `useQuery` → GET; `useMutation` →
  `PATCH /users/me/bank-account`. Snackbar ile geri bildirim, `appAlert` ile silme onayı.
- **API client:** `apps/mobile/src/services/api.ts` içine `bankAccountApi`.
- **testID'ler:** `bank-account-holder-input`, `bank-account-iban-input`,
  `bank-account-submit-button`, `bank-account-delete-button` (mobil otomasyon kapsamı için).

### 5. Mobil — ilan-verme gate'i
- **Dosya:** `apps/mobile/src/components/listing/ListingForm.tsx`
- `mode === 'create'` iken banka hesabı sorgulanır; yoksa formu engelleyen uyarı +
  `/settings/bank-account`'a yönlendiren CTA.

## Veri Akışı

1. Satıcı IBAN sayfasını açar → `GET /users/me/bank-account` → form dolar veya boş.
2. Kaydet → `PATCH /users/me/bank-account` (normalize edilmiş IBAN) → 200 → toast/snackbar.
3. Satıcı ilan vermeye gider → gate `GET` ile kontrol eder → hesap yoksa engelle + yönlendir.
4. (Mevcut, değişmiyor) Satış tamamlanıp hold release olunca payout scheduler IBAN'ı okur ve
   PayTR transferini yapar.

## Hata Yönetimi
- İstemci doğrulaması: geçersiz IBAN/zorunlu alan → submit engellenir, alan altında mesaj.
- API 400 → sunucu mesajı toast/snackbar olarak gösterilir.
- 401 → mevcut token-refresh interceptor'ları devrede.

## Test
- Web: `apps/web/e2e/journeys/j050…` zaten API'yi test ediyor; UI eklendiğinde bu journey'ler
  arayüz üzerinden de geçilebilir hale gelir (gerekirse güncellenir).
- Mobil: testID'ler Maestro journey'leri için eklenir.
- Birim: `normalizeIban` / `isValidTrIban` saf fonksiyon testleri (her iki uygulamada).

## Kapsam Dışı (bilerek)
- Satıcıya payout/ödeme listesi ekranı (ayrı iş).
- IBAN doğrulama/onay (isVerified) akışı ve admin manuel onayı.
- KYC / belge yükleme.
- Backend / Prisma / endpoint değişikliği — gerekmiyor.
