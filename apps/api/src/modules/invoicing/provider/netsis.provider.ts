import { Injectable, Logger } from "@nestjs/common";
import type { FiscalInvoiceType } from "@prisma/client";
import { PrismaService } from "../../../prisma";
import {
  NetsisClientFacade,
  NetsisRequestException,
  classifyNetsisError,
  readNetsisArpEInvoiceProfile,
  type NetsisCallOptions,
  type NetsisEDocumentRequest,
  type NetsisEDocumentState,
  type NetsisErrorKind,
} from "../../netsis";
import { localizedPayloadOf } from "../../i18n/localized-message";
import { translateMessage } from "../../i18n/translate";
import { eArchiveReversalStrategy } from "../helpers/earchive-reversal-strategy";
import { LINE_DESCRIPTION } from "../invoice/invoice-line-description";
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
  FiscalParty,
  RecipientKindResult,
} from "./e-invoice-provider";
import {
  NETSIS_CARI_CODE_MAX_LENGTH,
  NETSIS_INVOICE_SETTING_KEYS,
  loadNetsisInvoiceSettings,
  netsisItemSettingKey,
  type NetsisInvoiceSettings,
  type NetsisItemInvoiceType,
} from "./netsis-invoice-settings";
import {
  buildNetsisCorporateArp,
  buildNetsisServiceItem,
  buildNetsisSlip,
  expectedNetsisTotals,
  formatNetsisProviderRef,
  netsisItemTypeOf,
  netsisTotalsMismatches,
  parseNetsisProviderRef,
  type NetsisTotalsMismatch,
} from "./netsis-slip.mapper";

type EInvoiceSendRejection = Extract<EInvoiceSendResult, { accepted: false }>;

/** VKN 10 hanedir (tüzel kişi); TCKN 11. */
const VKN_LENGTH = 10;

const SERIAL_SETTING_KEY: Record<EInvoiceScenario, string> = {
  EARCHIVE: NETSIS_INVOICE_SETTING_KEYS.earchiveSerial,
  EINVOICE: NETSIS_INVOICE_SETTING_KEYS.einvoiceSerial,
};

/**
 * Netsis e-belge durumu → port durumu. `sent` (kuyrukta / iletildi)
 * tamamlandı SAYILMAZ: eLogo'daki "status 1" gibi işleniyor demektir.
 * `draft` = fiş var ama e-belge hiç gönderilmemiş → teslim katmanı gönderir.
 */
const STATE_OF: Record<NetsisEDocumentState, EInvoiceStatus["state"]> = {
  accepted: "completed",
  sent: "processing",
  rejected: "failed",
  cancelled: "cancelled",
  draft: "unknown",
  unknown: "unknown",
};

/** NetOpenX hata sınıfı → deneme politikası sınıfı. */
const CATEGORY_OF: Record<NetsisErrorKind, EInvoiceErrorCategory> = {
  network: "network",
  conflict: "duplicate-number",
  auth: "configuration",
  configuration: "configuration",
  validation: "unknown",
  unknown: "unknown",
};

/**
 * Bizim verdiğimiz "gönderme" kararı (eksik ayar, tutar uyuşmazlığı, cari
 * yok…). Netsis transaction'ı içinde fırlatılır ki yazılan her şey geri
 * alınsın; sağlayıcı bunu `configuration` reddine çevirir.
 */
class NetsisInvoiceRejection extends Error {
  constructor(readonly resultMsg: string) {
    super(resultMsg);
    this.name = "NetsisInvoiceRejection";
  }
}

const message = (
  key: string,
  values?: Record<string, string | number>,
): string => translateMessage(`server.invoicing.netsis.${key}`, undefined, values);

const digitsOf = (value: string | null | undefined): string =>
  (value ?? "").replace(/\D/g, "");

/** Kayda/loga güvenli kısa hata metni (Netsis gövde parçası, istek değil). */
function errorText(error: unknown): string {
  if (error instanceof NetsisInvoiceRejection) return error.resultMsg;
  if (error instanceof NetsisRequestException) {
    return `${error.kind}: ${error.detail}`.slice(0, 500);
  }
  const payload = localizedPayloadOf(error);
  if (payload) return translateMessage(payload.i18nKey);
  return String((error as Error)?.message ?? error).slice(0, 500);
}

interface CorporateRecipient {
  /** Kullanıcının B/K kodu — Netsis cari kodu. */
  code: string;
  party: FiscalParty;
}

/**
 * Logo Netsis (ERP, NetOpenX REST) uygulaması.
 *
 * eLogo'dan farkı: belgeyi biz göndermeyiz, ERP'de SATIŞ FATURASI olarak
 * OLUŞTURURUZ; Netsis onu kendi e-belge modülüyle GİB'e iletir. Bu yüzden
 * numarayı Netsis verir (`numbering: "provider"`) ve gönderim iki adımdır:
 *
 *  1. Tek NetOpenX transaction'ında: cari (ortak perakende ya da kurumsal) →
 *     hizmet/ürün kartı → `Calculate` ile tutar KONTROLÜ → seri numarası →
 *     `ItemSlips` kaydı. Herhangi bir hata transaction'ı geri alır.
 *  2. Commit'ten SONRA `EDocument/SendEDocument`. Bu adım düşerse fiş ERP'de
 *     kalır; sonuç `providerRef` taşır ve sonraki deneme yalnız gönderir
 *     (`EInvoiceSendContext.existingProviderRef`).
 *
 * Tutar kontrolü defteri korur: Netsis'in hesapladığı matrah/KDV/toplam
 * kaydınkiyle 0,01 TL'den fazla ayrışırsa belge hiç gönderilmez.
 */
@Injectable()
export class NetsisInvoiceProvider implements EInvoiceProvider {
  readonly name = "netsis" as const;
  /** Numarayı Netsis'in e-Arşiv / e-Fatura serisi verir. */
  readonly numbering = "provider" as const;

  private readonly logger = new Logger(NetsisInvoiceProvider.name);

  constructor(
    private readonly netsis: NetsisClientFacade,
    private readonly prisma: PrismaService,
  ) {}

  isEnabled(): boolean {
    return this.netsis.enabled;
  }

  /**
   * VKN → kurumsal cariyi bul/aç, Netsis'e GİB listesinden bayrağı
   * tazelettir, bayrağı oku. TCKN ve misafir → e-Arşiv (sorgu yok).
   *
   * Ulaşım hatası port gereği FIRLATILIR (teslim katmanı kaydı `pending`
   * bırakır); bunun dışında "bilinmiyor" hiçbir zaman hata değildir — e-Arşiv
   * döner ve loglanır.
   */
  async resolveRecipientKind(
    taxId: string,
  ): Promise<RecipientKindResult | null> {
    const vkn = digitsOf(taxId);
    if (vkn.length !== VKN_LENGTH) return { kind: "EARCHIVE" };
    try {
      const recipient = await this.corporateRecipient(vkn);
      if (!recipient) {
        this.logger.warn(
          `Netsis mükellef sorgusu: VKN ${vkn} hiçbir kullanıcıya bağlı değil — e-Arşiv`,
        );
        return { kind: "EARCHIVE" };
      }
      const settings = await loadNetsisInvoiceSettings(this.prisma);
      const code = await this.ensureCorporateCari(recipient, settings);
      if (!code) {
        this.logger.warn(
          `Netsis mükellef sorgusu: ${recipient.code} carisi yok ve otomatik açma kapalı — e-Arşiv`,
        );
        return { kind: "EARCHIVE" };
      }
      await this.netsis.arps.refreshEInvoiceFlags(code);
      const arp = await this.netsis.arps.findByCode(code);
      const profile = arp
        ? readNetsisArpEInvoiceProfile(arp)
        : { isEInvoiceUser: null, alias: null };
      if (profile.isEInvoiceUser === true) {
        return profile.alias
          ? { kind: "EINVOICE", alias: profile.alias }
          : { kind: "EINVOICE" };
      }
      if (profile.isEInvoiceUser === null) {
        this.logger.warn(
          `Netsis mükellef sorgusu: ${code} carisinin e-Fatura bayrağı okunamadı — e-Arşiv`,
        );
      }
      return { kind: "EARCHIVE" };
    } catch (error: unknown) {
      if (this.classifyError(error) === "network") throw error;
      this.logger.warn(
        `Netsis mükellef sorgusu başarısız (VKN ${vkn}): ${errorText(error)} — e-Arşiv`,
      );
      return { kind: "EARCHIVE" };
    }
  }

  async send(
    document: FiscalDocumentInput,
    context: EInvoiceSendContext,
  ): Promise<EInvoiceSendResult> {
    if (context.existingProviderRef) {
      const existing = parseNetsisProviderRef(context.existingProviderRef);
      if (!existing) {
        return this.reject(
          message("invalidProviderRef", { ref: context.existingProviderRef }),
        );
      }
      return this.resend(document, existing);
    }
    return this.createAndSend(document, context);
  }

  async getStatus(ref: EInvoiceDocumentRef): Promise<EInvoiceStatus> {
    const parsed = parseNetsisProviderRef(ref.providerRef);
    // Referans yoksa fiş Netsis'te hiç oluşmamıştır.
    if (!parsed) return { state: "unknown" };
    const status = await this.netsis.eDocuments.check(
      this.eDocumentRequest(parsed.docType, parsed.documentNumber, ref.ettn),
    );
    return {
      state: STATE_OF[status.state],
      resultMsg: `Netsis: ${status.state}`,
    };
  }

  async cancelEArchive(
    ref: EInvoiceDocumentRef,
  ): Promise<EInvoiceCancelResult> {
    const parsed = parseNetsisProviderRef(ref.providerRef);
    if (!parsed) {
      return {
        success: false,
        resultMsg: message("invalidProviderRef", {
          ref: ref.providerRef ?? "-",
        }),
      };
    }
    try {
      await this.netsis.eDocuments.cancelEArchive(
        this.eDocumentRequest(parsed.docType, parsed.documentNumber, ref.ettn),
      );
      return { success: true };
    } catch (error: unknown) {
      // Ulaşım hatası fırlatılır: iptalin sonucu bilinmiyor, çağıran
      // iade faturasına düşmeden önce durumu sorar.
      if (this.classifyError(error) === "network") throw error;
      return { success: false, resultMsg: errorText(error) };
    }
  }

  /**
   * PDF'i Netsis'ten değil kendi şablonumuzdan üretiyoruz.
   * TODO(netsis-pdf): `pdf/fiscal-invoice-pdf.renderer.ts` bağlanınca belge
   * buradan değil oradan üretilecek; o zamana kadar PDF teslimi atlanır.
   */
  async fetchPdf(): Promise<Buffer | null> {
    return null;
  }

  eArchiveReversalStrategy(
    issuedAt: Date,
    now?: Date,
  ): EArchiveReversalStrategy {
    return eArchiveReversalStrategy(issuedAt, now);
  }

  classifyError(error: unknown): EInvoiceErrorCategory {
    if (error instanceof NetsisInvoiceRejection) return "configuration";
    const key = localizedPayloadOf(error)?.i18nKey;
    // Ortak oturum başka süreçte açılıyor: geçici. Entegrasyon kapalı: insan işi.
    if (key === "server.netsis.sessionBusy") return "network";
    if (key === "server.netsis.disabled") return "configuration";
    return CATEGORY_OF[classifyNetsisError(error)];
  }

  // ───────────────────────── gönderim ─────────────────────────

  private async createAndSend(
    document: FiscalDocumentInput,
    context: EInvoiceSendContext,
  ): Promise<EInvoiceSendResult> {
    const settings = await loadNetsisInvoiceSettings(this.prisma);
    const itemType = await this.itemTypeOf(document, context.invoiceType);
    if (!itemType) {
      return this.reject(
        message("itemTypeUnresolved", { type: context.invoiceType ?? "-" }),
      );
    }
    const pooled = document.customer.vknTckn.length !== VKN_LENGTH;
    const missing = [
      ...(pooled && !settings.retailCariCode
        ? [NETSIS_INVOICE_SETTING_KEYS.retailCariCode]
        : []),
      ...(settings.serials[document.scenario]
        ? []
        : [SERIAL_SETTING_KEY[document.scenario]]),
      ...(settings.itemCodes[itemType] ? [] : [netsisItemSettingKey(itemType)]),
    ];
    if (missing.length > 0) {
      return this.reject(
        message("settingsMissing", { keys: missing.join(", ") }),
      );
    }
    const corporate = pooled
      ? null
      : await this.corporateRecipient(
          document.customer.vknTckn,
          context.recipientUserId,
          document.customer,
        );
    if (!pooled && !corporate) {
      return this.reject(
        message("corporateUserMissing", { vkn: document.customer.vknTckn }),
      );
    }

    const itemCode = settings.itemCodes[itemType];
    const serial = settings.serials[document.scenario];
    let created: { docType: string; documentNumber: string };
    try {
      created = await this.netsis.transactions.withTransaction(async (tx) => {
        const cariCode = corporate
          ? await this.requireCorporateCari(corporate, settings, tx)
          : await this.requireRetailCari(settings.retailCariCode, tx);
        await this.netsis.items.ensureServiceItem(
          buildNetsisServiceItem(
            itemCode,
            LINE_DESCRIPTION[itemType] ?? itemCode,
            document.lines[0]?.vatRate ?? 0,
          ),
          tx,
        );
        const mapping = {
          document,
          cariCode,
          pooledCari: pooled,
          itemCode,
          sourceReference: context.sourceReference,
        };
        // Numara ALINMADAN önce hesaplatılır: uyuşmazlıkta seri numarası
        // hiç tüketilmez.
        const totals = await this.netsis.itemSlips.calculate(
          buildNetsisSlip(mapping),
          tx,
        );
        const mismatches = netsisTotalsMismatches(
          expectedNetsisTotals(document),
          totals,
        );
        if (mismatches.length > 0) {
          throw new NetsisInvoiceRejection(this.mismatchMessage(mismatches));
        }
        const documentNumber =
          document.scenario === "EINVOICE"
            ? await this.netsis.itemSlips.newEInvoiceNumber(serial, tx)
            : await this.netsis.itemSlips.newEArchiveNumber(serial, tx);
        const stored = await this.netsis.itemSlips.create(
          buildNetsisSlip({ ...mapping, documentNumber }),
          tx,
        );
        return {
          docType: stored.FaturaTip,
          documentNumber: stored.FatUst.FATIRS_NO?.trim() || documentNumber,
        };
      });
    } catch (error: unknown) {
      // Fiş oluşmadı (transaction geri alındı): ulaşım hatası fırlatılır,
      // iş kuralı reddi sınıflanıp döner.
      if (error instanceof NetsisInvoiceRejection) {
        return this.reject(error.resultMsg);
      }
      const category = this.classifyError(error);
      if (category === "network") throw error;
      return { accepted: false, category, resultMsg: errorText(error) };
    }
    return this.sendEDocument(
      created.docType,
      created.documentNumber,
      document.ettn,
    );
  }

  /**
   * Fiş zaten Netsis'te: yeniden OLUŞTURMA. Fiş hâlâ kayıttaki tutarları
   * taşıyorsa (gönderilmemiş belge iadede yeniden fiyatlanmış olabilir) ve
   * e-belgesi gitmemişse yalnız gönderilir; gitmişse kabul sayılır.
   */
  private async resend(
    document: FiscalDocumentInput,
    ref: { docType: string; documentNumber: string },
  ): Promise<EInvoiceSendResult> {
    const providerRef = formatNetsisProviderRef(
      ref.docType,
      ref.documentNumber,
    );
    const located = { providerRef, documentNumber: ref.documentNumber };
    try {
      const slip = await this.netsis.itemSlips.details({
        FaturaTip: ref.docType,
        FATIRS_NO: ref.documentNumber,
      });
      if (!slip) {
        return this.reject(
          message("slipNotFound", { number: ref.documentNumber }),
        );
      }
      const totals = await this.netsis.itemSlips.calculate(slip);
      if (
        netsisTotalsMismatches(expectedNetsisTotals(document), totals).length
      ) {
        // Fiş silinip yeniden açılmaz: seri numarasında boşluk doğardı.
        return {
          ...this.reject(message("staleSlip", { number: ref.documentNumber })),
          ...located,
        };
      }
      const status = await this.netsis.eDocuments.check(
        this.eDocumentRequest(ref.docType, ref.documentNumber),
      );
      // e-Belge zaten GİB yolunda (kuyrukta ya da kabul): yeniden göndermek
      // ikinci bir e-belge demektir — önceki deneme başarılı sayılır.
      if (status.state === "accepted" || status.state === "sent") {
        return {
          accepted: true,
          ...located,
          ...(status.ettn ? { ettn: status.ettn } : {}),
          resultMsg: `Netsis: ${status.state}`,
        };
      }
      if (status.state === "cancelled") {
        return {
          accepted: false,
          category: "unknown",
          resultMsg: message("documentCancelled", {
            number: ref.documentNumber,
          }),
          ...located,
        };
      }
    } catch (error: unknown) {
      const category = this.classifyError(error);
      if (category === "network") throw error;
      return {
        accepted: false,
        category,
        resultMsg: errorText(error),
        ...located,
      };
    }
    return this.sendEDocument(ref.docType, ref.documentNumber, document.ettn);
  }

  /**
   * Commit edilmiş fişin e-belgesini gönderir. Hata FIRLATMAZ: fiş ERP'de
   * duruyor, sonuç referansı ve numarayı taşır ki teslim katmanı yalnız
   * gönderimi yeniden denesin.
   */
  private async sendEDocument(
    docType: string,
    documentNumber: string,
    ettn: string,
  ): Promise<EInvoiceSendResult> {
    const providerRef = formatNetsisProviderRef(docType, documentNumber);
    try {
      const res = await this.netsis.eDocuments.send(
        this.eDocumentRequest(docType, documentNumber, ettn),
      );
      this.logger.log(
        `Netsis e-belgesi gönderildi (${documentNumber}, ettn=${res.ettn ?? "-"})`,
      );
      return {
        accepted: true,
        providerRef,
        documentNumber,
        // Netsis kendi ETTN'ini atayabilir; döndüyse kayda o yazılır.
        ...(res.ettn ? { ettn: res.ettn } : {}),
      };
    } catch (error: unknown) {
      const category =
        this.classifyError(error) === "network" ? "network" : "unknown";
      this.logger.warn(
        `Netsis fişi ${documentNumber} oluştu ama e-belge gönderilemedi (${category}): ${errorText(error)}`,
      );
      return {
        accepted: false,
        category,
        resultMsg: errorText(error),
        providerRef,
        documentNumber,
      };
    }
  }

  // ───────────────────────── cari / kart ─────────────────────────

  /**
   * VKN'li alıcının kullanıcısı. Önce kaydın alıcısı (id ile, VKN'si
   * tutuyorsa), yoksa VKN ile en eski kullanıcı. Cari kodu kullanıcının
   * B/K kodudur (docs/CODE_SCHEME.md).
   */
  private async corporateRecipient(
    vkn: string,
    userId?: string,
    snapshot?: FiscalParty,
  ): Promise<CorporateRecipient | null> {
    const select = {
      adminCode: true,
      companyName: true,
      displayName: true,
      taxId: true,
      taxOffice: true,
      email: true,
    } as const;
    const byId = userId
      ? await this.prisma.user.findUnique({ where: { id: userId }, select })
      : null;
    const user =
      byId && digitsOf(byId.taxId) === vkn
        ? byId
        : await this.prisma.user.findFirst({
            where: { taxId: vkn },
            select,
            orderBy: { createdAt: "asc" },
          });
    if (!user) return null;
    // Belge snapshot'ı (unvan, adres, e-posta) kazanır; boş alanları
    // kullanıcı kaydı doldurur. `undefined` değerli anahtar kullanıcıyı ezmesin.
    const snapshotFields = Object.fromEntries(
      Object.entries(snapshot ?? {}).filter(
        ([, value]) => typeof value === "string" && value.trim() !== "",
      ),
    ) as Partial<FiscalParty>;
    return {
      code: user.adminCode,
      party: {
        vknTckn: vkn,
        title: user.companyName ?? user.displayName,
        ...(user.taxOffice ? { taxOffice: user.taxOffice } : {}),
        email: user.email,
        ...snapshotFields,
      },
    };
  }

  /**
   * Kurumsal cari: varsa onu, yoksa (ayar açıksa) açar ve e-Fatura
   * bayrağını GİB listesinden tazeletir. Açılamıyorsa `null`.
   */
  private async ensureCorporateCari(
    recipient: CorporateRecipient,
    settings: NetsisInvoiceSettings,
    options?: NetsisCallOptions,
  ): Promise<string | null> {
    const { code } = recipient;
    if (!code || code.length > NETSIS_CARI_CODE_MAX_LENGTH) {
      throw new NetsisInvoiceRejection(
        message("corporateCariCodeInvalid", { code: code || "-" }),
      );
    }
    if (await this.netsis.arps.findByCode(code, options)) return code;
    if (!settings.autoCreateCorporateCari) return null;
    try {
      await this.netsis.arps.create(
        buildNetsisCorporateArp(code, recipient.party),
        options,
      );
    } catch (error: unknown) {
      // Yarış: başka süreç aynı cariyi az önce açtı — cari artık var.
      if (classifyNetsisError(error) !== "conflict") throw error;
    }
    await this.netsis.arps.refreshEInvoiceFlags(code, options);
    return code;
  }

  private async requireCorporateCari(
    recipient: CorporateRecipient,
    settings: NetsisInvoiceSettings,
    options: NetsisCallOptions,
  ): Promise<string> {
    const code = await this.ensureCorporateCari(recipient, settings, options);
    if (!code) {
      throw new NetsisInvoiceRejection(
        message("corporateCariMissing", { code: recipient.code }),
      );
    }
    return code;
  }

  /** Ortak perakende cari muhasebece açılır; biz açmayız, yalnız doğrularız. */
  private async requireRetailCari(
    code: string,
    options: NetsisCallOptions,
  ): Promise<string> {
    if (!(await this.netsis.arps.findByCode(code, options))) {
      throw new NetsisInvoiceRejection(message("retailCariNotFound", { code }));
    }
    return code;
  }

  /** Kartı seçen tür; iade faturasında orijinal belgenin türü. */
  private async itemTypeOf(
    document: FiscalDocumentInput,
    invoiceType: FiscalInvoiceType | undefined,
  ): Promise<NetsisItemInvoiceType | null> {
    if (!invoiceType) return null;
    if (invoiceType !== "return_invoice") return netsisItemTypeOf(invoiceType);
    const originalNumber = document.billingReference?.documentNumber;
    const original = originalNumber
      ? await this.prisma.fiscalInvoice.findUnique({
          where: { invoiceNumber: originalNumber },
          select: { type: true },
        })
      : null;
    return netsisItemTypeOf(invoiceType, original?.type);
  }

  // ───────────────────────── yardımcılar ─────────────────────────

  private eDocumentRequest(
    docType: string,
    documentNumber: string,
    ettn?: string,
  ): NetsisEDocumentRequest {
    return {
      FaturaTip: docType,
      FATIRS_NO: documentNumber,
      ...(ettn ? { ETTN: ettn } : {}),
    };
  }

  private reject(resultMsg: string): EInvoiceSendRejection {
    this.logger.error(`NETSIS_CONFIG_ERROR ${resultMsg}`);
    return { accepted: false, category: "configuration", resultMsg };
  }

  private mismatchMessage(mismatches: NetsisTotalsMismatch[]): string {
    const details = mismatches
      .map(
        (m) =>
          `${translateMessage(`server.invoicing.netsis.totalsField.${m.field}`)} ${m.expected} ≠ ${m.calculated}`,
      )
      .join("; ");
    return message("totalsMismatch", { details });
  }
}
