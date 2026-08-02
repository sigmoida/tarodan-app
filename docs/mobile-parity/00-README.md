# Mobil ↔ Web İşlev Paritesi — Uygulama Rehberi

Bu klasör, **web uygulamasındaki (`apps/web`) her kullanıcı işlevinin mobil uygulamada
da bulunmasını** sağlamak için yazılmıştır. Mobilin kanonik reposu
**`github.com/sigmoida/tarodan-mobile`** (`main`); `/Users/kaan/Projects/tarodan-mobile`
lokal kopyası başka bir remote'a (`mki19xci/…`) bakıyor ve gerideydi — güncel durum
analizi için her zaman GitHub `main` esas alınmalı.

Hedef kitlesi iki taraflıdır: hem mobil geliştirici hem de bu dosyaları girdi olarak alıp
kod yazacak bir agent. Bu yüzden her dosya "şu ekranı şöyle çiz" demez; **sözleşme +
kabul kriteri** verir. Ekranın nasıl görüneceği mobil reponun kendi tasarım kurallarına
(`tarodan-mobile/CLAUDE.md`) bırakılmıştır.

---

## Dosyalar ve önerilen uygulama sırası

Sıra tesadüfi değil: para akışı ve yasal zorunluluk taşıyan alanlar öncedir.

| #   | Dosya                           | Kapsam                                                          |
| --- | ------------------------------- | --------------------------------------------------------------- |
| 01  | `01-auth-account.md`            | Kayıt, giriş, 2FA, e-posta doğrulama, şifre, Google/Apple       |
| 02  | `02-catalog-search.md`          | Anasayfa, kategori/marka, ürün detay, arama, koleksiyon, favori |
| 03  | `03-listings-seller.md`         | İlan oluştur/düzenle, görseller, indirim, öne çıkarma paketleri |
| 04  | `04-cart-checkout-payment.md`   | Sepet, kupon, quote, checkout, PayTR/3DS, misafir ödeme         |
| 05  | `05-orders-shipping.md`         | Sipariş listesi/detay, kargo takip, teslim onayı, fatura        |
| 06  | `06-offers-trades.md`           | Teklif ve takas akışları                                        |
| 07  | `07-refunds-returns.md`         | İade talebi, iade kargosu, durum akışı                          |
| 08  | `08-membership-corporate.md`    | Üyelik katmanları, satın alma, kurumsal başvuru + belgeler      |
| 09  | `09-messaging-notifications.md` | Mesajlar, bildirimler, push, realtime (Socket.IO)               |
| 10  | `10-profile-settings.md`        | Profil, adres, IBAN, ayarlar, hesap silme                       |
| 11  | `11-api-contract.md`            | İstemci sözleşmesi, hata kodları, endpoint kataloğu (üretilen)  |
| 12  | `12-mobile-platform.md`         | Token saklama, deep link, force-update, i18n, izinler           |
| 13  | `13-parity-matrix.md`           | Web işlevi → mobildeki durum → öncelik (**v2, 2026-08-02**)     |
| 14  | `14-shipping-package-tiers.md`  | **Kargo paket boyutları** — desi kaldırıldı; 03 ve 04'ü ezer    |
| 15  | `15-api-delta-2026-08-02.md`    | **Değişiklik güncesi** (31 Tem → 2 Ağu) — çelişkide bu kazanır  |
| 16  | `16-agent-brief.md`             | **Agent brifingi** — ne yapıldı, okuma sırası, ilk 4 iş         |

**Önce `11` ve `12` okunmalı.** Oradaki istemci sözleşmesi (bearer token, hata kodları,
sayfalama) her domain dosyasında varsayılır ve tekrar edilmez.

---

## Ortak kurallar (her dosyada geçerli)

### Base URL ve auth

Mobil, web'in `/gateway` BFF proxy'sini **taklit etmez**; NestJS API'ye doğrudan bağlanır:

| Ortam               | Base URL                      |
| ------------------- | ----------------------------- |
| Production          | `<PRODUCTION_API_ORIGIN>/api` |
| Preview/staging     | `<PREVIEW_API_ORIGIN>/api`    |
| Lokal (iOS sim)     | `http://localhost:3001/api`   |
| Lokal (Android emu) | `http://10.0.2.2:3001/api`    |

- Kimlik: **`Authorization: Bearer <accessToken>`**. Web'in `web_at`/`web_rt` httpOnly
  cookie'leri ve `tarodan_authed` işaretçisi **web'e özgüdür**, mobilde yoktur.
- CSRF guard yalnızca **auth cookie'si varken** devreye girer → bearer kullanan mobil
  istemci `X-CSRF-Token` göndermek zorunda değildir.
- Token yenileme: `POST /auth/refresh` gövdesinde `{ refreshToken }`.

### Kırıcı değişiklikler (2026-07-30) — mobilin uyarlaması ZORUNLU

> **Güncel delta:** 2026-07-31 sonrası giren değişiklikler (hizmet KDV'si,
> `pricing.summary`, `PKG-` teslimat numarası, medya `folder` beyaz listesi,
> `tradeAvailable`, referans önekleri vb.) için `15-api-delta-2026-08-02.md`
> dosyasına bak — aşağıdaki tabloyla çelişirse **15 kazanır**.

| Değişiklik                                                                   | Mobilde yapılması gereken                                          |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `POST /auth/register` artık **token dönmüyor** (`{ user, message }`)         | Kayıt sonrası oturum açmayı bırak; doğrulama ekranına git          |
| `POST /auth/refresh` doğrulanmamış e-postada **401 `EMAIL_NOT_VERIFIED`**    | Bu kodu yakala, oturumu kapat, doğrulama akışına yönlendir         |
| Checkout `expectedPricingHash` + `expectedShippingTariffVersion` **zorunlu** | Quote'tan gelen değerleri aynen geri gönder; 409'da quote'u yenile |
| Komisyon kuralı yoksa checkout **503**                                       | Kullanıcıya "şu an satın alınamıyor" de, tekrar denenebilir yap    |
| PayTR prod'da `test_mode` başarı callback'i reddediliyor                     | Mobil ödemeyi test etmek için staging kullan                       |
| İlan `shippingDesi` **kaldırıldı** → `shippingPackageTier` (paket boyutu)    | Desi input'unu üç kartla değiştir (bkz. doküman 14)                |
| `commission-preview` `shippingDesi` yerine **`packageTier`** alıyor          | Query parametresini değiştir; yoksa `small` varsayılır             |
| Checkout hizmet bedeli oranı artık `pricing.buyerFeeRate`                    | Etikete sabit "%3" yazma, bu alandan oku                           |

### Yanıt gövdesi tutarsızlığı

Bazı endpoint'ler `{ data: [...] }`, bazıları doğrudan `[...]` döndürür. Web savunmacı
şekilde `res.data.data ?? res.data ?? []` yapıyor. **Mobilde bu normalizasyonu API
katmanında tek yerde yap**, ekranlara sızdırma.

### Hata mesajı biçimi

`error.response.data.message` **string veya string[]** olabilir (NestJS doğrulama
hataları dizi döner). Tek bir yardımcı fonksiyonla ele al.

### Throttle limitleri (429 beklenmesi gereken uçlar)

`register` 5/dk · `register/business` 5/dk · `login` 5/dk · `check-email` 10/dk ·
`google`/`apple` 10/dk · `username-availability` 30/dk · `corporate-invitation` GET 20/dk,
activate 5/dk. 429'da kullanıcıya bekleme mesajı göster, sessizce yeniden denemeyi tekrarlama.

---

## Bu dosyalar nasıl kullanılır (agent için)

1. Dosyayı baştan sona oku; **Kaynak (web)** bölümündeki dosyaları aç ve doğrula —
   doküman ile kod çelişirse **kod doğrudur**, dokümanı güncelle.
2. Mobil reponun mevcut yapısını (`app/` router, API katmanı, tasarım sistemi) kullan;
   yeni desen icat etme.
3. **Kabul kriterleri** listesindeki her maddeyi işaretlenebilir hale getir; test/manuel
   doğrulama olmadan "bitti" deme.
4. **Yapma** listesindekileri taşımaya çalışma; onlar bilinçli olarak web'e özgüdür.
5. Endpoint listesi bayatlamışsa `pnpm docs:mobile-api` ile
   `docs/mobile-api-reference.html`'i yeniden üret ve karşılaştır.

---

## Durum sözlükleri

Sipariş, ödeme, kargo, iade, teklif, takas, üyelik, mesaj ve belge durumlarının
tam listesi üretilen dokümanda **"Mobil durum sözlükleri"** başlığı altındadır
(`docs/mobile-api-reference.html`). Mobil tarafta bu enum'ları **elle kopyalamak
yerine** `@tarodan/types` paketinden almayı değerlendir (paylaşım stratejisi mobil
repoda hâlâ açık bir karar — `docs/` altındaki notlara bak).
