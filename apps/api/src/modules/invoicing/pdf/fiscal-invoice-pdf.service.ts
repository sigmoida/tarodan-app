import { Injectable, Logger } from "@nestjs/common";
import type { FiscalInvoice } from "@prisma/client";
import { PrismaService } from "../../../prisma";
import { translateMessage } from "../../i18n/translate";
import { InvoiceDocumentService } from "../invoice-document.service";
import { loadNetsisInvoiceSettings } from "../provider/netsis-invoice-settings";
import { buildFiscalInvoicePdfInput } from "./fiscal-invoice-pdf-input";
import { renderFiscalInvoicePdf } from "./fiscal-invoice-pdf.renderer";
import type { FiscalInvoicePdfVerification } from "./fiscal-invoice-pdf.types";

/** Alıcısı bilinmeyen (nihai tüketici) belgede GİB'in kabul ettiği kimlik. */
const UNKNOWN_CONSUMER_ID = "11111111111";

/**
 * Sağlayıcının PDF vermediği (Netsis) kayıtlar için BİZİM görsel kopyamız.
 *
 * Teslim (`InvoiceDeliveryService.deliverPdf`) ve kullanıcı indirmesi
 * (`InvoiceQueryService.getInvoiceDownload`) aynı çağrıyı kullanır; böylece
 * "kaydı PDF'e çevirme" kuralı tek yerde yaşar. Saf kurucu
 * `buildFiscalInvoicePdfInput`, çizim `renderFiscalInvoicePdf`; bu servis yalnız
 * ikisini kayda ve ayarlara bağlar. Hata YUTULUR: çağıran best-effort'tur.
 */
@Injectable()
export class FiscalInvoicePdfService {
  private readonly logger = new Logger(FiscalInvoicePdfService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly documents: InvoiceDocumentService,
  ) {}

  /**
   * Kaydın görsel kopyası; numara/ETTN yoksa, kayıt eLogo'ya aitse ya da çizim
   * düşerse `null`.
   * `recipientEmail` verilmezse kayıttaki snapshot kullanılır.
   */
  async renderForRecord(
    row: FiscalInvoice,
    recipientEmail?: string | null,
  ): Promise<Buffer | null> {
    if (!row.invoiceNumber || !row.ettn) return null;
    // eLogo kendi PDF'ini verir; onun geçici bir `null`'ı bizim kopyayı
    // S3'e/pdfUrl'e kalıcılaştırıp gerçek PDF'in yolunu kapatmasın.
    if (row.provider === "elogo") return null;
    try {
      const input = buildFiscalInvoicePdfInput(row, {
        supplier: this.documents.supplierParty(),
        customer: this.documents.buildParty(
          row.recipientVknTckn || UNKNOWN_CONSUMER_ID,
          row.recipientName || "Müşteri",
          recipientEmail ?? row.recipientEmail,
          {
            city: row.recipientCity,
            district: row.recipientDistrict,
            address: row.recipientStreet,
          },
        ),
        verification: await this.verificationFor(row),
      });
      return await renderFiscalInvoicePdf(input);
    } catch (e: unknown) {
      this.logger.warn(
        `Görsel kopya PDF üretilemedi (${row.invoiceNumber}): ${(e as Error)?.message}`,
      );
      return null;
    }
  }

  /** Doğrulama bağlantısı yalnız Netsis kayıtlarında ve ayar doluysa basılır. */
  private async verificationFor(
    row: FiscalInvoice,
  ): Promise<FiscalInvoicePdfVerification | undefined> {
    if (row.provider !== "netsis") return undefined;
    const settings = await loadNetsisInvoiceSettings(this.prisma).catch(
      () => null,
    );
    const url = settings?.earchiveVerificationUrl;
    if (!url) return undefined;
    return {
      label: translateMessage("server.invoicing.pdf.verificationLabel"),
      url,
    };
  }
}
