# Admin Tabloları — "Tarodan Geliştirme" PDF Karşılaştırma Planı

Bu doküman `Tarodan Geliştirme.pdf`'te her admin sayfası için istenen kolonları,
**mevcut admin kolonlarıyla** ve **Prisma şemasıyla** karşılaştırır. Amaç: her
kolon için "eklenebilir mi, DB'de var mı, çıkarılmalı mı" kararını netleştirmek.

## Etiketler

| Etiket        | Anlamı                                                                                              |
| ------------- | --------------------------------------------------------------------------------------------------- |
| ✅ **VAR**    | Kolon şu an tabloda mevcut                                                                          |
| ➕ **EKLE**   | Yok ama DB'de alan **doğrudan var** → sadece frontend kolonu (+ küçük API alan expose)              |
| 🔧 **TÜRET**  | Scalar alan yok ama **relation/aggregation ile türetilebilir** → API işi, şema değişikliği gerekmez |
| 🚧 **DB**     | **DB'de yok** → önce şema/backend (model veya alan) gerekir                                         |
| ➖ **KALDIR** | Şu an var ama PDF'te yok → kaldırma adayı                                                           |
| 🔁 **REVİZE** | İsim/format değişikliği (yeniden adlandırma, prefix vb.)                                            |

---

## 0) Tüm Sayfalar — Ortak İstekler

| İstek                                                 | Durum                     | Not                                                                                                                                                                                                                           |
| ----------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Belirli tarih aralığı filtresi                     | 🔧 **TÜRET**              | `ResourceList.DateRange` bileşeni **var**; sadece refund-requests, refunds ve shipping-iade sekmesinde kullanılıyor. `createdAt` her yerde var → kalan tüm liste sayfalarına eklenir (+ ilgili API'lere `from`/`to` desteği). |
| 2. A-Z / Z-A ve sayısal artan/azalan sıralama (ok'lu) | ✅ **VAR (büyük ölçüde)** | `col.*` sortKey ile sıralama var; sort okları **her zaman görünür** hale getirildi (bu branch). Sıralanabilir olmayan kolonlar için sortKey eklemek yeterli.                                                                  |
| 3. CSV dışa aktarım                                   | 🔧 **TÜRET**              | Şu an **sadece Ürünler**'de (`ProductsExport`). Ortak bir export mekanizması + her resource için export (client-side mevcut sayfadan veya API export endpoint) gerekir.                                                       |
| 4. Sayfa boyutu (20/50/100/250/500)                   | ➕ **EKLE (kısmi)**       | `ResourceListPagination` içinde satır-sayısı seçici **var**; opsiyon listesi 250/500 içerecek şekilde genişletilir (`PAGE_SIZE_OPTIONS`).                                                                                     |

---

## 1) Global DB Boşlukları (birden çok sayfayı bloke eden eksikler)

Bunlar PDF'te tekrar tekrar geçiyor ama şemada **yok** — önce backend gerekir:

| Eksik                                                   | Etkilenen sayfalar                                                 | Durum           | Detay                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------- | ------------------------------------------------------------------ | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Paket No**                                            | Siparişler, Takaslar, Kargo (3 alt), İade Takip, İade Geçmişi      | 🚧 **DB**       | Şemada `OrderItem`/`Package` **yok**; `Order` tek ürünlü. Çoklu alım `CheckoutGroup` ile gruplanıyor (`groupNumber` var). "Her paket için farklı no" → yeni model/alan gerekir.                                                                                                          |
| **Ürün Kodu (KullanıcıIDXXXX)**                         | Siparişler, Takaslar, Kargo, İade, İade Geçmişi, Ürünler, Yorumlar | 🚧 **DB**       | `Product`'ta `productCode`/`sku`/`code` **yok**. Otomatik kod üretimi + kalıcı alan gerekir.                                                                                                                                                                                             |
| **Sipariş No "S", Takas No "T" prefix**                 | Siparişler, Takaslar, tüm ilgili                                   | 🚧 **DB (gen)** | `orderNumber`/`tradeNumber` var ama prefix formatı numara **üretim mantığını** değiştirmeyi gerektirir (mevcut kayıtlar için migration kararı).                                                                                                                                          |
| **Satıcı Başvuru modeli**                               | Satıcı Başvuruları                                                 | 🚧 **DB**       | `SellerApplication`/KYC/belge modeli **yok**. Doğrulama `User.sellerType`/`businessStatus` (pending/approved/rejected) + `SellerBankAccount` üzerinden. "Başvuru ID", "Eksik Evrak / Yeni Belge Talebi" gibi granüler durumlar, "Yetkili Bilgileri", belge yükleme → yeni model gerekir. |
| **Misafir Mesaj modeli**                                | Destek → Misafir Mesajları                                         | 🚧 **DB**       | `GuestMessage` modeli **yok**. Kategori/Öncelik/Durum/Çözüm alanlı bir misafir-destek modeli gerekir.                                                                                                                                                                                    |
| **Yorum "Revize Talebi"**                               | Ürün Yorumları, Satıcı Yorumları                                   | 🚧 **DB**       | `ProductRating` ve `Rating`'te revizyon/revize alanı **yok**.                                                                                                                                                                                                                            |
| **Rapor "Tür" taksonomisi**                             | Rapor Talepleri                                                    | 🚧 **DB**       | `Report.type` = içerik hedefi (product/user/collection/message). PDF'in istediği Talep/Öneri/Şikayet/Ürün Talep kategorisi **farklı** — enum revizyonu veya ayrı "istek" modeli gerekir.                                                                                                 |
| **Kategori durum-bazlı ürün sayıları + komisyon oranı** | Kategoriler                                                        | 🔧/🚧           | Sayılar (Aktif/Taslak/Pasif/Onay) `Product.status` üzerinden **aggregation ile türetilir**. `commissionRate` kategori alanı **yok** — `CommissionRule` join gerekir.                                                                                                                     |

> **Türetilebilir sayılar (şema değişikliği gerektirmez):** Kullanıcı/Satıcı başına
> Sipariş/Takas/İptal/İade/Ürün adetleri şemada scalar değil ama relation üzerinden
> aggregation ile hesaplanır (admin zaten `ordersCount`/`productsCount` hesaplıyor →
> aynı desen). Kargo Durumu order için `Shipment.status` relation'ından türetilir.

---

## 2) Sayfa Sayfa Kolonlar

### Dashboard (Metrikler)

PDF kutuları: Aktif/Pasif Ürün, Aktif/Pasif Kullanıcı, Toplam Satış Tutarı, Net
Komisyon, Anlık/Günlük Aktif Ziyaretçi, Toplam İptal/İade — hepsi Dün/Bu Ay/Geçen
Ay + %; En çok tıklanan ilk 10 ürün/satıcı.
→ **Büyük ölçüde VAR** (`DashboardStats` period'lu kartlar + TopProducts/TopSellers + visitors). Ziyaretçi verisi şu an **placeholder/fake** (revamp epic notu) → gerçek veri bağlanmalı.

### Analizler (Analytics) — Dün vs Bugün / Geçen Ay vs Bu Ay

| #                                                                                                                               | Başlık                            | Durum                                   |
| ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | --------------------------------------- |
| 1                                                                                                                               | Toplam Sipariş Adedi              | 🔧 TÜRET                                |
| 2                                                                                                                               | Toplam Sipariş Tutarı             | 🔧 TÜRET (`totalAmount` toplamı)        |
| 3                                                                                                                               | Toplam Komisyon                   | ✅/🔧 (`commissionAmount`)              |
| 4                                                                                                                               | KDV Hariç Komisyon                | 🔧 TÜRET (`taxAmount` ile ayrıştır)     |
| 5                                                                                                                               | Toplam Net Komisyon               | ✅ (dashboard'da netCommission var)     |
| 6                                                                                                                               | KDV Hariç Net Komisyon            | 🔧 TÜRET                                |
| 7                                                                                                                               | Toplam Net Stopaj Adet/Tutar      | ➕ EKLE (`withholdingTaxAmount` var)    |
| 8                                                                                                                               | Toplam İptal Adedi                | 🔧 TÜRET                                |
| 9                                                                                                                               | Toplam İptal Tutarı               | 🔧 TÜRET                                |
| 10                                                                                                                              | Toplam İptal Komisyon / KDV Hariç | 🔧 TÜRET                                |
| 11                                                                                                                              | Toplam İade Adet                  | 🔧 TÜRET                                |
| 12                                                                                                                              | Toplam İade Tutarı                | 🔧 TÜRET (`RefundRequest.amount`)       |
| 13                                                                                                                              | Toplam İade Komisyon / KDV Hariç  | 🔧 TÜRET                                |
| 14                                                                                                                              | İade Nedenleri ve Yüzdelik        | ➕ EKLE (`RefundRequest.reason` grupla) |
| 15                                                                                                                              | İptal Nedenleri ve Yüzdelik       | ➕ EKLE (`Order.cancelReason` grupla)   |
| → Tümü mevcut alanlardan **türetilebilir**; DB bloğu yok. KDV ayrıştırmaları hesap gerektirir. Analytics API + grafik/kart işi. |

### Siparişler (Orders)

Mevcut: `orderNumber, status, buyer, seller, product, amount, commission, date`

| PDF Kolonu                                                                                        | Durum                                                   |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Sipariş No/Takas No (S-prefix)                                                                    | ✅ VAR (`orderNumber`) + 🔁 prefix (gen)                |
| Paket No                                                                                          | 🚧 DB                                                   |
| Ürün Kodu                                                                                         | 🚧 DB                                                   |
| Ürün Adı                                                                                          | ✅ VAR                                                  |
| Satıcı ID                                                                                         | ➕ EKLE (`sellerId` var; ID göster)                     |
| Satış Tutarı                                                                                      | ✅ VAR                                                  |
| Komisyon Oranı ve Tutarı                                                                          | ✅ tutar / 🔧 oran (CommissionRule veya tutar/subtotal) |
| Durum                                                                                             | ✅ VAR                                                  |
| Kargo Durumu                                                                                      | 🔧 TÜRET (`Shipment.status`)                            |
| Alıcı                                                                                             | ✅ VAR                                                  |
| Satıcı                                                                                            | ✅ VAR                                                  |
| Tarih                                                                                             | ✅ VAR                                                  |
| → Kaldırılacak yok. Ekleme: Paket No(DB), Ürün Kodu(DB), Satıcı ID, Kargo Durumu, Komisyon Oranı. |

### Takaslar (Trades)

Mevcut: `tradeNumber, status, initiator, receiver, cash, date`

| PDF Kolonu                                                                                                                                                                                                                            | Durum                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Takas No (T-prefix)                                                                                                                                                                                                                   | ✅ VAR + 🔁 prefix                    |
| Paket No                                                                                                                                                                                                                              | 🚧 DB                                 |
| Ürün Kodu                                                                                                                                                                                                                             | 🚧 DB                                 |
| Ürün Adı                                                                                                                                                                                                                              | 🔧 TÜRET (`TradeItem` → product)      |
| Satıcı ID / Alıcı ID                                                                                                                                                                                                                  | ➕ EKLE (initiator/receiver ID)       |
| Satış Tutarı                                                                                                                                                                                                                          | ✅ VAR (`cashAmount`)                 |
| Komisyon Oranı ve Tutarı                                                                                                                                                                                                              | ✅ tutar (`cashCommission`) / 🔧 oran |
| Durum                                                                                                                                                                                                                                 | ✅ VAR                                |
| Kargo Durumu                                                                                                                                                                                                                          | 🔧 TÜRET (`TradeShipment.status`)     |
| Alıcı / Satıcı                                                                                                                                                                                                                        | ✅ VAR (initiator/receiver)           |
| Tarih                                                                                                                                                                                                                                 | ✅ VAR                                |
| → ⚠️ **Model uyumsuzluğu:** Takas eşler-arası çoklu-ürün takası (initiator/receiver, `TradeItem[]`). PDF onu Sipariş gibi (tek Satıcı/Alıcı/Ürün) modelliyor. "Ürün Adı / Satıcı-Alıcı" gösterimi çok ürünlü takasta netleştirilmeli. |

### Kargo (Shipping) — durum sekmeleri: Beklemede/Teslim/İptal/İade/Yolda/Belirsiz

Mevcut 4 sekme: orderShipment, returnShipment, tradeShipment, suratShipment.

**Kargo → Siparişler** (mevcut orderShipment: order, buyer, carrier(provider), trackingNumber, status)

| PDF                  | Durum               |
| -------------------- | ------------------- |
| Sipariş No           | ✅ VAR              |
| Paket No             | 🚧 DB               |
| Ürün Adı + Ürün Kodu | 🔧 ad / 🚧 kod      |
| Satıcı ID            | ➕ EKLE             |
| Kargo Firması        | ✅ VAR (`provider`) |
| Kargo Takip No       | ✅ VAR              |
| Kargo Durumu         | ✅ VAR (`status`)   |

**Kargo → Takaslar** (mevcut tradeShipment: tradeNumber, direction(leg), carrier, trackingNumber, status, sender, updated)

| PDF                               | Durum                          |
| --------------------------------- | ------------------------------ |
| Takas No                          | ✅ VAR                         |
| Paket No                          | 🚧 DB                          |
| Ürün Adı + Ürün Kodu              | 🔧 / 🚧                        |
| Satıcı ID / Alıcı ID              | ➕ EKLE                        |
| Yön                               | ✅ VAR (`leg`/`recipientType`) |
| Kargo Firması / Takip No / Durumu | ✅ VAR                         |

**Kargo → İade** (mevcut returnShipment: refundNumber, order, carrier, trackingNumber, status, shippedAt, delivered)

| PDF                                                                                   | Durum                        |
| ------------------------------------------------------------------------------------- | ---------------------------- |
| Sipariş/Takas No                                                                      | ✅ VAR (order)               |
| Paket No                                                                              | 🚧 DB                        |
| Ürün Adı + Ürün Kodu                                                                  | 🔧 / 🚧                      |
| Satıcı ID / Alıcı ID                                                                  | ➕ EKLE                      |
| Kargo Firması / Takip No / Durumu                                                     | ✅ VAR                       |
| Kargoya verilme tarihi                                                                | ✅ VAR (`returnShippedAt`)   |
| Kargo teslim tarihi                                                                   | ✅ VAR (`returnDeliveredAt`) |
| → `suratShipment` sekmesi PDF'te yok (sağlayıcıya özel) → **kalabilir**, karar sizin. |

### İade Takip (Refund Tracking) → refund-requests

Mevcut: `refundNumber, order, product, buyer, seller, amount, reason, status, createdAt`

| PDF                                                                             | Durum                                          |
| ------------------------------------------------------------------------------- | ---------------------------------------------- |
| İade No                                                                         | ✅ VAR                                         |
| Sipariş/Takas No                                                                | ✅ VAR (order; takas iadesi şemada order-only) |
| Paket No                                                                        | 🚧 DB                                          |
| Ürün Adı + Ürün Kodu                                                            | ✅ ad / 🚧 kod                                 |
| Satıcı ID / Alıcı ID                                                            | ➕ EKLE (order.seller / requester)             |
| Satış Tutarı                                                                    | ✅ VAR                                         |
| Komisyon Tutarı                                                                 | 🔧 TÜRET (CommissionLedger)                    |
| İade Nedeni                                                                     | ✅ VAR (`reason`)                              |
| Kargo Durumu                                                                    | ➕ EKLE (`returnStatus` var, gösterilmiyor)    |
| Kargo Takip No                                                                  | ➕ EKLE (`returnTrackingNumber`)               |
| Oluşturulma / Tamamlanma Tarihi                                                 | ✅ / ➕ (`refundedAt`)                         |
| → Mevcut `status` (RefundRequestStatus) PDF'te yok ama faydalı → **kalabilir**. |

### İade Geçmişi (Refund History) → refunds

Mevcut: `id, amount, buyer, seller, product, refundedAt`

| PDF                  | Durum                                                   |
| -------------------- | ------------------------------------------------------- |
| İade No              | 🔁 REVİZE (şu an ham `id`; `refundNumber` gösterilmeli) |
| Sipariş/Takas No     | ➕ EKLE                                                 |
| Paket No             | 🚧 DB                                                   |
| Ürün Adı + Ürün Kodu | ✅ ad / 🚧 kod                                          |
| Satıcı ID / Alıcı ID | ➕ EKLE                                                 |
| Satış Tutarı         | ✅ VAR                                                  |
| Komisyon Tutarı      | 🔧 TÜRET                                                |
| İade Nedeni          | ➕ EKLE (`reason`)                                      |
| Tamamlanma Tarihi    | ✅ VAR (`refundedAt`)                                   |

### Ürünler (Products) — liste

Mevcut: `product(image+title), price, status, AI, condition, seller, category, date`

| PDF                                                                                                                                                                                                                                                                                                                                                                                                | Durum                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Ürün Görseli + Toplam Görsel Sayısı                                                                                                                                                                                                                                                                                                                                                                | ✅ görsel / ➕ sayı (images relation)                               |
| Ürün Adı + Ürün Kodu                                                                                                                                                                                                                                                                                                                                                                               | ✅ ad / 🚧 kod                                                      |
| Açıklama                                                                                                                                                                                                                                                                                                                                                                                           | ➕ EKLE (`description`)                                             |
| Kategori / Kategori Komisyon Oranı                                                                                                                                                                                                                                                                                                                                                                 | ✅ kategori / 🔧 oran (CommissionRule)                              |
| Listeleme Puanı                                                                                                                                                                                                                                                                                                                                                                                    | ➕ EKLE (`qualityScore`/`rankTier`/`relevanceScore` — biri seçilir) |
| Marka                                                                                                                                                                                                                                                                                                                                                                                              | ➕ EKLE (`brand` relation)                                          |
| Kondisyon                                                                                                                                                                                                                                                                                                                                                                                          | ✅ VAR                                                              |
| Satıcı ID/Adı                                                                                                                                                                                                                                                                                                                                                                                      | ✅ ad / ➕ ID                                                       |
| Durum                                                                                                                                                                                                                                                                                                                                                                                              | ✅ VAR                                                              |
| AI                                                                                                                                                                                                                                                                                                                                                                                                 | ✅ VAR                                                              |
| Takasa Dahil Mi?                                                                                                                                                                                                                                                                                                                                                                                   | ➕ EKLE (`isTradeEnabled`)                                          |
| → ➖ **Kaldırma adayı:** `price`, `date` PDF listesinde yok (karar sizin — çoğu için faydalı).                                                                                                                                                                                                                                                                                                     |
| → **Ürün Ekleme formu** (ayrı): Zorunlu (3 görsel, Marka, Model, Model Kodu, Renk, Kategori, Ölçek, Malzeme, Üretici, Açıklama 30/330, Durum, Araç Türü, Kutulu) / Opsiyonel (Yıl). Bunların çoğu (Renk, Ölçek, Malzeme, Model Kodu, Araç Türü, Kutulu, Yıl) **`ProductAttribute` sistemi** üzerinden var (scalar değil) → form alanları attribute'lardan beslenir; DB'de attribute olarak mevcut. |

### Kategoriler

Mevcut: `name, description, productCount, collectionCount, status(isActive)`

| PDF                                                                                     | Durum                                                                 |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Kategori / Açıklama                                                                     | ✅ VAR                                                                |
| Aktif / Taslak / Pasif / Onay Aşamasında Ürün                                           | 🔧 TÜRET (`Product.status` grupla — tek `productCount` yerine 4 sayı) |
| Koleksiyon                                                                              | ✅ VAR (`collectionCount`)                                            |
| Kategori Durumu                                                                         | ✅ VAR (`isActive`)                                                   |
| → (İpucu) "Kategori Komisyon Oranı" başka sayfalarda isteniyor → `CommissionRule` join. |

### Koleksiyonlar

Mevcut: `name, owner+tier, itemCount, viewCount, likeCount, status(isPublic)` → veriler yeterli.
→ PDF isteği bir **UX düzeni**: 2+ koleksiyonu olan sahipleri "koleksiyon sahibi" başlığı altında toplayıp `+` ile aç/kapat (accordion). Kolon değil, **gruplama/expand** özelliği (orders'taki checkout-group accordion deseni uygulanabilir).

### Kullanıcılar

Mevcut: `user(avatar+name+email), status(seller/verified/banned), membership, ordersCount, productsCount, createdAt, lastLoginAt`

| PDF                                             | Durum                                                           |
| ----------------------------------------------- | --------------------------------------------------------------- |
| Kullanıcı ID                                    | ➕ EKLE                                                         |
| Kullanıcı Adı / Nick                            | ✅ VAR (`displayName`; ayrı nick alanı yok)                     |
| Durum (Bireysel/Kurumsal Satıcı/Admin/Yönetici) | 🔧 TÜRET (`sellerType` + `AdminUser.role`; mevcut badge farklı) |
| Üyelik                                          | ✅ VAR                                                          |
| Sipariş Adedi                                   | ✅ VAR                                                          |
| Takas Adedi                                     | 🔧 TÜRET                                                        |
| İptal Adedi                                     | 🔧 TÜRET                                                        |
| İade Adedi                                      | 🔧 TÜRET                                                        |
| Ürün Adedi                                      | ✅ VAR                                                          |
| Kayıt Tarihi                                    | ✅ VAR                                                          |
| Son Giriş                                       | ✅ VAR                                                          |

### Satıcı Başvuruları

Mevcut: `company(name+email), contact(displayName), status(businessStatus), applicationDate`

| PDF                                                                                                            | Durum                                                     |
| -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Başvuru ID                                                                                                     | 🚧 DB (başvuru modeli yok)                                |
| Kullanıcı ID                                                                                                   | ➕ EKLE                                                   |
| Kullanıcı Adı/Nick/Firma                                                                                       | ✅ VAR                                                    |
| Yetkili Bilgileri (detay)                                                                                      | 🚧 DB (yetkili modeli yok)                                |
| Üyelik                                                                                                         | ➕ EKLE (`membership` relation)                           |
| Durum (Eksik Evrak/Belge Bekliyor/Yeni Belge/Bekliyor/Doğrulandı)                                              | 🚧 DB (`businessStatus` sadece pending/approved/rejected) |
| Başvuru Tarihi                                                                                                 | ✅ VAR                                                    |
| → ⚠️ Bireysel/Kurumsal olarak **2 alt sayfaya ayırma** + belge onay/itiraz denetim ekranı → yeni model + akış. |

### Satıcı Performansı

Mevcut: `seller(name+email), membership, products(_count.products), orders(_count.sellerOrders), status(isVerified)`

| PDF                  | Durum                   |
| -------------------- | ----------------------- |
| Satıcı ID            | ➕ EKLE                 |
| Kullanıcı Adı / Nick | ✅ VAR                  |
| Durum (tip)          | 🔧 TÜRET (`sellerType`) |
| Üyelik               | ✅ VAR                  |
| Ürün Adedi           | ✅ VAR                  |
| Sipariş Adedi        | ✅ VAR                  |
| Takas Adedi          | 🔧 TÜRET                |
| İptal Adedi          | 🔧 TÜRET                |
| İade Adedi           | 🔧 TÜRET                |
| Durum                | ✅ VAR (`isVerified`)   |

### Yorumlar — Ürün Yorumları

Mevcut: `product(image+title), user(avatar+name+verified), review(stars+title+text), status, date`

| PDF                        | Durum                             |
| -------------------------- | --------------------------------- |
| Yorum ID                   | ➕ EKLE                           |
| Ürün Görseli + sayı        | ✅ görsel / ➕ sayı               |
| Ürün Kodu                  | 🚧 DB                             |
| Ürün Adı                   | ✅ VAR                            |
| Satıcı ID                  | 🔧 TÜRET (product.seller)         |
| Sipariş Kodu               | ➕ EKLE (`orderId` → orderNumber) |
| Kullanıcı                  | ✅ VAR                            |
| Değerlendirme (puan/yorum) | ✅ VAR                            |
| Durum                      | ✅ VAR                            |
| Tarih                      | ✅ VAR                            |
| Revize Talebi              | 🚧 DB                             |

### Yorumlar — Satıcı Yorumları

Mevcut: `sender(giver), receiver(seller), score, comment, status, source(order/trade), date`

| PDF                        | Durum                                  |
| -------------------------- | -------------------------------------- |
| Satıcı ID                  | ➕ EKLE (receiver ID)                  |
| Satıcı Adı                 | ✅ VAR                                 |
| Sipariş Kodu               | ➕ EKLE (`orderId`/`tradeId` → number) |
| Kullanıcı                  | ✅ VAR (giver)                         |
| Değerlendirme (puan/yorum) | ✅ VAR                                 |
| Durum                      | ✅ VAR                                 |
| Tarih                      | ✅ VAR                                 |
| Revize Talebi              | 🚧 DB                                  |

### Rapor Talepleri → "İstek, Öneri ve Şikayet" (🔁 yeniden adlandır)

Mevcut: `type, reason, description, reporter(name+email), targetId, date, status`

| PDF                                  | Durum                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------- |
| Talep ID                             | ➕ EKLE                                                                   |
| Kullanıcı ID                         | ➕ EKLE (`reporterId`)                                                    |
| Kullanıcı Adı/Nick/Firma             | ✅ VAR                                                                    |
| Tür (Talep/Öneri/Şikayet/Ürün Talep) | 🚧 DB (mevcut `type` = product/user/collection/message; taksonomi farklı) |
| Neden                                | ✅ VAR (`reason`)                                                         |
| Açıklama                             | ✅ VAR                                                                    |
| Hedef ID                             | ✅ VAR (`targetId`)                                                       |
| Tarih                                | ✅ VAR                                                                    |
| Durum                                | ✅ VAR                                                                    |
| Dönüş/Çözüm                          | ➕ EKLE (`adminNote`)                                                     |

### Mesajlar → "Kullanıcı Görüşmeleri" (🔁 yeniden adlandır)

Mevcut: `sender, receiver, message(content), warning(flaggedReason), status, date` (Message bazlı)

| PDF                                                                                                                                   | Durum                               |
| ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Görüşme ID                                                                                                                            | ➕ EKLE (`threadId`)                |
| Gönderen ID + İsim/Firma/Nick                                                                                                         | ✅ ad / ➕ ID                       |
| Görüşme Ürün ID + Adı                                                                                                                 | ➕ EKLE (`MessageThread.productId`) |
| Alıcı ID + İsim                                                                                                                       | ✅ ad / ➕ ID                       |
| Mesaj İçeriği                                                                                                                         | ✅ VAR                              |
| Uyarı                                                                                                                                 | ✅ VAR (`flaggedReason`)            |
| Durum                                                                                                                                 | ✅ VAR                              |
| Tarih                                                                                                                                 | ✅ VAR                              |
| → ⚠️ Yapısal: Mevcut liste **Message** bazlı; PDF **Görüşme (MessageThread)** bazlı istiyor → thread bazlı listeye geçiş düşünülmeli. |

### Destek Talepleri — Talepler

Mevcut: `ticketNumber, subject, creator(name), category, priority, status, createdAt`

| PDF                                                                                 | Durum                                              |
| ----------------------------------------------------------------------------------- | -------------------------------------------------- |
| Talep ID                                                                            | ✅ VAR (`ticketNumber`)                            |
| Kullanıcı ID + İsim/Firma                                                           | ✅ ad / ➕ ID                                      |
| Kategori / Öncelik / Durum                                                          | ✅ VAR                                             |
| Konu / İçerik                                                                       | ✅ konu / 🔧 içerik (ilk `TicketMessage`)          |
| Oluşturulma Tarihi                                                                  | ✅ VAR                                             |
| Çözüm + Çözülme Tarihi                                                              | ➕ tarih (`resolvedAt`) / 🚧 çözüm metni alanı yok |
| → Ek istek: Mesaj içeriğine görsel ekleme → `TicketMessage.attachments` **var** ✅. |

### Destek Talepleri — Misafir Mesajları

Mevcut: `reference, fullName(name+email), subject, date`

| PDF                                                                      | Durum                      |
| ------------------------------------------------------------------------ | -------------------------- |
| Talep ID                                                                 | ✅/🔧 (`reference`)        |
| Misafir Gönderen ID                                                      | 🚧 DB                      |
| Kategori / Öncelik / Durum                                               | 🚧 DB (misafir modeli yok) |
| Konu / İçerik                                                            | ✅ konu / 🚧 içerik        |
| Oluşturulma Tarihi                                                       | ✅ VAR                     |
| Çözüm + Çözülme Tarihi                                                   | 🚧 DB                      |
| → ⚠️ `GuestMessage` modeli yok → tüm ek alanlar için yeni model gerekir. |

---

## 3) Özet — İş Kümeleri

**A. Frontend-only / hızlı (➕ EKLE — DB'de var):** Satıcı/Alıcı ID gösterimi,
Açıklama, Marka, Listeleme Puanı, Takasa Dahil Mi, İade Takip'te Kargo Durumu/Takip
No/Tamamlanma Tarihi, İade Geçmişi'nde refundNumber+neden, Görüşme/Yorum/Talep ID'leri,
Üyelik, Dönüş/Çözüm, sayfa-boyutu opsiyonları (250/500).

**B. API/aggregation (🔧 TÜRET — şema değişmez):** Analizler'in tüm 15 metriği,
Kullanıcı/Satıcı için Takas/İptal/İade adetleri, Kategori durum-bazlı ürün sayıları,
Kargo Durumu (order→Shipment), Komisyon Oranı/Tutarı türetme, tarih-aralığı filtresi
ve CSV export'un tüm sayfalara yayılması.

**C. Backend/şema (🚧 DB — önce model/alan):**

1. **Paket No** — OrderItem/Package modeli (çok sayfa etkiler; en yüksek öncelik).
2. **Ürün Kodu** — Product'a kalıcı kod + üretim.
3. **S/T numara prefix** — numara üretim mantığı.
4. **Satıcı Başvuru** modeli + belge/yetkili + granüler durumlar (bireysel/kurumsal ayrımı).
5. **Misafir Mesaj** modeli.
6. **Yorum Revize Talebi** alanı.
7. **Rapor "Tür"** taksonomisi (Talep/Öneri/Şikayet/Ürün Talep) — enum/ayrı model.
8. **Kategori komisyon oranı** alanı (veya CommissionRule join stratejisi).

**D. UX/yapısal kararlar:** Koleksiyon accordion gruplama; Mesajlar'ı thread-bazlı
listeye çevirme; Takas sayfasının çok-ürünlü modelle PDF'in tek-ürün varsayımını
uzlaştırma; `surat` kargo sekmesinin kalıp kalmayacağı.
