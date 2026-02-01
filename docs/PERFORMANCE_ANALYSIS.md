# Performans – Detaylı Analiz (Doğru Yerde mi?)

Bu dokümanda: her performans öğesinin **doğru yerde** olup olmadığı, **olması gereken yerde eksik** veya **olmaması gereken yerde fazla** bir şey olup olmadığı kontrol edildi.

---

## 1. Görsel: OptimizedImage vs plain `next/image`

### OptimizedImage nerede kullanılıyor? (Doğru yerler)

- **Ürün / koleksiyon / liste sayfaları:** page.tsx (ana sayfa), listings/page.tsx, listings/[id]/page.tsx, category/[slug]/page.tsx, search/page.tsx, seller/[id]/page.tsx, collections/page.tsx, collections/[id]/page.tsx, collections/[id]/edit/page.tsx, favorites/page.tsx, wishlist/page.tsx, offers/page.tsx, trades/page.tsx, trades/new/page.tsx, trades/[id]/page.tsx, profile/listings/page.tsx, profile/edit/page.tsx  
→ Kullanıcı içeriği / remote URL; fallback + Sentry + `sizes` için **doğru**.

### Plain `Image` (next/image) nerede kullanılıyor?

| Dosya | İçerik | Değerlendirme |
|-------|--------|----------------|
| **Navbar.tsx** | Logo / menü görselleri | Statik layout; plain Image kabul edilebilir. İstersen OptimizedImage ile tutarlılık sağlanabilir. |
| **Footer.tsx** | Logo / ikon | Aynı şekilde statik; sorun yok. |
| **checkout/page.tsx** | Sepet/ödeme sayfası (muhtemelen ürün görseli) | Ürün görseli varsa **OptimizedImage olmalı** (fallback, hata loglama). |
| **cart/page.tsx** | Sepet ürün görselleri | Ürün görseli; **OptimizedImage kullanılması daha doğru**. |
| **profile/business/page.tsx** | İşletme / ürün görselleri | Ürün görseli varsa **OptimizedImage tercih edilmeli**. |
| **profile/following/page.tsx** | Takip edilen kullanıcı / avatar | Avatar/ürün ise OptimizedImage mantıklı. |
| **settings/security/page.tsx** | Muhtemelen ikon / illustrasyon | Statikse Image yeterli. |
| **forgot-password/page.tsx** | Muhtemelen tek statik görsel | Statikse Image yeterli. |
| **offers/page.tsx** | Hem Image hem OptimizedImage | Ürün kartları OptimizedImage; diğer tek görsel Image kalabilir. |
| **seller/[id]/page.tsx** | Hem Image hem OptimizedImage | Ürün listesi OptimizedImage; avatar/logo Image kalabilir. |

**Özet – Görsel**

- **Olması gereken yerde yok:** checkout, cart, profile/business (ve gerekiyorsa profile/following) ürün/avatar görselleri için OptimizedImage kullanılmıyor; plain Image var.
- **Olmaması gereken yerde var:** Yok; OptimizedImage kullanılan yerler uygun.

---

## 2. Lazy loading (bileşen): `dynamic()`

### Şu an lazy yüklenenler

- **AuthRequiredModal:** Navbar, page.tsx (ana sayfa), listings/[id], seller/[id], collections/[id] → `dynamic(withChunkErrorLogging(...))`.
- **ReportModal:** listings/[id], seller/[id] → aynı şekilde dynamic.

Tüm kullanımlar `dynamic()` ile; modal açılmadan chunk yüklenmiyor. **Doğru.**

### Lazy olmayan ağır bileşenler var mı?

- **ReportModal:** Sadece listings/[id] ve seller/[id]’de kullanılıyor; ikisi de dynamic. Başka yerde import yok.
- **AuthRequiredModal:** Navbar, ana sayfa, listings/[id], seller/[id], collections/[id]; hepsi dynamic.
- **Profile/settings** “Delete Confirmation Modal”: Muhtemelen inline/modal; sayfa zaten yüklü, ekstra chunk yok. Kabul edilebilir.
- **CityDistrictSelector, NotificationBell:** Her sayfada gerekmiyor; Navbar’da NotificationBell var. Bunları dynamic yapmak isteğe bağlı (şu an zorunlu değil).

**Özet – Lazy (bileşen)**

- **Olması gereken yerde yok:** Tespit yok; AuthRequiredModal ve ReportModal her kullanıldığı yerde dynamic.
- **Olmaması gereken yerde var:** Yok.

---

## 3. Browser cache (next.config.js)

### Cache header verilen path’ler

- `/favicon.ico` → 1 gün
- `/logo.svg`, `/tarodan-logo.jpg`, `/images/:path*` → 1 hafta  
Hepsi **public altı statik**; HTML/SSR sayfaları veya API **dahil değil**. **Doğru.**

### Eksik veya yanlış

- **Cache verilmemesi gereken yerde verilmiş:** Yok (sadece statik path’ler var).
- **Cache verilmesi gereken yerde yok:** Yeni statik path eklenirse (örn. `/fonts/`, `/documents/`) next.config’e bir satır eklenmeli; yorumda belirtilmiş. Şu an bilinen statikler tanımlı.

**Özet – Browser cache**

- Yapı doğru; sadece yeni statik path’ler eklendiğinde config güncellenmeli.

---

## 4. Nginx (server cache / CDN tarafı)

### Cache’lenen location’lar

- **Web:**  
  - `/_next/static/` → 365 gün (hash’li JS/CSS).  
  - `~ ^/(favicon\.ico|logo\.svg|tarodan-logo\.jpg|images/)` → 7 gün.  
- **Web `location /`:** `proxy_cache_bypass $http_upgrade` → HTML/dinamik sayfalar cache’lenmiyor.  
- **API server:** `proxy_cache` yok → API yanıtları cache’lenmiyor.  
- **Admin:** Cache yok.  

next.config.js ile uyumlu; sadece statik asset’ler cache’leniyor. **Doğru.**

### Eksik / yanlış

- **Cache olmaması gereken yerde:** Yok.
- **Cache olması gereken yerde:** Yeni statik path (örn. `/fonts/`) eklenirse Nginx’e de location eklenmeli (yorumda belirtilmiş).

**Özet – Nginx**

- Yerleşim doğru; yeni statik path’ler hem next.config hem Nginx’e eklenmeli.

---

## 5. Redis (API – server cache)

### getOrSet / read cache kullanılan yerler

- **product.service:** Liste (findAll) ve detay (findOne) → `getOrSet` + TTL. Invalidation: create/update/delete/order/rating/wishlist/admin’da `del` / `delPattern`. **Doğru.**
- **category.service:** findAll (hiyerarşik kategori listesi) → `getOrSet`, 1 saat TTL. **Doğru.**

### Sadece invalidation (del) kullananlar

- wishlist, rating, order, admin, auth: Ürün/category cache’ini invalidate ediyor; kendi response’larını cache’lemiyor. Kullanıcıya özel veya sık değişen veri; cache’lememek **doğru**.

### Cache kullanılmayan okuma endpoint’leri

- **collection.service:** CacheService yok; collection list/detail her istekte DB’den. Koleksiyon listesi çok sık değişmiyorsa ileride `getOrSet` eklenebilir (şu an zorunlu değil).
- **user (public profile / seller):** Cache yok; sık güncellenen profil için kısa TTL ile cache eklenebilir (opsiyonel).

**Özet – Redis**

- **Olması gereken yerde yok:** Opsiyonel: collection list (ve istenirse public seller/profile) için cache.
- **Olmaması gereken yerde var:** Yok; auth/order/messages gibi kişisel veri cache’lenmiyor.

---

## 6. Cloudflare

- **infrastructure/config/cloudflare/cache-rules.example:** Sadece örnek/doküman; `_next/static`, public statik, API bypass kuralları anlatılmış. Gerçek kullanım Cloudflare Dashboard’dan yapılıyor. **Yerleşim doğru** (örnek dosya olarak).

---

## 7. Bundle (next.config.js)

- **optimizePackageImports:** `@heroicons/react`, outline, solid → Sadece kullanılan ikonlar bundle’a giriyor. **Doğru.**  
- Başka büyük kütüphaneler (örn. lodash, date-fns) için de benzeri eklenebilir; şu an heroicons için yapılmış.

---

## 8. Özet tablo

| Konu | Doğru yerde | Olması gereken yerde yok | Olmaması gereken yerde var |
|------|-------------|---------------------------|----------------------------|
| **OptimizedImage** | Liste/detay sayfaları (ürün, kategori, arama, koleksiyon, teklif, takas, profil ilanları) | checkout, cart, profile/business (ve gerekiyorsa profile/following) ürün/avatar görselleri | Yok |
| **dynamic() (modal)** | AuthRequiredModal, ReportModal tüm kullanım yerlerinde | Yok | Yok |
| **Browser cache** | favicon, logo, images | Yeni statik path’ler (fonts vb.) eklenince | Yok |
| **Nginx cache** | _next/static, favicon, logo, images; API/admin cache yok | Yeni statik path eklenince | Yok |
| **Redis (API)** | product list/detail, category list; invalidation doğru | Opsiyonel: collection list (ve istenirse public profile) | Yok |
| **Cloudflare** | Örnek kurallar dosyası | Dashboard’da uygulanması | Yok |
| **Bundle** | Heroicons optimize | İstenirse diğer büyük lib’ler | Yok |

---

## 9. Önerilen düzeltmeler (isteğe bağlı)

1. **checkout/page.tsx, cart/page.tsx:** Ürün görseli gösteren yerlerde `Image` → `OptimizedImage` (fallback + hata loglama).
2. **profile/business/page.tsx, profile/following/page.tsx:** Ürün/avatar görselleri varsa `OptimizedImage` kullanılabilir.
3. **API – collection.service:** Koleksiyon listesi trafiği yüksekse `CacheService.getOrSet` + kısa TTL (örn. 5–10 dk) eklenebilir.

Bu değişiklikler yapılmadan da mevcut performans yapısı tutarlı; yukarıdakiler ince iyileştirme.
