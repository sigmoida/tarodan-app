# e-Belge Sağlayıcıları

Tarodan'ın kestiği her gelir/iade belgesi tek bir alan hattından geçer
(`apps/api/src/modules/invoicing/`): kesim, gönderim kirası (lease), deneme bütçesi,
iptal-mi-iade-mi kararı, PDF'in S3'e ve müşteriye teslimi. Bu hat
**entegratörü bilmez**; belgeyi bir sağlayıcı portuna verir. İki sağlayıcı
var: eLogo (doğrudan özel entegratör) ve Logo Netsis (ERP, NetOpenX REST).

## Port — `provider/e-invoice-provider.ts`

`EInvoiceProvider`, `E_INVOICE_PROVIDER` token'ıyla enjekte edilir. Bağlama
`INVOICE_PROVIDER` ortam anahtarıyla seçilir (`config/invoice-provider.ts`:
`elogo` varsayılan | `netsis`) ve yalnız **yeni kesimleri** belirler.
Kesilmiş bir kaydın gönderim/durum/iptal/PDF işlemleri kaydın kendi
`provider` kolonundaki sağlayıcıda yapılır: `provider/provider-registry.ts`
(`InvoiceProviderRegistry` + `providerForRecord`) iki adaptörü de kayıtlı
tutar; delivery, reversal ve query kayıt başına oradan çözer. Netsis'e
geçildikten sonra bir eLogo belgesinin iptali yine eLogo'ya gider; bu yüzden
eski belgeler varken eLogo yapılandırması kaldırılmaz. Delivery, reversal,
query ve document servisleri yalnız bu arayüzü görür.

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

Gönderim bağlamı (`EInvoiceSendContext`) nötrdür, alanların hepsi isteğe
bağlıdır ve sağlayıcı ihtiyaç duymadığını yok sayar: `recipientAlias` (PK
etiketi), `existingProviderRef` (kaydın `providerRef`'i — doluysa belge
sağlayıcıda zaten oluşmuştur), `invoiceType`, `recipientUserId`,
`sourceReference`. eLogo yalnız alias'ı okur.

Red sonucu (`accepted: false`) `providerRef` / `documentNumber` da
taşıyabilir: belge sağlayıcıda OLUŞTU ama gönderilemedi. Teslim katmanı ikisini
kayda yazar, sonraki deneme `existingProviderRef` ile yalnız gönderir. Böyle
bir red `network` sınıfındaysa fırlatılan ağ hatası gibi bütçe tüketmez.

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
- İptal-mi-iade-mi kararı (`eArchiveReversalStrategy`) paylaşılan yardımcıdan
  gelir — bkz. aşağıda.

## Numaralandırma: `local` ve `provider`

- **local (eLogo):** Kayıt kesim anında `FiscalDocSequence`'ten boşluksuz TRD
  numarasıyla açılır (`InvoiceDocumentService.allocateDocumentNumberInTransaction`).
  Paylaşımlı hesapta numara çakışırsa yeni numara alınıp yeniden gönderilir.
- **provider (Netsis):** Numarayı ERP atar. Teslim katmanı
  (`InvoiceDeliveryService`) bu akışta şunları farklı yapar; eLogo yolu
  aynı çağrı ve yazımlarla kalır:
  - Kesim kaydı **numarasız** açar, sayaç ilerlemez (kapı `null` döner).
  - Belge sağlayıcıya numarasız gider; kabulde `documentNumber`,
    `providerRef` ve — sağlayıcı kendi ETTN'ini döndürdüyse — `ettn` kayda
    yazılır (GİB'deki kimlik ERP'nin ETTN'idir; bizimki değiştirilir).
  - Red `providerRef` taşıyorsa (fiş oluştu, e-belge gitmedi) referans ve numara
    kayda yazılır; sonraki deneme `existingProviderRef` ile yalnız gönderir ve
    alıcının senaryosunu yeniden çözmez (fiş o senaryoyla oluştu).
  - Yerel numara çakışması döngüsü çalışmaz; `duplicate-number` sıradan red
    gibi işlenir.
  - e-Fatura alıcısı için PK etiketi zorunlu tutulmaz (ERP kendi carisinin
    etiketine yollar).
  - Fırlatılan hatada numara kolonuna dokunulmaz.
  - PDF/e-posta yalnız numara yazıldıktan sonra yapılır.

  `invoice_number` kolonu ilk göçten beri NULL'a izin verir; yeni göç gerekmedi.
  `helpers/fiscal-invoice-number-nullable.spec.ts` bunu sabitler.

## İptal mi iade faturası mı — `helpers/earchive-reversal-strategy.ts`

Yasal kural (kesilmiş e-Arşiv ≤ 8 gün → İPTAL, sonrası → İADE FATURASI)
sağlayıcıdan bağımsızdır ve tek yerdedir. `ElogoService.refundStrategy` ve
`NetsisInvoiceProvider.eArchiveReversalStrategy` ikisi de bunu çağırır.

## Netsis adaptörü — `provider/netsis.provider.ts`

`NetsisInvoiceProvider` (`name: "netsis"`, `numbering: "provider"`)
`NetsisClientFacade` üzerinden NetOpenX REST'e konuşur. Platform firması
belgeyi düzenler; Netsis ERP'dir: satış faturasını Netsis'te OLUŞTURURUZ,
Netsis onu kendi e-belge modülüyle (entegratör eLogo, bize görünmez) GİB'e
iletir. Açıklık: `NETSIS_ENABLED`.

### Gönderim (`send`)

1. Ayarlar okunur (aşağıda). Belgenin ihtiyaç duyduğu bir kod eksikse Netsis'e
   hiç gidilmez → `configuration` reddi, eksik anahtarlar mesajda.
2. **Tek NetOpenX transaction'ı** (`transactions.withTransaction`):
   - Cari: TCKN'li bireysel alıcı ve misafir → ORTAK perakende cari
     (`netsis.cari.retailCode`, muhasebece açılır; biz yalnız varlığını
     doğrularız). Kişinin adı/TCKN/adresi fiş başlığına ayrıca yazılır.
     VKN'li kurumsal alıcı → kendi carisi, kod = kullanıcının B/K
     `adminCode`'u; yoksa (`netsis.cari.autoCreateCorporate` açıksa) açılır ve
     `arps.refreshEInvoiceFlags(code)` ile e-Fatura bayrağı tazelenir.
   - Kart: belgenin türüne göre tek hizmet/ürün kartı
     (`items.ensureServiceItem`). Official Store ürün satışının
     (`platform_sale`) tüm satırları tek ürün kartıyla; iade faturası orijinal
     belgenin kartıyla (orijinal `billingReference` numarasından bulunur).
   - **Tutar kontrolü:** fiş numarasız `itemSlips.calculate` ile hesaplatılır;
     matrah, KDV ya da toplam `invoice/fiscal-document-totals.ts`'in
     sonucundan 0,01 TL'den fazla saparsa transaction geri alınır ve belge
     gönderilmez (`configuration`). Numara bu kontrolden SONRA alınır —
     uyuşmazlık seri numarası tüketmez.
   - Numara: e-Arşiv `itemSlips.newEArchiveNumber(serial)`, e-Fatura
     `newEInvoiceNumber(serial)`; seri ayardan.
   - `itemSlips.create`.
3. Commit'ten sonra `eDocuments.send`. Bu adım düşerse fiş ERP'de kalır; sonuç
   `providerRef` + `documentNumber` taşır (`network` ya da `unknown`).

Fiş oluşmadan düşen ağ hatası fırlatılır (kayıt `pending`, bütçe
tüketilmez); iş kuralı reddi sınıflanıp döner.

### Yeniden gönderim (idempotent)

`existingProviderRef` doluysa fiş yeniden oluşturulmaz: `itemSlips.details`
ile bulunur; tutarları kayıttakiyle hâlâ tutuyor mu diye `calculate` ile
bakılır (gönderilmemiş belge iadede yeniden fiyatlanmış olabilir —
tutmuyorsa `configuration`, fiş silinmez çünkü seri numarasında boşluk
doğardı); `eDocuments.check` e-belge zaten yoldaysa (`sent`/`accepted`) kabul
sayar, iptal edilmişse göndermez, değilse yalnız `eDocuments.send` yapar.

### Referans, durum, iptal, PDF

- `providerRef` = `<FaturaTip>:<FATIRS_NO>` (ör. `ftSFat:EAR2026000000001`).
- `getStatus` → `eDocuments.check`: `accepted` → `completed`, `sent` →
  `processing`, `rejected` → `failed`, `cancelled` → `cancelled`, `draft` /
  bilinmeyen → `unknown` (teslim katmanı gönderir).
- `cancelEArchive` → `eDocuments.cancelEArchive`; ağ hatası fırlatılır.
- `fetchPdf` → `null`. PDF'i kendi şablonumuz üretecek
  (`pdf/fiscal-invoice-pdf.renderer.ts`, bağlanması sonraki adım).
- `classifyError`: `NetsisRequestException.kind` → `network`→`network`,
  `conflict`→`duplicate-number`, `auth`/`configuration`→`configuration`,
  diğerleri → `unknown`; ortak oturum kilidi (`sessionBusy`) → `network`,
  kapalı entegrasyon → `configuration`.
- `resolveRecipientKind`: TCKN/misafir → e-Arşiv (sorgu yok). VKN → kurumsal
  cari bul/aç → bayrak tazele → cari kartındaki e-Fatura bayrağı + etiket.
  Bilinmeyen hiçbir zaman hata değildir: e-Arşiv döner ve loglanır; yalnız
  ulaşım hatası fırlatılır.

### Ayarlar (`PlatformSetting`, deploy gerektirmez)

`provider/netsis-invoice-settings.ts` tek kaynaktır; satırlar referans
seed'inde (`prisma/seed-production.ts`) boş varsayılanla açılır ve asla
ezilmez. `netsisInvoiceSettingsReadiness()` eksik/geçersiz anahtarları
döndürür (admin ekranı için).

| Anahtar                             | Varsayılan | Not                                                 |
| ----------------------------------- | ---------- | --------------------------------------------------- |
| `netsis.cari.retailCode`            | boş        | Ortak perakende cari (≤ 15 karakter, VERIFY)        |
| `netsis.cari.autoCreateCorporate`   | `true`     | Kurumsal cari ilk faturada açılsın mı               |
| `netsis.serial.earchive`            | boş        | e-Arşiv serisi, 3 karakter                          |
| `netsis.serial.einvoice`            | boş        | e-Fatura serisi, 3 karakter                         |
| `netsis.item.productSale`           | boş        | `platform_sale` kartı (≤ 35 karakter, VERIFY)       |
| `netsis.item.<tür>`                 | boş        | `FiscalInvoiceType`'tan türeyen her ücret türü için |

**Admin ekranı:** Sistem → Faturalama Ayarları (`/system/invoicing-settings`,
`settings` izni). `GET`/`PUT /admin/invoicing/settings` ayarları okur/yazar
(PUT: bilinmeyen anahtar 400, hepsi tek işlemde, zorunlu denetim kaydı
`netsis_invoice_settings_update` önce/sonra değerleriyle), `POST
/admin/invoicing/netsis/ping` bağlantıyı sınar (hata `ok:false` + yerelleştirilmiş
mesaj). Doğrulama `provider/netsis-invoice-settings.validation.ts`'tedir ve kuralı
sağlayıcının ayrıştırıcısından alır — ikinci bir kural kopyası yoktur.
Etkin sağlayıcı ve Netsis modu (`INVOICE_PROVIDER`, `NETSIS_*`) ekranda
salt okunurdur.

Ücret türleri enum'dan türetilir (`platform_sale` ve `return_invoice`
hariç hepsi): `commission`, `service_fee`, `buyer_commission`,
`buyer_service_fee`, `buyer_shipping`, `seller_commission`,
`seller_platform_fee`, `seller_shipping`, `membership`, `boost`,
`trade_commission`, `trade_service_fee`, `trade_shipping`, `penalty`.

Fiş alanlarının adları (başlık/satır, e-belge bayrakları, alıcı alanları,
referans alanları) `provider/netsis-invoice.constants.ts`'te durur ve hepsi
`VERIFY`'dır; eşleyici `provider/netsis-slip.mapper.ts` saftır. Ayrıntı ve
doğrulama listesi: `docs/NETSIS.md`.

### Bilinen açıklar

- Fiş commit edildi ama commit yanıtı ağda kayboldu: kayıt `pending` kalır ve
  sonraki deneme yeni bir fiş açar. Fiş, bizim ETTN'imizi ve Kayıt No'yu ek
  açıklama alanlarında taşır; mutabakat bugün elle yapılır.
- Gönderilmemiş ama fişi açılmış belge iadeyle yerelde iptal edilirse ERP'deki
  taslak fiş kalır (`INVOICE_PROVIDER_ORPHAN` log'u); kapatma kararı
  muhasebenindir.
- Ürün satışı belgesinin kargo ve hizmet bedeli satırları da ürün kartıyla
  yazılır (kalem snapshot'ı satır türü taşımaz).

## Kayıt — `FiscalInvoice` (DB tablosu bilerek `elogo_invoices`)

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
| `ElogoInvoice` / `elogo_invoices`                                    | `FiscalInvoice` / DB adı değişmedi: `elogo_invoices`                                     |
| `ElogoInvoiceType` / `Context` / `Status`                            | `FiscalInvoiceType` / `Context` / `Status`                              |
| `ElogoDocSequence` / `elogo_doc_sequences`                           | `FiscalDocSequence` / DB adı değişmedi: `elogo_doc_sequences`                            |
| `elogoRefId` / `elogoResultCode` / `elogoResultMsg`                  | `providerRef` / `providerResultCode` / `providerResultMsg`              |
| —                                                                    | `provider` (`EInvoiceProviderName`, varsayılan `elogo`)                 |

Migration: `20261012120000_fiscal_invoice_provider` — yalnız `provider` kolonunu ekler. Veritabanı adları BİLEREK tarihsel kalır (`elogo_invoices`, `elogo_ref_id`…; Prisma `@map`): fiziksel yeniden adlandırma deploy penceresi ve geri dönüş riski taşır, görünür faydası yoktur.

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

### Netsis adaptörüyle yapıldı

- `E_INVOICE_PROVIDER` bağlaması `INVOICE_PROVIDER` ile seçilir.
- Kesilmiş belgenin gönderim/durum/iptal ve PDF işlemleri kaydın kendi
  `provider`'ıyla yapılır (`provider-registry.ts`).
