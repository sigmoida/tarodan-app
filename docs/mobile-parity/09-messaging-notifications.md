# 09 — Mesajlaşma, Bildirimler, Push ve Realtime

> Mobilde **eş veya daha ileri** (push web'de yok). Bu dosya sözleşmeyi ve moderasyon
> kurallarını sabitler.

## Kaynak (web)

```
apps/web/src/app/[locale]/(main)/profile/(messaging)/messages/    # sohbet
apps/web/src/app/[locale]/(main)/profile/(messaging)/notifications/
apps/web/src/lib/socket.ts + hooks/useMessagingSocket.ts          # realtime
apps/web/src/components/notifications/NotificationBell.tsx
```

---

## 1. Mesajlaşma

| Method | Path                             | Auth   | Amaç                                                              |
| ------ | -------------------------------- | ------ | ----------------------------------------------------------------- |
| `GET`  | `/messages/threads`              | bearer | Sohbet listesi                                                    |
| `GET`  | `/messages/threads/:id`          | bearer | Tek sohbet                                                        |
| `GET`  | `/messages/threads/:id/messages` | bearer | Mesajlar (istemci `createdAt` artan sıralar)                      |
| `POST` | `/messages/threads`              | bearer | `{ participantId, productId? }` — **409 = zaten var**             |
| `POST` | `/messages/threads/:id/messages` | bearer | `{ content, productId? }`                                         |
| `GET`  | `/messages/unread-count`         | bearer | `{ count }` — **web kullanmıyor, mobil kullanmalı**               |
| `GET`  | `/messages/daily-limit`          | bearer | Katman başına günlük mesaj hakkı — **hiçbir yerde gösterilmiyor** |
| `POST` | `/media/upload?folder=messages`  | bearer | Görsel eki (multipart `file`)                                     |
| `GET`  | `/admin/settings/public`         | public | `max_message_length` (varsayılan **1000**)                        |
| `POST` | `/user-reports`                  | bearer | Mesaj/kullanıcı şikayeti                                          |

### Satıcıyla sohbet açma (ürün detayından)

"Satıcı başına tek sohbet" kuralı: o satıcıyla sohbet varsa **onu kullan** ve `productId`'yi
_sonraki mesajın ürün bağlamı_ olarak sakla; yoksa `POST /messages/threads` ile oluştur.
**409 alınırsa** "zaten var" kabul et, listeyi tazele ve o sohbeti seç.

### ⚠️ Görsel ekleri metnin içinde taşınır

**Mesaj API'sinde ayrı ek alanı yoktur.** Yüklenen görselin URL'i mesaj gövdesine
`\n\n[IMG:<url>]` işaretçisi olarak eklenir ve okurken ayrıştırılır. **Uzunluk sınırı
işaretçiler dâhil** uygulanır (ek, karakter bütçesinden yer yer).

### Moderasyon

**Gönderim öncesi istemci filtresi:** IBAN/banka + rakam, telefon/GSM + 10+ hane, e-posta/`@`,
`whatsapp|wp|telegram` kalıpları. Etkisi: (a) taslak 5 karakteri geçince canlı uyarı,
(b) gönderimde "yine de gönder?" onayı.

**Sunucu geri bildirimi:** yanıt `isFiltered` veya `status === 'pending'` ise
"incelemeye gönderildi" bilgisi; hata gövdesinde `requiresApproval` → aynı, `filtered` →
"içerik engellendi".

Mesaj durumları (DTO): `sent, delivered, read, pending, rejected`.
Baloncuk: `pending` → soluk + saat ikonu; `rejected` → kırmızı + hata ikonu.
Okundu bilgisi: kendi mesajlarında tek tik / okunduysa çift tik.

---

## 2. Realtime (Socket.IO)

```
Bağlantı: auth: { token: "<accessToken>" }
Yayınla:  join:thread / leave:thread   (ve typing:start / typing:stop — henüz kimse yayınlamıyor)
Dinle:    message:new · message:read · typing:started · typing:stopped
          notification:new · thread:updated
```

Davranış:

- `message:new` → açık sohbetin cache'ine **id ile birleştir**; gelen mesajda sohbeti
  invalidate et (sunucunun okundu işaretlemesi tetiklenip gönderene `message:read` gitsin).
- `notification:new` → bildirim listesi + okunmamış sayaç + teklif/takas badge'lerini tazele.
- `thread:updated` → sohbet listesi + mesaj okunmamış sayacı.
- Yeniden bağlanmada odalara **tekrar katıl** ve tazele.
- **Mesajlaşma polling yapmaz**; yalnız badge sayaçları için 5 dakikalık yedek yoklama var.

> **Token yenilenince soketi yeniden bağla** — mevcut istemcilerde bu ele alınmıyor,
> uzun oturumlarda soket yetkisi bayatlar.

---

## 3. Bildirimler

| Method  | Path                           | Auth   | Amaç                                                   |
| ------- | ------------------------------ | ------ | ------------------------------------------------------ |
| `GET`   | `/notifications?page=&limit=`  | bearer | Liste (**sayısal olmayan parametre 400 verir**)        |
| `GET`   | `/notifications/unread-count`  | bearer | `{ count }`                                            |
| `PATCH` | `/notifications/:id/read`      | bearer | Okundu işaretle (**"kapat" da budur — silme ucu yok**) |
| `POST`  | `/notifications/mark-all-read` | bearer | Tümünü okundu                                          |

Bildirim: `{ id, type, title, message, icon?, link?, isRead, createdAt, data? }`.
Derin bağlantı = `link || data.link`.

**`type` serbest metindir — sunucuda enum YOK.** Kategori kovaları istemcide eşlenir:

- **siparişler:** `order_created, order_paid, order_shipped, order_delivered, order_completed,
order_cancelled, order_refunded, payment_received, payment_released, product_sold,
cargo_code_ready, cargo_movement_missing`
- **teklifler:** `offer_received, offer_accepted, offer_rejected, offer_counter, offer_expired`
- **takaslar:** `trade_received, trade_accepted, trade_rejected, trade_shipped, trade_completed,
trade_address_required`
- **mesajlar:** `new_message`
- diğer her şey → "diğer"

> Yeni sunucu tipleri sessizce "diğer"e düşer. Bilinmeyen tipte de en azından `title`/`message`
> ve `link` ile kullanışlı bir kart göster.

---

## 4. Push bildirimleri (yalnız mobil)

| Method | Path                        | Auth   | Amaç                                                                             |
| ------ | --------------------------- | ------ | -------------------------------------------------------------------------------- |
| `POST` | `/notifications/push-token` | bearer | `{ token, platform?: "ios"\|"android"\|"web", deviceId?, deactivate?: boolean }` |

- Girişten sonra ve token değişiminde **upsert** et.
- **Çıkışta `deactivate: true`** gönder (mobil bunu zaten yapıyor).
- Android'de kanal ayrımı: default / trades / messages / orders.
- Dokunma yönlendirmesi: bildirim `link`'i mobil rotaya çevrilir (`toMobileRoute`).
  Ön planda, arka planda ve **soğuk başlatmada** üç durumun hepsi ele alınmalı.

---

## 5. Bildirim tercihleri

| Method  | Path                 | Auth   | Amaç                                                                         |
| ------- | -------------------- | ------ | ---------------------------------------------------------------------------- |
| `GET`   | `/users/me/settings` | bearer | Tercihler (hata → sessizce varsayılana düş)                                  |
| `PATCH` | `/users/me/settings` | bearer | **Tek anahtar** gönder: `{ [key]: boolean }`, iyimser güncelleme + geri alma |

8 anahtar ve varsayılanları: `emailNotifications: true` · `pushNotifications: true` ·
`smsNotifications: false` · `marketingEmails: false` · `orderUpdates: true` ·
`messageAlerts: true` · `priceDropAlerts: true` · `newListingAlerts: false`.

> Web yalnız 6 tanesini gösteriyor (`smsNotifications` ve `newListingAlerts` gizli).
> **Mobilde `pushNotifications` mutlaka görünür olmalı** ve sistem izniyle tutarlı olmalı
> (izin reddedildiyse anahtarı bilgilendirici şekilde devre dışı göster).

---

## 6. Destek

| Method | Path                                          | Auth   | Amaç                                                               |
| ------ | --------------------------------------------- | ------ | ------------------------------------------------------------------ |
| `POST` | `/support/contact`                            | public | Misafir iletişim (**5 istek/saat/IP**)                             |
| `POST` | `/support/tickets`                            | bearer | `{ subject, category, message, orderId?, tradeId?, attachments? }` |
| `GET`  | `/support/tickets/me?page=&pageSize=&status=` | bearer | Kendi taleplerim                                                   |
| `GET`  | `/support/tickets/:id`                        | bearer | Detay + mesajlar                                                   |
| `POST` | `/support/tickets/:id/messages`               | bearer | Yanıt (`{ content }`)                                              |

Kategoriler: `shipping, payment, account, product, trade, technical, other`.
Doğrulama: `subject` 5–200, `message` 10–2000.
`isInternal === true` mesajları **gösterme**. `status === 'closed'` ise yanıt formu yerine
"kapandı" bilgisi.

Sipariş ekranından "sorun bildir" ile gelindiyse kategoriyi `shipping` seç, konuyu
"Sipariş sorunu (#kısa-id)" ile doldur ve `orderId` gönder.

> **Banlı kullanıcılar** `/support/*` ve `POST /auth/logout`'a erişmeye devam eder — engellendi
> ekranında destek bağlantısı bulunmalı.

---

## Kabul kriterleri

- [ ] Okunmamış mesaj sayısı `GET /messages/unread-count` ile alınıyor (sohbetleri toplayarak değil).
- [ ] Görsel ekleri `[IMG:url]` sözleşmesiyle gönderiliyor/ayrıştırılıyor ve uzunluk sınırına dâhil.
- [ ] Gönderim öncesi içerik uyarısı ve sunucu moderasyon geri bildirimi gösteriliyor.
- [ ] `POST /messages/threads` 409'u hata değil "mevcut sohbet" olarak ele alınıyor.
- [ ] Soket yeniden bağlanmada odalara tekrar katılıyor; token yenilenince yeniden bağlanıyor.
- [ ] Push kaydı girişte upsert, çıkışta `deactivate: true`.
- [ ] Push dokunma yönlendirmesi ön plan/arka plan/soğuk başlatma için çalışıyor.
- [ ] Bilinmeyen bildirim tipi kullanışlı biçimde gösteriliyor.
- [ ] Bildirim tercihi tek anahtar PATCH ile, iyimser ve geri alınabilir.

## Yapma

- İki panelli masaüstü sohbet düzeni ve "ilk 6 sohbeti göster" kısıtı (masaüstü çözümü).
- Mesajlaşma için polling kurma — soket + invalidation yeterli.
