# 05 — Siparişler, Kargo Takibi ve Faturalar

> **GRUP ÇATISI (2026-07 güncellemesi):** Sunum kuralı değişti — her şey GRUP
> bazında gösterilir. Tek satın alım bile 1 siparişlik gruptur; ayrı tıklanabilir
> sipariş detayı YOKTUR (order id → grup görünümüne çözülür). Liste için
> `GET /orders/groups?role=&tab=` (alıcı=CheckoutGroup, satıcı=kendi paketi),
> detay için `GET /orders/:id/group` kullanılır. Ödeme grup başına TEKTİR
> (`orderId` ile başlatma sunucuda gruba yönlendirilir); İPTAL grup bazındadır
> (`POST /orders/groups/:id/cancel`, kısmen kargolanmış sepette tamamen kapalı);
> iade sipariş bazında kalır; kargo SATICI PAKETİ başınadır (tek koli/tek barkod
> — paket içindeki siparişlere ayrı kargo kartı çizilmez). Aşağıdaki tekil
> `/orders` akışları YALNIZ veri referansıdır, sunum için kullanılmaz.

> Önce `00-README.md` ve `11-api-contract.md`. Mobilde bu alan **eş** durumda;
> tek eksik satıcı fatura yükleme (§5).

## Kaynak (web)

```
apps/web/src/app/[locale]/(main)/profile/(commerce)/orders/            # liste + detay
apps/web/src/app/[locale]/(main)/profile/(commerce)/orders/_components/OrderActions.tsx  # AKSİYON KURALLARI (tek kaynak)
apps/web/src/app/[locale]/(main)/profile/(commerce)/orders/_lib/status.ts                # durum türetimi
apps/web/src/app/[locale]/(main)/(catalog)/track-order/                # misafir takip
```

---

## 1. Sipariş listesi

| Method | Path                                 | Auth   | Amaç                                                                                                                        |
| ------ | ------------------------------------ | ------ | --------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/orders?role=&status=&refundsOnly=` | bearer | Liste. `role ∈ buyer\|seller`; `status` **virgülle çoklu** olabilir (`"cancelled,refunded"`); `refundsOnly` `status`'u ezer |
| `GET`  | `/orders?role=buyer&limit=1`         | bearer | Sekme sayacı (`meta.total`)                                                                                                 |
| `GET`  | `/orders/groups?page=&limit=`        | bearer | Checkout grupları (sepet siparişleri); `limit` 50'de kırpılır                                                               |
| `GET`  | `/orders/groups/:id`                 | bearer | Grup + tüm siparişler ve gönderiler                                                                                         |
| `GET`  | `/orders/seller/earnings`            | bearer | `{ totalEarnings, pendingEarnings }`                                                                                        |

Durumlar: `pending_payment, paid, preparing, shipped, delivered, awaiting_buyer_confirmation,
completed, cancelled, refund_requested, refunded`.

### Rozet türetimi (öncelik sırasıyla)

1. `activeRefundRequest` varsa → durumu `refunded` ise "iade edildi", değilse **"iade sürecinde"**.
2. `cancellationType === "iptal"` → **"iptal edildi"** (ham durum `refunded` olsa bile —
   kargolamadan önce iptal para akışında iadedir ama kullanıcıya iptal denmelidir).
3. Aksi halde ham `order.status`.

---

## 2. Sipariş detayı

| Method  | Path                           | Auth   | Amaç                                                                                      |
| ------- | ------------------------------ | ------ | ----------------------------------------------------------------------------------------- |
| `GET`   | `/orders/:id`                  | bearer | Detay                                                                                     |
| `GET`   | `/orders/:id/my-review`        | bearer | Kullanıcının kendi yorumu (`{ product, seller }`, yoksa null) — **mobil bunu çağırmıyor** |
| `POST`  | `/orders/:id/confirm`          | bearer | Alıcı teslimatı onaylar                                                                   |
| `POST`  | `/orders/:id/confirm-receipt`  | bearer | 48 saatlik pencerede erken onay → `{ completed }`                                         |
| `POST`  | `/orders/:id/prepare`          | bearer | Satıcı "hazırlanıyor" işaretler                                                           |
| `POST`  | `/orders/:id/cancel`           | bearer | Kargolamadan önce iptal (`{ reasonCode, reason? }`)                                       |
| `POST`  | `/orders/:id/reactivate`       | bearer | Süresi dolmuş teklif siparişini ödemeye yeniden açar                                      |
| `PATCH` | `/orders/:id/shipping-address` | bearer | Yalnız `pending_payment` iken (teklif siparişi ödeme öncesi adres)                        |

İptal sebepleri (`reasonCode`): `delivery_delayed, wrong_product_selected, changed_mind,
wrong_card, price_changed_mind, unavailable_at_address, other`.

### Aksiyon matrisi (birebir uygulanmalı)

```
takip et         : alıcı && kargolanmış && iptal değil
fatura (alıcı)   : alıcı && durum ∈ {paid, preparing, shipped, delivered, completed}
tekrar sipariş   : alıcı && ürün var && durum ∈ {delivered, completed, cancelled, refunded}
iade detayına git: activeRefundRequest.id var
iptal et         : iade yok && alıcı && durum ∈ {paid, preparing} && kargolanmamış
iade talep et    : iade yok && alıcı && kargolanmış && durum ∉ {cancelled, refunded}
kargoya ver      : satıcı && durum ∈ {paid, preparing} && shipment yok
fatura yükle     : satıcı && durum ∈ {paid, preparing, shipped}
değerlendir      : alıcı && durum ∈ {completed, delivered} && (ürün veya satıcı puanı eksik)
```

### Bekleyen ödemeli siparişi ödemek

`PATCH /orders/:id/shipping-address` → `POST /payments/initiate { orderId, provider }` →
ödeme ekranı (`04`).

---

## 3. Satıcı: kargoya verme

| Method  | Path                       | Auth   | Amaç                      |
| ------- | -------------------------- | ------ | ------------------------- |
| `POST`  | `/shipping`                | bearer | Gönderi oluştur           |
| `PATCH` | `/shipping/:id/tracking`   | bearer | Takip numarasını güncelle |
| `GET`   | `/shipping/order/:orderId` | bearer | Siparişin gönderisi       |
| `GET`   | `/shipping/:id`            | bearer | Gönderi detayı            |
| `GET`   | `/shipping/carriers`       | public | Kargo firmaları           |

> **`POST /orders/:id/ship` API'de YOKTUR.** Mobilin kullandığı `/shipping` + tracking
> ikilisi doğrudur; web envanterindeki aksi yönlü iddia hatalıydı.

---

## 4. Kargo takibi gösterimi

Kart **yalnızca** şu koşullarda gösterilir: `order.shipment` var **ve** gösterilecek bir kod
var **ve** `cancellationType !== "iptal"` **ve** durum `cancelled` değil **ve**
durum ∈ `{shipped, delivered, awaiting_buyer_confirmation, completed}`.

**Gösterilecek kod:** `shipment.cargoCode ?? (provider !== "surat" ? shipment.trackingNumber : null)`
— **Sürat için yalnızca gerçek `cargoCode`** gösterilir; dahili `trackingNumber` şubede
geçersizdir. Kod yoksa "takip kodu oluşturuluyor" de.

**Etkin durum türetimi** (sipariş durumu bayat `shipment.status`'u ezer):
iptal/iade → `cancelled` · sipariş `delivered` → `delivered` ·
sipariş `shipped` ama gönderi `pending`/`label_created` → `in_transit`.
İade akışları (`return_in_progress`, `returned`) bu ezmeden **muaftır**.

Gönderi durumları: `pending, label_created, picked_up, in_transit, at_delivery_branch,
out_for_delivery, delivered, failed, return_in_progress, returned, cancelled`.

Sürat derin bağlantısı: `https://www.suratkargo.com.tr/KargoTakip/?kargotakipno=<cargoCode>`
→ mobilde **uygulama içi tarayıcı** ile aç. Takip kodu kopyalanabilir olmalı.

---

## 5. Faturalar

İki bağımsız sistem var:

### (a) e-Arşiv (yasal fatura, otomatik kesilir)

| Method | Path                                | Auth   | Amaç                                                                         |
| ------ | ----------------------------------- | ------ | ---------------------------------------------------------------------------- |
| `GET`  | `/elogo/invoices/by-order/:orderId` | bearer | Siparişin faturası (yoksa null)                                              |
| `GET`  | `/elogo/invoices/:id/pdf`           | bearer | **`{url}` JSON _veya_ ham `application/pdf`** → `Content-Type`'a göre dallan |
| `GET`  | `/elogo/invoices`                   | bearer | Kullanıcının tüm faturaları                                                  |

Fatura **asenkron** kesilir: ödeme sonrası `by-order` çağrısını **~6 kez, 2 sn arayla**
tekrar dene. Ödeme öncesi ve iptal siparişlerde çağırma.

### (b) Satıcının yüklediği PDF (kurumsal satıcı)

| Method | Path                                  | Auth   | Amaç                                                      |
| ------ | ------------------------------------- | ------ | --------------------------------------------------------- |
| `GET`  | `/orders/:id/seller-invoice`          | bearer | Durum + `{ canUpload, isSeller, isBuyer }`                |
| `POST` | `/orders/:id/seller-invoice`          | bearer | **multipart `file`, yalnız PDF, ≤10 MB** → `{ replaced }` |
| `GET`  | `/orders/:id/seller-invoice/download` | bearer | `{ url }` presigned                                       |

> **Mobil eksiği:** yükleme yok, yalnız okuma var → kurumsal satıcı uygulamadan fatura
> yükleyemiyor. Dosya seçici (PDF) + multipart yükleme eklenmeli.

### (c) Bilgi amaçlı makbuz (eski sistem)

`GET /invoices`, `/invoices/order/:orderId`, `POST /invoices/generate/:orderId`,
`GET /invoices/download/:id` (**ham PDF akışı**). Misafir için `?paymentId=` + capability
başlığı ile `/public` varyantları var.

---

## 6. Misafir sipariş takibi

| Method | Path                  | Auth   | Amaç                                                |
| ------ | --------------------- | ------ | --------------------------------------------------- |
| `POST` | `/orders/guest/track` | public | `{ orderNumber, email }` → sipariş (throttle 20/dk) |

Yanıt: `{ id, orderNumber, status, totalAmount, product{...}, seller{...}, shippingAddress?,
shipment?{ provider, trackingNumber, cargoCode, trackingUrl, status, estimatedDelivery }, ... }`.
404 → "sipariş bulunamadı" (satır içi mesaj, hata ekranı değil).

E-posta bağlantısından gelen `orderNumber` + `email` parametreleriyle **otomatik sorgula**
(derin bağlantı — `12`).

---

## 7. Değerlendirme (yorum)

| Method | Path                                   | Auth   | Amaç                               |
| ------ | -------------------------------------- | ------ | ---------------------------------- |
| `POST` | `/media/upload?folder=reviews`         | bearer | Yorum fotoğrafı (multipart `file`) |
| `POST` | `/ratings/products`                    | bearer | Ürün puanı/yorumu                  |
| `POST` | `/ratings/users`                       | bearer | Satıcı puanı                       |
| `GET`  | `/ratings/products/:id?sortBy=&score=` | public | Yorum listesi                      |
| `GET`  | `/ratings/products/:id/stats`          | public | Puan dağılımı                      |

Değerlendirme aksiyonu yalnız `completed|delivered` siparişte ve **eksik puan varsa** gösterilir.

---

## Kabul kriterleri

- [ ] Rozet türetimi öncelik sırası uygulanıyor (iade > iptal > ham durum).
- [ ] Sürat gönderilerinde **yalnız `cargoCode`** gösteriliyor, dahili takip no gösterilmiyor.
- [ ] Kargo kartı yalnız izin verilen durumlarda görünüyor.
- [ ] e-Arşiv PDF ucu hem JSON hem PDF yanıtını ele alıyor.
- [ ] Ödeme sonrası fatura sorgusu retry'lı (asenkron kesim).
- [ ] Kurumsal satıcı uygulamadan PDF fatura yükleyebiliyor.
- [ ] Misafir takip derin bağlantıdan otomatik sorguluyor.

## Yapma

- `window.open` ile PDF açma → uygulama içi tarayıcı/paylaşım sayfası kullan.
- `/checkout/success` ekranındaki istemci-tarafı "+3 iş günü" teslim tahmini (API'den gelmiyor).
- Bayat `shipment.status`'a körü körüne güvenme; yukarıdaki etkin durum türetimini uygula.
