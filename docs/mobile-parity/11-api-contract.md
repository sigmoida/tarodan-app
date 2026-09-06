# 11 — İstemci Sözleşmesi ve Endpoint Kataloğu

## Endpoint kataloğu nerede?

**Elle yazılmış bir liste yok — bilinçli olarak.** Katalog koddan üretilir:

```bash
pnpm docs:mobile-api          # → docs/mobile-api-reference.html (tek dosya, tarayıcıda açılır)
```

Üretilen doküman (2026-07-30 itibarıyla **295 endpoint**) her uç için şunları içerir:
method, yol, auth türü, özet, parametre/DTO alanları, yanıt kodları, ilgili şemalar, cURL
örneği, **kaynak dosya:satır** ve **web'in o ucu çağırıp çağırmadığı**.

En değerli alan: **`coverage`**

- **`web-required` (224 uç)** → web bunu çağırıyor, yani **mobil paritesi için gerekli**.
- **`api-available` (71 uç)** → API'de var, web kullanmıyor. Mobil için fırsat ya da gereksiz.

Dokümanda ayrıca 9 iş akışı, **22 Socket.IO realtime olayı** ve 11 durum sözlüğü
(`OrderStatus`, `RefundRequestStatus`, `TradeStatus`, `ShipmentStatus`, `PaymentStatus`,
`OfferStatus`, `ProductStatus`, `SubscriptionStatus`, `MessageStatus`,
`ElogoInvoiceStatus`, `SellerDocumentStatus`) bulunur.

> Domain dokümanları (01–10) her işlev için **hangi ucun kullanılacağını** küratörlü olarak
> listeler. Tam katalog için üretilen dokümana bak.

---

## 1. Base URL

| Ortam               | Base URL                      |
| ------------------- | ----------------------------- |
| Production          | `<PRODUCTION_API_ORIGIN>/api` |
| Preview/staging     | `<PREVIEW_API_ORIGIN>/api`    |
| Lokal (iOS sim)     | `http://localhost:3001/api`   |
| Lokal (Android emu) | `http://10.0.2.2:3001/api`    |

**Tek istisna:** PayTR bildirim alias'ı `POST /callback` — global `api` ön ekinin **dışındadır**.
Sunucu-sunucu; istemci asla çağırmaz.

---

## 2. Kimlik doğrulama

### Bearer, cookie değil

API her giriş yanıtında token'ları **hem gövdede hem cookie olarak** döndürür.
Mobil **yalnızca gövdeyi** kullanır:

```
Authorization: Bearer <accessToken>
```

Sunucu token'ı şu sırayla arar: `access_token` cookie → `Authorization` başlığı.

> ⚠️ **Cookie kavanozunu kapat.** React Native'de paylaşılan bir `CookieManager` varsa
> bayat cookie başlığı **ezer** ve ayrıca CSRF guard'ını devreye sokar (§4).

### Token ömürleri

| Token   | Varsayılan ömür                  | İmza anahtarı        |
| ------- | -------------------------------- | -------------------- |
| access  | 15 dk (`JWT_EXPIRES_IN`)         | `JWT_SECRET`         |
| refresh | 7 gün (`JWT_REFRESH_EXPIRES_IN`) | `JWT_REFRESH_SECRET` |

### Yenileme — tek kullanımlık ve rotasyonlu

```
POST /auth/refresh      { "refreshToken": "<token>" }   → { accessToken, refreshToken }
```

- Sunucu refresh token'ı **kalıcı hash ile** doğrular ve **iptal eder**. Eski token bir
  daha çalışmaz → **yenileme serileştirilmeli** (tek uçuş, diğer 401'ler kuyrukta bekler).
- Yanıt **yalnız token** döner (kullanıcı yok) → gerekiyorsa `GET /users/me` çağır.
- **Doğrulanmamış e-postada 401 + `errorCode: "EMAIL_NOT_VERIFIED"`** döner (2026-07-30).
- Banlı/silinmiş hesapta 401.

### Çıkış

```
POST /auth/logout       { "refreshToken": "<token>" }
POST /notifications/push-token   { token, deactivate: true }   ← push kaydını da kaldır
DELETE /security/tokens          ← "her yerden çık" (tüm refresh token'ları iptal)
```

### Kayıt oturum açmaz

`POST /auth/register` → `{ user, message }`. **Token dönmez** (bilinçli). Akış:
kayıt → e-posta doğrula → giriş.

---

## 3. Ödeme yetki jetonu (`X-Payment-Capability`)

`POST /payments/initiate` ve `/payments/initiate-guest` yanıtlarında `paymentAccessToken`
gelir: `{ sub: paymentId, type: "payment_capability" }`, **2 saat** ömürlü.

Şu uçlarda **oturum olmadan** yetki verir:

```
GET  /payments/:id/status          GET  /payments/:id/status-guest
POST /payments/:id/verify          POST /payments/:id/confirm-failed
POST /payments/direct-form         (paymentId verildiğinde)
GET  /invoices/order/:orderId/public?paymentId=      ← ZORUNLU
GET  /invoices/download/:id/public?paymentId=        ← ZORUNLU
```

WebView turu boyunca **güvenli depoda tut**; yoksa misafir 403 alır.

---

## 4. CSRF — mobilde yok

Guard şu sırayla karar verir:

1. `GET/HEAD/OPTIONS` → geç.
2. İstekte **auth cookie'si yoksa** → geç.
3. Varsa `csrf_token` cookie'si ile `X-CSRF-Token` başlığı eşleşmeli.

**Bearer kullanan mobil istemci bu guard'a hiç değmez** ve `X-CSRF-Token` göndermemelidir.
`403 "Invalid CSRF token"` görüyorsan çözüm başlık eklemek değil, **cookie göndermeyi
bırakmaktır**. `GET /security/csrf-token` **başka** bir mekanizmadır, guard onu kullanmaz —
mobilde yok say.

---

## 5. Zorunlu başlıklar

| Başlık                 | Ne zaman                    | Değer                                                 |
| ---------------------- | --------------------------- | ----------------------------------------------------- |
| `Authorization`        | kimlikli her istek          | `Bearer <accessToken>`                                |
| `Content-Type`         | JSON gövdeli                | `application/json`                                    |
| `Accept-Language`      | **her zaman**               | `tr` \| `en` — hata `message`'ları bu dile göre gelir |
| `X-Payment-Capability` | misafir ödeme/fatura uçları | yetki jetonu                                          |
| `X-CSRF-Token`         | **asla**                    | yalnız tarayıcı                                       |
| `Cookie`               | **asla**                    | kavanozu kapat                                        |

---

## 6. Hata sözleşmesi

### Zarf üç biçimde gelir

**(a) Yerelleştirilmiş hata** (en yaygın):

```json
{
  "statusCode": 409,
  "message": "Kargo fiyatı güncellendi. Lütfen sepeti yenileyip yeni tutarı onaylayın.",
  "error": "Conflict",
  "i18nKey": "server.shipping.pricingChanged"
}
```

`message` gösterim içindir; **`i18nKey` kararlıdır ve dallanma buna göre yapılır.**

**(b) Doğrulama hatası** — `message` **dizi** olabilir:

```json
{
  "statusCode": 400,
  "message": ["email must be an email", "..."],
  "error": "Bad Request"
}
```

**(c) Beklenmeyen hata** — iç detay sızdırmaz:

```json
{
  "statusCode": 500,
  "message": "Sunucu hatası",
  "i18nKey": "server.common.internalError"
}
```

### ⚠️ Üç farklı ayırt edici alan var

Kod tabanında `errorCode`, `code` ve `i18nKey` birlikte kullanılıyor. **Üçüne de defansif bak:**

```ts
type ApiError = {
  statusCode: number;
  message: string | string[];
  error: string;
  i18nKey?: string; // kararlı katalog anahtarı — tercih et
  errorCode?: string; // auth katmanı
  code?: string; // fiyat/kargo/vergi/kargo-firması katmanı
  bannedReason?: string | null;
  correlationId?: string;
};
const discriminator = (e: ApiError) => e.errorCode ?? e.code ?? e.i18nKey;
```

### Ele alınması zorunlu kodlar

| Ad                                  | HTTP    | Ayırt edici                                                            | Anlam / aksiyon                                                                                                                                                |
| ----------------------------------- | ------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EMAIL_NOT_VERIFIED`                | 401     | `errorCode`                                                            | Login **ve refresh**'te çıkar. Oturumu kapat, doğrulama ekranına git, "tekrar gönder" sun                                                                      |
| `USER_BANNED`                       | 403     | `errorCode` (+ `bannedReason`)                                         | Engellendi ekranı. `POST /auth/logout` ve `/support/*` hâlâ çalışır                                                                                            |
| `STAFF_ACCOUNT`                     | 401     | `errorCode` + `i18nKey: "server.auth.staffAccountCustomerLogin"`       | Personel hesabı (yönetim paneli kullanıcısı) web/mobil'e giremez; login, sosyal login, refresh ve her korumalı istekte dönebilir. Oturumu kapat, mesajı göster |
| `TWO_FACTOR_PASSWORD_REQUIRED`      | 401     | `errorCode`                                                            | Google/Apple girişi 2FA yüzünden engellendi → e-posta+şifre ile giriş                                                                                          |
| **fiyat değişti**                   | **409** | **`i18nKey: "server.shipping.pricingChanged"`** — **`code` alanı YOK** | Quote'u yenile, yeni toplamı göster, yeniden onay al. `status === 409 && i18nKey === ...` ile yakala                                                           |
| `SHIPPING_DESI_RATE_NOT_CONFIGURED` | 503     | `code`                                                                 | Yapılandırma boşluğu; tekrar denemek çözmez. "Şu an satın alınamıyor"                                                                                          |
| `TAX_CONFIGURATION_MISSING`         | 503     | `code`                                                                 | Aynı                                                                                                                                                           |
| komisyon kuralı yok                 | 503     | `i18nKey: "server.commission.noRuleConfigured"`                        | Aynı                                                                                                                                                           |
| aktif kargo tarifesi yok            | 503     | `i18nKey: "server.shipping.noActiveTariff"`                            | Aynı                                                                                                                                                           |
| `reactivateAlreadyPaid`             | 400     | `i18nKey: "server.order.reactivateAlreadyPaid"`                        | Ödenmiş/iade edilmiş teklif siparişi yeniden açılamaz; "Ödemeyi tamamla" gösterme                                                                              |
| iade zaten aktif                    | 400     | `i18nKey: "server.refund.alreadyActive"`                               | Mevcut iade talebine derin bağlantı                                                                                                                            |
| `SURAT_BUSINESS`                    | 400     | `code` (+ `correlationId`)                                             | Adres/bilgi hatası — kullanıcıya düzeltme sun                                                                                                                  |
| `SURAT_TECHNICAL`                   | 503     | `code` (+ `correlationId`)                                             | **Geri çekilmeli (backoff) tekrar denenebilir**                                                                                                                |
| 429                                 | 429     | —                                                                      | Bekleme mesajı; sessiz yeniden denemeyi tekrarlama                                                                                                             |

Ayrıca `i18nKey`-only auth hataları: `server.auth.loginRequired`,
`server.auth.invalidRefreshToken`, `server.auth.accountSuspended`,
`server.auth.invalidCredentials`, `server.auth.userNotFound`.

---

## 7. Sayfalama — üç ayrı sözleşme var

**Tek bir varsayım yapma.**

### (a) `{ data, meta }` — çoğu liste

```json
{ "data": [...], "meta": { "total": 100, "page": 1, "limit": 20, "totalPages": 5 } }
```

Parametreler: `page` (≥1, vars. 1) · `limit` (1..500, vars. 20; birçok DTO 100'de sınırlar) ·
`sortBy` · `sortOrder` (`asc|desc`) · `sortType` (`text|number|date`) ·
`startDate`/`endDate` (`YYYY-MM-DD`, dahil) · `search`.

> **Bilinmeyen `sortBy` hata vermez** — sessizce varsayılana düşer.

Kullananlar: `/products`, `/products/my`, `/orders`, `/offers`, `/discounts`.

### (b) `{ <isim>, total, page, pageSize }` — koleksiyon, destek, puanlar

`limit` değil **`pageSize`**. Ör. `{ collections, total, page, pageSize }`.

### (c) Serbest parametreler

`/search/products` (`page`+`pageSize`) · `/orders/groups` (`page`+`limit`, 50'de kırpılır) ·
`/notifications` (`page`+`limit`, **sayısal olmayan değer 400 verir**) ·
`/products/popular`, `/users/top-sellers`, `/products/:id/similar` (yalnız `limit`).

### ⚠️ Hata yutan listeler

`GET /products`, `GET /collections/liked`, `GET /wishlist`, `GET /users/top-collections`,
`GET /users/featured-collector`, `GET /users/featured-business` hatayı yutup **boş sayfa**
döner. **Boş sonuç "veri yok" anlamına gelmeyebilir** — kullanıcıya "hata" değil "şu an
gösterilemiyor" demeyi düşün.

---

## 8. Dosya yükleme

Tüm uçlarda multer sınırı **10 MB** (dahil); aşan istek gövde tamponlanmadan **413** alır.
JSON için geçerli 1 MB sınırı multipart'a **uygulanmaz**.

| Uç                                | Alan adı                | Maks dosya                    | MIME                     | Sonuç URL                                                                                |
| --------------------------------- | ----------------------- | ----------------------------- | ------------------------ | ---------------------------------------------------------------------------------------- |
| `POST /media/upload?folder=`      | `file`                  | 1                             | jpeg, png, webp, gif     | **presigned, 1 saat**                                                                    |
| `POST /media/upload/multiple`     | `files`                 | 10                            | aynı                     | aynı                                                                                     |
| `POST /media/upload/product`      | `images`                | 15 (üyelik sınırı da geçerli) | jpeg, png, webp, gif     | **kalıcı public** (`cardKey/detailKey` + `cardUrl/detailUrl`; 500×500 ve 1200×1200 WebP) |
| `POST /media/upload/avatar`       | `avatar`                | 1                             | jpeg, png, webp          | **2 MB sınır**, public, 300×300                                                          |
| `POST /collections/:id/items`     | `image` (ops.)          | 1                             | görsel                   | presigned, **7 gün**, 800×800                                                            |
| `PATCH /collections/:id/cover`    | `cover`                 | 1                             | görsel                   | koleksiyon yanıtında                                                                     |
| `POST /users/me/seller-documents` | `file` + `documentType` | 1                             | **pdf**, jpeg, png, webp | **özel bucket** — yalnız presigned                                                       |
| `POST /orders/:id/seller-invoice` | `file`                  | 1                             | **yalnız pdf**           | özel bucket, indirme ucu ile                                                             |

**Sunucu sertleştirmesi:** beyan edilen MIME ile **gerçek magic byte'lar** eşleşmeli
(spoof reddedilir); HTML/SVG/script/çalıştırılabilir her durumda reddedilir; **görsel
yüklemeleri AI moderasyonundan geçer** ve `flag` verdisi yüklemeyi engeller (yanıt Türkçe
mesajla 400 döner — kullanıcıya olduğu gibi göster).

---

## 9. Realtime (Socket.IO)

```
Namespace: /          Transports: websocket, polling
Bağlantı: auth: { token: "<accessToken>" }   (veya Authorization: Bearer başlığı)
```

| Yön              | Olay                                | Amaç                                                |
| ---------------- | ----------------------------------- | --------------------------------------------------- |
| istemci → sunucu | `join:thread` / `leave:thread`      | Mesaj odası                                         |
| istemci → sunucu | `typing:start` / `typing:stop`      | **Sunucu destekliyor; hiçbir istemci yayınlamıyor** |
| sunucu → istemci | `message:new`                       | Yeni mesaj (cache'e id ile birleştir)               |
| sunucu → istemci | `message:read`                      | Okundu bilgisi (çift tik)                           |
| sunucu → istemci | `typing:started` / `typing:stopped` | Yazıyor göstergesi                                  |
| sunucu → istemci | `notification:new`                  | Bildirim + sayaç tazeleme                           |
| sunucu → istemci | `thread:updated`                    | Thread listesi + okunmamış sayaç                    |

Tam olay listesi (22 olay) üretilen dokümanın **"Realtime Socket.IO sözleşmesi"** bölümünde.

> Socket token'ı bağlantı anında verilir; **token yenilenince soketi yeniden bağla** —
> mevcut istemcilerde bu ele alınmıyor.

---

## 10. Yalnız mobil için olan uçlar

| Uç                                      | Amaç                                                                                                      |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `GET /app-config?platform=&appVersion=` | **Force-update kapısı.** Açılışta çağır, `updateRequired` ise engelle                                     |
| `POST /notifications/push-token`        | Push kaydı; `{ token, platform, deviceId?, deactivate? }`. Çıkışta `deactivate: true`                     |
| `GET /users/:id/avatar`                 | **302** ile presigned S3'e yönlendirir — `Authorization` gönderemeyen görsel yükleyiciler için tasarlandı |

---

## 11. Mobilde asla çağrılmayacak uçlar

- `POST /payments/callback/paytr` ve `POST /callback` — PayTR sunucu-sunucu webhook'u.
- `POST /shipping/webhook/:provider` — kargo firması; varsayılan **kapalı**.
- `/auth/admin/*`, `/*/admin/*`, `/reports/*`, `/health/detailed` — admin yüzeyi, ayrı JWT.
- `GET /search/dev/reindex*`, `GET /categories?refresh=1` — geliştirme/ops; `refresh=1`
  sunucu cache'ini boşaltır, üretim istemcisinden çağrılmamalı.
- `GET /security/csrf-token` — guard'ın kullandığı mekanizma değil.
