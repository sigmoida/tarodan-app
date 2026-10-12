import type { FiscalDocumentInput } from "../provider/e-invoice-provider";

/** PDF etiketlerinin dili; varsayılan `tr`. */
export type FiscalInvoicePdfLocale = "tr" | "en";

/** Belgeyi KESEN entegratör (FiscalInvoice.provider ile aynı değerler). */
export type FiscalInvoicePdfProvider = "elogo" | "netsis";

/** Entegratörün belge sorgulama bağlantısı (alıcı e-belgeyi oradan doğrular). */
export interface FiscalInvoicePdfVerification {
  label: string;
  url: string;
}

/**
 * Mali belgenin GÖRSEL KOPYASI için girdi: sağlayıcıya giden belge aynen
 * (`document`) + kayda ait üst bilgi. Tutarlar burada yeniden türetilmez;
 * satır/dip toplamlar `computeFiscalDocumentTotals` ile — sağlayıcıya giden
 * UBL ve kayıt kolonlarıyla AYNI hesap — alınır.
 */
export interface FiscalInvoicePdfInput {
  document: FiscalDocumentInput;
  provider: FiscalInvoicePdfProvider;
  /** FiscalInvoice.status (ham değer; etiketlenmez). */
  status: string;
  /** Bizim KYT- kaynak kodu. */
  sourceReference: string;
  /** Kaydın sistemde oluştuğu an. */
  issuedAt: Date;
  verification?: FiscalInvoicePdfVerification;
  locale?: FiscalInvoicePdfLocale;
  /** Metin bloğu olarak basılır (QR kütüphanesi yok). */
  qrPayload?: string;
}
