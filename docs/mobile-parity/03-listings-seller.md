# 03 — Satıcı: İlan Yönetimi, İndirimler, Öne Çıkarma

> ⚠️ **Kargo/desi bölümleri geçersiz.** Satıcı artık desi girmiyor, üç paket
> boyutundan birini seçiyor. Bu dosyadaki `shippingDesi` alanı ve doğrulamaları
> yerine **[14-shipping-package-tiers.md](14-shipping-package-tiers.md)** geçerlidir.

> Önce `00-README.md` okunmalı. Mobilde bu alan **büyük ölçüde hazır**; eksikler
> §5 (vitrin/boost fiyat ucu) ve `13-parity-matrix.md` #8, #9, #10.

## Kaynak (web)

```
apps/web/src/app/[locale]/(main)/(catalog)/listings/new/       # ilan oluştur
apps/web/src/app/[locale]/(main)/(catalog)/listings/[id]/edit/ # ilan düzenle + yaşam döngüsü
apps/web/src/components/listings/form/                          # PAYLAŞILAN form modülü (şema, sabitler)
apps/web/src/app/[locale]/(main)/profile/(commerce)/listings/    # kendi ilanlarım + boost modalı
apps/web/src/app/[locale]/(main)/profile/(commerce)/discounts/   # satıcı indirimleri
```

---

## 1. Ön koşullar (ilan formu açılmadan önce)

| Method | Path                     | Auth   | Amaç                                                                            |
| ------ | ------------------------ | ------ | ------------------------------------------------------------------------------- |
| `GET`  | `/users/me/bank-account` | bearer | **Sert kapı**: IBAN yoksa form hiç gösterilmez, "IBAN ekle" yönlendirmesi çıkar |
| `GET`  | `/products/my/stats`     | bearer | İlan kotası bandı (`used/max`, `canCreate`, `remaining`)                        |

Kota aşıldıysa formu **gönderim öncesi** engelle ve `used/max` bilgisini göster.

---

## 2. Form için referans verileri

| Method | Path                                                          | Amaç                                             |
| ------ | ------------------------------------------------------------- | ------------------------------------------------ |
| `GET`  | `/categories`                                                 | Kategori seçimi (düzleştirilmiş ağaç)            |
| `GET`  | `/products/filters`                                           | `scales`, `materials`, `brands`, `manufacturers` |
| `GET`  | `/brands`                                                     | `filters.brands` boşsa yedek                     |
| `GET`  | `/car-models?brand=:slug`                                     | Seçilen markanın modelleri                       |
| `GET`  | `/products/attribute-groups?manufacturer=:slug`               | Üreticiye özel dinamik alanlar                   |
| `GET`  | `/orders/commission-preview?amount=&categoryId=&packageTier=` | "Elinize geçecek" önizlemesi                     |

**Kategori seçiminde marka ve ölçek kategorilerini gizle** — bunların ayrı alanları var.
Marka değişince model temizlenir; üretici değişince özel özellikler temizlenir.

`commission-preview` yanıtı `{ sellerFeeAmount, withholdingTaxAmount, shippingAmount, sellerNetAmount }`;
web yalnızca **`sellerNetAmount`** ve **`shippingAmount`** gösteriyor. Yalnız `price > 0` ve
`packageTier` = `small` \| `medium` \| `large` (bkz. doküman 14).

---

## 3. İlan oluşturma

| Method | Path                    | Auth   | Amaç                                                                                           |
| ------ | ----------------------- | ------ | ---------------------------------------------------------------------------------------------- |
| `POST` | `/media/upload/product` | bearer | multipart, alan adı **`images`**, en fazla 15 → `[{ cardKey, detailKey, cardUrl, detailUrl }]` |
| `POST` | `/products`             | bearer | İlanı oluştur                                                                                  |

### Alanlar ve doğrulama

| Alan                  | Kural                                                             |
| --------------------- | ----------------------------------------------------------------- |
| `title`               | trim, 1–200                                                       |
| `description`         | trim, **30–330 (zorunlu)**                                        |
| `categoryId`          | zorunlu                                                           |
| `condition`           | zorunlu — `new \| like_new \| very_good \| good \| fair`          |
| `brandId`             | zorunlu                                                           |
| `carModelId`          | zorunlu (marka seçilene kadar kapalı)                             |
| `modelCode`           | trim, 1–100 (zorunlu)                                             |
| `color`               | trim, 1–80 (zorunlu)                                              |
| `scale`               | zorunlu                                                           |
| `material`            | zorunlu (slug)                                                    |
| `manufacturerId`      | zorunlu                                                           |
| `isBoxed`             | zorunlu — `boxed \| unboxed` (boş başlar, seçim zorunlu)          |
| `year`                | opsiyonel (1950–bu yıl)                                           |
| `isTradeEnabled`      | üyelikte `canTrade` yoksa anahtar yerine yükseltme bağlantısı     |
| `quantity`            | oluşturmada varsayılan 1                                          |
| `shippingPackageTier` | zorunlu, `small` \| `medium` \| `large` (bkz. doküman 14)         |
| `price`               | zorunlu, ≥ 1                                                      |
| `images`              | **oluşturmada en az 3**; üst sınır `maxImagesPerListing` (üyelik) |
| `customAttributes`    | `Record<string, string[]>`                                        |

**Gövde:** `{ title, description?, price:number, categoryId, condition, brandId?, carModelId?,
modelCode, color, scale?, material?, manufacturerId?, isBoxed:boolean, year?:number,
isTradeEnabled, isPreorder:false, isSet, bundleSize?:number, quantity:number, shippingPackageTier:"small"|"medium"|"large",
images?:[{cardKey, detailKey}], attributes?: string[] }`

`attributes` = seçilen tüm özel özellik **slug'larının düz listesi** (gruplar birleştirilir).

Başarı → kendi ilanlarım ekranına `status=pending` filtresiyle git (ilan admin onayı bekler).

---

## 4. İlan düzenleme ve yaşam döngüsü

| Method   | Path                                            | Amaç                                                                                         |
| -------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `GET`    | `/products/my/:id`                              | Yükle (her durumda çalışır)                                                                  |
| `GET`    | `/products/:id`                                 | 404/403'te yedek                                                                             |
| `PATCH`  | `/products/:id`                                 | Tüm alanları kaydet                                                                          |
| `PATCH`  | `/products/:id` `{status:'inactive'}`           | Pasife al                                                                                    |
| `PATCH`  | `/products/:id` `{status:'active'}`             | **İncelemeye gönder** — satıcı kendi ilanını aktifleştiremez; UI durumu `pending` göstermeli |
| `PATCH`  | `/products/:id` `{status:'active', quantity:N}` | Satılmış/pasif ilanı yeniden yayına ver                                                      |
| `DELETE` | `/products/:id`                                 | Sil                                                                                          |

Düzenlemede farklar: `isPreorder` eklenir, **`images` için minimum 3 kuralı yoktur**,
boş `quantity` **`null`** olarak gönderilir ("sınırsız stok"), set değilse `bundleSize: null`.

### ⚠️ Form doldurma tuzağı

İndirim aktifken (`oldPrice > price`) web **`price` alanına `oldPrice`'ı** yazıyor
(indirim öncesi fiyat). `material` ve `scale` boşsa `attributes[]` içinden türetiliyor.
`isTradeEnabled = isTradeEnabled ?? trade_available ?? false`.

### Terminal durumlar

`sold, reserved, inactive, deleted` → form **tamamen gizlenir**, yalnız durum bildirimi ve
(satılmış/pasifte) stok girip "onaya gönder" aksiyonu kalır.

### İlan süresi

**Web'de ilan süresi/yenileme özelliği YOK.** `expiresAt` kullanılmıyor; tek yaşam döngüsü
yukarıdaki durum makinesi + boost süresi (`boostedUntil`). Mobilde süre UI'ı kurmadan önce
backend'de gerçekten var mı diye teyit et.

---

## 5. Öne çıkarma (boost) ve Vitrin

| Method | Path                           | Auth   | Amaç                                                                |
| ------ | ------------------------------ | ------ | ------------------------------------------------------------------- |
| `GET`  | `/products/:id/boost/options`  | bearer | **Ürün fiyat bandına göre** paket/fiyat matrisi                     |
| `POST` | `/products/:id/boost/initiate` | bearer | `{ packageId, durationDays, autoRenew }` → `{ paymentId }`          |
| —      | ödeme ekranı                   | —      | `paymentId` ile `04` dosyasındaki ödeme akışına gir (`?type=boost`) |

> ⚠️ **Mobil şu an `GET /products/boost/pricing` (legacy düz fiyat) kullanıyor** → yanlış fiyat
> gösterebilir. **`/products/:id/boost/options`'a geçilmeli.**

`options` yanıtı:

```ts
{ enabled?: boolean, productPrice?: number,
  packages?: [{ id, name, slug, showcaseOnHome: boolean,
                options: [{ durationDays, price, listPrice, campaign: boolean, label }] }] }
```

Kurallar:

- **`showcaseOnHome: true` = Vitrin paketi** → anasayfa "Öne Çıkanlar" rayında görünür
  (LIFO, `boostedAt DESC`). `false` = yalnız arama/liste öne çıkarma. İkisini **farklı
  etiketlerle** göster.
- `campaign: true` → `listPrice` üstü çizili + kampanya rozeti.
- **Fiyatlar ürün fiyat bandına göre değişir** → global önbellek yapma, ilan başına çek.
- Mevcut boost varken: `remainingDays = max(0, ceil((boostedUntil - now) / 86400000))`;
  "uzat" modunda `kalan + seçilen = toplam` özeti göster.
- **`autoRenew` yalnızca premium/işletme üyelikte** sunulur; aksi halde `false` gönder.
- `enabled === false` → satın alma kapalı, sebebi göster.

> Mobilde `FeaturedListingsModal.tsx` tüm vitrin akışını uygulamış ama **hiç render edilmiyor**
> ve API'de olmayan `GET /products/my-listings`'i çağırıyor. Bu bileşeni yukarıdaki
> `boost/options` sözleşmesine bağla ya da sil.

---

## 6. Kendi ilanlarım listesi

| Method   | Path                                             | Amaç                    |
| -------- | ------------------------------------------------ | ----------------------- |
| `GET`    | `/products/my?limit=100&page=1[&status=]`        | Liste (durum sekmeleri) |
| `DELETE` | `/products/:id`                                  | Sil                     |
| `GET`    | `/orders/commission-preview?amount=&categoryId=` | Kart başına net tahmini |

Sekmeler: `all, pending, active, reserved, sold, inactive, deleted`.

Kart aksiyon kuralları:

| Durum                                | Aksiyon                                        |
| ------------------------------------ | ---------------------------------------------- |
| `active \| pending \| inactive`      | Düzenle                                        |
| `active`                             | **Öne çıkar** ("Süreyi uzat" eğer `isBoosted`) |
| `sold` + `orderId` var               | Siparişe git                                   |
| `sold` (orderId yok) veya `inactive` | Yeniden yayına ver                             |
| `rejected`                           | Sil                                            |

Satılmış kartlarda `soldAt`, alıcı adı ve `soldPrice` gösterilir; net tahmini gösterilmez.

---

## 7. Satıcı indirimleri

| Method   | Path                                   | Auth   | Amaç                                          |
| -------- | -------------------------------------- | ------ | --------------------------------------------- |
| `GET`    | `/discounts?limit=100`                 | bearer | Tümü (sekmeler ve metrikler bundan türetilir) |
| `POST`   | `/discounts`                           | bearer | Oluştur                                       |
| `PATCH`  | `/discounts/:id`                       | bearer | Güncelle / `isActive` değiştir                |
| `DELETE` | `/discounts/:id`                       | bearer | Sil                                           |
| `GET`    | `/products/my?limit=100&status=active` | bearer | Ürün seçici                                   |

Doğrulama: `name` min 1 · `type ∈ percentage | fixed_amount` · `value ≥ 0` ·
**`scope` satıcı arayüzünde yalnız `product | seller`** (API `global|category` de destekler) ·
`startDate`/`endDate` zorunlu · `scope==='product'` ise en az 1 ürün seçilmeli.
`endDate` `<tarih>T23:59:59` olarak gönderilir; `usageLimitPerUser` varsayılan 1.

Durum türetimi: `isActive` değilse `inactive` · geçerlilik içindeyse `active` ·
başlangıç ilerideyse `pending` · bitiş geçtiyse `expired`.

---

## Kabul kriterleri

- [ ] IBAN yoksa ilan formu açılmıyor, kullanıcı IBAN ekranına yönlendiriliyor.
- [ ] Kota aşımı gönderim öncesi engelleniyor ve `used/max` gösteriliyor.
- [ ] Oluşturmada en az 3 görsel zorunlu; üst sınır üyelikten geliyor (sabit değil).
- [ ] `shippingPackageTier` üç boyuttan biri olarak gönderiliyor (bkz. doküman 14).
- [ ] "İncelemeye gönder" sonrası durum `pending` gösteriliyor (aktif değil).
- [ ] Boost fiyatları **ilan başına** `/products/:id/boost/options`'tan alınıyor.
- [ ] Vitrin paketi (`showcaseOnHome`) ayrı etiketle sunuluyor.
- [ ] `autoRenew` yalnız premium/işletmede görünüyor.

## Yapma

- Web'in "hızlı indirim" bölümü (`DiscountSection`) doğrulamasız ve "yakında aktif olacak"
  etiketli — mobile taşıma.
- Set/paket alanları web'de bayrakla kapalı (`SET_BUNDLE_ENABLED = false`) — açmayın.
- `GET /products/my-listings` (API'de yok) ve `GET /products/boost/pricing` (legacy) çağrılarını kullanma.
