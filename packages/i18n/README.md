# @tarodan/i18n

The shared internationalization package — the single source of truth for locales
and the message catalog consumed by **web, admin, mobile, and api**. Replaces the
three drifting hand-rolled i18n systems.

## Exports

```ts
import {
  locales,
  defaultLocale,
  isLocale,
  resolveLocale, // locale contract
  messages,
  getMessages, // the ICU catalog
  formatMessage, // ICU render primitive (api / tests)
} from "@tarodan/i18n";
import type { Locale, Messages, MessageKey } from "@tarodan/i18n";
```

- **Catalog** — `messages.tr` / `messages.en`, one namespaced ICU MessageFormat
  tree. `tr` and `en` are kept in exact key parity (CI-enforced).
- **`MessageKey`** — a generated union of every dot-path key (e.g.
  `'product.addToCart'`). Gives compile-time autocomplete and fails the build on
  a typo'd key.
- **`formatMessage(msg, values?, locale?)`** — renders an ICU string. Used by api
  (Node) and tests; web/mobile render through their own libraries.

## Namespaces

`common.*` (shared primitives) · bare storefront domains (`auth`, `product`,
`cart`, …, shared by web + mobile) · `mobile.*` (mobile-only) ·
`refund.*` / `stockout.*` (shared) · `admin.*` (admin UI) ·
`server.*` / `email.*` (api-generated messages).

## Codegen & CI gate

`MessageKey` is generated from the catalog. After editing the catalog:

```bash
pnpm --filter @tarodan/i18n codegen
```

`typecheck` fails if (a) `tr`/`en` key sets differ, or (b) the generated union is
stale — so the catalog can never drift or ship stale types.

## Consumer type augmentation

Each app maps its i18n library's types to this catalog (in the app, not here, so
the shared package stays library-agnostic).

**web / admin — next-intl** (`global.d.ts`):

```ts
import type { Messages } from "@tarodan/i18n";
declare global {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface IntlMessages extends Messages {}
}
```

**mobile — i18next** (`i18next.d.ts`):

```ts
import type { Messages } from "@tarodan/i18n";
declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: { translation: Messages };
  }
}
```

**api — @formatjs** — no augmentation; call `formatMessage(getMessages(locale)…)`
with a `MessageKey`.

## Bekleyen İngilizce çeviriler

Web'in TÜM sabit metni katalogdadır (`apps/web` lint kuralı artık `error`), ancak
~1.170 anahtarın İngilizce karşılığı henüz Türkçe kaynak metnin kopyasıdır. Bunlar
bilinçli olarak böyle bırakıldı: çoğu bağlayıcı sözleşme metnidir ve İngilizce
sürümü hukuk kontrolünden geçmeden yayımlanmamalı.

Kalan borç (anahtar sayısına göre en büyük ad alanları):

| Ad alanı                       | Anahtar | İçerik                                       |
| ------------------------------ | ------- | -------------------------------------------- |
| `legal.distanceSales`          | 103     | Ön bilgilendirme + mesafeli satış sözleşmesi |
| `legal.terms`                  | 67      | Kullanım koşulları                           |
| `legal.refundPolicy`           | 64      | İade/iptal politikası                        |
| `legal.cookies`                | 61      | Çerez politikası + envanter                  |
| `guides.content`               | 59      | Kullanım kılavuzları                         |
| `faq.content`                  | 54      | Sıkça sorulan sorular                        |
| `legal.privacy`                | 51      | KVKK aydınlatma metni                        |
| `legal.sellerAgreement`        | 51      | Satıcı sözleşmeleri                          |
| `information.shippingDelivery` | 40      | Kargo ve teslimat                            |
| `support.content`              | 33      | Destek merkezi içeriği                       |

Güncel listeyi üretmek için: tr/en değerleri birebir aynı OLAN ve Türkçe karakter
içeren anahtarları karşılaştırın (`check-catalog.mjs` yalnız anahtar paritesine
bakar, değerlere değil).

Kısa arayüz etiketleri (durum rozetleri, butonlar, form alanları, hata mesajları)
İngilizce'ye çevrilmiştir; borç yalnızca uzun metinlerdedir.

---

# Katkı Rehberi

(Eski `docs/I18N.md` — 2026-08-02'de buraya taşındı.)

## Yeni metin ekleme akışı

1. **Anahtarı iki kataloğa da ekle** — `tr.json` ve `en.json` anahtar setleri
   birebir aynı olmak zorundadır. Türkçe kaynak metindir; İngilizce doğal,
   profesyonel çeviri olmalıdır. Dinamik değerler ICU biçimindedir:
   `"{count} aktif ilanınız var"`; çoğul/seçim için ICU plural/select.
2. **Codegen:** `pnpm --filter @tarodan/i18n codegen` (+ tüketen app'in
   typecheck'i için `pnpm --filter @tarodan/i18n build`).
3. **Tüket:**
   - **web / admin (next-intl):** `const t = useTranslations();` +
     `t("admin.users.title")` (tam yol, namespace argümanı yok). Server
     component'te `getTranslations`. Statik obje/kolon katalogları hook
     çağıramaz → `t`-parametreli builder fonksiyon deseni
     (`type T = ReturnType<typeof useTranslations<never>>`). zod şemaları →
     `schema(t)` factory. Dinamik anahtar lookup'larında `as const` ile
     literal tipleri koruyun.
   - **mobil (i18next + ICU):** `useTranslation` + aynı anahtarlar.
   - **API (NestJS):** exception'lar için
     `throw new NotFoundException(i18nMessage('server.order.notFound', { orderNumber }))`
     — `AllExceptionsFilter` mesajı isteğin dilinde render eder (yanıtta
     `i18nKey` de döner). Controller success mesajları: `I18nService` +
     `@ReqLocale() locale` + `this.i18n.translate(...)`. E-posta/bildirim gibi
     request'siz kanallar alıcının `User.preferredLanguage` tercihiyle render
     edilir.

Anahtar adlandırma: önce `common.*` içinde ara ve varsa YENİDEN KULLAN; yeni
genel etiketse `common.*`'a ekle. Namespace haritası yukarıda.

## Lint guardrail: `@tarodan/no-hardcoded-turkish`

`packages/eslint-plugin` içindeki kural, Türkçe karakter içeren string
literal / template / JSX metnini işaretler (İngilizce, URL, class adı vb.
yanlış-pozitif üretmez).

- **admin:** `error`, istisnasız (dilim override'ları kaldırıldı).
- **web:** `error`. Kalıcı istisna yalnız veri dosyalarıdır (il/ilçe listesi,
  marka ansiklopedisi) ve bunlar **basename** ile eşleştirilir
  (`**/turkeyLocations.ts`, `**/brands-data.ts`): yol `[locale]` ve `(main)`
  gibi glob'da anlamlı karakterler içerdiği için tam-yol deseni hiç eşleşmiyor,
  istisna sessizce çalışmıyordu.
- Kural yalnız `çğıöşüÇĞİÖŞÜ` görür; bu harfleri taşımayan Türkçe metni
  (ör. "Toplam", "Fiyat:") yakalayamaz. İkinci bir tur için AST tabanlı
  tarama gerekir.
- Katalog dışında kalması MEŞRU metin için satır bazlı
  `// eslint-disable-next-line @tarodan/no-hardcoded-turkish -- <gerekçe>`
  kullanın — gerekçesiz disable PR review'da reddedilir.

## CI gate'leri

- `typecheck` → `check-catalog.mjs`: (1) tr/en anahtar paritesi,
  (2) `keys.ts` güncelliği; ikisi de kırmızıda merge'i bloklar.
- Lint job'ı `no-hardcoded-turkish` kuralını uygular (admin'de error).
- API unit testleri kataloğu kaynak koddan tüketir; katalog JSON'ları jest'te
  `apps/api/test/jest-json-default-transform.js` ile sarılır (esModuleInterop
  kapalı — detay o dosyanın yorumunda).

## Yeni dil ekleme (3. dil hazırlığı, #226)

Desteklenen dillerin tek doğruluk kaynağı `src/locale.ts`'teki `locales`
dizisidir — tüketiciler `'tr' | 'en'` union'ı yeniden TANIMLAMAZ, `Locale`
tipini import eder. Yeni dil (örn. `de`) için:

1. `locales` dizisine ekle: `["tr", "en", "de"] as const` — `Locale`,
   `isLocale`, `resolveLocale`, API'nin `Accept-Language` çözümü ve
   `/i18n/translations` otomatik genişler.
2. `src/catalog/de.json` oluştur (tr ile birebir anahtar seti; parity gate'i
   `check-catalog.mjs` içinde yeni locale'i kapsayacak şekilde güncelle),
   `codegen` + `build` çalıştır.
3. `catalog/index.ts`'e import + `messages` objesine ekle.
4. Dil seçicileri güncelle: admin `LocaleSwitcher` (endonim ekle), web locale
   routing (`[locale]` segmenti + middleware matcher) ve harici mobil
   repository'nin i18next resources'ı.
5. Web'de tr|en-bağımlı içerik yapısı KALMADI — `nav/config.ts`,
   `secure-swap/_lib/data.ts`, sipariş/takas/teklif durum etiketleri ve
   `packages/shared/status-configs.ts` katalog anahtarlarına taşındı; yeni dil
   için yalnız `de.json` doldurulur. Harici mobil istemcinin kendi `Locale`
   tipi hâlâ `Record<Locale, ...>`'a genişletilmeli.
6. E-posta/bildirim: `User.preferredLanguage` serbest string kolonudur, şema
   değişikliği gerekmez; `isLocale` yeni dili otomatik kabul eder.

## Sık hatalar

- Tek kataloğa anahtar ekleyip diğerini unutmak → parity gate kırmızı.
- Codegen'i çalıştırmamak → "generated MessageKey union up to date" hatası.
- `t`'yi modül-düzeyi sabitin içinde çağırmak → hook kuralı ihlali; builder
  desenini kullanın.
- Türkçe metni "geçici" hardcode etmek → lint error; anahtar eklemek toplamda
  daha hızlı.
