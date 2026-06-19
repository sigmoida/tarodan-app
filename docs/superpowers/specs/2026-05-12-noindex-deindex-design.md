# tarodan.shop / tarodan.com — Google deindex & noindex spec

**Tarih:** 2026-05-12
**Durum:** Onay bekliyor
**Sahip:** Görkem
**Tetikleyen:** Müşteri talebi — "site şu an Google'da görünmesin, kaldırın".

## Bağlam

- `tarodan` araması ile site Google sonuçlarında üstte çıkıyor.
- Daha önce SEO için manuel bir aksiyon (Search Console kaydı, sitemap submit, vb.) **alınmadı** — indexleme tamamen kodda açık olan SEO meta'ları + `robots.ts` + `sitemap.ts` üzerinden organik gerçekleşti.
- Mevcut kod (web app):
  - [apps/web/src/app/layout.tsx:14-24](../../apps/web/src/app/layout.tsx) → `robots.index = true`, `googleBot.index = true`.
  - [apps/web/src/app/robots.ts](../../apps/web/src/app/robots.ts) → tüm botlara `allow: '/'`.
  - [apps/web/src/app/sitemap.ts](../../apps/web/src/app/sitemap.ts) → sitemap üretimi açık.
  - OpenGraph, Twitter Card, `keywords` meta'ları dolu.
- **Domain belirsizliği:** Kod `tarodan.com` referanslı (`metadataBase`, OG url, robots host). Müşteri `tarodan.shop`'tan bahsediyor → prod'da büyük ihtimal `NEXT_PUBLIC_SITE_URL=https://tarodan.shop` env override'ı var, ya da `tarodan.shop` `tarodan.com`'a alias/redirect. **Spec, domain-agnostic** olacak — hangi host servis ediyorsa noindex döndürecek.

## Hedef

1. Web uygulaması artık hiçbir arama motoru tarafından indexlenmesin (HTTP + HTML seviyesinde).
2. Google'ın halihazırda indexlediği URL'ler **mümkün olan en kısa sürede** SERP'ten düşsün (Search Console Removals).
3. Çözüm geri alınabilir: müşteri "yine açın" derse tek bir env veya tek satır revert ile SEO geri açılsın.

## Kapsam

### Kapsamda
- `apps/web` Next.js uygulaması (public, müşteri yüzlü).

### Kapsam dışı
- `apps/admin` — zaten public değil, Google indexlemesi söz konusu değil.
- `apps/api` — REST endpoint'leri zaten `robots.ts`'de disallow.
- `apps/mobile` — web crawler konusu değil.

## Çözüm

### Kısım A — Kod değişiklikleri (PR)

**1. [apps/web/src/app/layout.tsx](../../apps/web/src/app/layout.tsx) metadata**
- `robots.index = false`, `robots.follow = false`.
- `googleBot.index = false`, `googleBot.follow = false`, `googleBot.noimageindex = true`.
- `openGraph` ve `twitter` blokları kalabilir (zarar vermez), ama `keywords` kaldırılsın (SEO sinyali).

**2. [apps/web/src/app/robots.ts](../../apps/web/src/app/robots.ts)**
Tüm içeriği şununla değiştir:
```ts
import { MetadataRoute } from 'next';
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: '*', disallow: '/' }] };
}
```
Sitemap referansı verilmesin (yoksa Google "sitemap blocked" diye logla, ama indexlemeye devam etmez — yine de temiz olsun).

**3. [apps/web/src/app/sitemap.ts](../../apps/web/src/app/sitemap.ts)**
- En temizi: dosyayı sil. Next.js otomatik route'u kaybolur, `/sitemap.xml` 404 döner.
- Alternatif: boş array döndür. **Tercih:** dosyayı sil.

**4. [apps/web/next.config.js](../../apps/web/next.config.js) — HTTP header**
`headers()` callback'ine ek satır ekle:
```js
{ source: '/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }] }
```
- Bu, HTML olmayan response'lar (resim, JSON, vb.) dahil her şeye `X-Robots-Tag` ekler. Google için en güçlü deindex sinyallerinden biri.

**5. (Opsiyonel) Kill-switch env**
İleride hızlı revert için `NEXT_PUBLIC_SEO_ENABLED` env'i eklenebilir; layout/robots/headers bu env'e bakar. **YAGNI:** şimdilik atlıyoruz, müşteri "geri açın" derse PR revert yeterli.

### Kısım B — Operasyonel adımlar (kod dışı)

Bunları kullanıcı (Görkem) yapacak; her biri runbook olarak da yazılacak ([docs/runbooks/google-deindex.md](../../docs/runbooks/google-deindex.md) — bu spec onaylanınca yazılır).

6. **Search Console doğrulaması:**
   - `tarodan.shop` ve `tarodan.com` için ayrı **Domain property** ekle (DNS TXT doğrulama tercih).
   - Hangisi(leri) gerçekten Google'da çıkıyorsa primer hedef o.
7. **URL Removals (geçici, ~6 ay):**
   - GSC → Removals → New Request → "Remove all URLs with this prefix" → `https://tarodan.shop/` (ve gerekirse `tarodan.com`).
   - Bu, ~24 saat içinde SERP'ten düşürür. 6 ay sonra reappear olmaması için `noindex` header'ının canlı olması ŞART (Kısım A bunu sağlıyor).
8. **Cached URL'ler için:**
   - `tarodan` araması yapıp ilk sayfada çıkan tek tek URL'ler için ayrı removal request açmak işi hızlandırır.
9. **(Opsiyonel) Bing Webmaster Tools** — aynı flow.
10. **Doğrulama (deploy sonrası):**
    - `curl -I https://tarodan.shop/` → header'da `X-Robots-Tag: noindex, nofollow, noarchive` görmek.
    - `curl https://tarodan.shop/robots.txt` → `Disallow: /` görmek.
    - `curl https://tarodan.shop/sitemap.xml` → 404 görmek.
    - GSC → URL Inspection → "Indexing allowed? No: 'noindex' detected".

## Risk & trade-off

- **Geri açma:** PR revert + GSC'de Removals'ı iptal et + sitemap'i yeniden ekle. Gün içinde geri açılabilir.
- **Performans/SEO toparlama:** Eğer ileride tekrar indexleneceksek, 6 ay içinde noindex'i kaldırırsak GSC removal süresi dolmadan reappear olur. Müşteri "kalıcı kapalı" istiyorsa bu zaten istenen davranış.
- **Domain belirsizliği:** Çözüm hangi host servis ederse etsin çalışıyor (header + meta + robots tüm host'lara döner). Domain netleştiğinde GSC adımlarını ona göre yapacağız.

## Açık sorular

1. Prod'da hangi domain canlı: `tarodan.shop`, `tarodan.com`, ikisi de? (Operasyonel adımlar için kritik, kod için değil.)
2. Müşteri "kalıcı olarak kapalı kalsın" mı diyor, yoksa "şimdilik kapalı, sonra açacağız" mı? (Kill-switch env eklemek bu cevaba bağlı.)
