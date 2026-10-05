# 23 — API Değişiklik Güncesi (2026-10-05): Yasal kimlik (ad, soyad, TCKN)

> **Bu dosya bir delta raporudur.** Önceki günce `22-api-delta-2026-10-05.md`
> (hukuki onaylar). Kalıcı referans: **`docs/IDENTITY.md` §6**.

Her üyenin yasal adı, soyadı ve T.C. Kimlik Numarası devlet bildirimi için
kayıtlı olmalıdır. Bu değişikliklerin **hiçbiri bugünkü mobil sürümü kırmaz**:
kayıttaki yeni alanlar opsiyoneldir ve **sunucu kimliği eksik üyenin
isteklerini reddetmez** — zorlama istemcidedir (web'de kapatılamaz pencere,
mobilde aşağıdaki ekran). Mobil UI bu repoda yapılmaz; aşağıdakiler sözleşmedir.

## Öncelikli uygulama özeti

| Öncelik | Mobil değişiklik                                                                                                                              | Yapılmazsa                                                                                           |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **P0**  | Girişte ve uygulama ön plana geldiğinde `GET /legal-identity/me`; `missing` boş değilse kapatılamaz kimlik ekranı → `POST /legal-identity/me` | Mobil üyenin kimliği hiç toplanmaz; web'e girdiği an web'de bekletilir. Devlet bildirimi eksik kalır |
| P1      | Kayıt formuna ad, soyad, TCKN alanları (zorunlu) ve `POST /auth/register` gövdesine `legalFirstName`, `legalLastName`, `nationalId`           | Kayıt çalışır; kimlik ilk girişte P0 ekranıyla alınır                                                |
| P1      | Profilde salt-okunur "Kimlik bilgileri" (ad, soyad, maskeli TCKN)                                                                             | Üye girdiğini göremez                                                                                |
| P2      | Banka hesabı formundan TCKN alanını kaldır (gönderilirse üyenin numarasıyla aynı olmalı)                                                      | Farklı numara `400 server.identity.bankNationalIdMismatch`                                           |

## 1. Kimlik ekranı (yeni uçlar)

```
GET  /legal-identity/me  → LegalIdentityStatus
POST /legal-identity/me  { legalFirstName?, legalLastName?, nationalId? } → LegalIdentityStatus
```

```jsonc
// LegalIdentityStatus (@tarodan/types)
{
  "required": true, // false: personel / test hesabı — ekran hiç gösterilmez
  "missing": ["legalFirstName", "legalLastName", "nationalId"], // boş = kapı kapalı
  "legalFirstName": null,
  "legalLastName": null,
  "nationalIdMasked": null, // dolu ise "•••••••••46" — tam numara ASLA dönmez
  "suggestedNationalId": "10000000146", // ön doldurma: üyenin kendi banka hesabındaki geçerli TCKN (yalnız numara eksikken)
}
```

- **Sıra:** onay ekranı (`GET /consents/me/pending`, bkz. 22) ÖNCE; onaylar
  bitince kimlik ekranı. İki ekran üst üste gösterilmez. Web'de ikisi tek
  bileşenden sırayla çıkar (`RequiredStepsGate`, `REQUIRED_STEPS =
["consents", "legalIdentity"]`); mobilde de aynı sıra uygulanmalı.
- **Kapatılamaz:** tek çıkış kaydetmek ya da oturumu kapatmak. Yasal metin
  (gizlilik / KVKK) bağlantısı açılabilir.
- **Yalnız `missing` alanları sorun.** Dolu alanı göndermek, değeri AYNIysa
  zararsızdır; farklıysa `409 server.identity.locked`. Gönderim sonrası üç
  alan da dolu olmalı, aksi `400 server.identity.incomplete`.
- **Ön doldurma:** `suggestedNationalId` doluysa TCKN alanına yazın (üye
  düzeltebilir). Ad için ön doldurma YOK — görünen ad takma ad olabilir.
- Başarılı yanıt güncel durumdur; `missing` boşsa ekranı kapatın.

### Doğrulama (istemcide de aynısı)

Kural `@tarodan/types` → `legal-identity.ts`; mobil bu paketi kullanabiliyorsa
`isValidTckn`, `isValidLegalName`, `normalizeTckn` doğrudan alınmalı (ikinci
kopya yazılmamalı).

- **TCKN:** rakam dışı karakterler atılır; 11 hane, ilk hane ≠ 0;
  d10 = ((d1+d3+d5+d7+d9)·7 − (d2+d4+d6+d8)) mod 10; d11 = (d1+…+d10) mod 10.
  Yabancı kimlik numarasına özel muamele yok.
- **Ad / soyad:** harf (Türkçe dahil), aralarında tek boşluk, tire ya da
  kesme; 2–50 karakter.

### Hatalar

| Durum | i18n anahtarı                           | Anlamı                                                                     |
| ----- | --------------------------------------- | -------------------------------------------------------------------------- |
| 400   | (DTO doğrulaması)                       | Biçim/checksum hatası                                                      |
| 400   | `server.identity.incomplete`            | Gönderim sonrası bir alan hâlâ boş                                         |
| 409   | `server.identity.locked`                | Kayıtlı bir alanı değiştirme girişimi (düzeltme yalnız destek/admin)       |
| 409   | `server.identity.nationalIdUnavailable` | Numara başka bir hesapta — hangi hesap olduğu söylenmez                    |
| 429   | `server.identity.tooManyAttempts`       | Deneme sınırı: IP başına 5/dk; ayrıca üye başına 10/gün, IP başına 30/saat |

## 2. Kayıt: üç yeni opsiyonel alan

`POST /auth/register` gövdesine:

```json
{
  "legalFirstName": "Ayşe Nur",
  "legalLastName": "Yılmaz",
  "nationalId": "10000000146"
}
```

API'de **opsiyonel** (eski sürümler kırılmasın); mobil formda zorunlu
olmalı. Gönderilen alan doğrulanır; TCKN başka hesaptaysa kayıt
`409 server.identity.nationalIdUnavailable` alır ve hesap açılmaz. Google /
Apple ile açılan hesaplar alanları sağlayamaz → ilk açılışta P0 ekranı.

i18n: `identity.legalFirstName`, `identity.legalLastName`, `identity.nationalId`,
`identity.nationalIdPlaceholder`, `identity.legalNameHint`,
`identity.registerHint`, `identity.validation.*`, ekran metinleri
`identity.gate.*`, profil `identity.profile.*`.

## 3. Banka hesabı (`PATCH /users/me/bank-account`)

`tcKimlikNo` alanı **eski**dir. Web formu artık göstermiyor. Gönderilirse
ortak TCKN kuralıyla doğrulanır ve üyenin `nationalId`'si varsa ONUNLA AYNI
olmalıdır (`400 server.identity.bankNationalIdMismatch`). Gönderilmezse
mevcut değer **korunur** (eskiden null'lanıyordu).

## 4. Sunucu zorlamıyor — bilinçli

Kimliği eksik üye diğer uçları kullanmaya devam eder. Kapıyı istemci uygular
(onay kapısıyla aynı karar). App Store incelemesi açısından notlar
`IDENTITY.md` §6 ve PR açıklamasında; ekran metni "neden istiyoruz" sorusunu
cevaplar (`identity.gate.intro`).
