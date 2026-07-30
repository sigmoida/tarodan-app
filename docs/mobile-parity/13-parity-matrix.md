# 13 — Parite Matrisi: Web İşlevi → Mobildeki Durum

Mobil repo: `/Users/kaan/Projects/tarodan-mobile` (Expo SDK 54, expo-router, 113 ekran,
~210 endpoint bağlı, 74 Jest + 50 Maestro testi). **Mobil zayıf değil** — keşif, sipariş,
teklif, takas, iade, mesajlaşma ve push alanları web ile eş veya daha ileri. Boşluklar
belirli ve sayılabilir.

Gösterim: ✅ tam · 🟡 kısmi · ❌ yok · ⚠️ hatalı/bozuk

---

## 🔴 P0 — Canlı kullanımı bozan / engelleyen

| #   | Bulgu                                            | Durum | Kanıt                                                                                                                                                                                                                                                                                       | Yapılacak                                                                                                                                      |
| --- | ------------------------------------------------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Kart ödemesi kaldırılmış bir uca gidiyor**     | ⚠️    | Mobil `POST /payments/process-direct` çağırıyor (`src/lib/api/checkout.ts:98`). Bu uç API'de **YOK**; kart-verisi sınırı sertleştirmesinde kaldırıldı ve `payment-card-data-boundary.spec.ts:18` route listesinde **bulunmamasını** test ediyor. Doğru uç: **`POST /payments/direct-form`** | `04` dosyasındaki akışa geç: `direct-form` → imzalı alanlar → WebView ile PayTR'ye POST. Kart verisi bizim API'ye **gönderilemez** (400 döner) |
| 2   | **2FA açan kullanıcı mobile bir daha giremiyor** | ❌    | `app/(auth)/login/_hooks/useLogin.ts` içinde `requires2FA` / `twoFactorCode` dalı yok; ama `app/settings/security/` 2FA'yı **açabiliyor**                                                                                                                                                   | `01` §4: login 200 + `requires2FA: true` yanıtını akış adımı olarak ele al, kod alanı göster (6 hane **veya** `XXXX-XXXX` yedek kod)           |
| 3   | **Kurumsal onboarding mobilde tamamlanamıyor**   | ❌    | 7 web ucundan (`/users/me/seller-documents*`) hiçbiri çağrılmıyor; `app/seller/register.tsx` sadece bilgilendirme. `BusinessMembershipGuard` kullanıcıyı `/business-pending` ekranına kilitliyor → çıkış yolu yok                                                                           | `08` §4: belge yükleme, paydaş ekleme, başvuru gönderme, itiraz                                                                                |
| 4   | **Kurumsal davet aktivasyonu yok**               | ❌    | Repoda invite/davet ile ilgili tek referans yok. Davet edilen alt hesap mobilde hesabını **hiç** açamıyor                                                                                                                                                                                   | `01` §3 + derin bağlantı (`12`)                                                                                                                |
| 5   | **Derin bağlantı yapılandırılmamış**             | ⚠️    | `app.json` yalnız `scheme: "tarodan"`; `ios.associatedDomains` ve `android.intentFilters` **yok**, `expo-linking` hiç import edilmiyor. Sonuç: e-posta doğrulama ve şifre sıfırlama bağlantıları uygulamayı açamıyor — o iki ekranın erişilebilir girişi yok                                | `12` §2                                                                                                                                        |

---

## 🟠 P1 — İşlev paritesi eksikleri

| #   | Bulgu                                               | Durum | Kanıt                                                                                                                                                                                                                | Yapılacak                                                                                                                                       |
| --- | --------------------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 6   | **Kupon/indirim kodu girişi yok**                   | ❌    | Hiçbir ekranda kupon UI'ı yok. `ordersApi.checkout` `couponCode?` parametresini tanımlıyor ama **hiç kimse geçirmiyor**; `cart.couponCode` çeviri anahtarı kullanılmıyor                                             | `04` §1: üyede `POST /cart/coupon`, misafirde `POST /discounts/validate-guest`                                                                  |
| 7   | **Sepet tamamen yerel**                             | 🟡    | `src/stores/cartStore.ts` zustand+AsyncStorage; **hiçbir `/cart` ucu çağrılmıyor**. Web sunucu sepeti kullanıyor → sepet cihazlar/web arasında **senkron değil**; 24 saatlik yerel son kullanma mobile özgü davranış | Karar gerekiyor: (a) üyede sunucu sepetine geç + girişte birleştirme (`04` §1), (b) bilinçli olarak yerel kalsın ve ürün kararı olarak yazılsın |
| 8   | **Vitrin (öne çıkan slot) ölü kod**                 | ❌    | `src/components/FeaturedListingsModal.tsx` tüm akışı uygulamış ama **hiç render edilmiyor**; ayrıca API'de olmayan `GET /products/my-listings`'i çağırıyor                                                           | `03` §5: `GET /products/:id/boost/options` + `POST /products/:id/boost/initiate` ile birleştir                                                  |
| 9   | **Boost fiyatları yanlış uçtan**                    | ⚠️    | Mobil `GET /products/boost/pricing` (legacy düz fiyat) kullanıyor; web ürün fiyat bandına göre `GET /products/:id/boost/options` kullanıyor → **mobilde yanlış fiyat gösterilebilir**                                | `03` §5                                                                                                                                         |
| 10  | **Satıcı fatura yükleme yok**                       | 🟡    | Mobil e-Arşiv ve satıcı faturasını **okuyabiliyor**, ama kurumsal satıcı `POST /orders/:id/seller-invoice` ile PDF **yükleyemiyor**                                                                                  | `05` §5                                                                                                                                         |
| 11  | **Reklam alanları (ads) yok**                       | ❌    | Web `GET /ads/active` + impression/click kullanıyor; mobilde karşılığı yok                                                                                                                                           | Ürün kararı: gelir kaybı mı, mobilde istenmiyor mu?                                                                                             |
| 12  | **E-posta değişikliği ve kullanıcı adı talebi yok** | ❌    | Web: `POST /auth/email/request-change` + `/verify-change`, `PATCH /users/me/username`                                                                                                                                | `10` §3                                                                                                                                         |
| 13  | **Planlı üyelik değişikliğini iptal yok**           | ❌    | Web `POST /membership/cancel-scheduled-change`                                                                                                                                                                       | `08` §2                                                                                                                                         |
| 14  | **Telefon doğrulama ekranı yok**                    | 🟡    | API katmanında `sendPhoneCode`/`verifyPhone` bağlı ama **hiçbir ekran çağırmıyor**                                                                                                                                   | `10` §4                                                                                                                                         |

---

## 🟡 P2 — Erişilebilirlik ve tutarlılık

| #   | Bulgu                                                             | Durum | Yapılacak                                                                                                                                                                                                                                             |
| --- | ----------------------------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 15  | **~22 ekran menüden erişilemiyor**                                | 🟡    | `settings/payment-methods`, `payment-history`, `payments`, `subscription`, `saved-searches`, `discounts`, `sales/[id]`, `checkout/success`, `sayfa/[slug]` + 10 statik içerik sayfası. Kod var, bağlantı yok → profil menüsüne/ayarlar listesine ekle |
| 16  | Üyelik hakları istemcide sabit                                    | 🟡    | `src/stores/authStore.ts` içindeki `TIER_LIMITS` tablosu kullanılıyor; `GET /users/me` → `membership.tier` ve `GET /membership/me/limits` mevcut. **API değerini tercih et**, tablo sessizce bayatlıyor                                               |
| 17  | `POST /products/:id/click` ve `GET /products/popular` çağrılmıyor | 🟡    | Web anasayfada ikisini de kullanıyor (tıklama takibi + popüler ray)                                                                                                                                                                                   |
| 18  | `GET /orders/:id/my-review` çağrılmıyor                           | 🟡    | Kullanıcının kendi yorumunu göstermek için (`05`)                                                                                                                                                                                                     |
| 19  | Yazıyor göstergesi tek yönlü                                      | 🟡    | Hem web hem mobil `typing:started/stopped` **dinliyor** ama hiç **yayınlamıyor**. Sunucu `typing:start/stop` kabul ediyor → mobil bunu kapatabilir (`09`)                                                                                             |
| 20  | Satıcı iade gelen kutusu yok                                      | 🟡    | `GET /refund-requests/seller` her iki tarafta da tanımlı, hiçbirinde ekran yok. Ürün kararı (`07`)                                                                                                                                                    |
| 21  | Ekranlarda sabit Türkçe metin                                     | 🟡    | i18n kataloğu **tamamen hazır** (4.822 anahtar, tr/en tam parite) ama ekranlarda hâlâ gömülü Türkçe var → katalog anahtarlarına taşı                                                                                                                  |

---

## ✅ Zaten eş veya mobilde daha iyi

| Alan                                                                                                            | Durum | Not                                                                   |
| --------------------------------------------------------------------------------------------------------------- | ----- | --------------------------------------------------------------------- |
| Keşif (anasayfa, arama, kategori, marka, model, üretici, ürün detay)                                            | ✅    | Mobilde marka/model sayfaları **var**, web'de marka sayfası yok       |
| Favoriler, takip, koleksiyonlar (CRUD + beğeni + öğe ekleme)                                                    | ✅    |                                                                       |
| İlan oluştur/düzenle/pasife al/sil/yeniden yayına ver                                                           | ✅    | Tek paylaşılan `ListingForm` (create/edit)                            |
| Satıcı indirimleri (CRUD)                                                                                       | ✅    | Ekran var ama menüden erişilemiyor (#15)                              |
| Checkout (üye + misafir OTP)                                                                                    | ✅    | 3 adım, idempotency anahtarı, `POST /orders/quote` fiyatlaması        |
| Sipariş listesi/detay, kargo takip, teslim onayı, e-Arşiv okuma                                                 | ✅    | Satıcı tarafı `app/sales/` ayrı                                       |
| Misafir sipariş takibi                                                                                          | ✅    |                                                                       |
| Teklifler                                                                                                       | ✅    | Reponun referans uygulaması (`app/offers/`)                           |
| Takas (öneri, karşı teklif, kargo, nakit fark, itiraz)                                                          | ✅    | **`POST /trades/:id/dispute` mobilde çağrılıyor, web'de çağrılmıyor** |
| İade talebi + kanıt fotoğrafı + kısmi iade + iptal                                                              | ✅    |                                                                       |
| Üyelik (katman, satın alma, yönetim, otomatik yenileme, kayıtlı kart)                                           | ✅    |                                                                       |
| Mesajlaşma + Socket.IO + görsel eki + rapor/engelle                                                             | ✅    |                                                                       |
| Bildirimler + **push (Expo, 4 Android kanalı, tap yönlendirme)**                                                | ✅    | Web'de push yok — mobil fazlası                                       |
| Destek talepleri + misafir iletişim                                                                             | ✅    |                                                                       |
| Profil, adres, IBAN, güvenlik (şifre/2FA/tüm oturumları kapat), hesap silme, bildirim tercihleri, dil, analitik | ✅    |                                                                       |
| Force-update + OTA (EAS)                                                                                        | ✅    | Web'de karşılığı yok                                                  |
| Banlı kullanıcı / kurumsal durum ekranları                                                                      | ✅    |                                                                       |

---

## Uç yolu çelişkileri — çözüm tablosu

Mobil ile web farklı yollar kullanıyor. **Doğrusu API'de var olandır**; aşağıdakiler
`apps/api` üzerinde doğrulandı:

| İşlev                | Mobil                                             | Web                                                   | API'de gerçek                                   | Karar                                                                                                        |
| -------------------- | ------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Kart ödemesi         | `POST /payments/process-direct`                   | `POST /payments/direct-form`                          | **yalnız `direct-form`**                        | **Mobil hatalı** — düzelt (P0 #1)                                                                            |
| Boost seçenekleri    | `GET /products/boost/pricing`                     | `GET /products/:id/boost/options`                     | **ikisi de var** (`pricing` legacy düz fiyat)   | Mobil `:id/boost/options`'a geçsin (P1 #9)                                                                   |
| Takas nakit ödemesi  | `POST /payments/initiate-trade-cash`              | `POST /trades/:id/cash-payment/initiate`              | **ikisi de var**                                | İkisi de çalışır; **`/payments/initiate-trade-cash`** tercih edilsin (web canlı yolu bu)                     |
| Satıcı kargo girişi  | `POST /shipping` + `PATCH /shipping/:id/tracking` | —                                                     | **`/shipping` var**, `/orders/:id/ship` **yok** | **Mobil doğru.** Web envanterindeki `/orders/:id/ship` iddiası hatalı; web'in kargo çağrısını ayrıca doğrula |
| Bekleyen sayaçlar    | `GET /trades/status-counts`                       | `GET /trades/pending-count` + `/offers/pending-count` | **üçü de var**                                  | İkisi de geçerli; badge için `pending-count` daha ucuz                                                       |
| Kendi istatistikleri | `GET /users/me/business-stats`                    | `GET /users/me/stats` (+ business-stats)              | **ikisi de var**                                | Farklı amaçlar; ikisini de kullan                                                                            |

---

## Uygulama sırası önerisi

1. **P0 #1 (ödeme ucu)** — mobilde ödeme alınamıyorsa her şeyden önce bu.
2. **P0 #2 (2FA)** — kullanıcıyı uygulamadan kilitliyor.
3. **P0 #5 (derin bağlantı)** — #4'ün ve e-posta akışlarının önkoşulu.
4. **P0 #3, #4 (kurumsal)** — kurumsal satıcı kazanımını bloke ediyor.
5. **P1 #6, #7 (kupon + sepet)** — dönüşüm ve çok-cihaz deneyimi.
6. **P1 #9, #8 (boost/vitrin)** — gelir ürünü, yanlış fiyat riski.
7. Kalanlar (#10–#21) sıraya göre.

---

## Doğrulanması gereken açık sorular

- Mobil ödeme **şu anda çalışıyor mu?** Eğer çalışıyorsa `process-direct` bir proxy/rewrite
  ile mi karşılanıyor? (API'de yok ve spec varlığını yasaklıyor.) Canlıda ağ trafiğiyle teyit et.
- Sepetin sunucuya taşınması ürün kararı mı, teknik borç mu?
- Reklam alanları (`/ads/*`) mobilde istenmiyor mu?
- Satıcı iade gelen kutusu her iki platformda da yok — gerçekten gerekmiyor mu?
