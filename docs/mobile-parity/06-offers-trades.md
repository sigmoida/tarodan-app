# 06 — Teklifler (Teklif) ve Takas

> Mobilde **her ikisi de eş durumda**; `app/offers/` reponun referans uygulaması.
> Bu dosya sözleşmeyi ve kaçırılmaması gereken kuralları sabitler.

## Kaynak (web)

```
apps/web/src/app/[locale]/(main)/profile/(commerce)/offers/     # teklif listesi + karşı teklif
apps/web/src/app/[locale]/(main)/(catalog)/listings/[id]/_modals/OfferModal.tsx
apps/web/src/app/[locale]/(main)/profile/(commerce)/trades/     # takas listesi, yeni, detay
```

---

## 1. Teklif verme

| Method | Path      | Auth   | Amaç                              |
| ------ | --------- | ------ | --------------------------------- |
| `POST` | `/offers` | bearer | `{ productId, amount, message? }` |

Kurallar (istemci + sunucu):

- `amount >= round(effectivePrice * 0.5)` **ve** `amount < effectivePrice`
  (alt sınır `MIN_OFFER_PERCENTAGE`, varsayılan %50).
- `message` opsiyonel, max 500.
- İlan `active` olmalı; sahibi teklif veremez.
- Teklif ömrü `OFFER_EXPIRY_HOURS`, varsayılan **24 saat**.

---

## 2. Teklif listesi ve durum makinesi

| Method | Path                               | Auth   | Amaç                                                  |
| ------ | ---------------------------------- | ------ | ----------------------------------------------------- |
| `GET`  | `/offers?type=received\|sent`      | bearer | Liste (ayrıca `status`, `productId`, `page`, `limit`) |
| `GET`  | `/offers/:id`                      | bearer | Detay                                                 |
| `GET`  | `/offers/pending-count`            | bearer | `{ received, sent, total }` — badge                   |
| `POST` | `/offers/:id/accept`               | bearer | Kabul                                                 |
| `POST` | `/offers/:id/reject`               | bearer | Reddet                                                |
| `POST` | `/offers/:id/cancel`               | bearer | Kendi teklifini iptal et                              |
| `POST` | `/offers/:id/counter`              | bearer | **Satıcı** karşı teklifi (`{ amount, message? }`)     |
| `POST` | `/offers/:id/buyer-counter`        | bearer | **Alıcı** daha düşük karşı teklif                     |
| `GET`  | `/offers/product/:productId`       | bearer | Bir ürünün teklifleri (satıcı)                        |
| `POST` | `/orders/commission-preview-batch` | bearer | Gelen tekliflerde "net kazanç" önizlemesi             |

Durumlar: `pending, accepted, rejected, expired, cancelled, payment_expired`.
**`countered` sunucuda YOK** — karşı teklif, `buyerMustAccept` bayrağı ile aynı teklif
üzerinden modellenir.

### Aksiyon matrisi

| Durum / rol                                        | İzinli aksiyonlar                               |
| -------------------------------------------------- | ----------------------------------------------- |
| `accepted`, gönderilen, sipariş ödenmemiş          | **Ödeme yap** → sipariş ekranı                  |
| `accepted`, diğer                                  | Yalnız "siparişi gör"                           |
| `pending`, gelen, `buyerMustAccept === false`      | Kabul · Karşı teklif (**daha yüksek**) · Reddet |
| `pending`, gelen, `buyerMustAccept === true`       | Salt okunur: "alıcı yanıtı bekleniyor"          |
| `pending`, gönderilen, `buyerMustAccept === true`  | Kabul · Daha düşük karşı teklif · Reddet        |
| `pending`, gönderilen, `buyerMustAccept === false` | Yalnız iptal                                    |
| `rejected \| cancelled \| expired`                 | Aksiyon yok (`cancelReason` varsa göster)       |

"Ödendi" türetimi: `status === 'accepted' && orderStatus ∈ {paid, preparing, shipped, delivered, completed}`.

Karşı teklif sınırları (istemci): alıcı karşı teklifi mevcut tutardan **küçük**, satıcı
karşı teklifi **büyük** olmalı. Sunucu %50/fiyat-altı kuralını yeniden doğrular.

### Süre gösterimi

Yalnız `pending` iken `expiresAt`'ten kalan süre gösterilir: >24 sa → "N gün", aksi halde
"Xs Yd". Web bunu **tıklamayla değil render'da bir kez** hesaplıyor; mobilde saniye bazlı
tik gerekmez (takasta gerekir, §5).

---

## 3. Takas teklifi oluşturma

**Üyelik kapısı:** `canTrade` yoksa yükseltme ekranına yönlendir.

| Method | Path                                            | Auth   | Amaç                        |
| ------ | ----------------------------------------------- | ------ | --------------------------- |
| `GET`  | `/products/:id`                                 | public | Takas hedefi ilan           |
| `GET`  | `/products/my?status=active&tradeEligible=true` | bearer | Kendi takasa açık ilanlarım |
| `GET`  | `/users/me/addresses`                           | bearer | Teslimat adresi seçici      |
| `POST` | `/users/me/addresses`                           | bearer | Satır içi adres ekleme      |
| `POST` | `/trades`                                       | bearer | Teklifi oluştur             |

**Gövde:** `{ receiverId, initiatorItems: [{productId, quantity: 1}],
receiverItems: [{productId, quantity: 1}], cashAmount?, message?, shippingAddressId? }`

**Nakit işaret kuralı:** `cashAmount = +X` → **teklifi başlatan öder**; `-X` → karşı taraf öder.

---

## 4. Takas listesi

| Method | Path                             | Auth   | Amaç            |
| ------ | -------------------------------- | ------ | --------------- |
| `GET`  | `/trades?pageSize=100[&status=]` | bearer | Liste           |
| `GET`  | `/trades/pending-count`          | bearer | Badge           |
| `GET`  | `/trades/status-counts`          | bearer | Sekme sayaçları |

**`shipped` bir sunucu durumu değildir** — istemci tarafında
`initiator_shipped | receiver_shipped | both_shipped` gruplanarak üretilir.

---

## 5. Takas detayı — escrow durum makinesi

| Method | Path                                | Auth    | Amaç                                                       |
| ------ | ----------------------------------- | ------- | ---------------------------------------------------------- |
| `GET`  | `/trades/:id`                       | bearer  | Detay                                                      |
| `POST` | `/trades/:id/accept`                | bearer  | `{ message?, shippingAddressId }` — **adres zorunlu**      |
| `POST` | `/trades/:id/reject`                | bearer  | `{ reason? }`                                              |
| `POST` | `/trades/:id/cancel`                | bearer  | `{ reason }`                                               |
| `POST` | `/trades/:id/counter`               | bearer  | `{ initiatorItems, receiverItems, cashAmount?, message? }` |
| `POST` | `/trades/:id/ship`                  | bearer  | Eski P2P kargo (`{ fromAddressId, carrier: "surat" }`)     |
| `POST` | `/trades/:id/ship-to-warehouse`     | bearer  | **Güvenli takas** akışı                                    |
| `POST` | `/trades/:id/confirm-receipt`       | bearer  | Gelen bacağı teslim aldım                                  |
| `POST` | `/trades/:id/dispute`               | bearer  | İtiraz (web kullanmıyor, **mobil kullanıyor**)             |
| `POST` | `/payments/initiate-trade-cash`     | bearer* | Nakit fark ödemesi (`{ tradeId }`) — canlı yol             |
| `POST` | `/trades/:id/cash-payment/initiate` | bearer  | Alternatif nakit yolu (ikisi de mevcut)                    |

Durumlar: `pending, accepted, rejected, awaiting_payment, shipping_to_warehouse, at_warehouse,
admin_reviewing, shipping_to_recipients, returning, completed, cancelled, disputed`
(+ eski P2P: `initiator_shipped, receiver_shipped, both_shipped, initiator_received, receiver_received`).

### Kapı kuralları

| Bayrak           | Kural                                                                                                                                                                                                                            |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `canAccept`      | alıcı taraf && `pending` (+ adres seçilmiş)                                                                                                                                                                                      |
| `canReject`      | alıcı taraf && `pending`                                                                                                                                                                                                         |
| `canCounter`     | alıcı taraf && `pending` && (`responseDeadline` yok veya gelecekte)                                                                                                                                                              |
| `canCancel`      | her iki taraf; sunucu `trade.canCancel` bayrağı varsa **o belirler**; yoksa durum ∈ {`pending`, `accepted`, `awaiting_payment`, `shipping_to_warehouse`} **ve** (`shipping_to_warehouse` && `firstWarehouseArrivalAt`) **değil** |
| iptal kilitli    | İptal edilebilir durumda ama `canCancel === false` → **görünür ama devre dışı** buton + "ürün depoya ulaştı" açıklaması                                                                                                          |
| nakit bekliyor   | `cashAmount > 0 && cashPayment.status !== 'completed'`                                                                                                                                                                           |
| kargolamam gerek | nakit beklemiyor **ve** kendi gönderim bacağım yok **ve** durum uygun                                                                                                                                                            |

### Geri sayım

**Saniye bazlı tik** (1000 ms) — duruma göre son tarih: `pending` → `responseDeadline`;
`accepted`/`awaiting_payment` → `paymentDeadline`; kargo durumları → `shippingDeadline`.

### Aşama göstergesi

`Kabul edildi → (Ödeme, yalnız nakit varsa) → Depoya kargo → Depoda → Size kargolanıyor → Tamamlandı`.
`returning` durumunda gösterge yerine uyarı gösterilir.

### Kargo kartları

- **Depoya kargo** (`shipping_to_warehouse`): yalnız **kendi** bacağının gerçek `cargoCode`'u
  gösterilir (Sürat'ta dahili takip no **asla**); karşı tarafın durumu tek satır metinle.
- **Alıcılara kargo** (`shipping_to_recipients`): kendi gelen bacağın + Sürat derin bağlantısı;
  **"Teslim aldım" butonu yalnız gelen bacağın durumu `delivered` iken aktif**.
- **İade** (`returning`): bana adreslenmiş `direction === 'return'` gönderisi.

### Nakit fark ödemesi

Ödeyen taraf, `accepted|awaiting_payment` durumunda ve ödeme tamamlanmamışsa öder:
`POST /payments/initiate-trade-cash { tradeId }` → `paymentId` → ödeme akışı (`04`).
Karşı taraf "diğer tarafın ödemesi bekleniyor" görür.

### Karşı teklif düzenleyicisi

Web bunu **modal değil tam ekran** yapıyor. Mevcut takas kalemlerinden sözde-ürünler üretip
seçili başlatıyor (takasta rezerve olan kalemler seçilebilir kalsın diye) ve gönderim öncesi
**"aynı teklif" kontrolü** yapıyor (ürün id listeleri + `abs(cash)` karşılaştırması).
`version > 1` ise "Karşı teklif #N" rozeti gösteriliyor.

---

## Kabul kriterleri

- [ ] Teklif tutarı sınırları (%50 alt, fiyat üstü hariç) istemcide doğrulanıyor.
- [ ] `buyerMustAccept` bayrağına göre doğru aksiyon seti gösteriliyor.
- [ ] Takas kabulünde adres seçimi zorunlu.
- [ ] Nakit işaret kuralı (+/−) doğru yorumlanıyor, ödeyen taraf doğru gösteriliyor.
- [ ] "Teslim aldım" yalnız gelen bacak `delivered` iken aktif.
- [ ] İptal kilitliyken buton görünür ama devre dışı ve sebebi açıklanıyor.
- [ ] Geri sayım saniye bazlı ve son tarih duruma göre seçiliyor.
- [ ] Sürat gönderilerinde yalnız `cargoCode` gösteriliyor.

## Yapma

- `countered` diye bir sunucu durumu varmış gibi davranma.
- Karşı teklifi modal içinde kurup ardından `appAlert` açma (mobilde iOS'ta donma riski —
  mobil `CLAUDE.md` §12).
