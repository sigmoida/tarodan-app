# 01 — Kimlik: Kayıt, Giriş, 2FA, Doğrulama, Şifre

> Önce `00-README.md` ve `11-api-contract.md` okunmalı. Base URL, bearer token ve hata
> biçimi orada tanımlı; burada tekrar edilmez.

## Kaynak (web)

```
apps/web/src/app/[locale]/(auth)/            # tüm kimlik ekranları
apps/web/src/app/[locale]/(auth)/_lib/auth.ts        # zod şemaları (tek kaynak)
apps/web/src/app/[locale]/(auth)/_hooks/             # akış hook'ları
apps/web/src/lib/api/auth.ts                         # endpoint sarmalayıcıları
apps/web/src/stores/authStore.ts                     # oturum durumu
packages/auth/src/actions.ts                         # web'e özgü Server Actions (mobil KOPYALAMAZ)
apps/api/src/modules/auth/                           # sözleşmenin gerçek kaynağı
```

---

## Ekran haritası

| Mobil ekran                 | Web route                                            | Auth   |
| --------------------------- | ---------------------------------------------------- | ------ |
| Kayıt (bireysel)            | `/register`                                          | public |
| Kayıt (kurumsal ön başvuru) | `/register/business`                                 | public |
| Kurumsal davet aktivasyonu  | `/corporate/invite?token=`                           | public |
| Giriş (2 adımlı)            | `/login`                                             | public |
| E-posta doğrulama           | `/verify-email?token=`                               | public |
| Şifremi unuttum             | `/forgot-password`                                   | public |
| Şifre sıfırlama             | `/reset-password?token=`                             | public |
| 2FA yönetimi                | `/profile/security`                                  | bearer |
| Hesap durumu ekranları      | `/banned`, `/business-pending`, `/business-rejected` | bearer |

---

## 1. Kayıt — bireysel

### Endpoint'ler

| Method | Path                        | Auth   | Amaç                                |
| ------ | --------------------------- | ------ | ----------------------------------- |
| `POST` | `/auth/register`            | public | Hesap oluştur (throttle 5/dk)       |
| `POST` | `/auth/resend-verification` | public | Doğrulama e-postasını tekrar gönder |

**İstek:** `{ displayName, username, email, password, phone?, birthDate, acceptsMarketingEmails }`
**Yanıt:** `{ user, message }` — **token YOK** (2026-07-30 değişikliği).

### Doğrulama kuralları (`registerSchema`)

| Alan              | Kural                                                            |
| ----------------- | ---------------------------------------------------------------- |
| `displayName`     | trim, min 1                                                      |
| `username`        | küçük harfe çevrilir, 3–30, `^[a-z0-9](?:[a-z0-9._]*[a-z0-9])?$` |
| `email`           | trim, geçerli e-posta                                            |
| `phone`           | opsiyonel; `+90` + 10 hane formatında gönderilir                 |
| `birthDate`       | zorunlu, `YYYY-MM-DD`, **yaş ≥ 18**                              |
| `password`        | min 8 **ve** en az bir küçük harf, bir büyük harf, bir rakam     |
| `confirmPassword` | `password` ile aynı                                              |
| `agreeTerms`      | `true` olmalı                                                    |

Şifre kurallarını canlı gösteren bir kontrol listesi olmalı (web'de `PasswordChecklist`).

### Akış

Başarı → **oturum açma yok**. "E-postanı doğrula" ekranına geç: kayıtlı e-postayı göster,
"Tekrar gönder" ve "Girişe dön" aksiyonları sun.

### Kabul kriterleri

- [ ] Yaş < 18 girildiğinde istemci tarafında engellenir (doğum tarihi seçicisi 18 yıl öncesini üst sınır alır).
- [ ] Kayıt başarılı olduğunda kullanıcı **giriş yapmış sayılmaz**, token saklanmaz.
- [ ] 409 (e-posta kayıtlı) kullanıcıya anlaşılır mesajla gösterilir, girişe yönlendirilir.
- [ ] 429'da bekleme mesajı gösterilir.

---

## 2. Kayıt — kurumsal ön başvuru

### Endpoint'ler

| Method | Path                      | Auth   | Amaç                                |
| ------ | ------------------------- | ------ | ----------------------------------- |
| `POST` | `/auth/register/business` | public | Kurumsal ön başvuru (throttle 5/dk) |

**İstek:** `{ authorizedFullName, companyLegalName, companyTitle, companyAddress, companyEmail, kepAddress?, phone, contactPhone? }`
**Yanıt:** `{ applicationId, status, email, message }`

Kurallar: `authorizedFullName`/`companyLegalName`/`companyTitle` min 2 · `companyAddress` min 10 ·
`companyEmail` e-posta · `kepAddress` opsiyonel e-posta · `phone` zorunlu ve **`^\+90[0-9]{10}$`** ·
`contactPhone` opsiyonel aynı format · şartlar onayı zorunlu.

> **Bu adımda hesap OLUŞMAZ.** Admin onayından sonra e-posta ile davet gelir (§3).

### Kabul kriterleri

- [ ] Bireysel/kurumsal kayıt arasında geçiş yapılabilen tek bir giriş noktası var.
- [ ] Başarıda "başvuru alındı, admin onayı bekleniyor" ekranı gösterilir; hesap açıldığı izlenimi verilmez.
- [ ] 409 (e-posta/telefon/vergi no zaten kayıtlı) ayrıştırılıp gösterilir.

---

## 3. Kurumsal davet aktivasyonu

### Endpoint'ler

| Method | Path                                  | Auth   | Amaç                                                    |
| ------ | ------------------------------------- | ------ | ------------------------------------------------------- |
| `GET`  | `/auth/corporate-invitation?token=`   | public | Daveti doğrula, şirket bilgisini getir (throttle 20/dk) |
| `POST` | `/auth/corporate-invitation/activate` | public | Kullanıcı adı + ilk şifreyi belirle (throttle 5/dk)     |

GET yanıtı: `{ companyTitle, companyEmail, expiresAt }`. Geçersiz/süresi dolmuş → **400**.
POST isteği: `{ token, username, password }` (şifre en fazla 72 karakter).

Kullanıcı adı: küçük harf, boşluksuz, 3–30, `^[a-z0-9](?:[a-z0-9._]*[a-z0-9])?$` ve
**bir kez belirlenince değiştirilemez** — bunu formda açıkça yaz.

### Kabul kriterleri

- [ ] Derin bağlantı (`tarodan://corporate/invite?token=...` veya universal link) davet e-postasından açılır.
- [ ] Token yok/geçersizse form gösterilmez, "bağlantı geçersiz" ekranı çıkar.
- [ ] Aktivasyon başarılı → girişe yönlendirilir.

---

## 4. Giriş — 2 adımlı (kimlik → şifre)

### Endpoint'ler

| Adım | Method | Path                        | Auth   | Amaç                                                     |
| ---- | ------ | --------------------------- | ------ | -------------------------------------------------------- |
| 1    | `POST` | `/auth/check-email`         | public | `{ email }` → `{ exists, hasPassword }` (throttle 10/dk) |
| 2    | `POST` | `/auth/login`               | public | `{ email, password, twoFactorCode? }` (throttle 5/dk)    |
| 2b   | `POST` | `/auth/forgot-password`     | public | Şifresi olmayan (Google-only) hesaba şifre kurma maili   |
| —    | `POST` | `/auth/resend-verification` | public | Doğrulanmamış e-posta uyarısından                        |
| —    | `GET`  | `/users/me`                 | bearer | Oturum sonrası kullanıcıyı yükle                         |
| —    | `POST` | `/auth/refresh`             | public | `{ refreshToken }` → yeni token çifti                    |
| —    | `POST` | `/auth/logout`              | bearer | `{ refreshToken }` ile sunucuda iptal                    |

**Login yanıtı iki biçimde gelir:**

- `{ user, tokens: { accessToken, refreshToken } }`
- **veya** `{ requires2FA: true }` — **HTTP 200 ile!** Bunu hata değil, akış adımı olarak ele al.

### Adım mantığı

1. E-posta gir → `check-email`.
2. `exists && hasPassword` → şifre adımı (+ opsiyonel 2FA kodu alanı).
3. `exists && !hasPassword` → "bu hesap Google ile açılmış" ekranı: Google ile gir **veya** şifre kur.
4. `!exists` → kayda yönlendir.

2FA kodu formatı: `^(?:\d{6}|[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4})$` — 6 haneli TOTP **veya** `XXXX-XXXX` yedek kod.

### Ele alınması zorunlu hata durumları

| Durum                 | Sinyal                                      | Mobil davranış                                           |
| --------------------- | ------------------------------------------- | -------------------------------------------------------- |
| 2FA gerekli           | 200 + `requires2FA: true`                   | Kod alanını göster, aynı e-posta/şifre ile tekrar gönder |
| E-posta doğrulanmamış | 401/400 + `errorCode: "EMAIL_NOT_VERIFIED"` | Uyarı + "Tekrar gönder" + doğrulama ekranına bağlantı    |
| Hatalı kimlik         | diğer 401/400                               | "E-posta veya şifre hatalı"                              |
| Ağ hatası             | istek başarısız                             | "Bağlantı kurulamadı, tekrar dene"                       |
| Banlı hesap           | 403 + `errorCode: "USER_BANNED"`            | Engellendi ekranı (`bannedReason` gösterilir)            |

### Giriş sonrası yönlendirme

Kullanıcı **doğrulanmış + `companyName` + `taxId` var + `membershipTier !== "business"`** ise
üyelik ekranına yönlendir (kurumsal hesabın işletme üyeliği alması gerekiyor); aksi halde
kullanıcının gelmek istediği ekrana dön.

### Kabul kriterleri

- [ ] `requires2FA` 200 yanıtı hata olarak gösterilmiyor.
- [ ] `EMAIL_NOT_VERIFIED` özel olarak ele alınıyor, genel hata mesajına düşmüyor.
- [ ] Token'lar güvenli depoda (SecureStore/Keychain) tutuluyor, AsyncStorage'da düz metin değil.
- [ ] 401'de refresh denenip başarısız olursa oturum temizlenip girişe düşülüyor.
- [ ] Ödeme/checkout ekranlarındayken tek bir 401 kullanıcıyı oturumdan atmıyor (web'de bilinçli guard var).

---

## 5. Token yenileme ve oturum ömrü

```
POST /auth/refresh   { refreshToken }  →  { accessToken, refreshToken }
```

- Refresh token **tek kullanımlıktır ve rotasyona tabidir** — yanıttaki yeni değeri sakla.
- **2026-07-30:** doğrulanmamış e-postada refresh artık **401 + `EMAIL_NOT_VERIFIED`** döner.
  Mobil bunu yakalayıp oturumu kapatmalı ve doğrulama akışına yönlendirmeli.
- Banlı/silinmiş hesapta 401 `accountSuspended`.

### Kabul kriterleri

- [ ] Eşzamanlı 401'lerde tek bir refresh çağrısı yapılıyor (single-flight), yarış yok.
- [ ] Rotasyon sonrası eski refresh token'ı bir daha kullanılmıyor.
- [ ] `EMAIL_NOT_VERIFIED` refresh hatası ayrı ele alınıyor.

---

## 6. E-posta doğrulama

| Method | Path                        | Auth   | Amaç        |
| ------ | --------------------------- | ------ | ----------- |
| `POST` | `/auth/verify-email`        | public | `{ token }` |
| `POST` | `/auth/resend-verification` | public | `{ email }` |

Derin bağlantıdan gelen token ile **bir kez** doğrula. Web'de StrictMode'un iki kez
tetiklemesini engelleyen bir ref guard var; mobilde de token'ı **tek seferlik** harca
(çift çağrı token'ı yakar).

Durumlar: `loading` · `success` (→ girişe) · `error` (mesaj + süresi dolmuşsa yeniden gönderme
formu) · `no-token` (bilgi + yeniden gönderme formu).

---

## 7. Şifre: unuttum / sıfırla / değiştir

| Method | Path                        | Auth   | Amaç                               |
| ------ | --------------------------- | ------ | ---------------------------------- |
| `POST` | `/auth/forgot-password`     | public | `{ email }`                        |
| `POST` | `/auth/reset-password`      | public | `{ token, newPassword }`           |
| `POST` | `/security/password/change` | bearer | `{ currentPassword, newPassword }` |

Şifre kuralı her yerde aynı: min 8 + küçük + büyük + rakam.

> **Gizlilik kuralı:** "şifremi unuttum" **her durumda** "e-posta gönderildi" ekranı gösterir —
> hata bile olsa. Böylece bir e-postanın kayıtlı olup olmadığı sızmaz. Mobilde de aynen böyle yap.

API'de ayrıca kullanılmayan bir ikinci çift var (`/security/password/request-reset`,
`/security/password/reset`); **yeni geliştirmede `/auth/*` olanları kullan**.

---

## 8. Google / Apple ile giriş

| Method | Path           | Auth   | Amaç                                                         |
| ------ | -------------- | ------ | ------------------------------------------------------------ |
| `POST` | `/auth/google` | public | Web: `{ code }` · **Native: `{ idToken }`** (throttle 10/dk) |
| `POST` | `/auth/apple`  | public | `{ identityToken, fullName? }` (throttle 10/dk)              |

- Web auth-code akışı kullanıyor; **mobil `idToken` göndermeli** — backend bu şekli zaten destekliyor.
- **Apple Sign-In backend'de tam çalışır durumda ama web'de devre dışı.** iOS'ta Google ile giriş
  sunuluyorsa Apple Sign-In App Store için **zorunludur** → mobilde uygulanmalı.
- Yanıt normal login ile aynı: `{ user, tokens }`.

### Kabul kriterleri

- [ ] Google ile giriş `idToken` ile çalışıyor.
- [ ] Apple ile giriş iOS'ta uygulanmış ve gerçek hesapla test edilmiş.
- [ ] Sosyal girişle açılan hesapta şifre olmadığı için "şifre kur" akışı erişilebilir.

---

## 9. 2FA (TOTP) yönetimi

| Method | Path                         | Auth   | Amaç                                        |
| ------ | ---------------------------- | ------ | ------------------------------------------- |
| `GET`  | `/security/2fa/status`       | bearer | `{ isEnabled }`                             |
| `POST` | `/security/2fa/enable`       | bearer | Kurulumu başlat → secret/QR + yedek kodlar  |
| `POST` | `/security/2fa/verify`       | bearer | `{ code }` → etkinleştir, `{ backupCodes }` |
| `POST` | `/security/2fa/disable`      | bearer | `{ code }`                                  |
| `POST` | `/security/2fa/backup-codes` | bearer | `{ code }` → yeni yedek kodlar              |

Yedek kodlar **yalnızca bir kez** gösterilir (verify/regenerate sonrası) — mobilde
kopyalama/paylaşma imkânı ver ve "bir daha gösterilmeyecek" uyarısı koy. QR kodunu native
olarak çiz veya secret'i manuel girilebilir biçimde sun.

---

## 10. Hesap durumu ekranları

Bunlar API çağırmaz, oturum/hata durumundan türetilir:

| Ekran                       | Tetik                                                                     |
| --------------------------- | ------------------------------------------------------------------------- |
| Engellendi                  | herhangi bir istekte `403 + errorCode: "USER_BANNED"` → global yakalayıcı |
| Kurumsal başvuru incelemede | `businessStatus === "pending"`                                            |
| Kurumsal başvuru reddedildi | `businessStatus === "rejected"`                                           |

Her üçünde de **çıkış yap** ve **destekle iletişim** aksiyonları bulunmalı.

---

## Yapma (web'e özgü, taşınmamalı)

- `/gateway` BFF proxy'si, `web_at`/`web_rt` httpOnly cookie'leri, `tarodan_authed` işaretçi cookie'si.
- Next.js Server Actions üzerinden login/logout (`packages/auth/src/actions.ts`).
- `middleware.ts` edge yönlendirmeleri, SSR prefetch/dehydration, `robots: noindex` metadata.
- `sessionStorage["login_redirect"]`, `localStorage["tarodan_user_snapshot"]`.
- `authStore.mapApiUser`'daki camelCase/snake_case çift eşleme — API camelCase, tek biçim yeterli.
