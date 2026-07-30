# 07 — İade ve Geri Gönderim (İade)

> Mobilde **eş** durumda. Bu dosya politika kurallarını ve durum akışını sabitler;
> tek açık konu satıcı iade gelen kutusu (her iki platformda da yok).

## Kaynak (web)

```
apps/web/src/app/[locale]/(main)/profile/(commerce)/orders/[id]/_modals/RefundRequestModal.tsx
apps/web/src/app/[locale]/(main)/profile/(commerce)/orders/[id]/_sections/RefundActions.tsx
apps/web/src/app/[locale]/(main)/profile/(finance)/refund-requests/     # liste + detay
apps/web/src/app/[locale]/(main)/profile/(finance)/refund-requests/_lib/refund-status.ts
```

---

## 1. Giriş kapısı — hangi durumda ne gösterilir

İade talebi butonu **yalnızca** şu koşullarda görünür:
`payment.status === 'completed'` **ve** alıcı **ve** üyelik/dijital sipariş değil
(`MEM-` ile başlayan sipariş no veya `isMembership`) **ve** durum ∉ `{cancelled, refunded}`
**ve** aktif iade talebi yok.

| Durum                                     | Gösterilen                                                                  |
| ----------------------------------------- | --------------------------------------------------------------------------- |
| Kargolanmamış (`paid`/`preparing`)        | **"İptal Et"** → `POST /orders/:id/cancel` (anında iade), iade talebi değil |
| Kargolanmış, 14 gün içinde                | **"İade Talep Et"**                                                         |
| Kargolanmış, `deliveredAt` 14 günden eski | Bilgi kartı: "iade süresi kapandı", buton yok (sunucu da reddeder)          |
| Aktif iade var                            | İade detayına bağlantı                                                      |

**Aşama türetimi (`phase`)**: `preparing` (paid/preparing ve gerçek gönderi yok) ·
`in_cooling_off` (teslimden ≤14 gün) · `past_cooling_off` (>14 gün).

---

## 2. İade talebi oluşturma

| Adım | Method | Path                               | Auth   | Not                                                                                                                           |
| ---- | ------ | ---------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------- |
| 1    | `POST` | `/media/upload?folder=reviews`     | bearer | Her kanıt fotoğrafı için (multipart alan **`file`**), **en fazla 5**, ≤10 MB, jpeg/png/webp/gif, **AI moderasyonundan geçer** |
| 2    | `POST` | `/orders/:orderId/refund-requests` | bearer | `{ reason, description?, evidencePhotoUrls?, refundQuantity? }` → **201**                                                     |

### Sebepler

Web'de sunulan 8 sebep: `changed_mind, damaged, wrong_item, not_as_described, missing_parts,
counterfeit, defective, buyer_damaged`.
Enum'da ayrıca `lost_in_transit` ve `other` var ama **web sunmuyor** — mobilde sunulup
sunulmayacağı ürün kararı.

### Koşullu zorunluluklar (istemci tarafı)

| Kural                               | Koşul                                                                                               |
| ----------------------------------- | --------------------------------------------------------------------------------------------------- |
| **Kanıt fotoğrafı zorunlu**         | `reason !== 'changed_mind'` → en az 1 fotoğraf                                                      |
| **Açıklama zorunlu (≥20 karakter)** | `past_cooling_off` **veya** kanıt gerektiren sebep                                                  |
| Kısmi iade                          | Yalnız `items[0].quantity > 1` iken adet seçici; tam adet seçilirse `refundQuantity` **gönderilme** |

> Kanıt fotoğrafları `reviews` klasörüne yüklenir (evet, iade için de) — sözleşme bu.

---

## 3. İade listesi ve detayı

| Method | Path                          | Auth   | Amaç                                                            |
| ------ | ----------------------------- | ------ | --------------------------------------------------------------- |
| `GET`  | `/refund-requests/me`         | bearer | Alıcının talepleri                                              |
| `GET`  | `/refund-requests/:id`        | bearer | Detay (alıcı, satıcı veya admin)                                |
| `POST` | `/refund-requests/:id/cancel` | bearer | **Yalnız `wait_for_delivery` durumunda** iptal edilebilir       |
| `GET`  | `/refund-requests/seller`     | bearer | Satıcının gelen talepleri — **her iki platformda da ekran YOK** |

Durumlar: `pending_review, approved, wait_for_delivery, return_shipment_open,
return_in_transit, return_delivered, refunded, rejected, disputed, cancelled`.

### Zaman çizelgesi (5 aşama)

```
Talep alındı → İade kargosu → Yolda → Satıcıda → İade edildi
```

Aşama eşlemesi: `pending_review:0` · `approved:1` · `wait_for_delivery:1` ·
`return_shipment_open:1` · `return_in_transit:2` · `return_delivered:3` · `refunded:4`.

- `rejected` / `cancelled` → 2 adımlı, kırmızı sonlu gösterge.
- **"Anında iade"** (`refunded` **ve** `returnTrackingNumber` yok) → zaman çizelgesi **gizlenir**.

### Bildirim kartları

`refunded` → başarı (+ `refundedAt`) · `rejected` → hata · `disputed` → uyarı
("admin incelemesinde"). `sellerResponse` varsa uyarı olarak göster.

### İade kargo kartı

Yalnız `return_shipment_open | return_in_transit | return_delivered` durumlarında.
`returnTrackingNumber` kopyalanabilir olmalı; `returnProvider === 'surat'` ise Sürat takip
bağlantısı. Takip no henüz yoksa "oluşturuluyor" göster.

> **Sürat özel kuralı:** sipariş ekranındaki özet bandında `returnProvider === 'surat'` iken
> **yalnız `returnCargoCode`** gösterilir (dahili `returnTrackingNumber` şubede geçersiz);
> manuel sağlayıcılarda `returnCargoCode ?? returnTrackingNumber`.

Kanıt fotoğrafları detayda küçük görsel olarak gösterilir, dokununca tam ekran.

---

## Kabul kriterleri

- [ ] Kargolanmamış siparişte iade yerine **iptal** akışı gösteriliyor.
- [ ] 14 gün geçmişse buton yok, açıklama var.
- [ ] `changed_mind` dışındaki sebeplerde fotoğraf ve ≥20 karakter açıklama zorunlu.
- [ ] Kısmi iade yalnız adet >1 iken sunuluyor; tam adette `refundQuantity` gönderilmiyor.
- [ ] Fotoğraf yükleme sınırı 5 ve AI moderasyon reddi kullanıcıya sunucunun mesajıyla gösteriliyor.
- [ ] İptal yalnız `wait_for_delivery` durumunda sunuluyor.
- [ ] Anında iadede zaman çizelgesi gizleniyor.
- [ ] Sürat iade kargosunda yalnız `returnCargoCode` gösteriliyor.

## Yapma

- Üyelik/dijital siparişlere iade akışı açma (sunucu da reddeder).
- `FileReader` benzeri veri-URL önizlemesi yerine native görsel seçicinin URI'sini kullan.
- Satıcı gelen kutusunu "web'de var" varsayarak yazma — yok; eklemek ürün kararıdır.
