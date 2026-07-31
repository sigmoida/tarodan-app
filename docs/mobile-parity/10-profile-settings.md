# 10 — Profil, Adresler, Banka Hesabı ve Ayarlar

> Mobilde **büyük ölçüde eş**. Eksikler: e-posta değişikliği, kullanıcı adı talebi,
> telefon doğrulama ekranı (`13-parity-matrix.md` #12, #14) ve ~22 ekranın menüden
> erişilememesi (#15).

## Kaynak (web)

```
apps/web/src/app/[locale]/(main)/profile/                       # genel bakış + bölümler
apps/web/src/app/[locale]/(main)/profile/(account)/username/     # kullanıcı adı talebi
apps/web/src/app/[locale]/(main)/profile/(account)/security/      # 2FA
apps/web/src/app/[locale]/(main)/profile/_hooks/                  # form hook'ları
```

---

## 1. Profil genel bakış

Web bu ekranı **8 paralel çağrı** ile kuruyor; her biri **tek tek hata yakalar** (biri
başarısız olursa ekran yine çalışır). Aynı yaklaşımı uygula.

| Method | Path                                | Amaç                                                               |
| ------ | ----------------------------------- | ------------------------------------------------------------------ |
| `GET`  | `/users/me`                         | Profil                                                             |
| `GET`  | `/users/me/stats`                   | Puan, yorum, takipçi, sayaçlar                                     |
| `GET`  | `/orders/groups?role=buyer&limit=1` | Sipariş GRUBU sayısı (`meta.total`) — birim gruptur, sipariş değil |
| `GET`  | `/products/my?limit=100`            | Aktif ilan sayısı                                                  |
| `GET`  | `/trades?limit=1`                   | Takas sayısı                                                       |
| `GET`  | `/collections/my?limit=1`           | Koleksiyon sayısı                                                  |
| `GET`  | `/offers/pending-count`             | Teklif badge (`.received`)                                         |
| `GET`  | `/trades/pending-count`             | Takas badge (`.received`)                                          |
| `GET`  | `/wishlist`                         | Favori badge                                                       |
| `GET`  | `/messages/unread-count`            | Okunmamış mesaj badge                                              |

> Bu blok **pencere odağında yeniden çekilmemeli** (web'de bilinçli kapatılmış — istek
> fırtınası oluşturuyordu). Mobilde uygulama ön plana geldiğinde makul bir `staleTime`
> (≈5 dk) kullan.

---

## 2. Profil bilgileri

| Method  | Path                   | Auth   | Amaç                                                                   |
| ------- | ---------------------- | ------ | ---------------------------------------------------------------------- |
| `GET`   | `/users/me`            | bearer | Formu doldur                                                           |
| `PATCH` | `/users/me`            | bearer | Kaydet                                                                 |
| `POST`  | `/media/upload/avatar` | bearer | multipart alan **`avatar`**, **≤2 MB**, jpeg/png/webp → `{ key, url }` |
| `PATCH` | `/users/me`            | bearer | `{ avatarUrl: <key> }` ile kalıcılaştır                                |

`PATCH /users/me` kabul ettiği alanlar: `displayName` (2–100) · `phone` (`+905XXXXXXXXX`) ·
`bio` (≤500) · `birthDate` (`YYYY-MM-DD`) · `companyName` (≤200) · `taxId` (10–11 hane) ·
`taxOffice` (≤100) · `isCorporateSeller` · `avatarUrl` (S3 key) · `showTrustScore` ·
`preferredLanguage` (`tr|en`).

**E-posta bu formda salt okunurdur** — değişimi §3'teki OTP akışıyla yapılır. Boş string
gönderme; `undefined` yap ve `email` alanını gövdeden **çıkar**.

Avatar gösteriminde **`GET /users/:id/avatar`** kullan: 302 ile presigned URL'e yönlendirir ve
`Authorization` gönderemeyen görsel yükleyiciler için tasarlanmıştır.

---

## 3. E-posta değişikliği (OTP) — mobilde YOK

| Method | Path                         | Auth   | Amaç                                                       |
| ------ | ---------------------------- | ------ | ---------------------------------------------------------- |
| `POST` | `/auth/email/request-change` | bearer | `{ newEmail }` → kod **yeni adrese** gider (throttle 3/dk) |
| `POST` | `/auth/email/verify-change`  | bearer | `{ code }` → `{ email }` (throttle 10/dk)                  |

İki adımlı: yeni e-posta → 6 haneli kod (yalnız rakam, tam 6 hane girilene kadar onay kapalı).
**Mevcut e-posta doğrulama bitene kadar aktif kalır.**

---

## 4. Telefon doğrulama — mobilde ekran YOK (API bağlı)

| Method | Path                    | Auth   | Amaç                                                |
| ------ | ----------------------- | ------ | --------------------------------------------------- |
| `POST` | `/auth/phone/send-code` | bearer | `{ phone }` tam `+90…` (throttle 3/dk)              |
| `POST` | `/auth/phone/verify`    | bearer | `{ code }` → `{ isPhoneVerified }` (throttle 10/dk) |

Doğrulandıysa profilde "doğrulandı" rozeti gösterilir.

---

## 5. Kullanıcı adı talebi — mobilde YOK

| Method  | Path                                    | Auth   | Amaç                                                                     |
| ------- | --------------------------------------- | ------ | ------------------------------------------------------------------------ |
| `PATCH` | `/users/me/username`                    | bearer | `{ username }` → `{ username, usernameClaimed: true }`                   |
| `GET`   | `/auth/username-availability?username=` | public | `{ available }` (throttle 30/dk) — **web kullanmıyor, mobil kullanmalı** |

Kurallar: küçük harf, boşluksuz, 3–30, `^[a-z0-9](?:[a-z0-9._]*[a-z0-9])?$`,
**bir kez belirlenince değiştirilemez**. Girişi yalnızca `usernameClaimedAt` boşken göster;
alınmışsa salt okunur `@kullaniciadi` kartı göster.

---

## 6. Adresler

| Method   | Path                      | Auth   | Amaç                                                   |
| -------- | ------------------------- | ------ | ------------------------------------------------------ |
| `GET`    | `/users/me/addresses`     | bearer | Liste                                                  |
| `GET`    | `/users/me/addresses/:id` | bearer | Tek adres                                              |
| `POST`   | `/users/me/addresses`     | bearer | Ekle                                                   |
| `PATCH`  | `/users/me/addresses/:id` | bearer | Güncelle **ve** varsayılan yap (`{ isDefault: true }`) |
| `DELETE` | `/users/me/addresses/:id` | bearer | Sil (onay diyaloğu)                                    |

**Üst sınır 10 adres** — sınırda "yeni adres" aksiyonunu gizle.

Doğrulama: `title` opsiyonel (kaydederken varsayılan "Ev") · `fullName` trim min 2 ·
`phone` rakamları ayıklandığında ≥12 hane (`+90` + 10) · `city` ve `district` zorunlu ·
`address` trim min 10 · `zipCode` opsiyonel · `isDefault` boolean.
Şehir seçilince ilçe **sıfırlanır**.

---

## 7. Satıcı banka hesabı (IBAN)

| Method   | Path                     | Auth   | Amaç                   |
| -------- | ------------------------ | ------ | ---------------------- |
| `GET`    | `/users/me/bank-account` | bearer | Mevcut kayıt veya null |
| `PATCH`  | `/users/me/bank-account` | bearer | Ekle/güncelle          |
| `DELETE` | `/users/me/bank-account` | bearer | Sil (onay)             |

Doğrulama: `accountHolder` trim min 2 · `iban` **`^TR\d{24}$`** (mod-97 checksum da
doğrulanmalı; girişte büyük harfe çevir, boşlukları temizle) · `tcKimlikNo` opsiyonel tam 11
hane · `taxId` opsiyonel tam 10 hane.

Yanıt `isVerified` içerir → "doğrulandı/doğrulanmadı" rozeti; **düzenlemenin doğrulamayı
sıfırlayacağı** bilgisi verilmeli.

> **İlan açmanın ön koşuludur** (`03` §1).

---

## 8. Güvenlik

| Method     | Path                        | Auth   | Amaç                                                    |
| ---------- | --------------------------- | ------ | ------------------------------------------------------- |
| `POST`     | `/security/password/change` | bearer | `{ currentPassword, newPassword }` (throttle 5/dk)      |
| `DELETE`   | `/security/tokens`          | bearer | **Her yerden çık** (tüm refresh token'ları iptal) → 204 |
| 2FA uçları | —                           | —      | `01` §9                                                 |

Şifre kuralı: min 8 + küçük + büyük + rakam; canlı kural göstergesi olmalı.

---

## 9. Dil tercihi

| Method  | Path        | Auth   | Amaç                                                            |
| ------- | ----------- | ------ | --------------------------------------------------------------- |
| `PATCH` | `/users/me` | bearer | `{ preferredLanguage: "tr" \| "en" }` (yalnız giriş yapılmışsa) |

Sunucu hata mesajlarının dili `Accept-Language` başlığından gelir → tercih değişince
**başlığı da güncelle**.

---

## 10. Bildirim tercihleri

`09` §5'e bakın (tek anahtar PATCH, iyimser güncelleme).

---

## 11. Hesap silme

| Method   | Path        | Auth   | Amaç         |
| -------- | ----------- | ------ | ------------ |
| `DELETE` | `/users/me` | bearer | Kalıcı silme |

**Yaz-onayla:** kullanıcı belirlenen anahtar kelimeyi yazmadan onay butonu açılmamalı.

**Özel hata biçimi (400):**

```json
{
  "message": "...",
  "errors": ["..."],
  "details": { "activeProducts": 3, "activeTrades": 1, "pendingOrders": 0 }
}
```

`errors` dizisini **liste olarak** göster; `details` ile "önce şunları kapat" ekranı kurabilirsin.
Başarıda oturumu kapat ve anasayfaya dön.

---

## 12. Satıcı paneli / istatistikler

| Method | Path                                      | Auth   | Amaç                                                                    |
| ------ | ----------------------------------------- | ------ | ----------------------------------------------------------------------- |
| `GET`  | `/users/me/stats`                         | bearer | `totalRevenue`, aktif/satılmış ilan sayısı                              |
| `GET`  | `/products/my/stats`                      | bearer | `counts.active`, `counts.sold` (tercih edilen)                          |
| `GET`  | `/orders/seller/pending-count`            | bearer | Bekleyen PAKET sayısı sunucudan (`.pending`) — istemcide sayım YAPILMAZ |
| `GET`  | `/users/me/analytics?period=7d\|30d\|90d` | bearer | Görüntülenme/beğeni/satış/gelir                                         |
| `GET`  | `/orders/seller/earnings`                 | bearer | `{ totalEarnings, pendingEarnings }`                                    |

---

## Kabul kriterleri

- [ ] Genel bakış blokunda tek bir çağrının hatası ekranı bozmuyor.
- [ ] Avatar `GET /users/:id/avatar` (302) üzerinden gösteriliyor.
- [ ] E-posta değişikliği OTP akışı çalışıyor; e-posta profil formunda salt okunur.
- [ ] Kullanıcı adı talebi bir kez yapılabiliyor ve alındıktan sonra form gizleniyor.
- [ ] Adres üst sınırı 10 uygulanıyor; şehir değişince ilçe sıfırlanıyor.
- [ ] IBAN mod-97 doğrulaması yapılıyor; düzenleme doğrulamayı sıfırlayacağı bildiriliyor.
- [ ] Hesap silme 400'ünde `errors` listesi ve `details` gösteriliyor.
- [ ] Dil değişince `Accept-Language` başlığı güncelleniyor.
- [ ] Menüden erişilemeyen ekranlar (ödeme yöntemleri, abonelik, indirimler, kayıtlı aramalar,
      satış detayı, statik sayfalar) profil/ayarlar menüsüne bağlandı.

## Yapma

- `localStorage` kullanıcı anlık görüntüsü, `tarodan_authed` işaretçisi ve diğer web
  oturum yardımcıları.
- camelCase/snake_case çift alan eşlemesi — API camelCase.
