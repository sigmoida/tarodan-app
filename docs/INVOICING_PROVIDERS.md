# e-Belge Sağlayıcıları

Tarodan'ın kestiği her gelir/iade belgesi tek bir alan hattından geçer
(`apps/api/src/modules/elogo/`): kesim, gönderim kirası (lease), deneme bütçesi,
iptal-mi-iade-mi kararı, PDF'in S3'e ve müşteriye teslimi. Bu hat
**entegratörü bilmez**; belgeyi bir sağlayıcı portuna verir. Bugün tek
sağlayıcı eLogo'dur, Logo Netsis (NetOpenX REST) ikincisi olacak.

## Port — `provider/e-invoice-provider.ts`

`EInvoiceProvider`, `E_INVOICE_PROVIDER` token'ıyla enjekte edilir
(`elogo.module.ts` → `ElogoInvoiceProvider`). Delivery, reversal, query ve
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
- Red metnini sınıflar (`helpers/elogo-retry-policy.ts`): numara çakışması
  önce, sonra yapılandırma; fırlatılan hatada ağ sınıfı önce bakılır.
- Numaralandırma `local`'dir.

## Numaralandırma: `local` ve `provider`

- **local (eLogo):** Kayıt kesim anında `ElogoDocSequence`'ten boşluksuz TRD
  numarasıyla açılır (`ElogoDocumentService.allocateDocumentNumberInTransaction`).
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

## Faz 1b — yeniden adlandırma

Faz 1a'da dosya taşınmadı, şema değişmedi. Faz 1b:

- Modül `elogo/` → `invoicing/`; servisler `Invoicing*` adını alır, eLogo'ya
  özgü dosyalar (`elogo.service.ts`, `elogo-soap.client.ts`, UBL üreteci,
  adaptör) `invoicing/providers/elogo/` altına iner.
- Tablo `elogo_invoices` → `fiscal_invoices`; `provider` kolonu eklenir (kayıt
  hangi sağlayıcıyla kesildi). `elogoRefId` / `elogoResultCode` /
  `elogoResultMsg` → `providerRef` / `providerResultCode` / `providerResultMsg`.
- `E_INVOICE_PROVIDER` bağlaması ayarla seçilir; kesilmiş belgenin iptal/iade
  ve PDF işlemleri kaydın kendi `provider`'ıyla yapılır.

Bugün port dışında kalan eLogo adları (bilinçli, Faz 1b işi): tablo/kolon
adları, `ELOGO_*` ortam anahtarları (düzenleyen bilgisi, KDV, önek), S3 klasörü
`elogo-invoices`, e-posta şablonu `elogo-invoice`, log etiketleri.
