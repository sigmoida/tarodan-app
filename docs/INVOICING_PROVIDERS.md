# e-Belge Sağlayıcıları

Tarodan'ın kestiği her gelir/iade belgesi tek bir alan hattından geçer
(`apps/api/src/modules/invoicing/`): kesim, gönderim kirası (lease), deneme bütçesi,
iptal-mi-iade-mi kararı, PDF'in S3'e ve müşteriye teslimi. Bu hat
**entegratörü bilmez**; belgeyi bir sağlayıcı portuna verir. Bugün tek
sağlayıcı eLogo'dur, Logo Netsis (NetOpenX REST) ikincisi olacak.

## Port — `provider/e-invoice-provider.ts`

`EInvoiceProvider`, `E_INVOICE_PROVIDER` token'ıyla enjekte edilir
(`invoicing.module.ts` → `ElogoInvoiceProvider`). Delivery, reversal, query ve
document servisleri yalnız bu arayüzü görür.

| Üye                          | Ne yapar                                                                  |
| ---------------------------- | ------------------------------------------------------------------------- |
| `name`, `numbering`          | `elogo` / `netsis`; numarayı kim veriyor (`local` / `provider`)           |
| `isEnabled()`                | Kapalıyken kayıt `pending` açılır, gönderilmez; cron denemez              |
| `resolveRecipientKind(vkn)`  | GİB mükellefiyeti → `EINVOICE` (+ PK alias) / `EARCHIVE`; hata fırlatılır |
| `send(document, ctx)`        | Kabul (`providerRef`, varsa `documentNumber`) ya da sınıflı red döner     |
| `getStatus(ref, senaryo)`    | `completed` / `processing` / `cancelled` / `failed` / `unknown`           |
| `cancelEArchive(ref)`        | e-Arşiv iptali; ulaşım hatası fırlatılır                                  |
| `fetchPdf(ref)`              | Belgenin PDF'i ya da `null`                                               |
| `eArchiveReversalStrategy()` | Süre içindeyse `CANCEL`, değilse `RETURN_INVOICE` (iade faturası)         |
| `classifyError(err)`         | `network` / `duplicate-number` / `configuration` / `unknown`              |

Girdi `FiscalDocumentInput`'tur: senaryo, yön (`SALE` / `RETURN`), numara,
ETTN, tarih/saat, gönderim şekli, not, düzenleyen ve alıcı tarafları
(`FiscalParty`), kalemler (`FiscalDocumentLine`) ve iade faturasında orijinal
belge referansı. Entegratör sözlüğü (UBL profil adı, SOAP sonuç kodu, XSLT,
ZIP/base64) bu tiplerde yoktur.

**Tutarların tek hesap yeri** `invoice/fiscal-document-totals.ts`'tir. UBL
üreteci belgeyi, teslim katmanı kaydın matrah/KDV/toplam/iskonto kolonlarını aynı
sonuçtan yazar. Yeni bir sağlayıcı kendi toplamını hesaplamaz; belgeye bu
toplamları basar.

Deneme politikası sağlayıcıdan bağımsızdır: `network` bütçe tüketmez (kayıt
`pending` kalır), `configuration` bütçeyi hemen tüketir (alarm görünür),
`duplicate-number` yeni numarayla yeniden dener, `unknown` normal bütçeyle
denenir.

## eLogo adaptörü — `provider/elogo.provider.ts`

Yalnız çeviri yapar, iş kuralı taşımaz:

- Nötr belgeyi UBL-TR'ye çevirir (`ubl/ubl-invoice.builder.ts`):
  `EINVOICE → TEMELFATURA`, `EARCHIVE → EARSIVFATURA`, `RETURN → IADE`.
- `ELOGO_INVOICE_XSLT_UUID` görsel tasarımını gönderime ekler.
- `ElogoService` üzerinden PostBoxService çağırır (oturum, ZIP/base64 ve PDF
  doğrulaması `elogo.service.ts` + `elogo-soap.client.ts`'te kalır).
- SOAP sonucunu port durumuna çevirir: `isCancel` → `cancelled`;
  `status 2` ya da GİB `1300` → `completed`; `status 1` → `processing`.
- Red metnini sınıflar (`provider/elogo-error-patterns.ts`; ağ kalıpları ortak
  `helpers/invoice-retry-policy.ts`'tedir): numara çakışması
  önce, sonra yapılandırma; fırlatılan hatada ağ sınıfı önce bakılır.
- Numaralandırma `local`'dir.

## Numaralandırma: `local` ve `provider`

- **local (eLogo):** Kayıt kesim anında `FiscalDocSequence`'ten boşluksuz TRD
  numarasıyla açılır (`InvoiceDocumentService.allocateDocumentNumberInTransaction`).
  Paylaşımlı hesapta numara çakışırsa yeni numara alınıp yeniden gönderilir.
- **provider (Netsis):** Numarayı ERP gönderimde atar. Kayıt **numarasız**
  açılır, sayaç ilerlemez (kapı `null` döner); numara `send` sonucundaki
  `documentNumber`'dan kayda yazılır. Numara çakışması sınıfı oluşmaz.

Faz 1a yalnız bayrağı ve kapıyı kurar; `provider` akışının teslim tarafı
(numarasız kaydın gönderilmesi, dönen numaranın yazılması, iade faturasında
orijinal numaranın sağlayıcıdan okunması) Netsis adaptörüyle birlikte gelir.

## Planlanan Netsis adaptörü (NetOpenX REST)

| Port üyesi             | NetOpenX karşılığı                                                                                                                                    |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| oturum                 | `token` ucu → bearer; süresi dolunca yenilenir (eLogo oturumu gibi)                                                                                   |
| `send`                 | `ARPs` (cari kartı VKN/TCKN ile bul/oluştur) → `Items` (hizmet/stok kartı) → `ItemSlips` (satış ya da iade faturası fişi) → `EDocument/SendEDocument` |
| `getStatus`            | `EDocument/CheckEDocument`                                                                                                                            |
| `cancelEArchive`       | `EDocument/EArchiveCancellationInvoice`                                                                                                               |
| `resolveRecipientKind` | ERP'nin GİB mükellef sorgusu                                                                                                                          |
| `fetchPdf`             | ERP'nin belge görüntüsü                                                                                                                               |
| `numbering`            | `provider`                                                                                                                                            |

`eArchiveReversalStrategy` yasal 8 günlük iptal penceresidir; bugün
`ElogoService.refundStrategy`'de durur. Netsis adaptörü yazılırken bu kural
paylaşılan bir yardımcıya taşınmalı, kopyalanmamalı.

## Kayıt — `FiscalInvoice` (`fiscal_invoices`)

Belge kaydı sağlayıcıdan bağımsızdır. `provider` kolonu
(`EInvoiceProviderName`: `elogo` / `netsis`) belgeyi KESEN sağlayıcıyı tutar;
kesim (`InvoiceDeliveryService.cut`) ve iade faturası
(`InvoiceReversalService`) kaydı portun `name`'iyle açar. Port tipi
`EInvoiceProviderName` bu enum'dan türer, yeni bir sağlayıcı önce şemaya
eklenir. Kolon eklenmeden önceki kayıtların hepsi eLogo'yla kesildiği için
varsayılan `elogo`'dur.

Sağlayıcının belgeye verdiği referans ve son sonucu `providerRef` /
`providerResultCode` / `providerResultMsg` kolonlarındadır. Admin fatura
listesi sonucu `resultMsg` adıyla, sağlayıcıyı `provider` olarak döner ve
"Sağlayıcı" kolonunda rozet olarak gösterir; detay dökümü (Excel) künyeye
"e-Belge Sağlayıcısı" satırını yazar.

## Faz 1b — yeniden adlandırma (yapıldı)

Davranış değişmedi; yalnız sağlayıcıdan bağımsız olan her şey eLogo adını
bıraktı. eLogo adını yalnız adaptör taşır: `provider/elogo.provider.ts`,
`provider/elogo.types.ts`, `provider/elogo-error-patterns.ts`,
`elogo.service.ts`, `elogo-soap.client.ts`, `ubl/*` ve `config/elogo.ts`.

| Eski                                                                 | Yeni                                                                    |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `modules/elogo/`, `ElogoModule`                                      | `modules/invoicing/`, `InvoicingModule`                                 |
| `elogo-invoicing.service.ts` / `ElogoInvoicingService`               | `invoicing.service.ts` / `InvoicingService` (metot adları aynı)         |
| `elogo-issuing` / `-delivery` / `-reversal` / `-document` / `-query` | `invoice-issuing` / `-delivery` / `-reversal` / `-document` / `-query`  |
| `elogo-invoice.controller.ts` / `ElogoInvoiceController`             | `invoicing.controller.ts` / `InvoicingController` (yol aynı)            |
| `jobs/elogo-scheduler.service.ts`, `jobs/elogo-scheduled.processor`  | `jobs/invoice-scheduler.service.ts`, `jobs/invoice-scheduled.processor` |
| `helpers/elogo-retry-policy.ts`                                      | `helpers/invoice-retry-policy.ts` + `provider/elogo-error-patterns.ts`  |
| `helpers/elogo-write-conflict.ts`, `helpers/elogo-pdf.ts`            | `helpers/invoice-write-conflict.ts`, `helpers/invoice-pdf.ts`           |
| `helpers/elogo.types.ts`                                             | `provider/elogo.types.ts`                                               |
| `invoice/elogo-document-number.ts`, `invoice/elogo-guest-recipient`  | `invoice/document-number.ts`, `invoice/guest-recipient.ts`              |
| `ELOGO_MAX_SEND_ATTEMPTS`, `isTransientElogoFailure`                 | `INVOICE_MAX_SEND_ATTEMPTS`, `isTransientInvoiceFailure`                |
| `formatElogoInvoiceNumber`, `ELOGO_NUMBER_LENGTH`                    | `formatInvoiceNumber`, `INVOICE_NUMBER_LENGTH`                          |
| `ElogoInvoice` / `elogo_invoices`                                    | `FiscalInvoice` / `fiscal_invoices`                                     |
| `ElogoInvoiceType` / `Context` / `Status`                            | `FiscalInvoiceType` / `Context` / `Status`                              |
| `ElogoDocSequence` / `elogo_doc_sequences`                           | `FiscalDocSequence` / `fiscal_doc_sequences`                            |
| `elogoRefId` / `elogoResultCode` / `elogoResultMsg`                  | `providerRef` / `providerResultCode` / `providerResultMsg`              |
| —                                                                    | `provider` (`EInvoiceProviderName`, varsayılan `elogo`)                 |

Migration: `20261012120000_fiscal_invoices_rename` — tablo, enum, kolon, kısıt
ve indeks adlarını Prisma'nın varsayılan adlarına çevirir, `provider`'ı ekler;
her eski adın karşılığı `helpers/fiscal-invoices-migration.spec.ts`'te
sabitlenmiştir. Dağıtım notu: `OPERATIONS.md`.

### Faz 5 — bilinçli olarak eski adıyla kalanlar

Bunlar saklanan veriye, yayındaki istemcilere ya da dış sistemlere bağlıdır;
adlarını değiştirmek bir taşıma ya da ops adımı ister, kozmetik olduğu için
ayrı bir fazda yapılır:

- Yollar `/elogo/invoices*` — mobil sözleşme; Swagger etiketi `elogo-invoices`.
- Cron kimliği `elogo-retry-pending` — Bull repeatable anahtarı ve Sentry
  check-in'i.
- `ELOGO_*` ortam anahtarları — eLogo sağlayıcısını yapılandırırlar.
- i18n anahtarları `server.elogo.*`, `server.notification.elogoInvoiceExhausted`.
- S3 klasörü `elogo-invoices/` ve dosya kaydı türü `elogo_invoice`
  (`helpers/invoice-pdf.ts` → `INVOICE_PDF_STORAGE`).
- E-posta şablonu `elogo-invoice` (admin'den düzenlenen DB kaydının anahtarı).
- Bildirim türü `ELOGO_INVOICE_EXHAUSTED` (`elogo_invoice_exhausted`) ve
  tekilleştirme anahtarı `elogo-exhausted:<id>`.
- Silinen hesap kimlik arşivindeki kaynak `elogo_invoice` ve ref anahtarı
  `elogoInvoiceId` (`deleted_user_identities` satırlarında saklı).
- Log metinleri (`eLogo …`) ve cron kataloğundaki etiket/açıklama.
- Bakım script'lerinin adları (`backfill-elogo-invoice-parties`,
  `reissue-demo-elogo-invoices`, `elogo-smoke`) ve paket script'leri.

### Sonraki adım (Netsis adaptörüyle)

- `E_INVOICE_PROVIDER` bağlaması ayarla seçilir.
- Kesilmiş belgenin iptal/iade ve PDF işlemleri kaydın kendi `provider`'ıyla
  yapılır (bugün tek bağlama olduğu için port doğrudan kullanılıyor).
