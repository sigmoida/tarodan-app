# Satıcı IBAN Giriş Arayüzü Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Satıcının IBAN/banka hesabını web ve mobilde girip yönetebileceği bir arayüz eklemek ve banka hesabı olmadan ilan yayınlanmasını engellemek.

**Architecture:** Backend hazır (`GET/PATCH/DELETE /users/me/bank-account`, TR IBAN doğrulamalı DTO, PayTR payout). Bu plan yalnızca frontend ekler: (1) her iki uygulamada paylaşılan IBAN doğrulama/format yardımcısı, (2) web profil altında `/profile/bank-account` sayfası + mevcut adresler kalıbı, (3) mobil `/settings/bank-account` ekranı (react-hook-form + zod), (4) her iki ilan-verme akışında "banka hesabı yoksa engelle + yönlendir" gate'i.

**Tech Stack:** Web: Next.js App Router, axios (`lib/api.ts`), @tanstack/react-query, react-hot-toast, @tarodan/ui. Mobil: Expo Router, axios (`services/api.ts`), react-hook-form + zod, @tarodan/ui-native (Input/Button/Card/Snackbar/ScreenHeader/appAlert), jest (unit test). Web'de birim test koşucusu YOK → web doğrulaması Playwright journey (`apps/web/e2e/`) ve manuel ile yapılır.

---

## File Structure

**Ortak mantık (her uygulamada ayrı dosya, aynı imza):**
- Create: `apps/web/src/lib/iban.ts` — `normalizeIban`, `isValidTrIban`, `formatIbanDisplay`
- Create: `apps/mobile/src/utils/iban.ts` — aynı üç fonksiyon
- Create: `apps/mobile/src/utils/__tests__/iban.test.ts` — jest birim testleri

**Web:**
- Modify: `apps/web/src/lib/api.ts` — `bankAccountApi` ekle
- Create: `apps/web/src/app/profile/bank-account/page.tsx` — IBAN yönetim sayfası
- Modify: `apps/web/src/app/profile/page.tsx:377-378` — profil menüsüne link
- Modify: `apps/web/src/app/listings/new/page.tsx` — banka hesabı gate'i

**Mobil:**
- Modify: `apps/mobile/src/services/api.ts` — `bankAccountApi` ekle
- Create: `apps/mobile/app/settings/bank-account.tsx` — IBAN yönetim ekranı
- Modify: `apps/mobile/app/(tabs)/profile.tsx:618-622` — menüye `MenuItem` ekle
- Modify: `apps/mobile/src/components/listing/ListingForm.tsx` — banka hesabı gate'i

**Test:**
- Modify (opsiyonel doğrulama): `apps/web/e2e/journeys/j050-satici-iban-ini-birkac-kez-hatali-giriyor.spec.ts`

---

## Task 1: Mobil IBAN yardımcısı (TDD — jest)

**Files:**
- Create: `apps/mobile/src/utils/iban.ts`
- Test: `apps/mobile/src/utils/__tests__/iban.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/mobile/src/utils/__tests__/iban.test.ts`:
```typescript
import { normalizeIban, isValidTrIban, formatIbanDisplay } from '../iban';

describe('normalizeIban', () => {
  it('removes spaces and uppercases', () => {
    expect(normalizeIban('tr12 0006 2000 0000 0000 0000 00')).toBe('TR120006200000000000000000');
  });
  it('handles empty string', () => {
    expect(normalizeIban('')).toBe('');
  });
});

describe('isValidTrIban', () => {
  it('accepts a 26-char TR IBAN with spaces', () => {
    expect(isValidTrIban('TR12 0006 2000 0000 0000 0000 00')).toBe(true);
  });
  it('accepts a normalized 26-char TR IBAN', () => {
    expect(isValidTrIban('TR120006200000000000000000')).toBe(true);
  });
  it('rejects too-short IBAN', () => {
    expect(isValidTrIban('TR1200062000')).toBe(false);
  });
  it('rejects non-TR IBAN', () => {
    expect(isValidTrIban('DE12000620000000000000000000')).toBe(false);
  });
  it('rejects letters after TR', () => {
    expect(isValidTrIban('TRX20006200000000000000000')).toBe(false);
  });
});

describe('formatIbanDisplay', () => {
  it('groups into blocks of 4 separated by spaces', () => {
    expect(formatIbanDisplay('TR120006200000000000000000')).toBe('TR12 0006 2000 0000 0000 0000 00');
  });
  it('formats partial input as the user types', () => {
    expect(formatIbanDisplay('tr1200')).toBe('TR12 00');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && npx jest src/utils/__tests__/iban.test.ts`
Expected: FAIL — "Cannot find module '../iban'".

- [ ] **Step 3: Write minimal implementation**

`apps/mobile/src/utils/iban.ts`:
```typescript
/**
 * Satıcı IBAN yardımcıları. Backend DTO ile parite:
 * UpsertBankAccountDto @Matches(/^TR\d{24}$/) — boşluksuz, 26 karakter, büyük harf.
 * Service ayrıca normalize eder (replace(/\s/g,'').toUpperCase()).
 */

/** Boşlukları siler, büyük harfe çevirir — gönderilecek kanonik form. */
export function normalizeIban(raw: string): string {
  return (raw || '').replace(/\s/g, '').toUpperCase();
}

/** Backend regex'i ile birebir: TR + 24 rakam (toplam 26 karakter). */
export function isValidTrIban(raw: string): boolean {
  return /^TR\d{24}$/.test(normalizeIban(raw));
}

/** Girişte gösterim: normalize edip 4'erli bloklara böler. */
export function formatIbanDisplay(raw: string): string {
  const normalized = normalizeIban(raw);
  return normalized.replace(/(.{4})/g, '$1 ').trim();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && npx jest src/utils/__tests__/iban.test.ts`
Expected: PASS — all assertions green.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/utils/iban.ts apps/mobile/src/utils/__tests__/iban.test.ts
git commit -m "feat(mobile): IBAN doğrulama/format yardımcısı"
```

---

## Task 2: Web IBAN yardımcısı

**Files:**
- Create: `apps/web/src/lib/iban.ts`

Web'de birim test koşucusu yok; mantık Task 1 ile birebir aynıdır ve web doğrulaması Task 6 (gate) ve Task 8 (e2e) ile yapılır.

- [ ] **Step 1: Write the implementation**

`apps/web/src/lib/iban.ts`:
```typescript
/**
 * Satıcı IBAN yardımcıları. Backend DTO ile parite:
 * UpsertBankAccountDto @Matches(/^TR\d{24}$/) — boşluksuz, 26 karakter, büyük harf.
 */

/** Boşlukları siler, büyük harfe çevirir — gönderilecek kanonik form. */
export function normalizeIban(raw: string): string {
  return (raw || '').replace(/\s/g, '').toUpperCase();
}

/** Backend regex'i ile birebir: TR + 24 rakam (toplam 26 karakter). */
export function isValidTrIban(raw: string): boolean {
  return /^TR\d{24}$/.test(normalizeIban(raw));
}

/** Girişte gösterim: normalize edip 4'erli bloklara böler. */
export function formatIbanDisplay(raw: string): string {
  const normalized = normalizeIban(raw);
  return normalized.replace(/(.{4})/g, '$1 ').trim();
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i iban || echo "no iban type errors"`
Expected: "no iban type errors".

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/iban.ts
git commit -m "feat(web): IBAN doğrulama/format yardımcısı"
```

---

## Task 3: Web API client — bankAccountApi

**Files:**
- Modify: `apps/web/src/lib/api.ts` (addressesApi bloğunun hemen ardına, satır ~463)

- [ ] **Step 1: Add the API client block**

`apps/web/src/lib/api.ts` içinde `addressesApi` nesnesinin kapanış `};`'inden (satır 463) hemen sonra ekle:
```typescript
// Seller Bank Account (IBAN) — backend: user.controller.ts GET/PATCH/DELETE /users/me/bank-account
export const bankAccountApi = {
  get: () => api.get('/users/me/bank-account'),
  upsert: (data: {
    accountHolder: string;
    iban: string;
    tcKimlikNo?: string;
    taxId?: string;
  }) => api.patch('/users/me/bank-account', data),
  delete: () => api.delete('/users/me/bank-account'),
};
```

- [ ] **Step 2: Verify it type-checks**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | grep -i "bankAccountApi\|api.ts" || echo "ok"`
Expected: "ok".

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/api.ts
git commit -m "feat(web): bankAccountApi client eklendi"
```

---

## Task 4: Web — /profile/bank-account sayfası

**Files:**
- Create: `apps/web/src/app/profile/bank-account/page.tsx`

Desen: `apps/web/src/app/profile/addresses/page.tsx` (auth guard + useQuery + toast + @tarodan/ui Input/Button).

- [ ] **Step 1: Create the page**

`apps/web/src/app/profile/bank-account/page.tsx`:
```typescript
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { TrashIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { bankAccountApi } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import AuthLoadingScreen from '@/components/AuthLoadingScreen';
import { Button, Input } from '@tarodan/ui';
import { isValidTrIban, normalizeIban, formatIbanDisplay } from '@/lib/iban';

interface BankAccount {
  id: string;
  accountHolder: string;
  iban: string;
  tcKimlikNo?: string | null;
  taxId?: string | null;
  isVerified: boolean;
}

export default function BankAccountPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();

  const [form, setForm] = useState({ accountHolder: '', iban: '', tcKimlikNo: '', taxId: '' });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.push('/login?redirect=/profile/bank-account');
    }
  }, [authLoading, isAuthenticated, router]);

  const accountQuery = useQuery({
    queryKey: ['bank-account'],
    queryFn: async (): Promise<BankAccount | null> => {
      const res = await bankAccountApi.get();
      return res.data || null;
    },
    enabled: !authLoading && isAuthenticated,
  });

  // Sunucudan gelen kayıt formu doldursun (IBAN boşluklu gösterilir).
  useEffect(() => {
    const acc = accountQuery.data;
    if (acc) {
      setForm({
        accountHolder: acc.accountHolder || '',
        iban: formatIbanDisplay(acc.iban || ''),
        tcKimlikNo: acc.tcKimlikNo || '',
        taxId: acc.taxId || '',
      });
    }
  }, [accountQuery.data]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (form.accountHolder.trim().length < 2) {
      toast.error('Hesap sahibi adı en az 2 karakter olmalıdır');
      return;
    }
    if (!isValidTrIban(form.iban)) {
      toast.error('Geçerli bir TR IBAN giriniz (TR + 24 rakam)');
      return;
    }
    if (form.tcKimlikNo && !/^\d{11}$/.test(form.tcKimlikNo)) {
      toast.error('TC Kimlik No 11 rakam olmalıdır');
      return;
    }

    const payload = {
      accountHolder: form.accountHolder.trim(),
      iban: normalizeIban(form.iban),
      ...(form.tcKimlikNo ? { tcKimlikNo: form.tcKimlikNo } : {}),
      ...(form.taxId ? { taxId: form.taxId } : {}),
    };

    setIsSaving(true);
    try {
      await bankAccountApi.upsert(payload);
      toast.success('Banka hesabı kaydedildi');
      await queryClient.invalidateQueries({ queryKey: ['bank-account'] });
    } catch (error: any) {
      const msg = error.response?.data?.message || 'Kaydetme başarısız';
      toast.error(Array.isArray(msg) ? msg[0] : msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Banka hesabınızı silmek istediğinize emin misiniz?')) return;
    try {
      await bankAccountApi.delete();
      toast.success('Banka hesabı silindi');
      setForm({ accountHolder: '', iban: '', tcKimlikNo: '', taxId: '' });
      await queryClient.invalidateQueries({ queryKey: ['bank-account'] });
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Silme başarısız');
    }
  };

  if (authLoading) return <AuthLoadingScreen />;
  if (!isAuthenticated) return null;

  const existing = accountQuery.data;

  return (
    <div className="min-h-screen bg-surface">
      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Banka Hesabı / IBAN</h1>
          <p className="text-muted">
            Satışlarınızdan elde ettiğiniz tutar bu IBAN&apos;a aktarılır.
          </p>
        </div>

        {existing && (
          <div className="mb-6 flex items-center gap-2">
            {existing.isVerified ? (
              <span className="inline-block px-2 py-1 bg-success-100 text-success-700 text-xs rounded">
                Doğrulandı
              </span>
            ) : (
              <span className="inline-block px-2 py-1 bg-warning-100 text-warning-700 text-xs rounded">
                Doğrulanmadı
              </span>
            )}
          </div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-surface-elevated rounded shadow-sm p-6"
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-body mb-1">
                Hesap Sahibi <span className="text-danger-500">*</span>
              </label>
              <Input
                type="text"
                value={form.accountHolder}
                onChange={(e) => setForm({ ...form, accountHolder: e.target.value })}
                className="rounded"
                placeholder="Ad Soyad / Firma Ünvanı"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-body mb-1">
                IBAN <span className="text-danger-500">*</span>
              </label>
              <Input
                type="text"
                value={form.iban}
                onChange={(e) => setForm({ ...form, iban: formatIbanDisplay(e.target.value) })}
                className="rounded font-mono"
                placeholder="TR.. .... .... .... .... .... .."
                required
              />
              <p className="text-xs text-muted mt-1">TR ile başlayan 26 karakterli IBAN</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-body mb-1">
                TC Kimlik No (opsiyonel)
              </label>
              <Input
                type="text"
                value={form.tcKimlikNo}
                onChange={(e) =>
                  setForm({ ...form, tcKimlikNo: e.target.value.replace(/\D/g, '').slice(0, 11) })
                }
                className="rounded"
                placeholder="11 rakam"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-body mb-1">
                Vergi No (opsiyonel)
              </label>
              <Input
                type="text"
                value={form.taxId}
                onChange={(e) => setForm({ ...form, taxId: e.target.value.slice(0, 20) })}
                className="rounded"
                placeholder="Kurumsal hesaplar için"
              />
            </div>

            {existing && (
              <p className="text-xs text-muted">
                Bilgileri güncellerseniz hesabınız yeniden doğrulanana kadar
                &quot;Doğrulanmadı&quot; durumuna döner.
              </p>
            )}

            <div className="flex gap-3 pt-2">
              {existing && (
                <Button
                  variant="secondary"
                  type="button"
                  onClick={handleDelete}
                  className="flex items-center gap-2 px-4 py-2 text-danger-500 hover:bg-danger-50 rounded"
                >
                  <TrashIcon className="w-5 h-5" />
                  Sil
                </Button>
              )}
              <Button
                variant="secondary"
                type="submit"
                disabled={isSaving}
                className="flex-1 px-4 py-2 bg-primary-500 text-inverted rounded hover:bg-primary-600 disabled:opacity-60"
              >
                {isSaving ? 'Kaydediliyor...' : existing ? 'Güncelle' : 'Kaydet'}
              </Button>
            </div>
          </form>
        </motion.div>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | grep "bank-account/page" || echo "ok"`
Expected: "ok".

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/profile/bank-account/page.tsx
git commit -m "feat(web): satıcı IBAN yönetim sayfası (/profile/bank-account)"
```

---

## Task 5: Web — profil menüsüne IBAN linki

**Files:**
- Modify: `apps/web/src/app/profile/page.tsx:377-378`

- [ ] **Step 1: Add the menu entry**

`apps/web/src/app/profile/page.tsx` içinde, adresler menü satırının (`href: '/profile/addresses'`) hemen ardına yeni bir giriş ekle. Mevcut iki satır:
```typescript
        { icon: MapPinIcon, label: t('address.myAddresses'), href: '/profile/addresses', desc: 'Teslimat adresleriniz' },
        { icon: ClockIcon, label: t('payment.history'), href: '/profile/payments', desc: 'Ödeme geçmişiniz' },
```
Bunların arasına ekle (mevcut import'lardan `BanknotesIcon` kullanılır — yoksa import satırına ekle, bkz. Step 2):
```typescript
        { icon: MapPinIcon, label: t('address.myAddresses'), href: '/profile/addresses', desc: 'Teslimat adresleriniz' },
        { icon: BanknotesIcon, label: 'Banka Hesabı / IBAN', href: '/profile/bank-account', desc: 'Ödemeleriniz bu IBAN\'a aktarılır' },
        { icon: ClockIcon, label: t('payment.history'), href: '/profile/payments', desc: 'Ödeme geçmişiniz' },
```

- [ ] **Step 2: Ensure the icon is imported**

`apps/web/src/app/profile/page.tsx` üst kısmındaki `@heroicons/react/24/outline` import bloğuna `BanknotesIcon`'u ekle (zaten varsa atla). Kontrol et:
```bash
grep -n "BanknotesIcon" apps/web/src/app/profile/page.tsx
```
Yoksa, `MapPinIcon`'ün import edildiği satıra `BanknotesIcon,` ekle.

- [ ] **Step 3: Verify it type-checks**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | grep "profile/page" || echo "ok"`
Expected: "ok".

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/profile/page.tsx
git commit -m "feat(web): profil menüsüne banka hesabı linki"
```

---

## Task 6: Web — ilan-verme gate'i

**Files:**
- Modify: `apps/web/src/app/listings/new/page.tsx`

Banka hesabı yoksa formu kilitleyen uyarı + CTA. Mevcut "Listing Limit Info" bloğunun (satır ~793-836) hemen ardına eklenir; form (`<form onSubmit={handleSubmit}>`, satır ~838) yalnızca hesap varsa render edilir.

- [ ] **Step 1: Add the bank-account query**

Dosyanın üstüne import ekle (mevcut import bloğuna):
```typescript
import { bankAccountApi } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
```
(Not: `useQuery` zaten import edilmiş olabilir — `grep -n "useQuery" apps/web/src/app/listings/new/page.tsx` ile kontrol et, varsa tekrar ekleme.)

`NewListingPage` bileşeni içinde, diğer hook'ların yanında (örn. `canCreateListing` destructure'ının yakınında) ekle:
```typescript
  const bankAccountQuery = useQuery({
    queryKey: ['bank-account'],
    queryFn: async () => {
      const res = await bankAccountApi.get();
      return res.data || null;
    },
    enabled: isAuthenticated,
  });
  const hasBankAccount = !!bankAccountQuery.data;
  const bankAccountLoading = bankAccountQuery.isLoading;
```

- [ ] **Step 2: Render the gate and guard the form**

`apps/web/src/app/listings/new/page.tsx` içinde "Listing Limit Info" bloğunun kapanışından sonra, `<form onSubmit={handleSubmit} ...>`'ten ÖNCE ekle:
```typescript
          {/* Banka Hesabı Gate — IBAN yoksa ilan verilemez (no_bank_account payout fail'ini önler) */}
          {!bankAccountLoading && !hasBankAccount && (
            <div className="mb-5 p-4 rounded border bg-danger-50 border-danger-200">
              <p className="font-medium text-danger-800 mb-1">
                İlan vermeden önce banka hesabı eklemelisiniz
              </p>
              <p className="text-sm text-danger-700 mb-3">
                Satışlarınızdan elde edeceğiniz tutarın size aktarılabilmesi için IBAN bilgisi
                gereklidir.
              </p>
              <ButtonLink href="/profile/bank-account">IBAN Ekle</ButtonLink>
            </div>
          )}
```
Ardından mevcut `<form onSubmit={handleSubmit} className="space-y-5">` satırını koşullu hale getir — formu açan satırı şu şekilde sar:
```typescript
          {!bankAccountLoading && hasBankAccount && (
          <form onSubmit={handleSubmit} className="space-y-5">
```
ve formun kapanış `</form>` etiketinden sonra koşulu kapat:
```typescript
          </form>
          )}
```
(`ButtonLink` bu dosyada zaten import edilmiş — Listing Limit bloğunda kullanılıyor.)

- [ ] **Step 3: Verify it type-checks**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | grep "listings/new" || echo "ok"`
Expected: "ok".

- [ ] **Step 4: Manual verification**

API (3001) + web (3000) ayaktayken, banka hesabı OLMAYAN bir satıcı ile `/listings/new` aç → kırmızı uyarı + "IBAN Ekle" görünür, form gizli. `/profile/bank-account`'tan IBAN kaydet, `/listings/new`'e dön → form görünür.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/listings/new/page.tsx
git commit -m "feat(web): ilan-verme öncesi banka hesabı gate'i"
```

---

## Task 7: Mobil API client — bankAccountApi

**Files:**
- Modify: `apps/mobile/src/services/api.ts`

- [ ] **Step 1: Add the API client block**

`apps/mobile/src/services/api.ts` içinde `userApi` nesnesinin tanımının hemen ardına ekle (dosyadaki diğer `export const xApi = {` blokları kalıbıyla):
```typescript
// Seller Bank Account (IBAN) — backend: GET/PATCH/DELETE /users/me/bank-account
export const bankAccountApi = {
  get: () => api.get('/users/me/bank-account'),
  upsert: (data: { accountHolder: string; iban: string; tcKimlikNo?: string; taxId?: string }) =>
    api.patch('/users/me/bank-account', data),
  remove: () => api.delete('/users/me/bank-account'),
};
```

- [ ] **Step 2: Verify it type-checks**

Run: `cd apps/mobile && npx tsc --noEmit 2>&1 | grep "services/api" || echo "ok"`
Expected: "ok".

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/services/api.ts
git commit -m "feat(mobile): bankAccountApi client eklendi"
```

---

## Task 8: Mobil — /settings/bank-account ekranı

**Files:**
- Create: `apps/mobile/app/settings/bank-account.tsx`

Desen: `apps/mobile/app/settings/edit-profile.tsx` (react-hook-form + zod + Snackbar + ScreenHeader). Expo Router dosya tabanlı olduğu için `_layout.tsx` değişikliği gerekmez.

- [ ] **Step 1: Create the screen**

`apps/mobile/app/settings/bank-account.tsx`:
```typescript
import { View, ScrollView, StyleSheet } from 'react-native';
import {
  Button,
  Card,
  Input,
  Text,
  Snackbar,
  ScreenHeader,
  appAlert,
  theme,
} from '@tarodan/ui-native';
import { useState, useEffect } from 'react';
import { router } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { bankAccountApi } from '../../src/services/api';
import { useAuthStore } from '../../src/stores/authStore';
import { isValidTrIban, normalizeIban, formatIbanDisplay } from '../../src/utils/iban';

const { colors, spacing } = theme;

const bankAccountSchema = z.object({
  accountHolder: z.string().min(2, 'Hesap sahibi adı en az 2 karakter olmalı').max(150),
  iban: z.string().refine((v) => isValidTrIban(v), 'Geçerli bir TR IBAN giriniz (TR + 24 rakam)'),
  tcKimlikNo: z
    .string()
    .regex(/^\d{11}$/, 'TC Kimlik No 11 rakam olmalı')
    .optional()
    .or(z.literal('')),
  taxId: z.string().max(20).optional().or(z.literal('')),
});

type BankAccountForm = {
  accountHolder: string;
  iban: string;
  tcKimlikNo?: string;
  taxId?: string;
};

export default function BankAccountScreen() {
  const { isAuthenticated } = useAuthStore();
  const queryClient = useQueryClient();
  const [snackbar, setSnackbar] = useState<{
    visible: boolean;
    message: string;
    variant?: 'default' | 'success' | 'danger';
  }>({ visible: false, message: '' });

  const accountQuery = useQuery({
    queryKey: ['bank-account'],
    queryFn: async () => {
      const res = await bankAccountApi.get();
      return res.data || null;
    },
    enabled: isAuthenticated,
  });

  const { control, handleSubmit, reset, formState: { errors } } = useForm<BankAccountForm>({
    resolver: zodResolver(bankAccountSchema),
    defaultValues: { accountHolder: '', iban: '', tcKimlikNo: '', taxId: '' },
  });

  // Sunucudan gelen kayıt formu doldursun.
  useEffect(() => {
    const acc = accountQuery.data;
    if (acc) {
      reset({
        accountHolder: acc.accountHolder || '',
        iban: formatIbanDisplay(acc.iban || ''),
        tcKimlikNo: acc.tcKimlikNo || '',
        taxId: acc.taxId || '',
      });
    }
  }, [accountQuery.data, reset]);

  const upsertMutation = useMutation({
    mutationFn: async (data: BankAccountForm) =>
      bankAccountApi.upsert({
        accountHolder: data.accountHolder.trim(),
        iban: normalizeIban(data.iban),
        ...(data.tcKimlikNo ? { tcKimlikNo: data.tcKimlikNo } : {}),
        ...(data.taxId ? { taxId: data.taxId } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-account'] });
      setSnackbar({ visible: true, message: 'Banka hesabı kaydedildi', variant: 'success' });
    },
    onError: (error: any) => {
      const msg = error.response?.data?.message || 'Kaydetme başarısız';
      setSnackbar({ visible: true, message: Array.isArray(msg) ? msg[0] : msg, variant: 'danger' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => bankAccountApi.remove(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-account'] });
      reset({ accountHolder: '', iban: '', tcKimlikNo: '', taxId: '' });
      setSnackbar({ visible: true, message: 'Banka hesabı silindi', variant: 'success' });
    },
    onError: (error: any) => {
      setSnackbar({
        visible: true,
        message: error.response?.data?.message || 'Silme başarısız',
        variant: 'danger',
      });
    },
  });

  const onSubmit = (data: BankAccountForm) => upsertMutation.mutate(data);

  const handleDelete = () =>
    appAlert('Banka Hesabını Sil', 'Silmek istediğinize emin misiniz?', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: () => deleteMutation.mutate() },
    ]);

  const existing = !!accountQuery.data;

  if (!isAuthenticated) {
    return (
      <View style={styles.centered}>
        <Text variant="h3">Giriş Yapın</Text>
        <Button variant="primary" title="Giriş Yap" onPress={() => router.push('/(auth)/login')} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Banka Hesabı / IBAN"
        onBack={() => router.back()}
        right={
          <Text
            testID="bank-account-submit-button"
            style={styles.saveButton}
            onPress={handleSubmit(onSubmit)}
          >
            Kaydet
          </Text>
        }
      />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Card style={styles.card}>
          <Text variant="bodySm" tone="muted" style={{ marginBottom: spacing[3] }}>
            Satışlarınızdan elde ettiğiniz tutar bu IBAN&apos;a aktarılır.
          </Text>

          <Controller
            control={control}
            name="accountHolder"
            render={({ field: { onChange, value } }) => (
              <Input
                testID="bank-account-holder-input"
                label="Hesap Sahibi *"
                value={value}
                onChangeText={onChange}
                error={errors.accountHolder?.message}
                containerStyle={styles.input}
              />
            )}
          />

          <Controller
            control={control}
            name="iban"
            render={({ field: { onChange, value } }) => (
              <Input
                testID="bank-account-iban-input"
                label="IBAN *"
                value={value}
                onChangeText={(t) => onChange(formatIbanDisplay(t))}
                error={errors.iban?.message}
                placeholder="TR.. .... .... ...."
                autoCapitalize="characters"
                containerStyle={styles.input}
              />
            )}
          />

          <Controller
            control={control}
            name="tcKimlikNo"
            render={({ field: { onChange, value } }) => (
              <Input
                label="TC Kimlik No (opsiyonel)"
                value={value ?? ''}
                onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, 11))}
                error={errors.tcKimlikNo?.message}
                keyboardType="number-pad"
                containerStyle={styles.input}
              />
            )}
          />

          <Controller
            control={control}
            name="taxId"
            render={({ field: { onChange, value } }) => (
              <Input
                label="Vergi No (opsiyonel)"
                value={value ?? ''}
                onChangeText={(t) => onChange(t.slice(0, 20))}
                error={errors.taxId?.message}
                containerStyle={styles.input}
              />
            )}
          />

          {existing && (
            <Text variant="bodySm" tone="muted" style={{ marginTop: spacing[2] }}>
              Bilgileri güncellerseniz hesabınız yeniden doğrulanana kadar
              &quot;Doğrulanmadı&quot; durumuna döner.
            </Text>
          )}

          <Button
            variant="primary"
            title={existing ? 'Güncelle' : 'Kaydet'}
            onPress={handleSubmit(onSubmit)}
            loading={upsertMutation.isPending}
            style={{ marginTop: spacing[4] }}
          />

          {existing && (
            <Button
              testID="bank-account-delete-button"
              variant="ghost"
              title="Banka Hesabını Sil"
              onPress={handleDelete}
              style={{ marginTop: spacing[2] }}
            />
          )}
        </Card>
      </ScrollView>

      <Snackbar
        visible={snackbar.visible}
        message={snackbar.message}
        variant={snackbar.variant}
        onDismiss={() => setSnackbar((s) => ({ ...s, visible: false }))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.backgroundSecondary },
  content: { flex: 1, paddingHorizontal: spacing[4] },
  card: { marginTop: spacing[4], padding: spacing[4] },
  input: { marginBottom: spacing[3] },
  saveButton: { color: colors.primary[600], fontWeight: '600' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing[3] },
});
```

- [ ] **Step 2: Verify it type-checks**

Run: `cd apps/mobile && npx tsc --noEmit 2>&1 | grep "bank-account" || echo "ok"`
Expected: "ok". (Eğer `@tarodan/ui-native` Input/Button prop'ları farklıysa — örn. `loading` yerine `isLoading`, ya da `Text` `onPress` desteklemiyorsa — `apps/mobile/app/settings/edit-profile.tsx` ve `apps/mobile/app/settings/payments.tsx` içindeki gerçek prop kullanımına göre düzelt.)

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/settings/bank-account.tsx
git commit -m "feat(mobile): satıcı IBAN yönetim ekranı (/settings/bank-account)"
```

---

## Task 9: Mobil — profil menüsüne IBAN linki

**Files:**
- Modify: `apps/mobile/app/(tabs)/profile.tsx:618-622`

- [ ] **Step 1: Add the MenuItem**

`apps/mobile/app/(tabs)/profile.tsx` içinde "Hesap Ayarları" bölümündeki "Adreslerim" `MenuItem`'ının (satır 618-622) hemen ardına ekle:
```tsx
          <MenuItem
            icon="card-outline"
            label="Banka Hesabı / IBAN"
            onPress={() => router.push('/settings/bank-account')}
          />
```

- [ ] **Step 2: Verify it type-checks**

Run: `cd apps/mobile && npx tsc --noEmit 2>&1 | grep "tabs)/profile" || echo "ok"`
Expected: "ok".

- [ ] **Step 3: Commit**

```bash
git add "apps/mobile/app/(tabs)/profile.tsx"
git commit -m "feat(mobile): profil menüsüne banka hesabı linki"
```

---

## Task 10: Mobil — ilan-verme gate'i

**Files:**
- Modify: `apps/mobile/src/components/listing/ListingForm.tsx`

`mode === 'create'` iken banka hesabı sorgulanır; yoksa submit engellenir + uyarı banner'ı gösterilir.

- [ ] **Step 1: Add the bank-account query**

`apps/mobile/src/components/listing/ListingForm.tsx` import bloğuna ekle:
```typescript
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { bankAccountApi } from '../../services/api';
```
(`useQueryClient` zaten satır 22'de import ediliyor — o satırı yukarıdaki gibi `useQuery` ekleyecek şekilde genişlet, çift import yapma. `bankAccountApi`'yi satır 27'deki `from '../../services/api'` import'una ekleyebilirsin.)

`ListingForm` bileşeni içinde, `isEdit` tanımının yakınında ekle:
```typescript
  const bankAccountQuery = useQuery({
    queryKey: ['bank-account'],
    queryFn: async () => {
      const res = await bankAccountApi.get();
      return res.data || null;
    },
    enabled: !isEdit,
  });
  const hasBankAccount = isEdit || !!bankAccountQuery.data;
```

- [ ] **Step 2: Guard submit**

`handleSubmit` (satır 646) içinde, limit kontrolünden (satır 649-655) ÖNCE ekle:
```typescript
    if (!isEdit && !hasBankAccount) {
      appAlert(
        'Banka Hesabı Gerekli',
        'İlan vermeden önce IBAN bilgilerinizi eklemelisiniz. Satışlarınızdan elde edeceğiniz tutar bu IBAN\'a aktarılır.',
        [
          { text: 'Vazgeç', style: 'cancel' },
          { text: 'IBAN Ekle', onPress: () => router.push('/settings/bank-account') },
        ],
      );
      return;
    }
```
(`router` bu dosyada `expo-router`'dan import edilmiş — yoksa `import { router } from 'expo-router';` ekle; `grep -n "from 'expo-router'" apps/mobile/src/components/listing/ListingForm.tsx` ile kontrol et.)

- [ ] **Step 3: Add a visible banner (formun üstünde)**

Formun render kök View'ının başında (ilk `<ScrollView>` veya kart başlangıcının hemen içinde) ekle:
```tsx
        {!isEdit && !bankAccountQuery.isLoading && !hasBankAccount && (
          <Card style={{ margin: spacing[4], padding: spacing[4], backgroundColor: colors.danger[50] }}>
            <Text variant="label" style={{ color: colors.danger[800], marginBottom: spacing[1] }}>
              İlan vermeden önce banka hesabı ekleyin
            </Text>
            <Text variant="bodySm" style={{ color: colors.danger[700], marginBottom: spacing[2] }}>
              Satışlarınızdan elde edeceğiniz tutarın aktarılabilmesi için IBAN gereklidir.
            </Text>
            <Button
              variant="primary"
              title="IBAN Ekle"
              onPress={() => router.push('/settings/bank-account')}
            />
          </Card>
        )}
```
(`Card`, `Text`, `Button`, `theme`/`colors`/`spacing` bu dosyada zaten kullanılıyor mu kontrol et — satır 23 `theme`'i import ediyor. Eksik component varsa `@tarodan/ui-native`'den import et, edit-profile.tsx kalıbıyla aynı.)

- [ ] **Step 4: Verify it type-checks**

Run: `cd apps/mobile && npx tsc --noEmit 2>&1 | grep "ListingForm" || echo "ok"`
Expected: "ok".

- [ ] **Step 5: Run existing ListingForm test to ensure no regression**

Run: `cd apps/mobile && npx jest src/components/listing/__tests__/ListingForm.test.tsx`
Expected: PASS (mevcut test bozulmamalı; bozulduysa testin mock'larına `bankAccountApi.get` ekle).

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/components/listing/ListingForm.tsx
git commit -m "feat(mobile): ilan-verme öncesi banka hesabı gate'i"
```

---

## Task 11: (Opsiyonel) Web e2e — j050 journey'ini UI üzerinden sürmek

**Files:**
- Modify: `apps/web/e2e/journeys/j050-satici-iban-ini-birkac-kez-hatali-giriyor.spec.ts`

Mevcut journey API'yi doğrudan test ediyor. Yeni UI eklendiğine göre, hatalı→düzeltme akışını `/profile/bank-account` sayfası üzerinden süren bir test bloğu eklenebilir. Web'de birim test koşucusu olmadığından bu, web UI doğrulamasının birincil otomatik yoludur.

- [ ] **Step 1: Add a UI-driven test block**

Journey dosyasının sonuna yeni `test(...)` ekle: satıcı token ile login (`loginViaToken`), `/profile/bank-account` git, geçersiz IBAN gir → toast hata, sonra geçerli IBAN gir → toast başarı, sayfayı yenile → IBAN dolu gelir. (Dosyadaki mevcut `loginViaToken`, `USERS`, `API` yardımcılarını kullan.)

```typescript
test('J50-UI — satıcı IBAN sayfasında hatalı sonra doğru girer', async ({ page, request }) => {
  await loginViaToken(page, request, USERS.seller);
  await page.goto('/profile/bank-account');

  await page.getByPlaceholder('Ad Soyad / Firma Ünvanı').fill('Test Satıcı');
  await page.getByPlaceholder(/TR\.\./).fill('TR123'); // geçersiz
  await page.getByRole('button', { name: /Kaydet|Güncelle/ }).click();
  await expect(page.getByText(/Geçerli bir TR IBAN/)).toBeVisible();

  await page.getByPlaceholder(/TR\.\./).fill('TR12 0006 2000 0000 0000 0000 00');
  await page.getByRole('button', { name: /Kaydet|Güncelle/ }).click();
  await expect(page.getByText(/Banka hesabı kaydedildi/)).toBeVisible();
});
```

- [ ] **Step 2: Run the journey**

Run: `cd apps/web && npx playwright test e2e/journeys/j050-satici-iban-ini-birkac-kez-hatali-giriyor.spec.ts`
Expected: PASS (API + tarodan_test DB ayakta olmalı). Selektörler `Input` component'inin gerçek render'ına göre ayarlanmalı.

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/journeys/j050-satici-iban-ini-birkac-kez-hatali-giriyor.spec.ts
git commit -m "test(web/e2e): j050 IBAN akışını UI üzerinden sür"
```

---

## Self-Review Notes

- **Spec kapsamı:** Ortak yardımcı (Task 1-2), web sayfası (Task 4) + menü (Task 5) + gate (Task 6), mobil ekran (Task 8) + menü (Task 9) + gate (Task 10), API client'ler (Task 3, 7). Spec'in tüm bileşenleri karşılanıyor. Kapsam dışı maddeler (payout listesi, isVerified onay akışı, KYC) plana dahil edilmedi — isVerified yalnızca read-only rozet olarak gösteriliyor (spec ile uyumlu).
- **Tip tutarlılığı:** Üç yardımcı fonksiyon imzası (`normalizeIban`, `isValidTrIban`, `formatIbanDisplay`) web ve mobilde aynı. API client metod adları: web `bankAccountApi.delete`, mobil `bankAccountApi.remove` (mobilde `delete` rezerve kelime karışıklığını önlemek için bilinçli) — her ekran kendi client'ini doğru adla çağırıyor.
- **react-query anahtarı:** Her iki uygulamada `['bank-account']` — sayfa, gate ve mutation invalidation aynı anahtarı paylaşır.
- **Doğrulama paritesi:** İstemci kuralları DTO ile birebir (accountHolder 2-150, iban `/^TR\d{24}$/`, tcKimlikNo `/^\d{11}$/`, taxId ≤20).
