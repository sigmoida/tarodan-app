# 02 — Keşif: Anasayfa, Katalog, Arama, Koleksiyonlar, Favoriler

> Önce `00-README.md` okunmalı.

## Kaynak (web)

```
apps/web/src/app/[locale]/(main)/page.tsx + _home/            # anasayfa
apps/web/src/app/[locale]/(main)/(catalog)/listings/          # katalog ızgarası + ürün detay
apps/web/src/app/[locale]/(main)/(catalog)/listings/_lib/params.ts   # FİLTRE SÖZLEŞMESİ (tek kaynak)
apps/web/src/app/[locale]/(main)/(catalog)/manufacturers/     # üretici sayfaları
apps/web/src/app/[locale]/(main)/(catalog)/collections/       # koleksiyonlar
apps/web/src/components/layout/header/HeaderSearch*.tsx       # arama + otomatik tamamlama
apps/web/src/lib/productPrice.ts                              # FİYAT/STOK GÖSTERİM SÖZLEŞMESİ
apps/web/src/components/ui/ProductCard.tsx                    # kart kuralları
```

---

## 1. Anasayfa

Bölümler (sırayla): Hero → Marka şeridi → **Vitrin (öne çıkan)** → İndirimdekiler → Takasa açık →
Popüler → En iyi koleksiyonlar → Öne çıkan koleksiyoner/işletme → Güven işaretleri.

### Endpoint'ler

| Method  | Path                                                        | Amaç                                                                         |
| ------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `GET`   | `/products?limit=20&page=1&homeShowcase=true&status=active` | **Vitrin** rayı (satın alınmış öne çıkarma; sunucu `boostedAt DESC` sıralar) |
| `GET`   | `/products?limit=24&page=1&tradeOnly=true&status=active`    | Takasa açık rayı                                                             |
| `GET`   | `/products?limit=24&page=1&discountOnly=true&status=active` | İndirim rayı                                                                 |
| `GET`   | `/products/popular?limit=20&page=1`                         | Popüler rayı                                                                 |
| `GET`   | `/manufacturers`                                            | Marka şeridi                                                                 |
| `GET`   | `/users/top-collections?limit=20`                           | Koleksiyon ızgarası                                                          |
| `GET`   | `/users/featured-collector`                                 | Haftanın koleksiyoneri (null olabilir)                                       |
| `GET`   | `/users/featured-business`                                  | Haftanın işletmesi (null olabilir)                                           |
| `POST`  | `/products/:id/click`                                       | Kart tıklama takibi (fire-and-forget)                                        |
| `PATCH` | `/users/me/onboarding/home-tour`                            | Tanıtım turunu tamamlandı işaretle                                           |

### Mobilin tekrar üretmesi gereken türetilmiş mantık

- **İndirim rayı filtresi:** API sahte %0 indirimler döndürebiliyor. Yalnızca
  `isOnSale === true || (oldPrice ?? originalPrice) > price` **ve** gösterilecek orijinal fiyat >
  güncel fiyat olan kalemleri göster (`lib/productPrice.ts#hasRealDiscount`).
- Her bölüm **bağımsız** yüklenir; biri hata verirse diğerleri etkilenmez (boş liste ile geç).
- Boş rayları (vitrin/takas/koleksiyon) hiç render etme; indirim ve popüler için boş durum + CTA göster.

---

## 2. Katalog ızgarası (`/listings` karşılığı)

**Filtre sözleşmesi `_lib/params.ts` dosyasındadır ve tek kaynaktır.** Mobil, aynı parametre
adlarını kullanmalı.

### Endpoint'ler

| Method | Path                                   | Amaç                                                             |
| ------ | -------------------------------------- | ---------------------------------------------------------------- |
| `GET`  | `/products`                            | Ana liste (parametreler aşağıda)                                 |
| `GET`  | `/categories`                          | Kategori listesi                                                 |
| `GET`  | `/categories/slug/:slug`               | Slug → id çözümleme                                              |
| `GET`  | `/manufacturers`                       | Üretici filtresi                                                 |
| `GET`  | `/products/filters`                    | Facet'ler: `scales, materials, brands, carModels, manufacturers` |
| `GET`  | `/products/filters?manufacturer=:slug` | Üreticiye özel `customAttributes` grupları                       |
| `POST` | `/products/:id/click`                  | Tıklama takibi                                                   |

### `GET /products` parametreleri

`limit` (web: 48) · `page` · `search` · `categoryId` · `condition` · `minPrice` · `maxPrice` ·
`brandId` **veya** `brand` · `carModelId` · `scale` · `material` · `manufacturerId` **veya**
`manufacturer` · `tradeOnly` · `discountOnly` · `preOrder` · `limited` · `set` · `sortBy` ·
`attrGroups` · (ayrıca `sellerId`, `status`, `homeShowcase`)

Kurallar:

- `brandId` `brand`'i **ezer**; `manufacturerId` `manufacturer`'ı ezer.
- Boolean'lar yalnızca `true` iken gönderilir.
- `sortBy` **`relevance` iken gönderilmez** (sunucunun kendi ilgi sıralaması devreye girer).
  Seçenekler: `relevance | created_desc | created_asc | view_count_desc | price_asc | price_desc | rating_desc | title_asc | title_desc`.
- `attrGroups` = `JSON.stringify({ grupSlug: [ozellikSlug, ...] })`; boş gruplar atılır.
  Sunucu semantiği: **grup içi OR, gruplar arası AND**.
- `condition` değerleri: `new, like_new, very_good, good, fair`.

### Kart gösterim kuralları (birebir uygulanmalı)

- `effectivePrice = Number(price)` — API `price` alanında **güncel satış fiyatını** döner.
- `onSale = isOnSale === true || (oldPrice ?? originalPrice) > price`; üstü çizili fiyat =
  `oldPrice ?? originalPrice ?? price`; indirim etiketi `discountPercent ?? 0`.
- `outOfStock = (status != null && status !== 'active') || (availableQuantity != null && availableQuantity <= 0)`.
  **`availableQuantity == null` "sınırsız" demektir**, stok yok demek değildir.
- Etiketler: `isBoosted` → "Sponsorlu"; `trade_available || isTradeEnabled` → takas etiketi.
- Puan rozeti yalnızca `rating.average != null && rating.count > 0` iken gösterilir.
- Görsel seçimi: kart için `cardUrl ?? detailUrl ?? url`; detay için `detailUrl ?? cardUrl ?? url`.

> **Tutarsızlık uyarısı:** web kartlarda `₺` + 0 ondalık, detayda `TL` + 2 ondalık kullanıyor.
> Mobilde **tek bir biçim seç** ve her yerde uygula (öneri: `₺`, 2 ondalık yalnız gerekliyse).

### Kabul kriterleri

- [ ] Filtreler URL/derin bağlantı ile taşınabiliyor (paylaşılan filtre bağlantısı açılıyor).
- [ ] `availableQuantity == null` "stokta yok" olarak gösterilmiyor.
- [ ] Aktif filtre sayacı web mantığıyla aynı (sıralama sayılmaz; eşleşen anahtar çiftleri 1 sayılır).
- [ ] Facet boş dönerse makul bir varsayılan liste gösteriliyor (tamamen boş ekran değil).

---

## 3. Üretici sayfaları

| Method | Path                                    | Amaç                |
| ------ | --------------------------------------- | ------------------- |
| `GET`  | `/manufacturers`                        | Liste               |
| `GET`  | `/manufacturers/slug/:slug`             | Detay               |
| `GET`  | `/products?manufacturerId=:id&limit=50` | Üreticinin ürünleri |

> **Web'de marka (brand) sayfası YOK** — markalar yalnızca filtre olarak erişilebilir.
> `GET /brands`, `GET /brands/:slug` API'de mevcut. Mobilde marka sayfası açmak bir **parite
> fazlası** olur; ürün istiyorsanız ekleyin, istemiyorsanız markayı filtreye bağlayın.
>
> **Bilinen hata:** web ürün detayında marka slug'ını `/manufacturers/:slug` rotasına bağlıyor —
> marka ve üretici farklı varlıklar. Mobilde bunu tekrarlama.

---

## 4. Ürün detay

### Endpoint'ler

| Method   | Path                                   | Auth   | Amaç                                                                                   |
| -------- | -------------------------------------- | ------ | -------------------------------------------------------------------------------------- |
| `GET`    | `/products/:id`                        | public | Detay                                                                                  |
| `GET`    | `/products/my/:id`                     | bearer | **Fallback**: 404/403 alınırsa sahibinin kendi (pending/inactive) ilanını görmesi için |
| `POST`   | `/products/:id/view`                   | public | Görüntülenme (ekran açılışında **bir kez**)                                            |
| `GET`    | `/ratings/products/:id?sortBy=&score=` | public | Yorumlar                                                                               |
| `GET`    | `/ratings/products/:id/stats`          | public | Puan dağılımı                                                                          |
| `GET`    | `/products/:id/similar?limit=12`       | public | Benzer ürünler                                                                         |
| `GET`    | `/wishlist/check/:productId`           | bearer | Favoride mi                                                                            |
| `POST`   | `/wishlist`                            | bearer | Favoriye ekle (`{ productId }`)                                                        |
| `DELETE` | `/wishlist/:productId`                 | bearer | Favoriden çıkar                                                                        |
| `POST`   | `/cart/items`                          | bearer | Sepete ekle                                                                            |
| `GET`    | `/collections/me`                      | bearer | "Koleksiyona ekle" seçici                                                              |
| `POST`   | `/collections/:id/items`               | bearer | Koleksiyona ekle (multipart, `productId`)                                              |
| `POST`   | `/offers`                              | bearer | Teklif ver (bkz. `06`)                                                                 |
| `POST`   | `/user-reports`                        | bearer | İlanı şikayet et                                                                       |

### Aksiyon kuralları

| Aksiyon                | Koşul                                                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Hemen al / sepete ekle | `status === 'active'` **ve** stok var. `sold`/`inactive` → "artık uygun değil" ekranı; `reserved` → bilgi mesajı |
| Adet seçici            | `!isOwner && status === 'active' && availableQuantity > 1`; üst sınır `min(availableQuantity, 20)`               |
| Teklif ver             | `status === 'active'`, sahibi değil, giriş yapılmış. Tutar: `>= round(price * 0.5)` ve `< price`                 |
| Takas teklifi          | `trade_available \|\| isTradeEnabled` **ve** üyelikte `canTrade`                                                 |
| Favori                 | Sahibi ekleyemez; **409 "zaten favoride" başarı sayılır**                                                        |
| Koleksiyona ekle       | Üyelikte `canCreateCollections`                                                                                  |
| Satıcıya mesaj         | `06`/`09` akışına yönlendir                                                                                      |

`isOwner = listing.sellerId === user.id`. `available = availableQuantity ?? quantity`;
`hasStock = available == null || available > 0`.

**Durum bildirimi kartı:** aktif olmayan durum, stok bilgisinden **önce** gelir
(`reserved` → uyarı, `sold` → hata, `pending`/`inactive` → nötr, `rejected` → hata,
`available === 0` → "stok tükendi" uyarısı).

`shippingDesi` **kullanıcıya gösterilmez** — yalnız satıcı formunda ve kargo hesabında kullanılır.

### Kabul kriterleri

- [ ] Sahibi kendi pending/inactive ilanını görebiliyor (fallback endpoint kullanılıyor).
- [ ] Görüntülenme sayacı ekran başına bir kez tetikleniyor.
- [ ] Favori 409'u hata olarak gösterilmiyor.
- [ ] Galeri: en az 2 görsel yoksa 360° modu kapalı.

---

## 5. Arama

**Web'de ayrı bir arama sonuç ekranı yok** — arama her zaman katalog ızgarasına gider.

| Method | Path                           | Amaç                                              |
| ------ | ------------------------------ | ------------------------------------------------- |
| `GET`  | `/search/autocomplete-rich?q=` | Zengin otomatik tamamlama (**kullanılan tek uç**) |
| `GET`  | `/products?search=`            | Sonuçlar (katalog ızgarası)                       |

Yanıt grupları: `products, brands, categories, manufacturers, carModels, scales, materials, conditions, suggestions`.
Her grup farklı bir filtreye götürür (ör. marka → `?brand=&brandId=`, ölçek → `?scale=`).

Kurallar: **300 ms debounce**, minimum **2 karakter**. Son aramalar yerel olarak saklanır
(**en fazla 5**, büyük/küçük harf duyarsız tekilleştirme, en yeni üstte).

> `GET /search/products` ve `GET /search/autocomplete` API'de var ama web kullanmıyor —
> yeni geliştirmede `autocomplete-rich` + `/products?search=` ikilisini kullan.

> **Kaydedilmiş aramalar** web'de **tamamen yerel** (backend yok) ve `?q=` gönderdiği için
> çalışmıyor. Mobilde ya doğru parametreyle (`search`) yerel olarak yap ya da backend talebi aç.

---

## 6. Koleksiyonlar

| İşlem                 | Method   | Path                                              | Auth   |
| --------------------- | -------- | ------------------------------------------------- | ------ |
| Herkese açık liste    | `GET`    | `/collections/browse?sortBy=&search=&categoryId=` | public |
| Kendi koleksiyonlarım | `GET`    | `/collections/me`                                 | bearer |
| Beğendiklerim         | `GET`    | `/collections/liked`                              | bearer |
| Detay (id)            | `GET`    | `/collections/:id`                                | public |
| Detay (slug)          | `GET`    | `/collections/slug/:slug`                         | public |
| Oluştur               | `POST`   | `/collections`                                    | bearer |
| Güncelle              | `PATCH`  | `/collections/:id`                                | bearer |
| Kapak yükle           | `PATCH`  | `/collections/:id/cover`                          | bearer | multipart alan adı **`cover`** |
| Sil                   | `DELETE` | `/collections/:id`                                | bearer |
| Öğe ekle              | `POST`   | `/collections/:id/items`                          | bearer | multipart                      |
| Öğe sil               | `DELETE` | `/collections/:id/items/:itemId`                  | bearer |
| Beğen                 | `POST`   | `/collections/:id/like`                           | bearer |
| Beğeniyi kaldır       | `DELETE` | `/collections/:id/like`                           | bearer |

`sortBy ∈ popular | recent | name | items_asc | items_desc`.

Oluşturma doğrulaması: `name` min 1 (düzenlemede **3–100**), `description` max 500,
`categoryId` opsiyonel (boş → `null`), `isPublic` (varsayılan true).

Öğe ekleme (multipart): `productId` **veya** özel öğe alanları
(`customTitle` zorunlu, `customDescription, customBrand, customModel, customYear, customScale,
customManufacturer, customMaterial, customImageUrl, image` dosyası, `sortOrder`, `isFeatured`).

Sıralama/filtreleme mantığı: `productStatus` `active|sold|reserved|inactive` dışındaysa öğeyi
gösterme (özel öğeler her zaman kalır) → önce `isFeatured` → sonra `sortOrder`.

> **Doğrula:** web detay ekranında beğenmeyi de beğeniyi kaldırmayı da **POST** ile yapıyor;
> beğenilenler ekranı ise DELETE kullanıyor. Backend'in toggle semantiğini teyit et, mobilde
> POST=beğen / DELETE=kaldır olarak net kullan.

Koleksiyon oluşturma **üyelik hakkına bağlı** (`canCreateCollections`) — yoksa yükseltme ekranına yönlendir.

---

## 7. Favoriler (wishlist)

| Method   | Path                         | Auth   | Amaç                                                     |
| -------- | ---------------------------- | ------ | -------------------------------------------------------- |
| `GET`    | `/wishlist`                  | bearer | Favorilerim                                              |
| `POST`   | `/wishlist`                  | bearer | Ekle                                                     |
| `DELETE` | `/wishlist/:productId`       | bearer | Çıkar                                                    |
| `GET`    | `/wishlist/check/:productId` | bearer | Durum                                                    |
| `DELETE` | `/wishlist`                  | bearer | Tümünü temizle (web'de kullanılmıyor, mobilde işe yarar) |

Satır: `{ id, productId, productTitle, productImage, productPrice, productOriginalPrice, productCondition, productStatus, sellerId, sellerName, addedAt }`.
**`productId` veya `productTitle` boş olan satırları at.**

> Web'in "favorileri paylaş" bağlantısı hatalı bir yola (`/favorites?ids=`) gidiyor. Mobilde
> paylaşım yapacaksan derin bağlantıyı doğru kur veya bu özelliği atla.

---

## 8. Üyelik hakları — her yerde geçerli kapılar

`GET /users/me` yanıtındaki `membership.tier` değerlerini kullan; **sabit tablo yazma**:

| Hak                    | free | basic | premium | business |
| ---------------------- | ---- | ----- | ------- | -------- |
| `maxListings`          | 10   | 50    | 200     | 1000     |
| `maxImagesPerListing`  | 3    | 6     | 10      | 15       |
| `canTrade`             | ✗    | ✓     | ✓       | ✓        |
| `canCreateCollections` | ✗    | ✓     | ✓       | ✓        |

Bu haklar şu noktalarda kapı olarak kullanılır: görsel yükleme sınırı, takas anahtarı,
koleksiyon oluşturma, "koleksiyona ekle".

---

## Yapma (web'e özgü)

- `generateMetadata`/OG etiketleri, `robots` yönergeleri, `localizedCanonical`.
- SSR hydration/dehydrate ve "sunucu anahtarı = istemci anahtarı" disiplini (`_lib/params.ts`).
- ISR `revalidate`/`tags` ve `app/api/revalidate` kancaları.
- Tarayıcıya özgü etkileşimler: fareyle büyütme, tekerlekle zoom, klavye ile gezinme.
- `localStorage` tabanlı ızgara/liste tercihi ve kaydedilmiş aramalar (mobilde kendi deponu kullan).
- Web'de tanımlı ama hiç çağrılmayan uçları körlemesine taşıma: `searchApi.products`,
  `searchApi.autocomplete`, `ratingsApi.markHelpful`, `mediaApi.deleteFile`.
