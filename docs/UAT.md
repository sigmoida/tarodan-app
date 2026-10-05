# UAT — Staging'de Kabul Testi

Staging, ekibin **gerçek hesaplarla** alıp sattığı bir kabul testi (UAT)
ortamıdır. Kimse kargoya koli vermez, SMS gelmez, para çekilmez; buna rağmen
satış, iade ve takas uçtan uca, gerçek kodla yürür. Bu belge ilkeyi, operatörün
staging'e yazacağı env değerlerini ve üç uçtan uca senaryonun adımlarını anlatır.

İlgili belgeler: ortam guard'ları ve reset için `OPERATIONS.md`, süreler için
`TIMING_RULES.md`, para akışı için `PAYMENTS.md`, kargo için `SHIPPING.md`.

---

## 1. İlke: kendi kodumuz gerçek, dış dünya sahte, dış olayı tester tetikler

| Dış sistem                 | Staging'de                                                           | Dış olayı kim / nasıl tetikler                                            |
| -------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| PayTR (pazaryeri + üyelik) | Test modu (`test_mode=1`), PayTR test mağazası                       | Tester ödeme formunda PayTR **test kartını** girer; callback gerçek gelir |
| PayTR transfer (payout)    | Kapalı (`PAYOUTS_DISABLED=true`)                                     | Yok — akış escrow serbest bırakılmasına kadar test edilir                 |
| Sürat Kargo                | Sahte taşıyıcı (`SURAT_SOAP_MODE=stub`), koli `STUB…` koduyla açılır | Admin → Test Araçları → **Kargo Simülasyonu** (kabul / teslim)            |
| eLogo (e-Arşiv / e-Fatura) | Kapalı (`ELOGO_ENABLED=false`); belgeler `pending` kalır             | Yok (fatura akışı denenecekse demo host, bkz. §2)                         |
| NetGSM (telefon doğrulama) | SMS gönderilmez, kod sabittir (`SMS_FIXED_VERIFICATION_CODE`)        | Tester ekipçe bilinen sabit kodu girer                                    |
| Zaman                      | Gerçek saat                                                          | Admin → Test Araçları → **Süre Ayarlama** + **Cron'lar**                  |

Kural: simülasyon ve kısayollar **yalnız dış olayın kaynağını** değiştirir.
Olayın sistemdeki sonucu — sipariş statüsü, `deliveredAt`,
`Order.returnWindowEndsAt`, escrow tarihi, bildirim ve e-postalar, outbox
olayları, faturalama tetiği — gerçek bir taşıyıcı bildirimiyle **aynı koddan**
üretilir. Kargo simülasyonu sentetik bir Sürat takip okuması üretip onu Sürat
poll'unun uygulama çekirdeğine verir (`SuratTrackingService.applyOrderParcelReading`
/ `applyRefundReturnReading` / `applyTradeShipmentReading` →
`OrderTrackingSyncService.applyTrackingUpdate`, `RefundReturnTrackingSyncService`,
`TradeTrackingSyncService`). Durum makinesi, CAS, teslim işleyicisinin statü
koşulu ve iade/takas kapanış kuralları aynen geçerlidir; simülasyon hiçbir
kargo/sipariş alanına kendisi yazmaz.

---

## 2. Staging env değerleri (operatör)

Coolify → staging API servisi (worker dahil aynı env). Burada yalnız UAT'ı
ilgilendiren değerler var; URL'ler, `S3_ENV_PREFIX=staging`, gizli anahtarlar,
SMTP, Sentry ve arama öneki için `OPERATIONS.md`'deki staging tablosu geçerlidir.

```env
NODE_ENV=production
APP_ENV=staging

# PayTR — açılış doğrulaması staging'de test modunu ve payout kapalı olmasını ZORUNLU tutar.
# PAYTR_MERCHANT_* ve PAYTR_MEMBERSHIP_MERCHANT_* PayTR TEST mağazasının kimlikleri olmalı.
PAYTR_TEST_MODE=true
PAYTR_MEMBERSHIP_TEST_MODE=true
PAYOUTS_DISABLED=true
PAYTR_TRANSFER_CALLBACK_ENABLED=false
PAYTR_REPORT_SYNC_ENABLED=false

# Sürat — tamamen sahte taşıyıcı (ağa hiç çıkmaz)
SURAT_CARGO_ENABLED=true
SURAT_SOAP_MODE=stub
# Stub modunda GEREKMEZ: SURAT_KARGO_TEST_MODE, SURAT_KARGO_CARI_KODU,
# SURAT_KARGO_SIFRE, SURAT_CREATE_API_VERSION, SURAT_FIRMA_ID
SURAT_STUB_RESPONSE=
SURAT_STUB_THROW=
SURAT_STUB_KARGO_TAKIP_NO=

# eLogo — dış belge üretilmez
ELOGO_ENABLED=false

# SMS — sabit doğrulama kodu, SMS gönderilmez (6 hane, ekipçe bilinen değer)
SMS_FIXED_VERIFICATION_CODE=246810
# Sabit kod açıkken staging'de NetGSM kimliği istenmez; boş bırakılabilir.
NETGSM_USERCODE=
NETGSM_PASSWORD=
NETGSM_MSGHEADER=
```

Notlar:

- **Sürat stub'ı yalnız staging'de kabul edilir.** `APP_ENV=production`'da
  `SURAT_SOAP_MODE` `rest` olmak zorundadır; hem env doğrulaması hem
  `SuratCargoModule` açılışı durdurur. Staging'de `rest` de geçerlidir (Sürat
  test host'u: `SURAT_KARGO_TEST_MODE=true` + kimlikler), ama o modda da koli
  fiziksel olarak ilerlemez; simülasyon iki modda da aynı çalışır.
- `SURAT_STUB_*` boş kalmalı. `SURAT_STUB_KARGO_TAKIP_NO` doluysa her koli aynı
  sahte taşıyıcı kodunu alır; `SURAT_STUB_THROW` kargo açılışını bilerek
  bozar (yalnız yerel hata testi içindir).
- **Sabit SMS kodu canlıda yasaktır.** `APP_ENV=production` ile verilirse açılış
  durur; erişimci (`config/sms.ts`) de canlıda değeri yok sayar. Açıkken API
  açılışta uyarı loglar: `SMS_FIXED_VERIFICATION_CODE is set: phone verification
uses a FIXED code and sends NO SMS`. Bekleme süresi (60 sn), 3 dakikalık
  geçerlilik, 5 yanlış denemede kilit ve "numara başka hesapta doğrulanmış"
  kuralı değişmez.
- **eLogo'yu denemek gerekirse:** `ELOGO_ENABLED=true`, `ELOGO_SOAP_MODE=live`,
  `ELOGO_SOAP_URL=https://pb-demo.elogo.com.tr/PostboxService.svc` + demo
  kimlikleri. Canlı host (`pb.elogo.com.tr`) staging'de yasaktır.
- E-posta gerçek SMTP'den gider: UAT hesaplarının e-posta adresleri ekibin
  gerçek kutuları olmalı.

---

## 3. Test Araçları (admin → Sistem → Test Araçları)

Yalnız **süper-admin** görür; her işlem audit log'a yazılır
(`test_tools_simulate_shipment`, `test_tools_adjust_time`, `test_tools_run_cron`).
Sayfa başındaki rozet dağıtımı gösterir; staging'de `staging`, canlıda `⚠ PROD`.

### Kargo Simülasyonu

Sipariş no (ORD-…), koli no (PKG-…), iade no, takas no (TKS-…) ya da
takip/taşıyıcı kodu ile ara. Her satır kolinin türünü (sipariş kolisi / iade
kolisi / takas bacağı ve yönü), takip referansını, kargo ve kayıt statüsünü ve
**yalnız gerçek takip hattının hâlâ kabul edeceği** adımları gösterir:

| Tür            | "Kargoya verildi" (Sürat kod 1)                                             | "Teslim edildi" (Sürat kod 6)                                                                                                                                               |
| -------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sipariş kolisi | Koli `picked_up`, `shippedAt`; sipariş `shipped`; alıcıya "kargoya verildi" | Koli `delivered`; sipariş `delivered`, `deliveredAt`, `returnWindowEndsAt`, escrow `releaseAt`; teslim bildirimi + e-posta; gelir faturası outbox'a                         |
| İade kolisi    | İade `return_in_transit`; alıcıya ve satıcıya bildirim, satıcıya e-posta    | İade `return_delivered`, `returnDeliveredAt`; satıcı muayene penceresi başlar                                                                                               |
| Takas bacağı   | `shippedAt`; karşı tarafa "kargoya verildi"                                 | Depoya: ilk varışta iptal kilidi, iki bacak da gelince `at_warehouse`. Yeni sahibine: iki bacak da gelince onay penceresi. İade: tüm iade bacakları çözülünce takas kapanır |

Sipariş kolisinde birim kolidir: aynı PKG'yi paylaşan sipariş satırları
(çok ürünlü paket) cron'daki gibi birlikte ilerler.

Sunulmayan adımlar bilinçlidir: iptal edilmiş / iade edilmiş / tamamlanmış
siparişin kolisi, kapanmış iade talebinin kolisi, kapanmış takasın bacağı ve
terminal (teslim, iade, iptal) koli için adım yoktur; API de böyle bir isteği
gerçek çekirdeğe ulaşmadan reddeder. "Göndericiye iade (kod 12)", taşıyıcı iptali
ve ara statüler (şubede, dağıtımda) simüle edilmez.

**Canlı dağıtımda** (APP_ENV=production) kart yalnız **test şeridi** kolilerini
listeler ve kabul eder (mağaza incelemesi siparişleri). Gerçek bir müşterinin
kolisi canlıda hiçbir koşulda simüle edilemez (403).

Takas teslimi için admin takas detayındaki "depoya ulaştı / teslim edildi /
iade teslim edildi" düğmeleri ayrıca vardır: onlar **operasyon** yoludur (depo
okutması, taşıyıcı haber vermediğinde elle kapatma). UAT'ta taşıyıcı davranışını
test etmek için simülasyonu, depo operasyonunu test etmek için o düğmeleri
kullanın.

### Süre Ayarlama

Tek kaydın süre alanını "şimdi bitir", "X dk sonra" ya da "N gün geri" yapar;
ardından ilgili cron'u **Cron'lar** kartından tetikleyin.

| Tip            | Kaydırılan alan                                                                                                     | Sonra tetiklenecek cron    |
| -------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| İade Penceresi | `Order.returnWindowEndsAt` **ve** held escrow `releaseAt` = pencere sonu + payout grace                             | `process-delivered-orders` |
| Escrow Hold    | Yalnız `PaymentHold.releaseAt` (pencereden önce ödemeyi denemek için)                                               | `payment-release-holds`    |
| Takas          | Statüye göre: yanıt / ödeme / kargo son tarihi; `shipping_to_recipients`'ta onay penceresi (`confirmationDeadline`) | `trade-expired`            |
| Sipariş        | `paymentExpiresAt`                                                                                                  | `payment-expired`          |
| İade           | `RefundRequest.createdAt`                                                                                           | `refund-crons`             |

"İade Penceresi" yalnız teslim edilmiş siparişte çalışır (pencere teslimde
başlar). Takasın onay penceresi iki çıkış kolisi de teslim edilmeden kaydırılamaz.

### Bilinen sınırlar

- **İade muayene penceresi** (`returnInspectionHours`, varsayılan 24 saat) ve
  **takas escrow'u** (`tradeHoldDays`, `TradeCashPayment.holdReleaseAt`) Test
  Araçları'ndan kaydırılamaz. Staging'de **Süreler ve Kurallar**'dan en küçük
  değere (1 saat / 1 gün) indirin ya da iade kararını admin iade ekranından verin.
- **Takip cron'ları stub'da gürültü üretir.** `sync-surat-tracking` (30 dk) ve
  teslim sonrası taramalar canlı-şerit kolileri Sürat'a sormaya devam eder; stub
  modunda kimlik olmadığı için her aktif koli "configuration" hatası olarak
  loglanır ve cron "senkronlanamadı" sayar. Para/statü etkisi yoktur (okuma
  uygulanmaz), yalnız log/alarm gürültüsüdür.
- Payout kapalıdır: `payment-release-holds` hold'u serbest bırakır, PayTR
  transferi oluşmaz.

---

## 4. Senaryolar

Hazırlık (her senaryo için): iki gerçek hesap (alıcı ve satıcı; takasta iki
kullanıcı). Telefon doğrulamasında SMS gelmez — staging'in sabit kodunu girin.
Satıcının çıkış adresi kayıtlı olmalı (yoksa kargo etiketi açılmaz ve satıcıya
"çıkış adresi ekle" bildirimi gider).

### 4.1 Satış (normal ve teklif siparişi)

1. Satıcı ilan verir (moderasyon açıksa admin onaylar).
2. Alıcı ürünü sepete ekler, ödemeye geçer, PayTR **test kartıyla** öder.
   (Teklif siparişi: alıcı teklif verir, satıcı kabul eder, alıcı teklif
   siparişini aynı şekilde öder — sonrası aynıdır.)
   Beklenen: sipariş `paid`/`preparing`, escrow hold oluşur (`releaseAt` boş),
   koli `STUB…` taşıyıcı koduyla `label_created` olarak açılır.
3. Test Araçları → Kargo Simülasyonu → sipariş no ile ara → **Kargoya verildi**.
   Beklenen: koli `picked_up`, sipariş `shipped`, alıcıya "kargoya verildi".
4. **Alıcıya teslim edildi**. Beklenen: sipariş `delivered`, `deliveredAt` dolu,
   sipariş ekranında iade son tarihi (teslim + 14 gün), satıcının ödeme tarihi
   (pencere + 1 gün), alıcıya teslim bildirimi + e-posta.
5. İade penceresini kapat: Süre Ayarlama → **İade Penceresi** → sipariş no →
   **Şimdi bitir**. Beklenen: `returnWindowEndsAt` = şimdi, escrow `releaseAt` =
   şimdi + 1 gün; alıcı artık iade talebi açamaz ("cayma süresi doldu").
6. Cron'lar → `process-delivered-orders` (iade penceresi dolmuş teslim edilmiş
   siparişleri tamamlar; `FEATURE_48H_CONFIRMATION_WINDOW` açıksa önce
   `order-auto-complete`). Beklenen: sipariş `completed`.
7. Süre Ayarlama → **Escrow Hold** → sipariş no → **Şimdi bitir**; Cron'lar →
   `payment-release-holds`. Beklenen: hold `released` (payout kapalı olduğu için
   transfer oluşmaz).

### 4.2 İade

1. 4.1'i 4. adıma kadar yürütün (sipariş teslim edildi, pencere açık).
2. Alıcı siparişten iade talebi açar; politika gerektiriyorsa satıcı/admin
   onaylar. Beklenen: iade etiketi `STUB…` koduyla açılır, talep
   `return_shipment_open`, alıcıya etiket bildirimi + e-posta. (Etiket hemen
   açılmazsa Cron'lar → `refund-crons`.)
3. Kargo Simülasyonu → iade no ya da sipariş no → **İade kargoya verildi**.
   Beklenen: talep `return_in_transit`, alıcıya ve satıcıya bildirim, satıcıya
   "ürün size geliyor" e-postası.
4. **Satıcıya teslim edildi**. Beklenen: talep `return_delivered`,
   `returnDeliveredAt` dolu; satıcının muayene penceresi başlar.
5. Muayene penceresinin dolması: Süreler ve Kurallar'da `returnInspectionHours`'u
   1 saate indirin ve bekleyin (ya da admin iade ekranından kararı verin), sonra
   Cron'lar → `refund-crons`. Beklenen: iade PayTR test modunda yapılır, talep
   `refunded`, escrow hold iade tutarı kadar azalır / kapanır.
6. Negatif: başka bir teslim edilmiş siparişte Süre Ayarlama → İade Penceresi →
   **N gün geri**; alıcının iade talebi reddedilmeli.

### 4.3 Takas (güvenli takas, depo üzerinden)

1. Kullanıcı A, B'nin ilanına takas teklif eder; B kabul eder. Takas
   `awaiting_payment`.
2. İki taraf da kendi ödemesini PayTR test kartıyla yapar. Beklenen: takas
   `shipping_to_warehouse`, iki "depoya" bacağı `STUB…` koduyla açılır.
3. Kargo Simülasyonu → takas no (TKS-…). İki **depoya** bacağı için:
   **Kargoya verildi** (karşı tarafa bildirim; kullanıcı iptali kapanır), sonra
   **Teslim edildi**. Beklenen: ilk varışta iptal kilidi, ikinci varışta takas
   `at_warehouse`, iki tarafa "ürünler depoda" bildirimi, hizmet bedeli
   faturası tetiği (eLogo kapalıysa `pending`).
4. Admin → takas detayı → **İncelemeye al** → **Onayla**. Beklenen: takas
   `shipping_to_recipients`, iki "yeni sahibine" bacağı açılır.
5. Simülasyonda iki **yeni sahibine** bacağı için kabul + teslim. Beklenen:
   ikinci teslimde onay penceresi kurulur (`confirmationDeadline` = +3 gün).
6. Süre Ayarlama → **Takas** → TKS no → **Şimdi bitir** (bu statüde onay
   penceresini kaydırır); Cron'lar → `trade-expired`. Beklenen: takas oto-onayla
   `completed`. Fark ödemesi varsa takas escrow'u `tradeHoldDays` sonra açılır
   (Test Araçları'ndan kaydırılamaz, bkz. §3 sınırlar).
7. Red dalı (ayrı bir takasla, 3. adımdan sonra): admin **Reddet** → takas
   `returning`, iade bacakları açılır; simülasyonda her **iade** bacağı için
   kabul + teslim. Beklenen: tüm iade bacakları çözülünce takas `cancelled`,
   rezervasyonlar çözülür, iade matrisi uygulanır (kargo bedeli iade edilmez).

---

## 5. Sorun giderme

| Belirti                                          | Sebep / çözüm                                                                                       |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Simülasyonda adım yok                            | Koli terminal, sahibi kapanmış ya da takip referansı yok (etiket açılmamış). Kayıt statüsüne bakın. |
| "Bu gönderiye … adımı uygulanamaz"               | Ekran eski; aramayı yenileyin — başka bir yol (cron, admin) koliyi ilerletmiş olabilir.             |
| "Okuma uygulanmadı"                              | Durum makinesi reddetti ya da kayıt eşzamanlı değişti; aramayı yenileyin.                           |
| Canlıda kart boş / 403                           | Beklenen: canlıda yalnız test şeridi kolileri.                                                      |
| Açılış "SMS_FIXED_VERIFICATION_CODE" ile duruyor | `APP_ENV=production`'da sabit kod verilmiş ya da değer 6 rakam değil.                               |
| Açılış "SURAT_SOAP_MODE" ile duruyor             | Staging'de `rest` ya da `stub` dışında bir değer / boş; canlıda `rest` dışı.                        |
