# Web ↔ Mobil özellik eşlemesi (kontrol listesi)

Mobil (`apps/mobile`) ile web (`apps/web`) aynı API’yi kullanmalı. Kritik akışlar ve ilgili dosyalar:

## 1. Ürün satın alma
| Adım | Web (referans) | Mobil |
|------|----------------|--------|
| Sepet / doğrudan alım | `apps/web/src/app/checkout/page.tsx` — `for (checkoutItems)` ile satır başına sipariş | `app/checkout/index.tsx` — aynı döngü (`checkoutItems`), `orderId` çözümü `orderId` / `id` / `order.id` |
| Teklif (quote) | `ordersApi.getQuote` → `res.data.pricing` | Aynı endpoint; hem `pricing` hem düz `q` alanları desteklenir |
| Quote tetikleme | Sepet değişince | `useCallback` + `items` (adet değişince yeniden quote) |
| Hata metni | Toast / mesaj ayrıştırma | `formatApiErrorMessage` (checkout + adres kaydı) |
| Ödeme sonrası | Sayfa yenileme / SWR | `app/payment/success.tsx` → `invalidateQueries` + `refreshUserData` |

**Mobil kontrol:** Ödeme tamamlanınca `orders`, `products`, `listings`, `my-listings`, `product*` sorguları invalidate edilmeli.

**Not:** Çok satırlı sepette web ile mobilde de ödeme akışı ilk satırda yönlendirme/bypass ile biter; kalan satırlar aynı oturumda ödenmez (web davranışı ile hizalı). Adet (`quantity`) API `directBuy` ile tek tek satılmıyor; ileride backend çoklu kalem desteği eklenebilir.

## 2. Stok
- Stok sunucuda güncellenir; istemci **önbelleği tazelemeden** eski miktar görülebilir.
- **Mobil:** `payment/success` içinde ürün / ilan ile ilgili React Query anahtarları invalidate edilir.

## 3. Takas (trade)
| | Web | Mobil |
|-|-----|--------|
| Hedef ilan | `apps/web/src/app/trades/new/page.tsx` — `?listing=` | `trade/new.tsx` — `listing` **veya** `productId` / `targetProductId`; ürün sayfası `listing` + `productId` gönderir |
| Ürünlerim | `userApi.getMyProducts()` (aktif + `isTradeEnabled`) | Aynı endpoint + aynı filtre |
| Karşı taraf ürünleri | Satıcı listesi | `listingsApi.getAll({ sellerId, tradeAvailable, status })` |
| `canTrade` | `limits?.canTrade` yoksa tier basic/premium/business | Aynı mantık |
| Gönderim sonrası | `POST /trades` → `/trades` | `tradesApi.create` → `/trades` |
| Detay | `trades/[id]` — `getOne`, accept mesajı | `trade/[id].tsx` — `trade` / `data` yanıtı, `accept(..., mesaj)`, mutation sonrası `products` / `product*` / ilanlar invalidate |
| Kargo gönder | `addressesApi` + `ship(fromAddressId, carrier)` — Aras/Yurtiçi/MNG | Aynı: gönderim modalında adres seçimi + kargo; takip no API üretir |

**Kontrol:** Nakit + ürün kuralları web ile uyumlu (en az ürün **veya** nakit; karşı tarafta en az bir kalem). **Nakit tarafta ödeme UI** web’de tam; mobilde kontrol: `WEB_MOBILE_GAP_ANALYSIS.md`.

## 3b. Üyelik satın alma
| | Web | Mobil |
|-|-----|--------|
| Fiyat kaynağı | `/admin/settings/public` + kuruş/TL sanitize | `membership/checkout.tsx` — aynı sanitize |
| Kart | Ad, numara, SKT, CVV zorunlu | Aynı + `formComplete` ile buton |
| Ödeme | `paymentUrl` → yönlendirme; `paymentId` + bypass / `/payment/:id?type=membership` | `Linking.openURL(paymentUrl)`; `?type=membership` ile ödeme ekranı |
| Başarı | `/membership/success?tier=` | `membership/success` — `?tier=` ile metin |
| Geçersiz plan | — | `required=true` ile geri link `/membership?required=true` |

## 4. Teklif (offers)
| | Web | Mobil |
|-|-----|--------|
| Liste + sekmeler | `apps/web/src/app/offers/page.tsx` (`?tab=sent` / `received`) | `app/offers.tsx` — aynı query (`/offers?tab=`), `router.replace` ile senkron |
| Satıcı net önizlemesi | `ordersApi.getCommissionPreviewBatch` (gelen + pending) | Aynı batch + kartta **Tahmini net (satıcı)** |
| Mutation sonrası önbellek | `invalidateQueries(['offers'])` | `offers` + `products` + `product*` + `listings` + `my-listings` (stok / ilan tutarlılığı) |
| Ürün sayfasından teklif | — | `product/[id].tsx` → `offersApi.create` + `invalidateQueries(['offers'])`, `formatApiErrorMessage` |
| Profil girişi | Nav | `profile.tsx` → menü + hızlı erişim **Tekliflerim** → `/offers` |

**Kontrol:** `POST` offer / accept / reject / counter / cancel web ile aynı endpoint’ler; hata metinleri `formatApiErrorMessage` ile.

## 5. Filtreler & arama
| | Web | Mobil |
|-|-----|--------|
| Ürün listesi filtreleri | Ürün listesi / katalog | `app/listings.tsx`, `buildProductListQueryParams.ts` |
| Arama sekmesi | Arama + ES | `app/(tabs)/search.tsx` — marka **adı**, `tradeOnly`, tek `condition`/`scale` |

## 6. Arama UI
- `Searchbar`: kontrast, `placeholderTextColor`, `inputStyle.color`
- Grid: `SEARCH_NUM_COLUMNS`, `CARD_WIDTH` — sabitler `StyleSheet` **üstünde** tanımlı olmalı (`SEARCH_LIST_H_PAD`, vb.)

## Hızlı regresyon testi
1. Giriş yap → ürün satın al → başarı ekranı → ana sayfa / arama / ilanlar’da stok güncel mi?
2. Takas açık ürün → takas başlat → durumlar ilerliyor mu?
3. Teklif gönder / yanıtla → liste güncelleniyor mu?
4. Arama → filtre + takaslı + sırala → sonuç tutarlı mı?

Bu dosya geliştirme sırasında güncellenmeli; “web’deki her detay” tek PR’da değil, bu listeye göre parça parça kapatılmalıdır.
