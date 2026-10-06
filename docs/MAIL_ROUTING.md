# Mail Yönlendirme (Mail routing)

Hangi e-posta hangi posta kutusundan çıkar ve hangi operasyon olayı hangi
personele e-posta olarak gider — **Sistem → Mail Yönlendirme** ekranından,
deploy gerektirmeden yönetilir. Belgenin ilk yarısı API ile admin ekranı
arasındaki sözleşmedir (değiştirmeden aktarıldı); ikinci yarısı ("Nasıl
çalışır") uygulamayı anlatır.

| Katman                    | Yer                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------- |
| Sözleşme tipleri          | `packages/types/src/mail-routing.ts`                                                  |
| Şablon → alan eşlemesi    | `apps/api/src/common/email/email-template-registry.ts` (`area` alanı)                 |
| Gönderen çözümü (okuma)   | `apps/api/src/modules/mail/` (`SmtpProvider`, `MailRoutingDirectory`, şifre anahtarı) |
| Admin yazma + bildirimler | `apps/api/src/modules/mail-routing/` (@Global)                                        |
| Admin uçları + denetim    | `apps/api/src/modules/admin/ops/admin-mail-routing.*`                                 |
| Tablolar                  | `mail_sender_accounts`, `mail_area_settings`, `mail_internal_notices`                 |

## Sözleşme (2026-10-06)

Owner decisions (2026-10-06):

- Outbound mail of each AREA is sent from its own mailbox. The mailboxes already exist on the mail host; the admin enters each mailbox's address + password in the panel ("sender accounts") and assigns an account to each area. An area without an account, or whose account fails, falls back to the default identity (env `MAIL_FROM`/`SMTP_*`, today's behaviour).
- Certain operational events also arrive as an email in a staff mailbox ("internal notifications"). Each area has a recipient list (any number of addresses: the area's own mailbox such as siparis@tarodan.com.tr plus people such as serhat@tarodan.com.tr). One person can be on many areas: that is the "grouping" the owner asked for.
- Per internal event the admin chooses: enabled or not, and delivery mode `instant` | `hourly` | `daily` (digest).
- Only super admins may change anything; every change is audit-logged.

## Types — file `packages/types/src/mail-routing.ts`, exported from the package index (API agent creates it EXACTLY like this; admin agent imports, never creates)

```ts
export const MAIL_AREAS = [
  "account",
  "order",
  "cancellation",
  "refund",
  "trade",
  "offer",
  "payment",
  "invoice",
  "membership",
  "listing",
  "discount",
  "boost",
  "ad",
  "support",
  "guestMessage",
  "report",
  "sellerApplication",
  "marketing",
  "social",
] as const;
export type MailAreaId = (typeof MAIL_AREAS)[number];

export const MAIL_DELIVERY_MODES = ["instant", "hourly", "daily"] as const;
export type MailDeliveryMode = (typeof MAIL_DELIVERY_MODES)[number];

/** Operational events that can be mailed to staff. `area` decides the recipient list. */
export const MAIL_INTERNAL_EVENTS = {
  "order.paid": { area: "order" },
  "order.cancelled": { area: "cancellation" },
  "refund.requested": { area: "refund" },
  "trade.started": { area: "trade" },
  "trade.disputed": { area: "trade" },
  "offer.converted": { area: "offer" },
  "support.ticketOpened": { area: "support" },
  "support.guestMessage": { area: "guestMessage" },
  "report.productReported": { area: "report" },
  "listing.pendingApproval": { area: "listing" },
  "discount.createdBySeller": { area: "discount" },
  "boost.purchased": { area: "boost" },
} as const satisfies Record<string, { area: MailAreaId }>;
export type MailInternalEventId = keyof typeof MAIL_INTERNAL_EVENTS;

export interface MailSenderAccountView {
  id: string;
  address: string; // mailbox, e.g. siparis@tarodan.com.tr (unique, lower-cased)
  displayName: string; // "Tarodan Sipariş"
  host: string | null; // null = use the default SMTP host/port/secure from env
  port: number | null;
  secure: boolean | null;
  username: string; // SMTP login; defaults to the address
  hasPassword: boolean; // the password itself is NEVER returned
  lastTestAt: string | null;
  lastTestOk: boolean | null;
  lastTestError: string | null;
  usedByAreas: MailAreaId[];
}

export interface MailInternalEventState {
  id: MailInternalEventId;
  enabled: boolean;
  delivery: MailDeliveryMode;
}

export interface MailAreaState {
  id: MailAreaId;
  /** Customer-facing template keys that belong to this area (read-only, from the registry). */
  templateKeys: string[];
  senderAccountId: string | null;
  /** Overrides the account's display name for this area; null = account's own. */
  displayName: string | null;
  /** Reply-To for this area's customer mail; null = the sender address. */
  replyTo: string | null;
  /** Staff recipients of this area's internal notifications. */
  internalRecipients: string[];
  events: MailInternalEventState[];
}

export interface MailRoutingState {
  defaultFrom: string; // resolved env identity, for display
  accounts: MailSenderAccountView[];
  areas: MailAreaState[]; // one per MAIL_AREAS entry, in that order
}

export interface MailSenderAccountInput {
  address: string;
  displayName: string;
  host?: string | null;
  port?: number | null;
  secure?: boolean | null;
  username?: string | null;
  /** Required on create; omit on update to keep the stored one. */
  password?: string;
}

export interface MailAreaUpdate {
  senderAccountId?: string | null;
  displayName?: string | null;
  replyTo?: string | null;
  internalRecipients?: string[];
  events?: Array<{
    id: MailInternalEventId;
    enabled: boolean;
    delivery: MailDeliveryMode;
  }>;
}

export interface MailAccountTestResult {
  ok: boolean;
  error: string | null;
}
```

## Admin endpoints (all under the existing admin auth; super_admin only)

- `GET    /admin/mail-routing` → `MailRoutingState`
- `POST   /admin/mail-routing/accounts` body `MailSenderAccountInput` → `MailSenderAccountView`
- `PATCH  /admin/mail-routing/accounts/:id` body `Partial<MailSenderAccountInput>` → `MailSenderAccountView`
- `DELETE /admin/mail-routing/accounts/:id` → 204; 409 when an area still uses it
- `POST   /admin/mail-routing/accounts/:id/test` body `{ to: string }` → `MailAccountTestResult` (really sends one test mail through that account and records lastTest*)
- `PATCH  /admin/mail-routing/areas/:areaId` body `MailAreaUpdate` → `MailAreaState`

Validation errors are 400 with the repo's usual i18n message shape. Email addresses are validated and lower-cased; `internalRecipients` max 20 per area, de-duplicated.

## i18n key namespace (both catalogs, identical key sets)

- API agent owns `server.mailRouting.*` (error messages) and the internal notification mail subjects/bodies.
- Admin agent owns `admin.mailRouting.*`, including `admin.mailRouting.areas.<MailAreaId>`, `admin.mailRouting.events.<event id with the dot replaced by an underscore>`, `admin.mailRouting.delivery.<mode>`, and the nav item `admin.nav.items.mailRouting.{name,description,keywords}`.

### Sözleşmeden sapmalar / eklemeler (API tarafı)

- **Ek tablo `mail_internal_notices`.** Sözleşme iki tablo sayıyor; saatlik /
  günlük özetler olayları bir yerde biriktirmek zorunda. Admin yüzeyini
  etkilemez (hiçbir uçta dönmez).
- **`MAIL_ACCOUNT_ENCRYPTION_KEY` yokken hesap oluşturma 503** döner
  (`server.mailRouting.encryptionKeyMissing`): bu bir doğrulama hatası değil,
  sunucu yapılandırma eksiği.
- **`DELETE` 409** gövdesi `server.mailRouting.accountInUse` ve kullanan alan
  kimliklerini (`{areas}`) taşır.
- **Okuma / yazma ayrımı** (Süreler ve Kurallar ile aynı): `GET` her admin
  rolüne açıktır ve asıl kapı izin matrisidir (segment `mail-routing` →
  `settings`; super_admin her zaman geçer) — ekranın salt-okunur görünümü
  buna dayanır. Bütün değişiklikler ve test gönderimi yalnız super_admin.
  Okuma yanıtında sır yoktur: şifre ve şifreli hali dönmez (`hasPassword`).
- **Ortak kurallar `@tarodan/types`te**: `MAIL_DISPLAY_NAME_MAX_LENGTH` (100),
  `MAIL_INTERNAL_RECIPIENTS_MAX` (20), `isValidMailDisplayName` — kırpılmış
  değer boş olmamalı, en çok 100 karakter, ve CR, LF, `"`, `<`, `>`, `\`
  içermemeli. API ve admin formu aynı fonksiyonu çağırır.
- **Kullanıcı adı adresi izler**: güncelleme adresi değiştirip kullanıcı adı
  taşımıyorsa ve kayıtlı kullanıcı adı eski adresle aynıysa, kullanıcı adı yeni
  adrese geçer (yoksa kutu eski kullanıcıyla oturum açıp yeni adresten
  gönderir, sunucu MAIL FROM'u reddeder).
- `POST …/test` ayrıca `@Throttle` 10/dk (gerçek SMTP oturumu açar).

## Nasıl çalışır

### Alanlar ve şablonlar

Müşteriye giden her şablon (`EMAIL_TEMPLATE_DEFINITIONS`) TAM bir alana
bağlıdır; eşlemenin tek yeri kayıttaki `area` alanıdır, alanı olmayan şablon
tip denetiminden ve `email-template-registry.spec.ts`'ten geçmez. Kayıttaki
"Sipariş" grubundan dört iptal şablonu ayrıldı ("İptal" grubu, `cancellation`
alanı). Şablonu olmayan alanlar (`discount`, `boost`, `ad`, `support`,
`guestMessage`) yalnız iç bildirimler ya da açıkça alan veren gönderimler için
vardır.

| Alan                | Şablonlar                                                                                                                                                                                                                                                                                                       |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `account`           | welcome, email-verification, password-reset, email-change-otp, site-access-invite                                                                                                                                                                                                                               |
| `order`             | order-confirmation, order-created-buyer, order-created-seller, order-paid, order-paid-group, order-paid-seller, order-shipped, order-delivered, order-preparing-extended-buyer, guest-checkout-otp                                                                                                              |
| `cancellation`      | order-cancelled-buyer, order-cancelled-seller, order-cancelled-by-platform-buyer, order-cancelled-by-platform-seller                                                                                                                                                                                            |
| `refund`            | payment-refunded, payment-refunded-seller, seller-did-not-ship-refunded, refund-requested-seller, refund-approved-buyer, refund-rejected-buyer, refund-return-label-buyer, refund-completed, refund-request-received-buyer, refund-return-incoming-seller, refund-completed-seller, refund-auto-accepted-seller |
| `trade`             | trade-received, trade-accepted, trade-shipped, trade-completed, trade-cancelled-platform                                                                                                                                                                                                                        |
| `offer`             | offer-received, offer-accepted                                                                                                                                                                                                                                                                                  |
| `payment`           | payment-received, payment-failed, payout-released-seller, payout-returned-seller, payout-failed-seller                                                                                                                                                                                                          |
| `invoice`           | elogo-invoice, seller-invoice (+ şablon kaydında olmayan seller-invoice-reminder, `area: "invoice"` ile)                                                                                                                                                                                                        |
| `membership`        | premium-offer, membership-expiring, membership-expiring-urgent                                                                                                                                                                                                                                                  |
| `listing`           | product-approved, wishlist-price-change, back-in-stock, listing-expiring, listing-expired                                                                                                                                                                                                                       |
| `report`            | report-resolved                                                                                                                                                                                                                                                                                                 |
| `sellerApplication` | seller-application-approved, seller-application-rejected, seller-document-revision                                                                                                                                                                                                                              |
| `marketing`         | marketing-newsletter, marketing-monthly (+ şablonsuz toplu duyurular, `area: "marketing"`)                                                                                                                                                                                                                      |
| `social`            | review-received-seller, new-follower                                                                                                                                                                                                                                                                            |

### Gönderen çözümü (müşteri postası)

`SmtpProvider` tek transport olarak kalır (başlık yorumu nedenini anlatır).
Her gönderimde:

1. **Alan:** `options.area` verilmişse o, yoksa `template` anahtarının alanı.
   İkisi de yoksa (ad hoc bildirimler) **varsayılan kimlik**.
2. **Hesap:** alanın `senderAccountId`'si. Yoksa varsayılan kimlik
   (`MAIL_FROM` + `SMTP_*`), alanın Reply-To'su yine uygulanır.
3. **From:** `"<alanın görünen adı ya da hesabın adı>" <hesap adresi>`.
   Posta sunucusu From'un oturum kullanıcısıyla aynı olmasını şart koştuğu
   için hesap **kendi SMTP oturumuyla** gönderir: `SmtpProvider` içinde hesap
   başına tembel kurulan bir oturum havuzu vardır; bağlantı alanları (host,
   port, secure, kullanıcı, şifreli şifre) değişince oturum yeniden kurulur,
   hesap silinince kapatılır (aynı süreçte hemen, diğer süreçlerde bir
   sonraki gönderimde). Host/port/secure boşsa env'deki varsayılanlar; TLS
   politikası (SMTP_TLS_*, SMTP_MIN_TLS_VERSION, SMTP_IGNORE_TLS) her oturumda
   aynıdır.
4. **Reply-To:** çağıran verdiyse o (misafir mesajında misafir), yoksa alanın
   `replyTo`'su, o da yoksa başlık eklenmez.
5. **EmailLog.from** gerçekten kullanılan kimliği yazar.

Yönlendirme okuması 30 sn önbelleklidir; admin yazımı aynı süreçte önbelleği
hemen boşaltır, diğer süreç (web ↔ worker) en geç 30 sn'de görür. Okuma
hatası e-postayı düşürmez: varsayılan kimlik kullanılır.

**Hesap hatası → varsayılan kimlik.** Hesabın oturumu reddedilirse
(`EAUTH`), sunucuya bağlanılamazsa (`ECONNECTION`, `ETIMEDOUT`, `ETLS`,
`ESOCKET`, DNS…), sunucu From'u reddederse (`MAIL FROM` komutu) ya da şifre
çözülemezse (anahtar yok/değişti): e-posta **varsayılan kimlikle yeniden
gönderilir**, olay loglanır, hesaba `lastTestOk=false` + hata metni yazılır
(admin ekranında görünür), EmailLog satırı `metadata.senderFallbackFrom`
taşır ve hesap bu süreçte **5 dk** denenmez (her e-postada bağlantı zaman
aşımı beklenmesin). Bağlantı ayarı değişince ya da admin testi başarılı
olunca soğuma biter. Alıcı reddi (`RCPT TO`) ve içerik reddi hesap hatası
sayılmaz: yeniden gönderilmez, başarısız döner. Hesap oturumlarının bağlantı
zaman aşımı 15 sn'dir.

**Sağlık işareti.** "Hatalı" işaretli (`lastTestOk=false`) bir kutudan
başarılı bir gerçek gönderim işareti kaldırır — yalnız o geçişte, koşullu
yazımla (`lastTestOk = false` olan satır); sağlıklı kutunun gönderimleri hiçbir
şey yazmaz. Admin test gönderiminde de yalnız kutuya ait sonuç (başarı ya da
oturum/bağlantı/TLS/DNS/MAIL FROM/şifre hatası) sağlığı yazar; alıcı ya da
içerik reddi çağırana `ok:false` + hata metni olarak döner, kutunun sağlık
kaydına dokunulmaz.

`List-Unsubscribe` başlıkları ve satır sonu (CRLF) savunmaları değişmedi:
görünen ad tırnak / `<>` / satır sonu içeremez, adresler `class-validator`
`isEmail` ile doğrulanır, From nodemailer'a adres nesnesi olarak verilir.

### Şifre

Hesap şifresi `MAIL_ACCOUNT_ENCRYPTION_KEY` ile AES-256-GCM şifreli saklanır
(ortak yardımcı `common/security/secret-cipher.ts`; 2FA sırları aynı
yardımcıyı kendi anahtarıyla kullanır). Şifre hiçbir yanıtta (yalnız
`hasPassword`), logda ya da denetim kaydında yer almaz; şifre değişimi
denetimde yalnız `passwordChanged: true` olarak görünür. Canlıda anahtar
yokken hesap kaydedilemez (503) ve kayıtlı hesaplar varsayılan kimliğe düşer.
Canlı dışında boş anahtar `JWT_SECRET`'a düşer. **Anahtarı döndürmek** kayıtlı
şifreleri okunamaz yapar: etkilenen alanlar varsayılan kimliğe düşer, her
hesabın şifresi panelden yeniden girilmelidir.

### İç bildirimler (personel postası)

```
iş olayı (commit SONRASI) ─► MailInternalNotifier.emit(eventId, notice, {isTest, dedupeKey})
              │  test şeridi → bırak; olay kapalı / alıcı yok → bırak (önbellekli ön eleme)
              ▼
         outbox_events (type mail.internal_event, dedupe: eventId + iş anahtarı)
              ▼  drainer (dakikada bir, commit SONRASI)
         MailInternalDeliveryService.handleEvent
              │  ayar yeniden okunur → mail_internal_notices satırı (outbox olay kimliğiyle tekil)
              ├─ instant  → alanın kutusundan alanın alıcılarına TEK e-posta → sentAt
              └─ hourly / daily → bekler
         mail-digest-hourly (her saat başı) / mail-digest-daily (09:00 Europe/Istanbul)
              └─ alan başına özet e-postaları (her biri en çok 200 olay, kuyruk boşalana ya da
                 koşu başına 20 e-postaya kadar), satırlar sahiplenilir; saatlik koşu
                 15 dk'dan eski, gönderilmemiş anlık satırları (outbox denemeleri tükenmiş) da toplar
```

- İş işlemi SMTP'yi **hiç beklemez**; e-posta hatası işlemi **hiç bozmaz**.
  `emit` her yerde commit SONRASI çağrılır ve fırlatmaz; açık bir işlemin
  içinde ek sorgu ya da ikinci bağlantıdan ayar okuması yapılmaz.
- **Olay varsayılanları** (tek yer: `defaultMailEventState`): her olay
  kapalı + anlık; tek istisna `support.guestMessage` — **açık + anlık**, çünkü
  bu e-posta Mail Yönlendirme'den önce de her zaman gidiyordu. Admin açıkça
  kapatabilir.
- Alanın alıcısı yoksa olay sessizce bırakılır. **İstisna — misafir mesajı:**
  `guestMessage` alanına alıcı girilmediği sürece misafir iletişim mesajı eski
  adrese, `SUPPORT_NOTIFICATION_EMAIL`'e (yoksa `destek@tarodan.com.tr`)
  gider. Alıcı eklemek e-postayı kesmez, yönünü alıcılara çevirir.
- Özet işi, olay anında seçili teslim moduyla saklanan satırları gönderir
  (sonradan mod değişirse bekleyen satır taşınmaz). Gönderim anında alanın
  alıcısı kalmamışsa birikmiş satırlar bırakılır. Başarısız gönderimde
  sahiplenme bırakılır, iş "başarısız" görünür ve bir sonraki koşu yeniden
  dener; 30 dk'dan eski yarım sahiplenmeler geri alınır. Birikmiş kuyruk aynı
  koşuda boşaltılır (alan başına en çok 20 e-posta × 200 olay; sınır dolarsa
  loglanır, kalan sonraki koşuya kalır). Outbox denemeleri tükenmiş anlık
  satırlar (15 dk'dan eski, gönderilmemiş) saatlik özete katılır. Günlük koşu
  90 günden eski satırları siler — gönderilmemiş olanlar dahil.
- Her e-posta: iş numaralı kısa konu, birkaç olgu (kim, tutar — e-posta
  şablonlarıyla aynı `formatEmailPrice`, durum), admin panelinde ilgili
  sayfaya link (`ADMIN_URL`). **Kimlik no, IBAN, tam adres ve mesaj gövdesi
  girmez**; serbest metin en çok 200 karakterlik alıntıdır. Metinler
  `server.mailRouting.internal.*` katalog anahtarlarındandır (Türkçe).
- Test şeridi (`isTest` sipariş/takas, `isTestAccount` kullanıcı) bildirilmez.

| Olay                       | Nerede (commit sonrası, aksi belirtilmedikçe)                                                                                                                                                                                                                                                                                                                   | Tekilleştirme            | Panel linki                |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | -------------------------- |
| `order.paid`               | `PaymentFulfillmentService` — sepet ödemesi (`processSuccessfulGroupPayment`, sepet başına tek e-posta, siparişler listelenir) ve grupsuz fiziksel sipariş (teklif siparişi)                                                                                                                                                                                    | sepet (yoksa sipariş) id | sipariş / sipariş listesi  |
| `order.cancelled`          | Ödenmemiş: `OrderLifecycleService.notifyStaffUnpaidCancelled`, iptal işlemi bittikten sonra çağıranlarda (`cancel` — alıcı, misafir, sepet; `AdminOrderCancelService.cancelUnpaid` — yönetici). Ödenmiş: `PaymentRefundService.processRefund` siparişi kapattığında (alıcı kargo öncesi iptal, yönetici iptali, stok kaskadı, kargolamama cron'u, ödeme yarışı) | sipariş id               | sipariş                    |
| `refund.requested`         | `RefundNotificationService.notifyRefundRequestOpened` — kalıcı iade talebinin tek açılış noktası (inceleme gerektiren iptal/iade + teslim sonrası iade)                                                                                                                                                                                                         | iade numarası            | iade talebi                |
| `trade.started`            | `TradeLifecycleService.acceptTrade`                                                                                                                                                                                                                                                                                                                             | takas numarası           | takas                      |
| `trade.disputed`           | `TradeLifecycleService.raiseDispute`                                                                                                                                                                                                                                                                                                                            | takas numarası           | takas                      |
| `offer.converted`          | `OfferService.accept` (teklif kabul → sipariş)                                                                                                                                                                                                                                                                                                                  | sipariş numarası         | teklif                     |
| `support.ticketOpened`     | `SupportService.createTicket`                                                                                                                                                                                                                                                                                                                                   | talep numarası           | destek talebi              |
| `support.guestMessage`     | `SupportService.createGuestContact` (eski `sendGuestContactAdminEmail` kaldırıldı)                                                                                                                                                                                                                                                                              | referans numarası        | Destek → Misafir mesajları |
| `report.productReported`   | `UserReportService.createReport` (yalnız `product` türü)                                                                                                                                                                                                                                                                                                        | şikayet id               | şikayet                    |
| `listing.pendingApproval`  | `emitListingPendingApproval` (product/helpers): oluşturma (AI görsel denetimi yoksa), AI moderasyon işinin kuyrukta bıraktığı ilan, düzenleme sonrası yeniden onay, yeniden açma, yenileme — ilan gönderimde hâlâ `pending` değilse (oto-onay) bildirilmez                                                                                                      | ilan + giriş anı         | ilan                       |
| `discount.createdBySeller` | `DiscountCrudService.create` (`isAdmin=false`; admin indirimleri bildirilmez)                                                                                                                                                                                                                                                                                   | indirim id               | İndirimler                 |
| `boost.purchased`          | `PaymentFulfillmentService` — öne çıkarma ödemesi tamamlanınca                                                                                                                                                                                                                                                                                                  | sipariş numarası         | öne çıkarma satın alımı    |

Bilinçli kapsam dışı: ödeme süresi dolan (hiç ödenmemiş) siparişlerin sistem
iptali `order.cancelled` olarak bildirilmez — terk edilmiş ödeme ekranıdır,
personel için gürültü.

### Operasyon

- Göç: `20261006110000_mail_routing` (yalnız ekleme, tohum yok) →
  `prisma migrate deploy`.
- Canlı: ilk hesap eklenmeden **önce** `MAIL_ACCOUNT_ENCRYPTION_KEY`
  (32+ karakter, diğer sırlardan farklı) tanımlanmalı.
- `ADMIN_URL` personel postalarındaki linklerin tabanıdır (yoksa canlıda
  `https://admin.tarodan.com.tr`).
- Hiçbir şey ayarlanmazsa davranış bugünküyle aynıdır: her e-posta
  `MAIL_FROM`'dan, misafir mesajı `SUPPORT_NOTIFICATION_EMAIL`'e, başka iç
  bildirim yok.
