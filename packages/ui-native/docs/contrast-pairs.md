# Tarodan — Renk + Kontrast Referansı

Bu paketteki tüm primitif'ler `@tarodan/design-tokens` üzerinden semantic
token'lardan beslenir. Token'lar WCAG 2.1 AA (≥4.5:1 normal text, ≥3:1 large text)
geçen çiftler verecek şekilde seçildi. Hex literal yazmayın — `Text tone="..."` ya
da `colors.X.Y` üzerinden çekin.

## Onaylı text/zemin çiftleri

| Zemin (background) | Onaylı text token'ları | Kontrast |
|---|---|---|
| `surface.DEFAULT` (#fafaf9 ~ neredeyse beyaz) | `text.heading`, `text.body`, `text.muted`, `text.subtle` | ≥4.5:1 (subtle hariç large-text only) |
| `surface.alt` (#f5f5f4) | `text.heading`, `text.body`, `text.muted` | ≥4.5:1 |
| `surface.elevated` (#ffffff) | `text.heading`, `text.body`, `text.muted` | ≥4.5:1 |
| `primary.600` (#ea580c, brand turuncu) | `white` / `text.inverted` | 4.6:1 |
| `primary.700` (#c2410c) | `white` / `text.inverted` | 6.0:1 |
| `primary.50` (#fff7ed, soft) | `primary.700`, `primary.800`, `text.heading` | ≥4.5:1 |
| `danger.600` (#dc2626) | `white` / `text.inverted` | 4.5:1 |
| `danger.50` (#fef2f2) | `danger.700`, `text.heading` | ≥5:1 |
| `success.600` (#16a34a) | `white` | 3.4:1 ❌ — sadece **bold** ya da ≥18pt için kullan |
| `success.700` (#15803d) | `white` | 4.6:1 ✓ |
| `success.50` | `success.700`, `text.heading` | ≥4.5:1 |
| `warning.500` (#f59e0b) | `gray.900` ya da `warning.900` | ≥4.5:1 — beyaz YAZIK kullanma |
| `warning.50` | `warning.800`, `text.heading` | ≥5:1 |
| `info.600` (#2563eb) | `white` | 4.7:1 |
| `info.50` | `info.700`, `text.heading` | ≥5:1 |

## Kullanım kuralı

```tsx
// ❌ HATA — hex literal
<Text style={{ color: '#fff' }}>...</Text>

// ❌ HATA — açık zemin + açık text
<View style={{ backgroundColor: '#fff' }}>
  <Text style={{ color: '#aaa' }}>...</Text>
</View>

// ✅ DOĞRU — semantic token'lar
import { Text } from '@tarodan/ui-native';
<Text variant="h1">Başlık</Text>          // text.heading on surface.DEFAULT
<Text variant="body" tone="muted">...</Text>
<Text tone="inverted">Buton içi</Text>    // primary.600 üzeri
```

## Kontrast başarısız çiftler (kaçınılacaklar)

- `surface.DEFAULT` + `text.subtle` → tek başına ≥18pt'a uygun, küçük metin için **hayır**
- `success.600` + `white` → 3.4:1 → bold/large değilse **success.700** kullan
- `warning.500` + `white` → ❌ → koyu yazıyla (`gray.900`) kullan
- `gray.300` + `gray.500` → düşük kontrast → muted text'i `text.muted` (gray.500) on `surface.DEFAULT` (gray.50)
  olarak kur, `gray.300` üstünde değil

## Token genişlemeleri

Yeni semantic eşleştirme gerekiyorsa (örn. yeni status renk seti) bu dosyaya ekle ve
`packages/design-tokens/src/colors.ts`'te export'la. Ekran-içi hex YASAK.
