import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ElogoService } from "../elogo.service";
import {
  buildInvoiceXml,
  type UblInvoiceInput,
} from "../ubl/ubl-invoice.builder";
import {
  isConfigurationElogoFailure,
  isDuplicateNumberElogoFailure,
  isTransientElogoFailure,
} from "../helpers/elogo-retry-policy";
import type { ElogoDocumentStatus } from "../helpers/elogo.types";
import type {
  EArchiveReversalStrategy,
  EInvoiceCancelResult,
  EInvoiceDocumentRef,
  EInvoiceErrorCategory,
  EInvoiceProvider,
  EInvoiceScenario,
  EInvoiceSendContext,
  EInvoiceSendResult,
  EInvoiceStatus,
  FiscalDocumentInput,
  RecipientKindResult,
} from "./e-invoice-provider";

/**
 * eLogo (doğrudan özel entegratör) uygulaması — `EInvoiceProvider` portunun
 * bugünkü tek uygulaması.
 *
 * Yalnız ÇEVİRİ yapar: nötr belgeyi UBL-TR'ye (`buildInvoiceXml`), eLogo'nun
 * SOAP sonuç kodlarını ve hata metinlerini portun durum/hata sınıflarına
 * çevirir. Oturum, ZIP/base64 paketleme ve PostBox çağrıları `ElogoService` +
 * `ElogoSoapClient`'ta kalır; numara, deneme bütçesi ve kayıt yazımı alan
 * servislerindedir.
 */
@Injectable()
export class ElogoInvoiceProvider implements EInvoiceProvider {
  readonly name = "elogo" as const;
  /** Numara bizde: kesimde `ElogoDocSequence`'ten boşluksuz TRD numarası. */
  readonly numbering = "local" as const;

  constructor(
    private readonly elogo: ElogoService,
    private readonly config: ConfigService,
  ) {}

  /** XSLTUUID — eLogo portalına yüklenen görsel tasarım (opsiyonel). */
  private get xsltUuid(): string | undefined {
    return (
      (this.config.get<string>("ELOGO_INVOICE_XSLT_UUID") ?? "").trim() ||
      undefined
    );
  }

  isEnabled(): boolean {
    return this.elogo.isEnabled();
  }

  async resolveRecipientKind(
    taxId: string,
  ): Promise<RecipientKindResult | null> {
    const result = await this.elogo.checkUser(taxId);
    if (!result) return null;
    return {
      kind: result.isEInvoiceUser ? "EINVOICE" : "EARCHIVE",
      alias: result.eInvoicePkAlias,
    };
  }

  async send(
    document: FiscalDocumentInput,
    context: EInvoiceSendContext,
  ): Promise<EInvoiceSendResult> {
    const { xml } = buildInvoiceXml(this.toUbl(document));
    const xsltUuid = this.xsltUuid;
    const res = await this.elogo.sendDocument({
      documentType: document.scenario,
      documentUuid: document.ettn,
      documentNumber: document.documentNumber,
      ublXml: xml,
      signed: false,
      ...(context.recipientAlias ? { alias: context.recipientAlias } : {}),
      ...(xsltUuid ? { xsltUuid } : {}),
    });
    if (res.success) {
      return {
        accepted: true,
        providerRef: res.refId != null ? String(res.refId) : undefined,
        ettn: res.documentUuid,
        resultCode: res.code,
        resultMsg: res.description,
      };
    }
    return {
      accepted: false,
      category: this.classifyRejection(res.description),
      resultCode: res.code,
      resultMsg: res.description,
    };
  }

  async getStatus(
    ref: EInvoiceDocumentRef,
    scenario: EInvoiceScenario,
  ): Promise<EInvoiceStatus> {
    const status = await this.elogo.getDocumentStatus(ref.ettn, scenario);
    return {
      state: this.stateOf(status),
      resultCode: status.code,
      resultMsg: status.description,
    };
  }

  async cancelEArchive(
    ref: EInvoiceDocumentRef,
  ): Promise<EInvoiceCancelResult> {
    const res = await this.elogo.cancelEArchiveInvoice(
      ref.ettn,
      ref.providerRef ?? undefined,
    );
    return {
      success: res.success,
      resultCode: res.code,
      resultMsg: res.description,
    };
  }

  fetchPdf(ref: EInvoiceDocumentRef): Promise<Buffer | null> {
    return this.elogo.getEArchiveInvoicePdf(ref.ettn);
  }

  eArchiveReversalStrategy(
    issuedAt: Date,
    now?: Date,
  ): EArchiveReversalStrategy {
    return this.elogo.refundStrategy(issuedAt, now);
  }

  /**
   * Fırlatılmış hata. Ağ sınıfı ÖNCE bakılır: teslim katmanı fırlatılan
   * hatada yalnız "geçici mi" diye sorar ve bu sıra o kararı aynen korur.
   */
  classifyError(error: unknown): EInvoiceErrorCategory {
    if (isTransientElogoFailure(error)) return "network";
    return this.classifyRejection(
      error instanceof Error ? error.message : String(error ?? ""),
    );
  }

  /**
   * SendDocument reddi (ResultType). Numara çakışması ÖNCE bakılır: red
   * metni fatura numarasını içerir ve numara "502/503" gibi ağ kalıplarına
   * benzeyebilir — bir red asla ağ hatası sayılmaz.
   */
  private classifyRejection(message?: string | null): EInvoiceErrorCategory {
    if (isDuplicateNumberElogoFailure(message)) return "duplicate-number";
    if (isConfigurationElogoFailure(message)) return "configuration";
    return "unknown";
  }

  /**
   * eLogo DocumentStatusType → port durumu. Sıra anlamlıdır: iptal bayrağı
   * her şeyden önce gelir; `status 2` ya da GİB `1300` tamamlandı demektir.
   */
  private stateOf(status: ElogoDocumentStatus): EInvoiceStatus["state"] {
    if (status.isCancel) return "cancelled";
    if (status.status === 2 || status.code === 1300) return "completed";
    if (status.status === 1) return "processing";
    if (status.status === -1) return "failed";
    return "unknown";
  }

  private toUbl(document: FiscalDocumentInput): UblInvoiceInput {
    if (!document.documentNumber) {
      // Yerel numaralandırmada kayıt numarasız gönderilemez — teslim
      // katmanı bunu zaten kesimden önce eler.
      throw new Error("eLogo document is missing its local document number");
    }
    return {
      profileId:
        document.scenario === "EINVOICE" ? "TEMELFATURA" : "EARSIVFATURA",
      invoiceTypeCode: document.kind === "RETURN" ? "IADE" : "SATIS",
      id: document.documentNumber,
      uuid: document.ettn,
      issueDate: document.issueDate,
      issueTime: document.issueTime,
      currency: document.currency,
      sendType: document.sendType,
      note: document.note,
      supplier: document.supplier,
      customer: document.customer,
      lines: document.lines,
      ...(document.billingReference
        ? {
            billingReference: {
              invoiceId: document.billingReference.documentNumber,
              issueDate: document.billingReference.issueDate,
            },
          }
        : {}),
    };
  }
}
