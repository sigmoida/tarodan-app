/**
 * e-Belge SAĞLAYICI PORTU — belgenin "ne / ne zaman / kime" kararı (kesim,
 * gönderim kirası, deneme bütçesi, iade/iptal seçimi, PDF teslimi) ile
 * "hangi entegratörle" sorusunu ayırır.
 *
 * Alan servisleri (delivery / reversal / query / document) yalnız bu arayüzü
 * bilir ve `E_INVOICE_PROVIDER` token'ıyla enjekte eder. eLogo (doğrudan
 * özel entegratör, UBL-TR SOAP) bugünkü TEK uygulamadır —
 * `elogo.provider.ts`. Logo Netsis (NetOpenX REST) aynı arayüzün ikinci
 * uygulaması olacak; bkz. docs/INVOICING_PROVIDERS.md.
 *
 * Buradaki tipler entegratör sözlüğü (SOAP sonuç kodu, UBL profil adı, XSLT,
 * ZIP/base64) taşımaz. GİB'in kendi kavramları (e-Fatura / e-Arşiv senaryosu,
 * VKN/TCKN, gönderim şekli) her sağlayıcıda aynı olduğu için nötr sayılır.
 *
 * Tutarlar `number`: kayıttaki `Decimal` snapshot'larından sınırda bir kez
 * çevrilmiş, kuruşa yuvarlanmış değerlerdir. Toplamların TEK hesap yeri
 * `invoice/fiscal-document-totals.ts`'tir — sağlayıcı kendi toplamını
 * hesaplamaz, beyan edilen tutar kayda yazılanla aynı kalır.
 */

/** DI token — modülde `ElogoInvoiceProvider`'a bağlanır. */
export const E_INVOICE_PROVIDER = "E_INVOICE_PROVIDER";

export type EInvoiceProviderName = "elogo" | "netsis";

/**
 * Belge numarasını KİM verir?
 *
 *  - `local`: numara bizdedir. Kayıt kesim anında `ElogoDocSequence`'ten
 *    boşluksuz (gap-free) bir TRD numarasıyla açılır, sağlayıcıya numara
 *    hazır gider; paylaşımlı hesapta numara çakışırsa yeni numara alınıp
 *    yeniden denenir. eLogo böyledir.
 *  - `provider`: numarayı ERP/entegratör gönderim anında atar (Netsis).
 *    Bu akışta kayıt NUMARASIZ açılır, sayaç hiç ilerlemez, numara
 *    `send` sonucundaki `documentNumber`'dan kayda yazılır; numara çakışması
 *    diye bir hata sınıfı yoktur. Faz 1a bu akışı UYGULAMAZ — yalnız bayrak
 *    ve `ElogoDocumentService.allocateDocumentNumberInTransaction` kapısı var.
 */
export type DocumentNumbering = "local" | "provider";

/** GİB belge senaryosu: e-Fatura mükellefine EINVOICE, diğer herkese EARCHIVE. */
export type EInvoiceScenario = "EINVOICE" | "EARCHIVE";

/** Belgenin yönü: satış ya da (orijinale referans veren) iade faturası. */
export type FiscalDocumentKind = "SALE" | "RETURN";

/** e-Arşiv gönderim şekli (GİB). e-Fatura'da yoktur. */
export type FiscalSendType = "ELEKTRONIK" | "KAGIT";

export interface FiscalParty {
  /** 10 haneli VKN (tüzel) veya 11 haneli TCKN (gerçek kişi). */
  vknTckn: string;
  /** Tüzel kişi unvanı (şirket). Gerçek kişide boş bırakılıp firstName/lastName kullanılır. */
  title?: string;
  firstName?: string;
  lastName?: string;
  /** Vergi dairesi (VKN için). */
  taxOffice?: string;
  country?: string;
  city?: string;
  district?: string;
  streetAddress?: string;
  email?: string;
  phone?: string;
  websiteUri?: string;
}

export interface FiscalDocumentLine {
  name: string;
  /**
   * Kalemin AÇIKLAMASI — hizmet faturalarında "Sipariş No: PKG-…". Belgenin
   * hangi koliden doğduğu kalemin üstünde durmalı; belge notu tek başına
   * yeterli değil, çoğu görsel tasarım satırın açıklamasını basar.
   */
  description?: string;
  quantity: number;
  /** Birim kodu (UN/ECE). Adet=C62, ay=MON. Varsayılan C62. */
  unitCode?: string;
  /** Birim fiyat (KDV hariç). */
  unitPrice: number;
  /**
   * Satıra uygulanan İSKONTO (KDV hariç). `lineExtension` (matrah) indirim
   * SONRASI tutardır; `unitPrice` ise brüt birim fiyat.
   */
  discount?: number;
  /**
   * Satırın KDV hariç toplamı. Verilmezse `quantity × unitPrice` hesaplanır.
   *
   * Birden fazla adette birim fiyat kuruşa yuvarlandığında (100/3 = 33,33)
   * `quantity × unitPrice` tahsil edilen tutardan sapıyor. Toplam AÇIKÇA
   * verildiğinde fatura, müşteriden tahsil edilen tutarla kuruşu kuruşuna eşleşir.
   */
  lineExtension?: number;
  /** KDV oranı (%). Örn. 20. */
  vatRate: number;
  /**
   * Satırın KDV'si, AÇIKÇA verildiğinde. Verilmezse `lineExtension × vatRate`.
   *
   * Paket hizmet belgeleri tek satırdır ama KDV'leri sipariş bazında yuvarlanıp
   * toplanır (checkout tahsil ederken böyle yuvarlar). Birleşik matrahtan yeniden
   * hesaplamak beyanı tahsilattan bir kuruş ayırabilirdi.
   */
  taxAmount?: number;
}

/** Sağlayıcıya giden belgenin TAMAMI — kayıt snapshot'ından kurulur. */
export interface FiscalDocumentInput {
  scenario: EInvoiceScenario;
  kind: FiscalDocumentKind;
  /**
   * Belge numarası. `numbering === "local"` sağlayıcıda her zaman doludur;
   * `provider` numaralandırmada boş gider ve numara `send` sonucundan döner.
   */
  documentNumber?: string;
  /** ETTN (belge UUID) — bizim tarafta üretilir, yeniden denemede değişmez. */
  ettn: string;
  /** yyyy-mm-dd (Türkiye takvimi). */
  issueDate: string;
  /** HH:mm:ss. */
  issueTime?: string;
  /** ISO 4217; varsayılan TRY. */
  currency?: string;
  /** Yalnız e-Arşiv'de verilir. */
  sendType?: FiscalSendType;
  note?: string;
  /** Belgeyi düzenleyen (Tarodan). */
  supplier: FiscalParty;
  /** Alıcı. */
  customer: FiscalParty;
  lines: FiscalDocumentLine[];
  /** İade faturasında iadesi yapılan ORİJİNAL belge. */
  billingReference?: { documentNumber: string; issueDate: string };
}

/** Gönderimin bağlamı — belgenin kendisine ait olmayan teslim bilgisi. */
export interface EInvoiceSendContext {
  /** e-Fatura alıcısının GİB posta kutusu etiketi (PK alias). */
  recipientAlias?: string;
}

/**
 * Hata sınıfı — teslim katmanının deneme bütçesi kararını sağlayıcıdan
 * bağımsız kılar:
 *
 *  - `network`: ağ/zaman aşımı/sağlayıcı 5xx — bütçe TÜKETMEZ, kayıt `pending`.
 *  - `duplicate-number`: numara sağlayıcıda zaten kullanılmış — yalnız `local`
 *    numaralandırmada anlamlı; yeni numarayla yeniden denenir.
 *  - `configuration`: hesabın/ortamın reddi (görsel tasarım yok vb.) — belgeye
 *    özgü değil, bütçe hemen tükenmiş sayılır ve alarm görünür.
 *  - `unknown`: diğer her red — normal deneme bütçesiyle yeniden denenir.
 */
export type EInvoiceErrorCategory =
  "network" | "duplicate-number" | "configuration" | "unknown";

export type EInvoiceSendResult =
  | {
      accepted: true;
      /** Sağlayıcının belge referansı (eLogo refId) — iptalde geri verilir. */
      providerRef?: string;
      ettn?: string;
      /** `provider` numaralandırmada atanan numara. */
      documentNumber?: string;
      resultCode?: number;
      resultMsg?: string;
    }
  | {
      accepted: false;
      category: EInvoiceErrorCategory;
      resultCode?: number;
      resultMsg?: string;
    };

/** Sağlayıcıdaki bir belgeyi tanımlar. */
export interface EInvoiceDocumentRef {
  ettn: string;
  providerRef?: string | null;
}

/**
 * Sağlayıcıdaki belge durumu:
 *  - `completed`: GİB'e ulaştı / başarıyla tamamlandı
 *  - `processing`: sağlayıcı hâlâ işliyor
 *  - `cancelled`: belge iptal edilmiş
 *  - `failed`: sağlayıcı hata bildirdi
 *  - `unknown`: diğer her durum (belge sağlayıcıda yok sayılır)
 */
export interface EInvoiceStatus {
  state: "completed" | "processing" | "cancelled" | "failed" | "unknown";
  resultCode?: number;
  resultMsg?: string;
}

export interface EInvoiceCancelResult {
  success: boolean;
  resultCode?: number;
  resultMsg?: string;
}

/** Alıcının mükellefiyet sorgusu. */
export interface RecipientKindResult {
  kind: EInvoiceScenario;
  /** e-Fatura posta kutusu etiketi — sağlayıcının döndürdüğü haliyle. */
  alias?: string;
}

/**
 * Kesilmiş bir e-Arşiv belgesinin geri alınma yolu: süre içindeyse İPTAL,
 * değilse İADE FATURASI.
 */
export type EArchiveReversalStrategy = "CANCEL" | "RETURN_INVOICE";

export interface EInvoiceProvider {
  readonly name: EInvoiceProviderName;
  readonly numbering: DocumentNumbering;

  /** Entegrasyon açık mı? Kapalıyken kayıt `pending` açılır, gönderilmez. */
  isEnabled(): boolean;

  /**
   * VKN/TCKN'nin GİB e-Fatura mükellefi olup olmadığı. Sorgu yapılamazsa
   * HATA FIRLATIR (çağıran geçici/kalıcı ayrımını `classifyError` ile yapar);
   * sağlayıcı sonuç döndürmezse `null`.
   */
  resolveRecipientKind(taxId: string): Promise<RecipientKindResult | null>;

  /**
   * Belgeyi gönderir. İş kuralı reddi DÖNÜŞ değeridir (`accepted: false`);
   * ulaşım hatası FIRLATILIR.
   */
  send(
    document: FiscalDocumentInput,
    context: EInvoiceSendContext,
  ): Promise<EInvoiceSendResult>;

  getStatus(
    ref: EInvoiceDocumentRef,
    scenario: EInvoiceScenario,
  ): Promise<EInvoiceStatus>;

  /** e-Arşiv belgesini iptal eder. Ulaşım hatası fırlatılır. */
  cancelEArchive(ref: EInvoiceDocumentRef): Promise<EInvoiceCancelResult>;

  /** Kesilmiş belgenin PDF'i; yoksa/PDF değilse `null`. */
  fetchPdf(ref: EInvoiceDocumentRef): Promise<Buffer | null>;

  /** Kesilmiş e-Arşiv belgesi bugün iptal edilebilir mi, yoksa iade faturası mı gerekir? */
  eArchiveReversalStrategy(
    issuedAt: Date,
    now?: Date,
  ): EArchiveReversalStrategy;

  /** Fırlatılmış bir hatayı deneme politikası sınıfına çevirir. */
  classifyError(error: unknown): EInvoiceErrorCategory;
}
