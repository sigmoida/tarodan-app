# 04 — Sepet, Checkout ve Ödeme (PayTR/3DS)

> **Bu dosya en kritik olanı.** Ödeme akışı web'de tarayıcıya özgü bir mekanizmayla
> çalışıyor ve mobile **birebir taşınamaz**; §5 bunun native karşılığını tanımlar.
> Önce `00-README.md` ve `11-api-contract.md` okunmalı.

## Kaynak (web)

```
apps/web/src/app/[locale]/(main)/(catalog)/cart/                 # sepet + /cart/payment (checkout)
apps/web/src/app/[locale]/(main)/(catalog)/checkout/             # CheckoutClient, context, adımlar
apps/web/src/app/[locale]/(main)/payment/[id]/                   # kart formu + PayTR gönderimi
apps/web/src/hooks/useCart.ts                                    # üye/misafir çift sepet + merge
apps/web/src/stores/cartStore.ts                                 # misafir sepeti (localStorage)
apps/web/src/lib/api/{cart,payments,orders}.ts
apps/api/src/modules/order/dto/checkout.dto.ts                   # sözleşmenin kaynağı
apps/api/src/modules/payment/payment.controller.ts               # kart verisi sınırı (assertNoRawCardData)
apps/api/src/modules/payment-providers/paytr.service.ts          # imzalı form alanları
```

---

## Uçtan uca durum makinesi (mobilin kurması gereken)

```
sepet → quote → (misafirse e-posta OTP) → sipariş oluştur → ödeme başlat
      → kart bilgisi (native) → direct-form (imzalı alanlar) → WebView 3DS
      → dönüş URL'ini yakala → verify (retry'lı) → status → fatura
```

Web bu akışı **tam sayfa yönlendirmelerle** yürütüyor. Mobilde açık bir state machine
kurulmalı; her adım kesintiye (uygulama arka plana atıldı, WebView kapandı) dayanıklı olmalı.

---

## 1. Sepet

Üye ve misafir için **iki ayrı veri kaynağı** var:

- **Üye:** sunucu sepeti (`GET /cart`).
- **Misafir:** yerel sepet (web: zustand + localStorage; mobil: MMKV/AsyncStorage). Yalnızca
  kupon **kodu** saklanır; indirim her değişiklikte sunucuda yeniden doğrulanır.

### Endpoint'ler

| İşlem                 | Method   | Path                        | Auth   | Not                                                           |
| --------------------- | -------- | --------------------------- | ------ | ------------------------------------------------------------- |
| Sepeti getir          | `GET`    | `/cart`                     | bearer | Sunucu hesabı (`calculation`) ile döner                       |
| Ürün ekle             | `POST`   | `/cart/items`               | bearer | `{ productId, quantity }`                                     |
| Adet güncelle         | `PATCH`  | `/cart/items/:productId`    | bearer | **`:productId` ürün id'si**, sepet satırı id'si değil         |
| Satır sil             | `DELETE` | `/cart/items/:productId`    | bearer |                                                               |
| Sepeti boşalt         | `DELETE` | `/cart`                     | bearer |                                                               |
| Kupon uygula          | `POST`   | `/cart/coupon`              | bearer | `{ code }` — büyük harfe çevir                                |
| Kupon kaldır          | `DELETE` | `/cart/coupon`              | bearer |                                                               |
| Misafir kupon doğrula | `POST`   | `/discounts/validate-guest` | public | `{ code, cartItems: [{productId, quantity}] }`                |
| Misafir ürün bilgisi  | `GET`    | `/products/:id`             | public | Yerel satır için başlık/fiyat/görsel/`availableQuantity`      |
| Alıcı hizmet bedeli   | `POST`   | `/orders/quote`             | public | Sepette gösterilen platform ücreti (`pricing.buyerFeeAmount`) |

### Kurallar

- **Ödenebilir toplamlar yalnızca uygun (available) satırlardan hesaplanır.** Uygun olmayan
  satırlar listede görünür ama `subtotal`/`itemCount`/"ödemeye geç" hesabına **girmez**.
  (Bu, geçmişte "sepet boş ama ödeme yapılabiliyor" hatasının kaynağıydı.)
- Sepette **kargo gösterilmez** — "checkout'ta hesaplanacak" denir. Kargo yalnızca quote'tan gelir.
- Sepet toplamı = `max(0, subtotal - totalDiscount) + buyerFee`.
- Misafir adet üst sınırı: `min(availableQuantity, 20)`.

### Girişte sepet birleştirme

Kullanıcı giriş yaptığında yerel satırlar **sırayla** `POST /cart/items` ile gönderilir,
sonra kupon uygulanır, sonra sunucu sepeti tazelenir ve yerel sepet temizlenir.
Aynı anda iki kez çalışmasın diye **single-flight** guard'ı şart.

### Kabul kriterleri

- [ ] Uygun olmayan satır ödeme toplamına dâhil edilmiyor ve "ödemeye geç" engelleniyor.
- [ ] Adet güncelleme ürün id'si ile yapılıyor.
- [ ] Girişte birleştirme bir kez çalışıyor, satır kaybı/çift ekleme olmuyor.
- [ ] `GET /cart` 503 `SHIPPING_DESI_RATE_NOT_CONFIGURED` dönerse anlaşılır bir "şu an
      hesaplanamıyor" durumu gösteriliyor (web'de bu ele alınmıyor — mobil daha iyisini yapmalı).

---

## 2. Fiyat teklifi (quote) — tek doğruluk kaynağı

```
POST /orders/quote        (public, throttle 60/dk)
{ items: [{ productId, quantity? }], couponCode? }
```

**Yanıt (kritik alanlar):**

```ts
{
  itemsSubtotal, shippingAmount, buyerFeeAmount, sellerFeeAmount,
  commissionAmount, taxAmount, couponDiscount, totalAmount, sellerNetAmount,
  items: [{ productId, sellerId, quantity, unitPrice, subtotal, buyerFeeAmount,
            sellerFeeAmount, sellerNetAmount, taxAmount, title? }],
  shippingBySeller: [{ sellerId, shippingCost, billableDesi }],  // satıcı başına 1 paket
  shippingTariffVersion: number,   // sipariş oluştururken AYNEN geri gönder
  pricingHash: string,             // 16 hex karakter, AYNEN geri gönder
  pricing: { subtotal, shippingAmount, buyerFeeAmount, sellerFeeAmount,
             commissionAmount, taxAmount, totalAmount, sellerNetAmount }
}
```

**Değişmezler:**

- `pricing.totalAmount` **tahsil edilecek tutardır.** Kuponu istemcide bir daha düşme.
- `totalAmount = itemsSubtotal − couponDiscount + shippingAmount + buyerFeeAmount + taxAmount`.
- Çoklu satıcıda kargo **satıcı başına** hesaplanır; `shippingAmount = Σ shippingBySeller[].shippingCost`.
- Quote yoksa (hata aldıysa) **sipariş oluşturma denenmemeli**.

**Parite fırsatı:** Web `shippingBySeller` ve `items[]` kırılımını göstermiyor. Mobilde
"satıcı bazında kargo" özetini göstermek kullanıcı için daha anlaşılır olur.

---

## 3. Checkout adımları

İki adım: **0 = Adres**, **1 = Onay**. Kart bilgisi bu ekranlarda **alınmaz** (ayrı ödeme ekranı).

### Adres adımı

| İşlem            | Method | Path                  | Auth   |
| ---------------- | ------ | --------------------- | ------ |
| Kayıtlı adresler | `GET`  | `/users/me/addresses` | bearer |
| Yeni adres ekle  | `POST` | `/users/me/addresses` | bearer |

Üye: kayıtlı adres listesi (varsayılan → yoksa son → yoksa form). Misafir: ad/e-posta/telefon +
adres alanları. Fatura adresi "teslimat ile aynı" seçeneği veya ayrı adres.

> **Yapma:** `GET /shipping/rates` çağrısı ve web'deki `34.9`/`49.9` sabit kargo fallback'i.
> Kargo **yalnızca** quote'tan gelir.

### Misafir e-posta OTP

| Method | Path                                   | Auth   | Not                                                                                      |
| ------ | -------------------------------------- | ------ | ---------------------------------------------------------------------------------------- |
| `POST` | `/orders/guest/send-verification-code` | public | `{ email, expectedCheckoutCount }` → `{ success, expiresInSeconds }` — throttle **3/dk** |

- **409 / `EMAIL_ALREADY_REGISTERED`** → misafir ödeme reddedilir; kullanıcı girişe yönlendirilir.
- 6 haneli kod alınır ama **burada doğrulanmaz**; sipariş oluşturma isteğinde gönderilir.
- E-posta değişirse kod sıfırlanır.

### Onay adımı → sipariş oluşturma

| Adım             | Method | Path                     | Auth                    |
| ---------------- | ------ | ------------------------ | ----------------------- |
| Üye siparişi     | `POST` | `/orders/checkout`       | bearer                  |
| Misafir siparişi | `POST` | `/orders/checkout/guest` | public (throttle 10/dk) |

**İstek (zorunlu alanlar dâhil):**

```ts
{
  items: [{ productId, quantity? }],        // 1..20 satır, adet 1..20
  idempotencyKey: "<uuid v4>",              // ZORUNLU — aynı anahtar aynı grubu döndürür
  shippingAddressId? | shippingAddress?,    // biri zorunlu
  billingAddressId? | billingAddress?,
  couponCode?,
  expectedShippingTariffVersion: number,    // ZORUNLU — quote'tan
  expectedPricingHash: "<16 hex>",          // ZORUNLU — quote'tan
  // misafir ek alanları:
  email, emailVerificationCode /^\d{6}$/, phone, guestName
}
```

**Yanıt:** `{ checkoutGroupId, groupNumber, totalAmount, orders: [{ orderId, orderNumber, status, totalAmount }] }`

> **Web'de bir hata var, tekrarlamayın:** web `expectedPricingHash`'i yalnızca doluysa
> gönderiyor, oysa DTO onu **zorunlu** kılıyor. Mobil **her zaman** göndersin.

### Ödeme başlatma

| Adım    | Method | Path                       | Auth   |
| ------- | ------ | -------------------------- | ------ |
| Üye     | `POST` | `/payments/initiate`       | bearer | `{ checkoutGroupId, provider: "paytr" }` |
| Misafir | `POST` | `/payments/initiate-guest` | public | `{ checkoutGroupId, provider: "paytr" }` |

**Yanıt:** `{ paymentId, orderId?, amount?, provider, expiresIn, useBypass?, paymentAccessToken }`

`paymentAccessToken` = **ödeme yetki jetonu** (2 saat ömürlü JWT). Sonraki `status`,
`verify`, `confirm-failed`, `direct-form` çağrılarında **`X-Payment-Capability` başlığı**
olarak gönderilir. Misafirin (JWT'si olmayan) kendi ödemesini okuyup tamamlamasını
sağlayan tek şey budur → **WebView turu boyunca saklanmalı**, yoksa 403 alınır.

### Kabul kriterleri

- [ ] `idempotencyKey` bir checkout oturumu boyunca **sabit** (yeniden denemede aynı anahtar).
- [ ] `expectedPricingHash` ve `expectedShippingTariffVersion` her zaman gönderiliyor.
- [ ] Sipariş oluşturulduktan sonra sepet temizleniyor ama ekran "sepet boş" diye geri atmıyor.
- [ ] `paymentAccessToken` güvenli şekilde saklanıyor ve tüm ödeme çağrılarında gönderiliyor.

---

## 4. Ödeme ekranı — durum ve yardımcı uçlar

| İşlem                | Method | Path                            | Auth   | Not                                                       |
| -------------------- | ------ | ------------------------------- | ------ | --------------------------------------------------------- |
| Ödeme konfigürasyonu | `GET`  | `/payments/config`              | public | `{ bypassEnabled, cardStorageEnabled, recurringEnabled }` |
| Durum (üye)          | `GET`  | `/payments/:id/status`          | bearer | throttle 120/dk                                           |
| Durum (misafir)      | `GET`  | `/payments/:id/status-guest`    | public | `X-Payment-Capability` şart                               |
| Kayıtlı kartlar      | `GET`  | `/membership/cards`             | bearer | Misafirde çağrılmaz                                       |
| İptal                | `POST` | `/payments/:id/cancel`          | bearer | Misafir çağırmaz                                          |
| Doğrula (dönüşte)    | `POST` | `/payments/:id/verify`          | public | `X-Payment-Capability`                                    |
| Başarısızı onayla    | `POST` | `/payments/:id/confirm-failed`  | public | Rezervasyonu hemen serbest bırakır                        |
| Yeniden dene         | `POST` | `/payments/:id/retry`           | bearer | Misafir **yapamaz**                                       |
| Test bypass          | `POST` | `/payments/:id/bypass-complete` | bearer | Yalnız dev/staging, `bypassEnabled` iken                  |

Durum yanıtı üç biçimde gelir: tek sipariş · **checkout grubu** (`orders[]` listesiyle) ·
takas nakit ödemesi (`tradeId`). Mobil üçünü de ele almalı.

Duruma göre yönlendirme: `completed` → başarı, `failed` → hata, `isMembershipOrder` → üyelik başarı,
`tradeId` → takas detayı.

---

## 5. ⚠️ Kart tahsilatı — web mekanizması ve native karşılığı

### Web'de nasıl çalışıyor

1. `POST /payments/direct-form` çağrılır (public, throttle 10/dk, `X-Payment-Capability` ile).
   Gövde: `{ paymentId? | orderId? | checkoutGroupId? | tradeId?, savedCardId?, saveCard? }`.
2. Yanıt: **imzalı form alanları**
   ```ts
   { paymentId, action: "https://www.paytr.com/odeme", method: "POST",
     fields: [{ name, value }], requireCvv, savedCard, status: "pending" }
   ```
   `fields` içinde `merchant_id, user_ip, merchant_oid, email, payment_amount, payment_type,
installment_count, currency, test_mode, non_3d: "0", paytr_token, merchant_ok_url,
merchant_fail_url, user_name, user_address, user_phone, user_basket, debug_on, client_lang`
   bulunur. Kayıtlı kartta ek olarak `utoken, ctoken, require_cvv`; kart kaydetmede `store_card: "1"`.
3. **İstemci kart alanlarını kendisi ekler:** yeni kart → `cc_owner, card_number, expiry_month (MM),
expiry_year (YY), cvv`; kayıtlı kart → yalnızca `requireCvv` ise `cvv`.
4. Tarayıcı gizli bir `<form>` oluşturup **doğrudan `https://www.paytr.com/odeme`'ye POST** eder.
   API'ye kart verisi **hiç gitmez**.

### Neden birebir taşınamaz

- **API kart verisini reddeder:** `assertNoRawCardData` gövdenin her seviyesinde
  `card, card_number, cc_owner, cvv, expiry_month, ...` gibi alan adlarını arar ve **400** döner.
  Sunucuya PAN verilebilecek bir uç **yok ve tasarım gereği olmayacak**.
- 3DS **zorunlu** (`non_3d = "0"`) → banka sayfası render edilmek zorunda.
- Native uygulamada DOM yok; `form.submit()` yapılamaz.

### Native karşılığı (yapılacak)

1. Kart bilgisini **native ekranda** topla (doğrulama: Luhn, MM/YY, CVV).
2. `POST /payments/direct-form` ile imzalı alanları al.
3. Bir **WebView** aç ve POST'u onunla yap. İki pratik yol:
   - Otomatik gönderilen gizli formu içeren yerel bir HTML dokümanı yükle (sunucu alanları + kart alanları), **veya**
   - Platformun POST destekleyen yükleme API'sini kullan (`WKWebView.load(URLRequest)` `httpMethod = "POST"` + `application/x-www-form-urlencoded`, Android'de `WebView.postUrl`).
4. **Web'deki iki güvenlik kontrolünü birebir uygula:**
   - `action` tam olarak `https://www.paytr.com/odeme` mi? (şema + host + path)
   - Sunucudan gelen `fields` içinde ham kart alanı adı var mı? (varsa iptal et)
5. `payment_amount` **ondalıklı TL** (`"462.81"`) — kuruş değil. **Sunucudan geleni olduğu gibi
   gönder**, yeniden hesaplama.
6. Dönüş URL'lerini yakala. Bunlar sunucuda env'den üretilir ve **istemci override edemez**:
   - başarı: `${FRONTEND_URL}/payment/success?paymentId=<id>[&guest=true][&type=membership]`
   - hata: `${FRONTEND_URL}/payment/fail`

   WebView bu ön eklere gittiğinde navigasyonu **kes**, `paymentId`/`guest` parametrelerini
   ayrıştır, WebView'i kapat ve native dönüş akışını çalıştır.

> **Backend iyileştirme talebi (ayrı iş):** `direct-form`'a whitelist'lenmiş bir
> `returnUrlScheme` parametresi eklenirse mobil, web URL'i yakalamak yerine gerçek derin
> bağlantı kullanabilir. Bunu ürün backlog'una gir.

### Kabul kriterleri

- [ ] Kart verisi hiçbir koşulda kendi API'mize gönderilmiyor (ağ trafiği ile doğrulandı).
- [ ] `action` ve `fields` güvenlik kontrolleri uygulanmış ve test edilmiş.
- [ ] `payment_amount` sunucudan geldiği gibi gönderiliyor.
- [ ] 3DS WebView'i kullanıcı kapatırsa ödeme "belirsiz" kabul edilip `status` sorgulanıyor
      (sessizce başarısız sayılmıyor).
- [ ] Uygulama arka plana atılıp geri gelse bile akış kaldığı yerden devam ediyor.

---

## 6. Dönüş akışı (başarı / hata)

### Başarı

| Adım | Method | Path                                         | Not                                                                                          |
| ---- | ------ | -------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1    | `POST` | `/payments/:id/verify`                       | `{ completed: true }` olana kadar **5 denemeye kadar, ~1.2 sn arayla** tekrar et. Idempotent |
| 2    | `GET`  | `/payments/:id/status` (veya `status-guest`) | Nihai durum + fiyat kırılımı                                                                 |
| 3    | `GET`  | `/elogo/invoices/by-order/:orderId`          | Fatura **asenkron** kesilir → **6 denemeye kadar, ~2 sn arayla**                             |
| 4    | `GET`  | `/elogo/invoices/:invoiceId/pdf`             | `{ url }` → presigned S3; native'de in-app browser/indirme                                   |

`status === "failed"` ise hata ekranına; `isMembershipOrder` ise üyelik başarı ekranına;
`tradeId` varsa takas detayına yönlendir.

### Hata

| Adım | Method | Path                           | Not                                                                            |
| ---- | ------ | ------------------------------ | ------------------------------------------------------------------------------ |
| 1    | `GET`  | `/payments/:id/status`         |                                                                                |
| 2    | `POST` | `/payments/:id/confirm-failed` | **Yalnız durum hâlâ `pending` ise.** Stok rezervasyonunu hemen serbest bırakır |

### Yeniden deneme

`POST /payments/:id/retry` → `{ newPaymentId, ... }`. **Ödeme URL'i dönmez**; yeni
`paymentId` ile kart ekranına git. Misafir yeniden deneyemez (JWT gerekir) → misafire
"yeni sipariş oluştur" yolu göster.

---

## 7. Kayıtlı kartlar

| Method   | Path                    | Auth   | Amaç                 |
| -------- | ----------------------- | ------ | -------------------- |
| `GET`    | `/membership/cards`     | bearer | Maskeli kart listesi |
| `DELETE` | `/membership/cards/:id` | bearer | Sil → `{ deleted }`  |

Kart **yalnızca ödeme sırasında** `saveCard: true` ile kaydedilir; "kart ekle" ucu yoktur.
Silme uyarısında otomatik yenilemenin bozulacağı belirtilmeli.

---

## 8. Hata sözleşmesi (bu akışa özgü)

| Durum                     | Sinyal                                          | Mobil davranış                                                                                                                                                    |
| ------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fiyat/tarife değişti      | **409**, mesaj `server.shipping.pricingChanged` | Quote'u yenile, **eski/yeni toplamı göster**, kullanıcıdan yeniden onay al. (Web bunu yapmıyor — mobil daha iyisini yapmalı)                                      |
| Kargo tarifesi eksik      | **503** `SHIPPING_DESI_RATE_NOT_CONFIGURED`     | "Şu an satın alma yapılamıyor" + tekrar dene                                                                                                                      |
| Vergi kuralı eksik        | **503** `TAX_CONFIGURATION_MISSING`             | Aynı şekilde                                                                                                                                                      |
| Komisyon kuralı yok       | **503**                                         | Aynı şekilde                                                                                                                                                      |
| Ürün satılmış/stok yok    | 400/409                                         | **Yapma:** web Türkçe metin eşleştiriyor. Mobil `productId` alanını kullanıp "ürün artık uygun değil" ekranı göstersin; kararlı hata kodu için backend'e talep aç |
| Misafir e-postası kayıtlı | 409 `EMAIL_ALREADY_REGISTERED`                  | Girişe yönlendir                                                                                                                                                  |

---

## 9. Yapma (web'e özgü)

- `/gateway` proxy, httpOnly cookie'ler, `?guest=true` URL parametresiyle misafir tespiti
  (mobilde navigasyon state'inde açık `isGuest` taşı).
- `useShippingCost` içindeki sabit `34.9`/`49.9` kargo fallback'i ve `GET /shipping/rates`.
- Türkçe mesaj içeriğine bakarak stok hatası tespiti.
- `window.open` ile fatura PDF'i, `window.location.href` ile PayTR yönlendirmesi.
- `/checkout/success` ekranındaki istemci-tarafı "+3 iş günü" teslim tahmini.
- `sessionStorage` tabanlı yetki jetonu saklama (mobilde güvenli depo kullan).
