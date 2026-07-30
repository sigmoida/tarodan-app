# 08 — Üyelik ve Kurumsal Hesap

> **Kurumsal onboarding mobilde YOK ve bu bir P0 engelidir** (`13-parity-matrix.md` #3, #4):
> kurumsal satıcı uygulamadan başvurusunu tamamlayamıyor, davet edilen alt hesap
> aktivasyon yapamıyor.

## Kaynak (web)

```
apps/web/src/app/[locale]/(main)/membership/                  # planlar, checkout, başarı
apps/web/src/app/[locale]/(main)/seller/documents/            # belge yükleme (basit)
apps/web/src/app/[locale]/(main)/profile/(account)/business/  # kurumsal başvuru tamamlama (zengin)
apps/web/src/app/[locale]/(auth)/(centered)/corporate/invite/ # davet aktivasyonu
```

---

## 1. Üyelik planları

| Method | Path                                                               | Auth   | Amaç                                     |
| ------ | ------------------------------------------------------------------ | ------ | ---------------------------------------- |
| `GET`  | `/membership/tiers`                                                | public | Katmanlar: fiyat + limitler + yetenekler |
| `GET`  | `/membership/tiers/:type`                                          | public | Tek katman                               |
| `GET`  | `/membership/me`                                                   | bearer | Mevcut üyelik                            |
| `GET`  | `/membership/me/limits`                                            | bearer | Hak zarfı                                |
| `GET`  | `/membership/check/listing` · `/check/trade` · `/check/collection` | bearer | Kota ön kontrolü                         |

`/membership/me` alanları: `currentPeriodStart, currentPeriodEnd, tier.type, status,
cancelledAt, pendingPayment, pendingTierName, pendingTierType, scheduledTierType,
scheduledBillingPeriod, autoRenew`.

Katmanlar: `free | basic | premium | business`. Dönem: `monthly | yearly` —
**mevcut dönem türetilir**: `currentPeriodEnd - currentPeriodStart > 180 gün` → yıllık.

> **Hakları API'den oku.** Kart içerikleri `maxTotalListings`, `maxImagesPerListing`,
> `canTrade`, `canCreateCollections`, `isAdFree` alanlarından üretilir. Mobil şu an
> `TIER_LIMITS` sabit tablosunu kullanıyor → **API değerini tercih et**, tablo bayatlıyor.

### Seçim kuralları

- Mevcut plan + dönem tekrar seçilirse: bilgi mesajı, işlem yok.
- Ücretli plandan `free`'ye geçiş = **iptal** (onay diyaloğu ile).
- Misafir: giriş ekranına yönlendir, dönüşte seçili katmanı koru.
- Aksi halde ödeme adımına geç.

---

## 2. Üyelik satın alma / yönetme

| Method   | Path                                  | Auth   | Amaç                                       |
| -------- | ------------------------------------- | ------ | ------------------------------------------ |
| `POST`   | `/membership/subscribe`               | bearer | `{ tierType, billingPeriod }`              |
| `POST`   | `/membership/payments/initiate`       | bearer | `{ provider }` → ödeme başlat              |
| `POST`   | `/membership/cancel`                  | bearer | İptal (ücretliden free'ye düşürme de bu)   |
| `POST`   | `/membership/cancel-scheduled-change` | bearer | **Planlı düşürmeyi geri al** — mobilde YOK |
| `PATCH`  | `/membership/auto-renew`              | bearer | `{ autoRenew }` (iyimser güncelleme)       |
| `GET`    | `/membership/cards`                   | bearer | Kayıtlı kartlar                            |
| `DELETE` | `/membership/cards/:id`               | bearer | Kart sil → `{ deleted }`                   |

### `subscribe` yanıtının dallanması (bu sırayla)

1. `useBypass && paymentId` → `POST /payments/:id/bypass-complete` → başarı (yalnız dev/staging)
2. `orderId` → `POST /payments/initiate` → ödeme ekranı (`?type=membership`)
3. `paymentId` → doğrudan ödeme ekranı
4. `scheduledTierType || scheduledBillingPeriod` → **ertelenmiş düşürme** → "planlandı" ekranı
5. Aksi halde → anında başarı

Fiyat **her zaman `/membership/tiers`'dan** okunur (DB tek fiyat kaynağı). Katman satırı
bulunamazsa "geçersiz plan" göster.

### Durum bandları (gösterilmesi gerekenler)

- İptal edilmiş ama dönem sonuna kadar aktif
- Planlı katman/dönem değişikliği (+ "değişikliği iptal et")
- Mevcut plan bilgisi
- **Kurumsal hesap işletme üyeliği almadıysa zorunluluk bandı** (girişte de yönlendirilir)

### Kayıtlı kartlar

Kart **yalnızca ödeme sırasında** "kartımı kaydet" ile eklenir — "kart ekle" ucu yoktur.
Silmede otomatik yenilemenin bozulacağı uyarısı gösterilmeli.

---

## 3. Kurumsal ön başvuru ve davet

Akış: **kayıt (ön başvuru)** → admin ön onayı → **e-posta ile davet** → **aktivasyon** →
belge yükleme → admin nihai onayı.

| Method | Path                                  | Auth   | Amaç                                                         |
| ------ | ------------------------------------- | ------ | ------------------------------------------------------------ |
| `POST` | `/auth/register/business`             | public | Ön başvuru (`01` §2)                                         |
| `GET`  | `/auth/corporate-invitation?token=`   | public | Daveti doğrula → `{ companyTitle, companyEmail, expiresAt }` |
| `POST` | `/auth/corporate-invitation/activate` | public | `{ token, username, password }`                              |

**Mobilde bu üçüncü adım tamamen eksik** → davet e-postası uygulamayı açamıyor (derin
bağlantı da yok, `12`). Öncelik: P0.

---

## 4. Kurumsal başvuru tamamlama (belgeler)

Bu bölüm **mobilde hiç yok**; 7 uç bağlanmalı.

| Method  | Path                                                  | Auth   | Amaç                                                        |
| ------- | ----------------------------------------------------- | ------ | ----------------------------------------------------------- |
| `GET`   | `/users/me/seller-documents`                          | bearer | Belge slotları (presigned URL'lerle)                        |
| `POST`  | `/users/me/seller-documents`                          | bearer | **multipart**: `file` + `documentType` (+ `stakeholderId?`) |
| `GET`   | `/users/me/seller-documents/application`              | bearer | Başvuru (400/404 → "başvuru yok")                           |
| `PATCH` | `/users/me/seller-documents/application`              | bearer | Şirket/banka bilgileri                                      |
| `POST`  | `/users/me/seller-documents/application/stakeholders` | bearer | Paydaş ekle                                                 |
| `POST`  | `/users/me/seller-documents/application/submit`       | bearer | İncelemeye gönder                                           |
| `POST`  | `/users/me/seller-documents/:documentId/appeal`       | bearer | `{ note }` — karara itiraz                                  |
| `GET`   | `/users/me/business-stats`                            | bearer | Onaylı hesapta işletme paneli                               |

### Belge yükleme kısıtları

Kabul edilen: **`application/pdf`, jpeg, png, webp** · ≤10 MB ·
**özel bucket** (yalnız presigned URL ile görüntülenir).

### Basit akış (5 slot)

`tax_plate, contract, signature_circular, activity_certificate, identity`

### Zengin akış (`/profile/business` karşılığı)

- **Detaylar sekmesi:** `companyType, taxId, taxOffice, companyCity, companyDistrict,
bankAccountHolder, iban`
- **Paydaşlar sekmesi:** `{ fullName, identityType: "tckn" | "passport", identityNumber? }`;
  paydaş başına ön/arka kimlik yüklemesi (`documentType` = `identity_front|identity_back` veya
  `passport_front|passport_back`)
- **Belgeler sekmesi (7 tür):** `tax_plate, residence_or_invoice, signature_circular,
trade_registry_gazette, activity_certificate, bank_account_info, contract`
- **Belge durumları:** `pending | approved | rejected | revision_requested | appealed`
  (+ UI'da "eksik"); `version` `v{n}` olarak, `reviewNote` kırmızı gösterilir
- **Kilit kuralı:** `application.status === "under_review"` iken detay formu, paydaş formu ve
  gönder butonu **devre dışı**; ancak `rejected`/`revision_requested` belgeler için yükleme
  **açık kalır**

### İşletme paneli (onaylı hesap)

`GET /users/me/business-stats` → `{ overview{...}, weekly{views,likes},
topProducts{byViews,byLikes}, topCollections, company{...} }`.
**400** dönerse mesajı göster ve kullanıcıyı doğru yere yönlendir: şirket adı eksikse profile,
katman yanlışsa üyeliğe.

---

## Kabul kriterleri

- [ ] Katman kartları ve haklar **API'den** üretiliyor, sabit tablodan değil.
- [ ] `subscribe` yanıtının 5 dalı da doğru ele alınıyor (özellikle ertelenmiş düşürme).
- [ ] Planlı değişikliği iptal etme aksiyonu var.
- [ ] Kurumsal davet derin bağlantıdan açılıyor ve aktivasyon tamamlanabiliyor.
- [ ] Kurumsal başvuru mobilden **uçtan uca** tamamlanabiliyor: bilgiler + paydaşlar + 7 belge + gönder + itiraz.
- [ ] `under_review` iken formlar kilitli ama reddedilen belgeler yeniden yüklenebiliyor.
- [ ] Belge yüklemede PDF ve görsel destekli dosya seçici kullanılıyor (≤10 MB).
- [ ] `business-stats` 400'ü kullanıcıyı doğru ekrana yönlendiriyor.

## Yapma

- Web'deki `window.prompt` ile itiraz notu alma — mobilde gerçek bir form/modal kullan.
- `/membership?required=true` sayfasındaki `beforeunload`/`popstate` tuzakları (tarayıcıya özgü).
- Katman fiyatlarını istemcide sabitleme.
