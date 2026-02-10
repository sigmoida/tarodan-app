# Browse Bölümü – Detaylı Analiz ve Yapılacaklar

Plan: `03 WEBSITE PAGES-Tablo 1.csv` (Browse sayfaları, satır 9–23).

---

## 1. Collections Page
**Planda:** Curated collections (limited editions, vintage, racing), collection cards.

**Mevcut durum:**
- `/collections` var: public koleksiyonlar listesi, arama, sıralama (popular, recent, name, items).
- `/collections/[id]` ve `/collections/[id]/edit` var.
- `/collections/liked` var.
- API: `collections/browse`, `collections/me`, CRUD, like/unlike.

**Eksik / iyileştirme:**
- Planda not: "koleksiyonlara kategori gerekiyor (uçak koleksiyonları vb.)". Koleksiyonlara kategori/etiket yok; filtreleme ve gruplama eksik.

**Yapılacak:** Koleksiyon kategorileri (opsiyonel): API + web’de kategori/tag alanı ve filtre.

---

## 2. Manufacturers Page
**Planda:** List of all manufacturers (Hot Wheels, Matchbox), brand logos, product count.

**Mevcut durum:**
- `/brands` var: marka listesi, arama, sıralama (name/count), logo, product count.
- API: `GET /brands` (marka = manufacturer).

**Durum:** Tamam. İyileştirme: logo/product count tutarlı kullanılıyor mu kontrol edilebilir.

---

## 3. Manufacturer Detail Page
**Planda:** Brand info, all products by manufacturer, filters, brand story.

**Mevcut durum:**
- `/brands/[slug]` var: marka bilgisi, ürünler, grid.

**Durum:** Tamam. İyileştirme: brand story (açıklama) alanı ve gösterimi varsa yeterli.

---

## 4. Car Models Page
**Planda:** Browse by real car model (Ford Mustang, Porsche 911), model images.

**Mevcut durum:**
- `/models` var: markalara göre car model listesi, linkler `/models/[slug]`.

**Durum:** Tamam.

---

## 5. Car Model Detail Page
**Planda:** All diecast versions of specific car model, variations, scales available.

**Mevcut durum:**
- `/models/[slug]` var: model detay, o marka/modeldeki ürünler (API’den `carModelId` veya arama ile).

**Durum:** Tamam. İyileştirme: “scales available” özeti eklenebilir.

---

## 6. Scales Page
**Planda:** Browse by scale (1:18, 1:24, 1:43, 1:64), scale comparison guide.

**Mevcut durum:**
- Ayrı bir “Scales” sayfası yok.
- CategoryNavBar’da “Ölçek” dropdown: scale’lara tıklanınca `/listings?scale=1:64` gibi.
- SidebarFilters’da scale filtresi var.
- Ana sayfada scale’lara link var.

**Eksik:**
- Dedicated “Scales” sayfası (tüm scale’lerin listesi, açıklama, karşılaştırma) yok.
- Scale comparison guide yok.

**Yapılacak:** İsteğe bağlı `/scales` sayfası + kısa scale rehberi metni.

---

## 7. Scale Detail Page
**Planda:** All products in specific scale, size comparison, popular models.

**Mevcut durum:**
- Ayrı `/scales/1-64` benzeri sayfa yok.
- Sadece `/listings?scale=1:64` ile liste filtreleniyor.

**Eksik:** Scale’e özel detay sayfası (başlık, kısa açıklama, ürün listesi) yok.

**Yapılacak:** İsteğe bağlı `/scales/[scale]` (örn. 1-64) sayfası; içerik `/listings?scale=...` ile aynı olabilir, sadece sayfa başlığı/açıklaması eklenir.

---

## 8. New Arrivals Page
**Planda:** Recently added products, sorted by date, filters.

**Mevcut durum:**
- Link: CategoryNavBar’da “Yeni Gelenler” → `/listings?sortBy=createdAt&sortOrder=desc`.
- API `sortBy` değerleri: `created_asc`, `created_desc` (tek parametre). `createdAt` ve `sortOrder` kullanılmıyor.
- Listings sayfası state’te `sortBy: 'created_desc'` kullanıyor; URL’den gelen `sortBy=createdAt` API’ye aynen gidiyor ve API’de eşleşme yok → sıralama default kalıyor.

**Hata:** Yeni Gelenler linki yanlış parametre gönderiyor; API ile uyumsuz.

**Yapılacak:** Tüm “Yeni Gelenler” linklerini `sortBy=created_desc` yapacak şekilde düzelt (CategoryNavBar, CategoryMegaMenu, vb.).

---

## 9. Best Sellers Page
**Planda:** Top selling products, trending, popularity metrics.

**Mevcut durum:**
- Link: “Çok Satanlar” → `/listings?sortBy=viewCount&sortOrder=desc`.
- API’de `sortBy` için sadece: price_asc, price_desc, created_asc, created_desc, title_asc, title_desc. `viewCount` yok.
- Sonuç: “Çok Satanlar” tıklanınca API default sıralama (created_at) dönüyor; viewCount’a göre sıralama yok.

**Eksik:** API’de viewCount (veya satış sayısı) ile sıralama desteği yok.

**Yapılacak:** API’ye `sortBy=view_count_desc` (ve gerekirse view_count_asc) ekle; frontend’de “Çok Satanlar” linkini buna bağla. Alternatif: “Çok görüntülenenler” olarak viewCount kullan.

---

## 10. Discounted Items Page
**Planda:** Sale products, discount %, original vs sale price, expiry timer.

**Mevcut durum:**
- `/listings?discountOnly=true` kullanılıyor; API’de `discountOnly` filtresi var.
- Ana sayfada “İndirimler” bölümü ve link var.
- Ürün kartlarında indirim yüzdesi, eski/yeni fiyat gösteriliyor.

**Durum:** Tamam. İyileştirme: “expiry timer” (kampanya bitiş süresi) ürün kartında gösterilebilir.

---

## 11. Accessories Page
**Planda:** Display cases, storage, tools, parts, filters by accessory type.

**Mevcut durum:**
- Ayrı “Accessories” sayfası veya kategori yok.
- Kategoriler API’den geliyor; “aksesuar” tipi yoksa bu içerik yok.

**Eksik:** Dedicated Accessories sayfası ve aksesuar tipi filtresi yok.

**Yapılacak:** İsteğe bağlı: “Aksesuarlar” kategorisi veya `/accessories` sayfası + kategori/filtre (display case, storage, tools, parts).

---

## 12. Car Sets Page
**Planda:** Multi-pack sets, themed collections, bundle deals.

**Mevcut durum:**
- Product’ta `isSet`, `bundleSize` var; API’de dönüyor.
- SidebarFilters’da “Setler” vehicle type olarak var (başlık/açıklamada arama).
- Listings’te “isSet” veya “bundle” için özel filtre yok; ayrı “Car Sets” sayfası yok.

**Eksik:** API’de isSet filtresi yok; dedicated “Setler” sayfası yok.

**Yapılacak:** API’ye `isSet=true` filtresi ekle; frontend’de “Setler” linki `/listings?isSet=true` veya ayrı sayfa.

---

## 13. Pre-Orders Page
**Planda:** Upcoming releases, pre-order products, release dates.

**Mevcut durum:**
- Product’ta `isPreorder`, `releaseDate` var; API’de dönüyor.
- Arama/listing sayfalarında pre-order rozeti gösteriliyor.
- Pre-order’a özel filtre veya sayfa yok.

**Eksik:** API’de isPreorder filtresi yok; “Ön Sipariş” linki/sayfası yok.

**Yapılacak:** API’ye `isPreorder=true` filtresi ekle; nav’da “Ön Sipariş” linki → `/listings?preOrder=true` (veya benzeri).

---

## 14. Limited Editions Page
**Planda:** Rare and limited edition models, numbered editions, exclusives.

**Mevcut durum:**
- Product’ta `isLimited`, `editionNumber` var; API’de dönüyor.
- Bazı sayfalarda “LIMITED” badge gösteriliyor.
- Limited’a özel filtre veya sayfa yok.

**Eksik:** API’de isLimited filtresi yok; “Limited Edition” linki/sayfası yok.

**Yapılacak:** API’ye `isLimited=true` filtresi ekle; nav’da “Limited Edition” linki → `/listings?limited=true` (veya benzeri).

---

## Ek tespitler

### Kategori (category) slug ↔ categoryId
- CategoryNavBar “Modeller” dropdown’ı `/listings?category=arabalar` (slug) kullanıyor.
- Listings sayfası sadece `searchParams.get('categoryId')` kullanıyor; `category` (slug) kullanılmıyor.
- Sonuç: “Arabalar” tıklanınca liste kategoriye göre filtrelenmiyor. Çözüm: (a) Linki `/category/arabalar` yapmak veya (b) Listings’te `category` slug’ı alıp categories API ile id’ye çevirip `categoryId` ile istek atmak.

### Sıralama (category sayfası)
- `/category/[slug]` sayfasında `sortBy: 'createdAt'`, `sortOrder: 'desc'` API’ye gidiyor.
- API sadece `sortBy=created_desc` kabul ediyor. Category sayfası sıralaması hatalı veya default’a düşüyor.
- Yapılacak: Category sayfasında `sortBy: 'created_desc'` (ve diğer geçerli değerler) kullan.

### Marka (brand) dropdown
- CategoryNavBar “Markalar” dropdown’ı `/listings?brand=BMW` (isim) kullanıyor.
- API: `brand` (string) gönderilince `title` içinde arama yapıyor; `brandId` (UUID) gönderilince doğrudan brandId ile filtre. Marka ismi ile filtre çalışıyor ama marka ID ile daha doğru olur (özellikle slug/ID kullanan /brands ile tutarlılık için).

---

## Öncelik sırasına göre TODO (uygulama sırası)

1. **Yeni Gelenler linki** – Tüm linkleri `sortBy=created_desc` yap; CategoryNavBar + CategoryMegaMenu.
2. **Kategori slug → listings** – Modeller dropdown’dan gelen `?category=slug` ile listings’in filtrelenmesi (slug → categoryId çözümü veya linki /category/slug yap).
3. **Category sayfası sortBy** – sortBy’ı API ile uyumlu hale getir (created_desc vb.).
4. **Çok Satanlar** – API’ye viewCount sıralaması ekle; linki buna bağla.
5. **Pre-Order filtresi** – API’ye isPreorder filtresi; nav’da “Ön Sipariş” linki.
6. **Limited Edition filtresi** – API’ye isLimited filtresi; nav’da “Limited Edition” linki.
7. **Car Sets filtresi** – API’ye isSet filtresi; “Setler” linki veya sayfa.
8. **Scales sayfası (opsiyonel)** – `/scales` ve gerekirse `/scales/[scale]`; kısa rehber metni.
9. **Koleksiyon kategorileri (opsiyonel)** – Koleksiyonlara kategori/tag ve filtre.
10. **Accessories (opsiyonel)** – Aksesuar kategorisi veya sayfası.

Bu doküman ve TODO listesi, Browse maddelerini sırayla uygularken referans olarak kullanılacak.
