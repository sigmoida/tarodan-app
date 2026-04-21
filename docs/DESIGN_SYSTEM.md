# Tarodan Design System

Bu dokümanda, monorepo genelinde tekilleştirilmiş UI & design-token mimarisi ve
günlük geliştirme sırasında nasıl doğrulanacağı anlatılmaktadır.

## Mimari

```
packages/
  design-tokens/   -> tek gerçek kaynak (renk, radius, shadow, spacing, typo, motion)
  ui/              -> React + Tailwind tabanlı web/admin bileşenleri; preset tokens'dan üretilir
  ui-native/       -> React Native StyleSheet tabanlı mobile bileşenleri; tokens'ı doğrudan tüketir

apps/
  web/    -> @tarodan/ui üzerinden paylaşılan primitiveleri import eder
  admin/  -> @tarodan/ui + preset; yerel shadcn wrapper'lar kaldırıldı
  mobile/ -> @tarodan/ui-native + shim common/Button & common/Input
```

### Renk semantiği

Raw Tailwind paleti (`bg-red-500`, `text-blue-600` vb.) **kullanılmaz**. Yerine:

| Eski                       | Yeni                | Ne zaman kullanılır                        |
| -------------------------- | ------------------- | ------------------------------------------ |
| `red`, `rose`, `pink`      | `danger`            | Hata, silme, kritik uyarı                  |
| `green`, `emerald`, `teal` | `success`           | Başarı, onay, aktif                        |
| `blue`, `sky`, `indigo`    | `info`              | Bilgilendirme, nötr vurgusu                |
| `amber`, `yellow`          | `warning`           | Dikkat, pending                            |
| `orange`, `purple`         | `primary`           | Marka rengi, CTA                           |
| `gray`                     | `surface`, `muted`  | Nötr arka planlar ve metinler              |

`heading`, `body`, `muted`, `subtle` ve `surface`/`surface-alt`/`surface-elevated`
tokens'ları metin ve yüzeyler için kullanılmalıdır (bkz. `packages/design-tokens/src/colors.ts`).

## Paylaşılan primitiveler (`@tarodan/ui`)

- `Button`, `IconButton`, `ButtonLink` (web)
- `Input`, `SearchInput`, `Textarea`, `Select`, `Checkbox`, `Radio`, `RadioGroup`, `Toggle`, `Label`, `FormField`
- `Card`, `Badge`, `ProductBadge`, `StatusBadge`, `Alert`, `EmptyState`
- `Modal`, `Dialog`, `ConfirmDialog`
- `Tabs`, `DropdownMenu`, `Tooltip`, `Pagination`
- `Table`, `Breadcrumb`, `Avatar`, `Skeleton`, `Spinner`

Tümü `packages/ui/src/index.ts` üzerinden export edilir. Kullanımı:

```tsx
import { Button, Input, Card, Table } from '@tarodan/ui';
```

## Mobile (`@tarodan/ui-native`)

React Native eşdeğerleri aynı adla:

```tsx
import { Button, Input, Card, Modal, theme } from '@tarodan/ui-native';
```

Mobile app'te `apps/mobile/src/components/common/{Button,Input}.tsx` **yalnızca
ince shim**'tir — legacy prop isimlerini (`title`, `hint`, `leftIcon` vb.) yeni
API'ye yönlendirir. Yeni ekranlarda doğrudan `@tarodan/ui-native` kullanın.

## Enforcement: ESLint kuralları

`apps/web/.eslintrc.json` ve `apps/admin/.eslintrc.json` şunları uyarır:

- `<input>`, `<button>`, `<select>`, `<textarea>` gibi ham HTML form elementleri
- Ham Tailwind palet renkleri (`bg-red-500`, `text-blue-300`, ...)

Uyarılar CI'da görünür; yeni kod bunlardan kaçınmalıdır.

## Codemod'lar

Script'ler `scripts/codemods/` altında:

- `migrate-colors.mjs` — ham Tailwind renklerini semantic token'lara dönüştürür
- `migrate-elements.mjs` — ham HTML form/control element'lerini `@tarodan/ui` primitive'leriyle değiştirir

```bash
node scripts/codemods/migrate-colors.mjs [--dry] [--path <glob>]
node scripts/codemods/migrate-elements.mjs apps/<app>/src
```

## Nasıl doğrulanır?

### 1. Tip doğrulama

```bash
pnpm -r --filter '!@tarodan/mobile' typecheck
```

Tüm paketler ve `apps/{api,admin,web}` 0 hatayla geçmelidir.

> Not: `apps/mobile` önceden var olan tip sorunları nedeniyle `typecheck`
> script'inden çıkarıldı. Mobile tarafı ekran bazlı aşamalı olarak
> temizlenebilir.

### 2. Lint doğrulama

```bash
pnpm --filter @tarodan/admin lint
pnpm --filter @tarodan/web lint
```

Beklenen çıktıda **0** `no-restricted-syntax` uyarısı olmalıdır. (Birkaç
`react/no-unescaped-entities` pre-existing hatası kalabilir; bunlar design
system ile ilgili değildir.)

### 3. Görsel regresyon (manuel)

Aşağıdaki yoğun kullanılan sayfaları tarayıcıda açıp UI bütünlüğünü kontrol
edin:

**Admin**
- `/` (dashboard)
- `/orders`, `/orders/[id]`
- `/products`, `/products/[id]`
- `/users`, `/users/[id]`
- `/sellers/performance`, `/sellers/applications`
- `/payments`, `/payments/statistics`
- `/discounts`, `/commission`, `/support/[id]`
- `/login`

**Web**
- `/` (anasayfa)
- `/listings`, `/listings/[id]`, `/listings/new`
- `/checkout`, `/cart`
- `/profile/edit`, `/profile/addresses`, `/profile/payments`
- `/trades`, `/trades/[id]`, `/trades/new`
- `/collections`, `/collections/[id]`
- `/login`, `/register`, `/register/business`, `/forgot-password`
- `/membership/checkout`, `/membership/manage`

Kontrol edilecekler:
- Butonların renk/ton/boyutları doğru (primary = turuncu marka rengi)
- Form input ve selectlerin odak halkası `ring-primary-500`
- Error mesajları `danger-600` tonunda
- Success toast'ları ve badge'leri `success` paletinde
- Modaller ve dropdown menüler düzgün açılıyor

### 4. Mobile duman testi

```bash
cd apps/mobile
pnpm start
```

Ekran seti (`LoginScreen`, `HomeScreen`, `ListingsScreen`, `CartScreen`,
`ProfileScreen`) marka rengiyle (turuncu) render olmalı; eski shim'ler hâlâ
çalışmalı (Button/Input).

## Regresyon kuralları

1. Yeni ekran eklerken her zaman `@tarodan/ui` (web/admin) veya
   `@tarodan/ui-native` (mobile) kullanın.
2. Yeni bir primitive ihtiyacı varsa önce paylaşılan pakete ekleyin, sonra
   tüketin.
3. Tailwind class'larında `primary/danger/success/info/warning/surface/heading/body/muted/subtle`
   dışında ham renk ismi kullanmayın.
4. Eski `components/ui/*` local wrapper'ları yeniden oluşturmayın —
   `@tarodan/ui` zaten re-export ediyor.
