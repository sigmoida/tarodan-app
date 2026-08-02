# 13 — Parite Matrisi: Web İşlevi → Mobildeki Durum

> **v2 — 2026-08-02.** Mobil: `github.com/sigmoida/tarodan-mobile` `main` @ `e0230f5`
> (2026-08-01) · API: `development` @ `930c5794`. İlk matristen (2026-07-30) bu yana
> mobil büyük bir parite hamlesi yaptı: **eski 21 bulgunun neredeyse tamamı kapandı**
> (özet en altta). Bugünkü tablo iki kaynaktan besleniyor: (a) güncel mobil kodun
> taranması, (b) `15-api-delta-2026-08-02.md`'deki API sözleşme değişiklikleri.
> Sayılar: 117 ekran, 106 Jest dosyası, 50 Maestro akışı.

Gösterim: ✅ tam · 🟡 kısmi · ❌ yok · ⚠️ hatalı/bozuk

---

## 🔴 P0 — Canlı kullanımı bozan (hepsi yeni API delta'sından)

| #   | Bulgu                                                    | Durum | Kanıt (mobil)                                                                                                                                                                                                                                 | Yapılacak                                                                                                                                                                                        |
| --- | -------------------------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **Checkout istekleri `expectedPricingHash` göndermiyor** | ⚠️    | `src/lib/api/orders.ts:45-66` (`checkout`, `checkoutGuest`), `:24-41` (`directBuy`, `createGuest`), `app/checkout/_hooks/useCheckout.ts` — iki alan hiçbir payload'da yok; API DTO'larında **zorunlu** (`checkout.dto.ts:125-138`)            | Quote yanıtındaki `pricingHash` + `shippingTariffVersion`'ı 4 payload üreticisine de aynen geçir; 409'da quote'u yenile (bkz. `04` + `15`). **Şu an her satın alma yolu 400 alır**               |
| 2   | **`POST /auth/register` `username` göndermiyor**         | ⚠️    | `app/(auth)/register/_lib/schema.ts:11-26` (alan yok), `src/lib/api/auth.ts:23-30`; API `RegisterDto.username` zorunlu, regex `^[a-z0-9](?:[a-z0-9._]*[a-z0-9])?$` (`register.dto.ts:43-55`)                                                  | Kayıt formuna kullanıcı adı alanı ekle; `GET /auth/username-availability` ile uygunluk kontrolü. **Şu an bireysel kayıt 400 alır**                                                               |
| 3   | **Sepet/checkout toplamı istemcide hesaplanıyor**        | ⚠️    | `app/checkout/_hooks/useCheckout.ts:79-100` (`subtotal + shippingCost + buyerFee + taxAmount − discount`), kargo ayrı `GET /shipping/rates?weight=0.5` çağrısından (`:131-148`, 34.9/49.9 sabit fallback); `app/cart/_hooks/useCart.ts:30-42` | `pricing.summary { productAmount, shippingAmount, serviceFeeAmount, total }`'ı **aynen bas**, yerel aritmetiği sil. Şu an ekrandaki tutar çekilecek tutardan **hizmet KDV'si kadar düşük** çıkar |
| 4   | **Mesaj görselleri boş render olur (401)**               | ⚠️    | `app/messages/[threadId]/_hooks/useMessageThread.ts:140-146` `[IMG:<url>]` gövdesine gömüyor; RN `<Image>` bearer göndermiyor (`src/utils/imageUrl.ts:118`). API artık `messages` yüklemelerinde JWT'li 302 ucu döndürüyor (`15` §6)          | Mesaj görsellerini auth'lu yükleyiciyle çek: `expo-image` `source.headers` ile bearer, ya da token'lı fetch → cache. Gönderen de alıcı da görseli göremiyor                                      |

---

## 🟠 P1 — Yanlış/eksik gösterim ve parite boşlukları

| #   | Bulgu                                                                   | Durum | Kanıt                                                                                                                                                                                                                       | Yapılacak                                                                                                                                  |
| --- | ----------------------------------------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 5   | **Sipariş/satış detayında para dökümü artık tutmuyor**                  | ⚠️    | `app/orders/[id]/_components/OrderAddressPrice.tsx:41-75` `taxAmount` (artık hep 0) satırı basıyor; `buyerServiceTaxAmount`/`sellerServiceTaxAmount` hiç okunmuyor → satırlar `totalAmount`'a toplanmıyor                   | KDV satırını kaldır, hizmet-KDV satırlarını ekle (`15` §1b); istersen `packages/shared/src/order-breakdown.ts` porte et                    |
| 6   | **İlan formunda paket boyutu seçimi yok** (doküman 14 hiç uygulanmamış) | ❌    | `src/components/listing/_lib/schema.ts` — `shippingPackageTier` de `shippingDesi` de yok; `GET /shipping/package-tiers` hiç bağlanmamış (`src/lib/api/orders.ts:145-176`)                                                   | `14` P0: üç kartlı seçim; seçilmeyince sunucu `small` varsayıyor → kargo bedeli satıcının beklediğinden sapabilir                          |
| 7   | **Satıcı iade gelen kutusu yok**                                        | ❌    | `GET /refund-requests/seller` tanımlı ama çağrılmıyor (`src/lib/api/orders.ts:202`); `app/refund-requests/` yalnız alıcı; satıcı onay/ret aksiyonu yok                                                                      | `07` §3: satıcı sekmesi + onay/ret. Satıcı iade talebine yalnız push derin bağlantısıyla ulaşabiliyor                                      |
| 8   | **Çekirdek ticaret ekranlarında i18n yok**                              | 🟡    | `useTranslation` 271 ekran dosyasının ~71'inde; `app/cart/index.tsx:22`, `app/checkout/index.tsx:39`, `app/orders/index.tsx:30`, `app/product/[id]/index.tsx:127` gömülü Türkçe; katalog hazır (~4.800 anahtar)             | Sepet/checkout/sipariş/ürün ekranlarını katalog anahtarlarına taşı                                                                         |
| 9   | **`EMAIL_NOT_VERIFIED` refresh 401'i sessiz logout**                    | 🟡    | `src/lib/api/client.ts:123-136` her refresh hatasında `handleAuthFailure()` → açıklamasız login'e atar; kod bazlı ayrım yok                                                                                                 | `01`/`15`: bu kodu yakala, doğrulama akışına yönlendir, "e-postanı doğrula" mesajı göster                                                  |
| 10  | **IP-engel 403'üne özel davranış yok**                                  | 🟡    | `src/lib/api/client.ts:143-157` yalnız `USER_BANNED` özel; IP engeli (`"Erişim engellendi"`, `errorCode`'suz) ekran başına rastgele hata metnine düşüyor                                                                    | `15` §9: bu 403'ü ayırt et; oturumu kapatmadan bilgilendir                                                                                 |
| 11  | **Üyelik limitlerinin 10/15 alanı hâlâ istemcide sabit**                | 🟡    | `src/stores/authStore.ts:101-136` — sunucu overlay'i yalnız 5 alan (`maxListings`, `maxImagesPerListing`, `canCreateCollections`, `canTrade`, `isAdFree`); kalanlar `TIER_LIMITS` tablosundan                               | Sunucu kaynaklı alanları genişlet ya da kalanların istemci-sabit olduğunu bilinçli karar olarak yaz (`membership-tiers` tek kaynak ilkesi) |
| 12  | **İade nedeni listesi 6/11**                                            | 🟡    | `app/orders/[id]/_lib/status.ts:9-16`; `delivery_delayed`, `counterfeit`, `defective`, `lost_in_transit` yok; başka yerde oluşturulmuş talep etiketsiz kalır                                                                | Listeyi API enum'uyla eşitle (`15` §15); etiket sözlüğünü tamamla                                                                          |
| 13  | **`/order-track?orderNumber=` parametresi okunmuyor** (bug)             | ⚠️    | `app/orders/_components/OrderCard.tsx:65` parametreyle push ediyor; `app/order-track/_hooks/useOrderTrack.ts`'te `useLocalSearchParams` yok → form boş açılıyor                                                             | Parametreyi oku ve formu doldur                                                                                                            |
| 14  | **Misafir takipte grup/paket kodları gösterilmiyor**                    | 🟡    | Girdi üç biçimi de kabul ediyor (sunucu çözüyor) ama placeholder yalnız `ORD-XXXXXX` (`app/order-track/index.tsx:42`); yanıt tipinde `groupNumber`/`packageNumber` yok (`_lib/status.ts:7-20`)                              | `15` §2: iki alanı tipe/ekrana ekle; placeholder'ı `ORD- / GRP- / PKG-` olarak güncelle                                                    |
| 15  | **iOS universal link kapalı** (bilinçli)                                | 🟡    | `app.json`'da `ios.associatedDomains` yok — AASA + Apple capability bekliyor; mobil repoda Faz 4.1 olarak planlı (`docs/superpowers/plans/2026-08-01-yol-haritasi.md:87`). Android `intentFilters` + `tarodan://` çalışıyor | AASA yayınlanınca geri ekle; o güne dek iOS'ta e-posta bağlantıları yalnız custom scheme ile açılır                                        |

---

## 🟡 P2 — Tutarlılık ve küçükler

| #   | Bulgu                                                          | Durum | Not                                                                                                                                                                                                                              |
| --- | -------------------------------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 16  | ~20 statik sayfa + `/checkout/success` hâlâ menüsüz/ölü        | 🟡    | `/guides`, `/cookies`, `/buyer-protection` (+ ondan geçilen `/returns-exchanges`, `/refund-policy`), `/size-guide`, `/faq`, `/pricing`, `/following`, `/newsletter` … Ayrıca CMS (`/sayfa/*`) ile statik yasal sayfalar ikilendi |
| 17  | `packageNumber` ("Teslimat No") ve `productCode` gösterilmiyor | 🟡    | İkisi de additive (`15` §2, §3); sipariş detayına Teslimat No, ilan detayına ürün kodu eklenmeli                                                                                                                                 |
| 18  | `X-Request-Id` / `requestId` loglanmıyor                       | 🟡    | `src/lib/api/errorText.ts` yalnız `message` okuyor; Sentry kayıtlarına request id ekle (`15` §10)                                                                                                                                |
| 19  | `GET /orders/:id/my-review` hâlâ kullanılmıyor                 | 🟡    | Tanımlı (`src/lib/api/orders.ts:97`), çağrı yok; "değerlendirildi" durumu yerelden türetiliyor                                                                                                                                   |
| 20  | Satıcı takip numarası serbest metin                            | 🟡    | `PATCH /shipping/:id/tracking` ile elle numara giriliyor (`app/sales/_hooks/useSaleActions.ts:75-85`); sunucu üretimli `PKG-` düzeniyle kavramsal çatışma — `05`/`15` §2 ile hizala                                              |
| 21  | Hizmet bedeli oranı statik sayfada sabit "%3"                  | 🟡    | `app/platform-hizmet-bedeli.tsx:26,34`; checkout etiketi oransız (güvenli) ama `pricing.buyerFeeRate` hiç okunmuyor                                                                                                              |
| 22  | Test fixture'larında eski önekler                              | 🟡    | `TRD-…`, `TRK…` fixture'ları bayat (canlı biçim `TKS-`/`SHP-`, `15` §14); üretim kodunda tek önek ayrıştırma `MEM-` — o hâlâ doğru                                                                                               |

---

## ✅ Eş veya mobilde daha iyi (e0230f5 doğrulaması)

2026-07-30 matrisindeki **tüm P0/P1 bulgular kapandı**; öne çıkanlar:

| Alan                                        | Not                                                                                                                                                   |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kart ödemesi                                | `POST /payments/direct-form` + WebView; `assertSafePaytrForm` action/alan koruması, 3DS zorunlu (`src/lib/payment/paytrDirectForm.ts`)                |
| 2FA login                                   | `requires2FA` akış adımı, TOTP + `XXXX-XXXX` yedek kod (`app/(auth)/login/_hooks/useLogin.ts`)                                                        |
| Kurumsal onboarding + davet                 | 7 `seller-documents*` ucu tam; `business-pending`'den "Başvurumu Tamamla" çıkışı; davet aktivasyonu `app/(auth)/corporate-invite/`                    |
| Derin bağlantı (Android + scheme)           | `intentFilters` autoVerify, `expo-linking` cold/warm, push ile ortak `toMobileRoute` — iOS AASA hariç (P1 #15)                                        |
| Kupon                                       | `app/checkout/_components/CouponInput.tsx`; üye `POST /discounts/validate`, misafir `validate-guest`; `isValid:false` + `error` ele alınıyor          |
| Sepet                                       | Bilinçli hibrit ("Faz A"): yerel yazma otoriter, üyede sunucu aynası + stok/uygunluk `useServerCart`; **misafir sepeti cihaz-yerel** — bilinçli karar |
| Boost/vitrin                                | `GET /products/:id/boost/options` birincil, legacy `pricing` yalnız fallback; ölü `FeaturedListingsModal` silindi + regresyon testi                   |
| Satıcı faturası                             | Yükleme/değiştirme/indirme tam (`sellerInvoiceApi`)                                                                                                   |
| Reklam alanları                             | `GET /ads/active` + impression/click, anasayfada `AdBanner`                                                                                           |
| E-posta değişikliği, kullanıcı adı, telefon | Üçü de ekranlı ve bağlı                                                                                                                               |
| Planlı üyelik değişikliği iptali            | `POST /membership/cancel-scheduled-change` bağlı                                                                                                      |
| Tıklama + popüler ray                       | `recordClick` fire-and-forget, `products/popular` anasayfada                                                                                          |
| Yazıyor göstergesi                          | Artık iki yönlü (`typing:start/stop` emit ediliyor)                                                                                                   |
| Ayar ekranları menüde                       | payment-methods/history/payments/subscription/saved-searches/discounts profil menüsünde                                                               |
| Medya `folder` sözleşmesi                   | Yalnız `messages`/`reviews` gönderiliyor — yeni beyaz listeyle birebir uyumlu (`15` §6)                                                               |
| Marka/üretici logosu                        | `logo === null` fallback'li, mutlak URL passthrough (`15` §7 uyumlu)                                                                                  |
| `tradeAvailable`                            | Toleranslı çözücü (`src/utils/isProductTradeOpen.ts`) yeni alanı zaten okuyor                                                                         |
| IBAN                                        | İstemcide mod-97 checksum var (`src/utils/iban.ts`) — sunucuyla aynı kural                                                                            |
| Refresh                                     | Single-flight + rotasyonlu token saklama; 60 sn sunucu toleransıyla uyumlu                                                                            |
| Kayıt akışı                                 | Token beklemiyor, login'e yönlendiriyor (`15` uyumlu) — ama #2'deki `username` eksiği kayıtı bloke ediyor                                             |
| Yeni alanlar (webde olmayanlar dahil)       | Satış sekmesi, satıcı paneli, analitik, kayıtlı aramalar, bülten, sipariş grupları, takas süiti, force-update + OTA, push                             |

---

## Uç yolu notları (güncel)

| İşlev                | Mobil                                                                               | Durum                                                                             |
| -------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Takas nakit ödemesi  | `POST /payments/initiate-trade-cash`                                                | Geçerli (web'den farklı ama ikisi de API'de var)                                  |
| Satıcı kargo         | `GET /shipping/order/:id` → yoksa `POST /shipping` → `PATCH /shipping/:id/tracking` | Doğru sıra; #20'deki serbest metin notu geçerli                                   |
| Bekleyen sayaçlar    | `status-counts` (sekme) + `pending-count` (rozet)                                   | Doğru ayrım; `GET /orders/seller/pending-count` mobilde kullanılmıyor (opsiyonel) |
| Kendi istatistikleri | `me/stats` (profil) + `me/business-stats` (yalnız kurumsal)                         | Doğru kapılama                                                                    |

---

## Uygulama sırası önerisi

1. **P0 #1 + #3 birlikte** (checkout): hash/versiyon alanları + `pricing.summary` — ikisi de `useCheckout` içinde, tek PR.
2. **P0 #2** (kayıt `username`) — yeni kullanıcı girişini açar.
3. **P0 #4** (mesaj görselleri) — mevcut kullanıcı deneyimini bozuyor.
4. **P1 #5** (sipariş dökümü) + **#6** (paket boyutu) — para gösterimi tutarlılığı.
5. **P1 #9, #10** (hata ele alma) — küçük, `client.ts` içinde.
6. Kalanlar (#7, #8, #11–#22) sıraya göre.

---

## Açık sorular

- Misafir sepetinin cihaz-yerel kalması ("Faz A") kalıcı ürün kararı mı?
- Satıcı iade gelen kutusu hâlâ iki platformda da yok — gerçekten istenmiyor mu?
- iOS AASA dosyaları ne zaman yayınlanacak (P1 #15'in önkoşulu)?
- Yasal sayfalar CMS (`/sayfa/*`) mi statik ekran mı — ikilik hangi yönde çözülecek?
