# SMS ile Telefon Doğrulama — Tasarım Dokümanı

Tarih: 2026-06-29
Durum: Onaylandı (tasarım) — implementasyon planı bekliyor

## 1. Amaç ve Kapsam

Kullanıcının telefon numarasını NetGSM SMS OTP servisiyle doğrulamak. SMS yalnızca telefon
doğrulaması için kullanılır — uygulamada başka hiçbir yerde SMS gönderimi yoktur.

Yaklaşım **additive (eklemeli)**: mevcut hiçbir akış (mobil TOTP 2FA, Twilio SMS provider, email
doğrulama, şifre sıfırlama) değiştirilmez veya bozulmaz.

### Kapsam dışı / mevcut durum notları
- **Mobil 2FA (TOTP + yedek kodlar)** zaten tam implemente ve çalışıyor
  (`apps/mobile/app/settings/security.tsx`, `/security/2fa/*` endpoint'leri). Bu özellik
  **olduğu gibi kalır**. Telefon doğrulama ona ek olarak gelir.
- **Web 2FA** sadece "Yakında" rozetiyle pasif bir placeholder
  (`apps/web/src/app/profile/settings/page.tsx:349-366`). Bu placeholder kaldırılıp yerine
  telefon doğrulama gelir.
- Telefon doğrulamanın kendisi web ve mobilde **simetrik (paralel)** olur.

## 2. Backend Mimarisi (apps/api — NestJS + Prisma)

### 2.1 Veri modeli
Mevcut `User` modelinde `phone String? @unique` ve `isPhoneVerified Boolean @default(false)`
alanları **zaten var** (schema.prisma:13, 20). Yeni alan gerekmez.

Yeni Prisma modeli `PhoneVerificationToken` (mevcut `EmailVerificationToken` ikizi):

```
model PhoneVerificationToken {
  id        String   @id @default(cuid())
  userId    String
  phone     String              // E.164, kod bu numaraya gönderildi
  codeHash  String              // sha256(kod)
  expiresAt DateTime
  attempts  Int      @default(0)
  usedAt    DateTime?
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
}
```

Migration eklenecek (`prisma migrate`). Hatırlatma: API başlatmadan önce `migrate deploy` +
`prisma generate` (bkz. bayat client riski).

### 2.2 NetGSM Provider (yeni dosya — Twilio'ya dokunulmaz)
`apps/api/src/modules/notification/providers/netgsm.provider.ts`

- Mevcut Twilio `sms.provider.ts` ile aynı arayüzü (`sendSms` / `sendOtp`) sağlar.
- NetGSM REST v2: `POST https://api.netgsm.com.tr/sms/rest/v2/send`
  - Auth: `Authorization: Basic base64(usercode:password)`
  - `Content-Type: application/json`
  - Body: `{ msgheader, encoding: "TR", messages: [{ msg, no }] }`
  - `no` formatı: E.164 → NetGSM `905XXXXXXXXX` (baştaki `+` kaldırılır).
- **OTP/IYS notu:** Doğrulama SMS'leri için NetGSM tarafında **onaylı OTP başlığı**
  (IYS muafiyetli) gereklidir. Başlık ve OTP modu env ile yapılandırılabilir bırakılır;
  kesin başlık/endpoint canlı NetGSM panelinden teyit edilecek (resmi doküman JS render
  olduğu için tam çekilemedi).
- Response code haritası → anlamlı hata mesajı:
  - `00` (veya `01/02`) = başarı (jobid döner)
  - `20` = mesaj/karakter problemi
  - `30` = geçersiz kimlik / API erişimi yok
  - `40` = tanımsız/onaysız başlık (msgheader)
  - `50` = IYS kaynaklı sorun
  - `70` = geçersiz parametre
  - `80` = gönderim limiti aşıldı
  - `85` = mükerrer gönderim limiti
- Env değişkenleri:
  - `NETGSM_USERCODE`, `NETGSM_PASSWORD`, `NETGSM_MSGHEADER`
  - `NETGSM_BASE_URL` (varsayılan `https://api.netgsm.com.tr`)
  - `SMS_PROVIDER=netgsm|twilio` (varsayılan mevcut davranışı bozmaz)
  - Env yoksa graceful degrade: kod log'a yazılır, akış kırılmaz (dev ortamı).

### 2.3 Endpoint'ler (auth modülü, JwtAuthGuard ile korumalı)
Kullanıcı yalnızca kendi telefonu için işlem yapar (userId JWT'den).

- `POST /auth/phone/send-code`
  - Body: `{ phone }` (E.164'e normalize edilir, TR formatları desteklenir).
  - Numarayı `User.phone`'a yazar (`isPhoneVerified=false` kalır), başka kullanıcıda
    `@unique` çakışması varsa reddeder.
  - 6 haneli sayısal kod üretir, `sha256` hash'leyip 3 dk TTL ile `PhoneVerificationToken`'a yazar.
  - NetGSM ile gönderir.
  - Rate limit: `@Throttle({ default: { limit: 3, ttl: 60000 } })` + cache ile telefon başına.
  - Resend cooldown: son aktif token'ın createdAt'ine göre 60 sn.
  - Zaten doğrulanmışsa idempotent yanıt.

- `POST /auth/phone/verify`
  - Body: `{ code }`.
  - Aktif (kullanılmamış, süresi geçmemiş) token'ı bulur, `attempts++`.
  - `sha256(code)` karşılaştırır; max 5 yanlış denemede token iptal.
  - Başarılıysa `isPhoneVerified=true`, token `usedAt` işaretlenir.

### 2.4 OTP kuralları (varsayılanlar)
6 hane sayısal · 3 dk TTL · 60 sn resend cooldown · 5 yanlış deneme limiti · 3 SMS/dk rate limit.
İlgili env ile ayarlanabilir (`PHONE_VERIFICATION_*`).

## 3. UI (Web + Mobil — paralel, layout kaymasız)

### Ortak akış
Numara gir/düzenle → "Kod Gönder" → 6 haneli kod gir → "Doğrula" → ✓ Doğrulandı.
Resend butonu 60 sn geri sayımlı. Durum gösterimi her iki platformda aynı:
- Numara yok → "Telefon Ekle"
- Numara var, doğrulanmamış → "Doğrula"
- Doğrulanmış → yeşil ✓ + maskeli numara

### Web
`apps/web/src/app/profile/settings/page.tsx` — Güvenlik bölümündeki "İki Faktörlü Doğrulama /
Yakında" bloğu (349-366) kaldırılır, yerine aynı kart stilinde "Telefon Doğrulama" gelir.
Doğrulama akışı inline/modal. Mevcut "Şifre Değiştir" ve "Danger Zone" düzeni korunur.

### Mobil
`apps/mobile/app/settings/security.tsx` — Mevcut 2FA bölümü **kalır**; aynı section stilinde
yeni "Telefon Doğrulama" bölümü eklenir, mevcut spacing/sıralama korunur. testID'ler eklenir.

## 4. Hiçbir Yeri Bozmama Garantisi
- Tüm değişiklikler eklemeli; mevcut endpoint/UI/provider imzaları değişmez.
- NetGSM provider env yoksa graceful (akış kırılmaz, kod log'a düşer).
- Web ve mobilde telefon doğrulama özdeş davranır; mevcut kartların layout'u korunur.

## 5. Test Stratejisi (TDD)
- Birim testleri: NetGSM response-code mapping, telefon format normalizasyonu, OTP üretim/
  hash/doğrulama, TTL/deneme/cooldown, idempotent "zaten doğrulanmış" durumu, `@unique` çakışması.
- NetGSM HTTP çağrısı mock'lanır. **Gerçek SMS gönderimi testlerle kanıtlanamaz** — canlı
  doğrulama (onaylı başlıkla) ayrı yapılır.
- UI: web + mobil manuel doğrulama (layout kayması kontrolü dahil).
