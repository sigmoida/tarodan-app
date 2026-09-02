import { Injectable, Logger, Optional } from "@nestjs/common";
import { randomUUID } from "crypto";
import { Prisma, type ElogoInvoice } from "@prisma/client";
import { PrismaService } from "../../prisma";
import {
  ELOGO_MAX_SEND_ATTEMPTS,
  isConfigurationElogoFailure,
  isTransientElogoFailure,
} from "./helpers/elogo-retry-policy";
import { retryOnWriteConflict } from "./helpers/elogo-write-conflict";
import { LINE_DESCRIPTION } from "./invoice/invoice-line-description";
import { invoiceIssueYear } from "./invoice/invoice-datetime";
import { renderManagedEmailTemplate } from "../../common/helpers/email-template-renderer";
import {
  adminUrl,
  frontendUrl as resolveFrontendUrl,
} from "../../config/app-urls";
import { NotificationService } from "../notification/notification.service";
import { NotificationType } from "../notification/dto";
import { buildInvoiceXml } from "./ubl/ubl-invoice.builder";
import {
  invoiceTotalsFromLines,
  readInvoiceLineItems,
} from "./invoice/invoice-lines";
import type {
  ElogoDocumentType,
  ElogoUserCheckResult,
} from "./helpers/elogo.types";
import type { CutOptions, RevenueType } from "./elogo-invoicing.service";
import { ElogoService } from "./elogo.service";
import { ElogoDocumentService } from "./elogo-document.service";
import { StorageService } from "../storage/storage.service";
import { SmtpProvider } from "../mail/smtp.provider";

/**
 * Faturanın e-Logo'ya GİDİŞİ — ElogoInvoicingService'ten birebir taşındı.
 * Kaydı oluşturur (`cut`), gönderim hakkını atomik olarak sahiplenir
 * (`claimInvoiceForSend`), belgeyi yollar (`sendRecord`), PDF'i teslim eder ve
 * takılan kayıtları cron'la yeniden dener.
 *
 * Buradaki tek kural her şeyi belirler: fatura kesmek para hareketini BLOKLAMAZ.
 * `cut` hatayı yutar ve `failed` kayıt bırakır; kurtarma yolu
 * `retryPendingInvoices`'tır. Gönderim hakkı lease ile sahiplenildiği için iki
 * instance aynı belgeyi iki kez yollayamaz — aynı numarayla ikinci bir belge
 * kesilmesi geri alınamaz bir mali hatadır.
 */
const MAX_SEND_ATTEMPTS = ELOGO_MAX_SEND_ATTEMPTS;
/** Gönderim hakkının kilit süresi: bu kadar süre ilerlemeyen `processing` kayıt yeniden denenir. */
const SEND_LEASE_MS = 10 * 60 * 1000;

@Injectable()
export class ElogoDeliveryService {
  private readonly logger = new Logger(ElogoDeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly elogo: ElogoService,
    private readonly documents: ElogoDocumentService,
    @Optional() private readonly storage?: StorageService,
    @Optional() private readonly smtp?: SmtpProvider,
    @Optional() private readonly notifications?: NotificationService,
  ) {}

  // ───────────────────────── core ─────────────────────────

  /** Gelir faturası kes (idempotent). Hata YUTULUR (non-blocking) — failed kayıt + cron retry. */
  async cut(
    type: RevenueType,
    sourceId: string,
    recipientUserId: string,
    grossAmount: number,
    opts: CutOptions = {},
  ): Promise<void> {
    const { lineDescription, guestRecipient, categoryId, lineItems } = opts;
    try {
      const providerEnabled = this.elogo.isEnabled();
      if (!providerEnabled) {
        this.logger.debug(
          `eLogo kapalı — ${type} faturası pending kaydedilecek (source=${sourceId})`,
        );
      }
      if (!(grossAmount > 0)) return;

      const existing = await this.prisma.elogoInvoice.findUnique({
        where: { type_sourceId: { type, sourceId } },
      });
      if (
        existing &&
        (existing.status === "sent" || existing.status === "signed")
      )
        return; // zaten kesildi
      if (existing) {
        if (providerEnabled) {
          await this.sendRecord(existing.id); // failed/pending → yeniden dene
        }
        return;
      }

      const recipient = await this.documents.resolveRecipient(
        recipientUserId,
        guestRecipient,
      );
      const now = new Date();
      // Kalem listesi varsa belge ÇOK ORANLI olabilir; toplamlar satırlardan
      // gelir ve `vatRate` yalnız geriye-uyumluluk için (tek oranlı özet) tutulur.
      const hasLines = !!lineItems?.length;
      const vatRate = await this.documents.resolveVatRate(type, categoryId);
      const amounts = hasLines
        ? invoiceTotalsFromLines(lineItems!)
        : this.documents.invoiceAmounts(type, grossAmount, vatRate);

      // Sequence artışı ve unique(type,sourceId) aynı SERIALIZABLE transaction'da:
      // yarışın kaybedeni numara tüketmez; kazanan kayıt tek ETTN ile gönderilir.
      // Aynı sayaç satırında çakışan iki belge (P2034) kısa beklemeyle yeniden
      // denenir — bkz. elogo-write-conflict.ts.
      const record = await retryOnWriteConflict(
        () =>
          this.prisma.$transaction(
            async (tx) => {
              const raced = await tx.elogoInvoice.findUnique({
                where: { type_sourceId: { type, sourceId } },
              });
              if (raced) return raced;
              const invoiceNumber =
                await this.documents.allocateInvoiceNumberInTransaction(
                  tx,
                  invoiceIssueYear(now),
                );
              return tx.elogoInvoice.create({
                data: {
                  type,
                  sourceId,
                  recipientUserId,
                  recipientVknTckn: recipient.vknTckn,
                  recipientName: recipient.name,
                  // Kesim anındaki iletişim bilgisi: misafir siparişlerinde gönderim
                  // anında kullanıcı kaydına dönmek sistem e-postasına/boş adrese düşer.
                  recipientEmail: recipient.email ?? null,
                  recipientCity: recipient.address?.city ?? null,
                  recipientDistrict: recipient.address?.district ?? null,
                  recipientStreet: recipient.address?.street ?? null,
                  documentType: recipient.documentType,
                  sendType: "ELEKTRONIK",
                  invoiceNumber,
                  ettn: randomUUID(),
                  netAmount: amounts.net,
                  taxAmount: amounts.tax,
                  total: amounts.total,
                  originalTotal: amounts.total,
                  vatRate,
                  status: "pending",
                  lineDescription: lineDescription?.trim() || null,
                  lineItems: hasLines
                    ? (lineItems as unknown as Prisma.InputJsonValue)
                    : Prisma.DbNull,
                  createdAt: now,
                },
              });
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
          ),
        {
          onRetry: (attempt) =>
            this.logger.warn(
              `eLogo ${type} numara sayacı çakıştı (source=${sourceId}), ${attempt}. deneme yenileniyor`,
            ),
        },
      );
      if (providerEnabled) {
        await this.sendRecord(record.id);
      }
    } catch (err: any) {
      // Idempotency yarışı (aynı anda iki create) veya beklenmedik hata — yut, cron toparlar.
      this.logger.error(
        `eLogo ${type} faturası kesimi hata (source=${sourceId}): ${err?.message}`,
      );
    }
  }

  /**
   * DB tabanlı gönderim lease'i. Aynı pending/failed belgeyi yalnız bir API/worker
   * instance'ı sağlayıcıya yollar; çöken processing lease'i cron tarafından alınabilir.
   */
  private async claimInvoiceForSend(
    invoiceId: string,
  ): Promise<{ invoice: ElogoInvoice; reconcileFirst: boolean } | null> {
    const current = await this.prisma.elogoInvoice.findUnique({
      where: { id: invoiceId },
    });
    if (!current) return null;
    if (
      current.status === "sent" ||
      current.status === "signed" ||
      current.status === "cancelled"
    ) {
      return null;
    }
    if (
      current.status !== "processing" &&
      current.attemptCount >= MAX_SEND_ATTEMPTS
    ) {
      return null;
    }
    const staleBefore = new Date(Date.now() - SEND_LEASE_MS);
    if (
      current.status === "processing" &&
      current.lastAttemptAt &&
      current.lastAttemptAt >= staleBefore
    ) {
      return null;
    }

    const claim = await this.prisma.elogoInvoice.updateMany({
      where: {
        id: current.id,
        status: current.status,
        attemptCount: current.attemptCount,
        ...(current.status === "processing"
          ? { lastAttemptAt: current.lastAttemptAt }
          : {}),
      },
      data: {
        status: "processing",
        attemptCount:
          current.status === "processing"
            ? current.attemptCount
            : { increment: 1 },
        lastAttemptAt: new Date(),
      },
    });
    if (claim.count !== 1) return null;
    const invoice = await this.prisma.elogoInvoice.findUnique({
      where: { id: current.id },
    });
    if (!invoice) return null;
    return {
      invoice,
      reconcileFirst:
        current.status === "processing" || current.attemptCount > 0,
    };
  }

  /** Kayıttaki snapshot'tan UBL üretip gönderir, durumu günceller. */
  async sendRecord(invoiceId: string): Promise<void> {
    const claimed = await this.claimInvoiceForSend(invoiceId);
    if (!claimed) return;
    const inv = claimed.invoice;
    const now = new Date();
    const issueMoment = inv.issuedAt ?? inv.createdAt;
    let currentNumber = inv.invoiceNumber ?? "";

    if (!inv.invoiceNumber || !inv.ettn || !inv.recipientVknTckn) {
      await this.prisma.elogoInvoice.update({
        where: { id: inv.id },
        data: {
          status: "failed",
          elogoResultMsg:
            "Missing invoice number, ETTN or recipient identifier",
        },
      });
      return;
    }

    // Captured after the guard: the narrowing above does not reach the XML
    // builder closure below, which is why one of its uses carried a non-null
    // assertion instead.
    const ettn = inv.ettn;

    const net = Number(inv.netAmount);
    const rate = Number(inv.vatRate);
    const isReturn = inv.type === "return_invoice";

    // Provider geçici olarak kapalıyken kayıt EARCHIVE açılmış olabilir. İlk gerçek
    // gönderimde alıcı mükellefiyetini tekrar çöz; return belgesi orijinal tipini korur.
    let documentType = inv.documentType as ElogoDocumentType;
    let alias: string | undefined;
    const isRealIdentifier =
      inv.recipientVknTckn !== "11111111111" &&
      (inv.recipientVknTckn.length === 10 ||
        inv.recipientVknTckn.length === 11);
    if (!isReturn && isRealIdentifier) {
      let chk: ElogoUserCheckResult | null = null;
      try {
        chk = await this.elogo.checkUser(inv.recipientVknTckn);
      } catch (err: unknown) {
        // Mükellef sorgusu ağ/sağlayıcı arızasıyla düşerse belge KALICI
        // `failed` olmamalı: bu, gönderimdeki geçici arızayla aynı durumdur —
        // sayaç geri alınır, kayıt `pending` kalır ve cron yeniden dener.
        const transient = isTransientElogoFailure(err);
        const reason = String((err as Error)?.message ?? err).slice(0, 400);
        await this.prisma.elogoInvoice
          .update({
            where: { id: inv.id },
            data: {
              status: transient ? "pending" : "failed",
              ...(transient ? { attemptCount: { decrement: 1 } } : {}),
              elogoResultMsg: `Recipient e-Invoice status could not be resolved: ${reason}`,
            },
          })
          .catch(() => undefined);
        this.logger[transient ? "warn" : "error"](
          `eLogo ${inv.type} mükellef sorgusu hatası (${currentNumber}, ${transient ? "geçici" : "kalıcı"}): ${reason}`,
        );
        return;
      }
      if (!chk) {
        await this.prisma.elogoInvoice.update({
          where: { id: inv.id },
          data: {
            status: "failed",
            elogoResultMsg: "Recipient e-Invoice status could not be resolved",
          },
        });
        return;
      }
      documentType = chk?.isEInvoiceUser ? "EINVOICE" : "EARCHIVE";
      alias = chk?.isEInvoiceUser ? chk.eInvoicePkAlias : undefined;
      if (documentType !== inv.documentType) {
        await this.prisma.elogoInvoice.update({
          where: { id: inv.id },
          data: { documentType },
        });
      }
    } else if (documentType === "EINVOICE") {
      const chk = await this.elogo
        .checkUser(inv.recipientVknTckn)
        .catch(() => null);
      alias = chk?.eInvoicePkAlias;
    }
    const isEInvoice = documentType === "EINVOICE";
    if (isEInvoice) {
      if (!alias) {
        await this.prisma.elogoInvoice.update({
          where: { id: inv.id },
          data: {
            status: "failed",
            elogoResultMsg: "E-INVOICE recipient alias could not be resolved",
          },
        });
        return;
      }
    }

    // Alıcı e-postası + adresi UBL'e konur — eLogo e-Arşiv'i (ELEKTRONIK) bu e-postaya gönderir.
    const [recipientUser, addr] = await Promise.all([
      inv.recipientUserId
        ? this.prisma.user
            .findUnique({
              where: { id: inv.recipientUserId },
              select: { email: true },
            })
            .catch(() => null)
        : Promise.resolve(null),
      this.documents.fetchAddress(inv.recipientUserId),
    ]);
    const snapshotAddress =
      inv.recipientCity || inv.recipientDistrict || inv.recipientStreet
        ? {
            city: inv.recipientCity,
            district: inv.recipientDistrict,
            address: inv.recipientStreet,
          }
        : null;
    // Snapshot önce: misafir siparişlerinde kullanıcı kaydı paylaşılan sistem
    // hesabıdır (sistem e-postası + adres yok).
    const recipientEmail = inv.recipientEmail ?? recipientUser?.email ?? null;
    const party = this.documents.buildParty(
      inv.recipientVknTckn,
      inv.recipientName || "Müşteri",
      recipientEmail,
      snapshotAddress ?? addr,
    );
    // e-Arşiv gönderim şekli: eLogo ELEKTRONIK belgeyi alıcının e-postasına
    // yollar; e-posta yoksa GİB KAGIT bekler — ELEKTRONIK göndermek ya
    // reddedilir ya da belge alıcıya hiç ulaşmaz. e-Fatura'da bu alan yoktur.
    const sendType: "ELEKTRONIK" | "KAGIT" = recipientEmail
      ? "ELEKTRONIK"
      : "KAGIT";
    const desc =
      inv.lineDescription || LINE_DESCRIPTION[inv.type] || "Hizmet bedeli";

    let billingRef: { invoiceId: string; issueDate: string } | undefined;
    if (isReturn && inv.billingReference) {
      billingRef = {
        invoiceId: inv.billingReference,
        issueDate: this.documents.ymd(
          inv.billingReferenceIssueDate ?? issueMoment,
        ),
      };
    }

    // Kalem snapshot'ı varsa (ürün faturası) belge kalem kalem üretilir; yoksa
    // tek satırlı hizmet faturası. Snapshot kesim anında donduğu için retry
    // aynı belgeyi yeniden üretir.
    const snapshotLines = readInvoiceLineItems(inv.lineItems);
    const buildXml = (invoiceNumber: string) =>
      buildInvoiceXml({
        profileId: isEInvoice ? "TEMELFATURA" : "EARSIVFATURA",
        invoiceTypeCode: isReturn ? "IADE" : "SATIS",
        id: invoiceNumber,
        uuid: ettn,
        issueDate: this.documents.ymd(issueMoment),
        issueTime: this.documents.hms(issueMoment),
        currency: "TRY",
        // Gönderim şekli yalnız e-Arşiv'de gerekli (e-Fatura'da AdditionalDocumentReference yok).
        sendType: isEInvoice ? undefined : sendType,
        note: desc,
        supplier: this.documents.supplierParty(),
        customer: party,
        lines: snapshotLines.length
          ? snapshotLines.map((l) => ({
              name: l.name,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              lineExtension: l.net,
              vatRate: l.vatRate,
            }))
          : [{ name: desc, quantity: 1, unitPrice: net, vatRate: rate }],
        ...(billingRef ? { billingReference: billingRef } : {}),
      });

    const deliver = (invoiceNumber: string, total: number) => {
      void this.deliverPdf(
        {
          id: inv.id,
          ettn,
          invoiceNumber,
          type: inv.type,
          total,
          currentPdfUrl: inv.pdfUrl,
          recipientName: inv.recipientName,
          lineDescription: inv.lineDescription,
        },
        recipientEmail,
      ).catch((e) =>
        this.logger.warn(
          `eLogo PDF teslim hatası (${invoiceNumber}): ${e?.message}`,
        ),
      );
    };

    // Önceki deneme sırasında provider başarı verip DB güncellenememiş olabilir.
    // Aynı ETTN'i yeniden yollamadan önce durum sorgusuyla mutabakat yap.
    if (claimed.reconcileFirst) {
      const providerStatus = await this.elogo
        .getDocumentStatus(inv.ettn, documentType)
        .catch(() => null);
      if (providerStatus?.isCancel) {
        await this.prisma.elogoInvoice.update({
          where: { id: inv.id },
          data: {
            status: "cancelled",
            cancelledAt: now,
            elogoResultCode: providerStatus.code ?? null,
            elogoResultMsg: providerStatus.description ?? null,
          },
        });
        return;
      }
      if (
        providerStatus &&
        (providerStatus.status === 2 || providerStatus.code === 1300)
      ) {
        await this.prisma.elogoInvoice.update({
          where: { id: inv.id },
          data: {
            status: "sent",
            elogoResultCode: providerStatus.code ?? null,
            elogoResultMsg: providerStatus.description ?? null,
            issuedAt: issueMoment,
            sentAt: now,
          },
        });
        deliver(inv.invoiceNumber, Number(inv.total));
        return;
      }
      if (providerStatus?.status === 1) {
        await this.prisma.elogoInvoice.update({
          where: { id: inv.id },
          data: {
            status: "processing",
            elogoResultCode: providerStatus.code ?? null,
            elogoResultMsg:
              providerStatus.description ?? "Provider is still processing",
          },
        });
        return;
      }
    }

    // Paylaşımlı eLogo hesabında (özellikle demo) fatura numarası çakışırsa yeni numara
    // alıp boşluğa kadar atlayarak yeniden dener. Böylece taze bir DB'nin sequence'i,
    // hesapta zaten kullanılmış numaralarla otomatik hizalanır (elle müdahale gerekmez).
    try {
      for (let attempt = 0; attempt < 12; attempt++) {
        const { xml, totals } = buildXml(currentNumber);
        const res = await this.elogo.sendDocument({
          documentType,
          documentUuid: inv.ettn,
          documentNumber: currentNumber,
          ublXml: xml,
          signed: false,
          ...(alias ? { alias } : {}),
          ...(this.documents.xsltUuid
            ? { xsltUuid: this.documents.xsltUuid }
            : {}),
        });

        if (res.success) {
          await this.prisma.elogoInvoice.update({
            where: { id: inv.id },
            data: {
              invoiceNumber: currentNumber,
              netAmount: totals.taxExclusive,
              taxAmount: totals.tax,
              total: totals.payable,
              sendType,
              status: "sent",
              elogoRefId: res.refId != null ? String(res.refId) : null,
              elogoResultCode: res.code ?? null,
              elogoResultMsg: res.description ?? null,
              issuedAt: issueMoment,
              sentAt: now,
            },
          });
          this.logger.log(
            `eLogo ${inv.type} faturası gönderildi (${currentNumber}, ref=${res.refId})`,
          );
          deliver(currentNumber, totals.payable);
          return;
        }

        // Numara çakışması → ARTAN adımla ileri atla (ardışık dolu numara bloğunu az
        // denemede geç: 1,2,3,... büyüyen sıçrama; 12 denemede ~78 numaralık blok aşılır).
        if (attempt < 11 && this.isDuplicateNumberError(res.description)) {
          const skip = attempt + 1;
          for (let s = 0; s < skip; s++) {
            currentNumber = await this.documents.allocateInvoiceNumber(
              invoiceIssueYear(issueMoment),
            );
          }
          this.logger.warn(
            `eLogo numara çakışması → +${skip} atlanıp ${currentNumber} ile tekrar (${inv.type})`,
          );
          continue;
        }

        // Başka bir red (veya çakışma denemeleri tükendi) → failed olarak işaretle.
        // YAPILANDIRMA reddi (XSLT tasarımı yok vb.) belgeye değil hesaba
        // özgüdür: yeniden denemek sonucu değiştirmez, bu yüzden bütçe hemen
        // tüketilmiş sayılır ve alarm bir sonraki cron turunda görünür.
        const configurationFailure = isConfigurationElogoFailure(
          res.description,
        );
        await this.prisma.elogoInvoice.update({
          where: { id: inv.id },
          data: {
            invoiceNumber: currentNumber,
            netAmount: totals.taxExclusive,
            taxAmount: totals.tax,
            total: totals.payable,
            status: "failed",
            ...(configurationFailure
              ? { attemptCount: ELOGO_MAX_SEND_ATTEMPTS }
              : {}),
            elogoResultCode: res.code ?? null,
            elogoResultMsg: res.description ?? null,
          },
        });
        this.logger.error(
          configurationFailure
            ? `ELOGO_CONFIG_ERROR ${inv.type} faturası sağlayıcı yapılandırma reddi (${currentNumber}): ${res.description} — XSLT/hesap ayarı düzeltilmeden yeniden denenmeyecek`
            : `eLogo ${inv.type} faturası reddedildi (${currentNumber}): ${res.description}`,
        );
        return;
      }
    } catch (err: any) {
      // GEÇİCİ arıza (ağ/zaman aşımı/sağlayıcı 5xx) deneme bütçesini TÜKETMEMELİ:
      // 8 deneme × 30 dk cron ≈ 4 saat; sağlayıcı bir gün kapalı kalırsa fatura
      // kalıcı `failed`'e düşüp 7 günlük e-Arşiv süresini sessizce kaçırıyordu.
      // Sayaç geri alınır ve kayıt `pending`'de bırakılır → cron denemeye devam eder.
      const transient = isTransientElogoFailure(err);
      await this.prisma.elogoInvoice
        .update({
          where: { id: inv.id },
          data: {
            invoiceNumber: currentNumber,
            status: transient ? "pending" : "failed",
            ...(transient ? { attemptCount: { decrement: 1 } } : {}),
            elogoResultMsg: String(err?.message || err).slice(0, 500),
          },
        })
        .catch(() => undefined);
      this.logger[transient ? "warn" : "error"](
        `eLogo ${inv.type} faturası gönderim hatası (${currentNumber}, ${transient ? "geçici" : "kalıcı"}): ${err?.message}`,
      );
    }
  }

  /** eLogo "aynı fatura numarası tekrar kullanılamaz" reddini tanı (paylaşımlı hesapta numara çakışması). */
  private isDuplicateNumberError(msg?: string | null): boolean {
    if (!msg) return false;
    const m = msg.toLocaleLowerCase("tr");
    return (
      m.includes("tekrar kullanılamaz") ||
      m.includes("aynı fatura numarası") ||
      (m.includes("daha önce") && m.includes("fatura"))
    );
  }

  /**
   * Kesilen e-Arşiv PDF'ini eLogo'dan çek → S3'e kaydet → alıcıya KENDİ SMTP'mizden e-postala.
   * Demo eLogo mail atmadığı için maili biz atıyoruz; PDF de uygulamada gösterilebilsin diye S3'te.
   * Tamamen best-effort: hata kesimi etkilemez.
   */
  private async deliverPdf(
    inv: {
      id: string;
      ettn: string;
      invoiceNumber: string;
      type: string;
      total: any;
      currentPdfUrl: string | null;
      recipientName?: string | null;
      lineDescription?: string | null;
    },
    recipientEmail: string | null,
  ): Promise<void> {
    // MAIL-ONCE GARANTİSİ: bu fatura zaten maillendiyse ASLA tekrar gönderme. Çok sayıda tetik
    // (completeOrder/confirmDelivery/admin/cron/at_warehouse) aynı faturayı işleyebilir; emailSentAt
    // dolu ise çık. (cut() zaten sent'te no-op yapar; bu ikinci emniyet — yarış durumları için.)
    const fresh = await this.prisma.elogoInvoice
      .findUnique({ where: { id: inv.id }, select: { emailSentAt: true } })
      .catch(() => null);
    if (fresh?.emailSentAt) {
      this.logger.debug(
        `eLogo mail zaten gönderilmiş (${inv.invoiceNumber}) — tekrar atlanıyor`,
      );
      return;
    }
    const pdf = await this.elogo
      .getEArchiveInvoicePdf(inv.ettn)
      .catch(() => null);
    if (!pdf || pdf.length < 200) {
      this.logger.warn(
        `eLogo PDF alınamadı (${inv.invoiceNumber}) — S3/mail atlandı`,
      );
      return;
    }
    // 1) S3'e kaydet (documents bucket).
    let pdfKey = inv.currentPdfUrl;
    try {
      if (this.storage?.isStorageAvailable?.()) {
        const up = await this.storage.uploadFile(pdf, {
          bucket: "documents",
          folder: "elogo-invoices",
          filename: `${inv.invoiceNumber}.pdf`,
          mimeType: "application/pdf",
          isPublic: false,
          entityType: "elogo_invoice",
          entityId: inv.id,
        } as any);
        pdfKey = up.key;
      }
    } catch (e: any) {
      this.logger.warn(
        `eLogo PDF S3 yükleme hatası (${inv.invoiceNumber}): ${e?.message}`,
      );
    }
    // 2) Alıcıya kendi SMTP'mizden e-postala (PDF ekli). Şablon = admin'den düzenlenebilir
    //    'elogo-invoice' (DB override) → yoksa koddaki güzel Tarodan varsayılanı.
    let emailedAt: Date | null = null;
    try {
      if (recipientEmail && this.smtp) {
        const desc =
          inv.lineDescription || LINE_DESCRIPTION[inv.type] || "Hizmet bedeli";
        const tplKey = "elogo-invoice";
        const tplData = {
          recipientName: inv.recipientName || "Değerli Müşterimiz",
          description: desc,
          invoiceNumber: inv.invoiceNumber,
          total: Number(inv.total),
          type: inv.type,
        };
        const frontendUrl = resolveFrontendUrl();
        const dbTpl = await this.prisma.emailTemplate
          .findUnique({ where: { key: tplKey } })
          .catch(() => null);
        const email = renderManagedEmailTemplate(
          tplKey,
          { ...tplData, to: recipientEmail },
          dbTpl,
          frontendUrl,
        );
        await this.smtp.sendEmail({
          to: recipientEmail,
          subject: email.subject,
          html: email.html,
          attachments: [{ filename: `${inv.invoiceNumber}.pdf`, content: pdf }],
        } as any);
        emailedAt = new Date();
      }
    } catch (e: any) {
      this.logger.warn(
        `eLogo PDF e-posta hatası (${inv.invoiceNumber}): ${e?.message}`,
      );
    }
    // 3) Kaydı güncelle (pdfUrl + emailSentAt).
    await this.prisma.elogoInvoice
      .update({
        where: { id: inv.id },
        data: { pdfUrl: pdfKey, emailSentAt: emailedAt },
      })
      .catch(() => undefined);
    this.logger.log(
      `eLogo PDF teslim (${inv.invoiceNumber}): S3=${pdfKey ? "OK" : "-"} mail=${emailedAt ? recipientEmail : "-"}`,
    );
  }

  /** Cron: pending/failed ve lease'i düşmüş processing kayıtları yeniden dener. */
  async retryPendingInvoices(maxAttempts = 8, batch = 50): Promise<void> {
    if (!this.elogo.isEnabled()) return;
    const staleBefore = new Date(Date.now() - SEND_LEASE_MS);
    const pend = await this.prisma.elogoInvoice.findMany({
      where: {
        OR: [
          {
            status: { in: ["pending", "failed"] },
            attemptCount: { lt: maxAttempts },
          },
          { status: "processing", lastAttemptAt: { lt: staleBefore } },
        ],
      },
      take: batch,
      orderBy: { createdAt: "asc" },
    });
    for (const inv of pend) {
      await this.sendRecord(inv.id).catch((e) =>
        this.logger.error(
          `eLogo retry hata (${inv.invoiceNumber}): ${e?.message}`,
        ),
      );
    }
  }

  /**
   * Deneme bütçesi tükenmiş (`failed` + attemptCount >= üst sınır) faturaları
   * greplenebilir ALARM olarak raporlar. Bunlar otomatik kurtarılmaz: yasal süre
   * işlerken kimse fark etmezse fatura hiç kesilmez.
   *
   * Alarm belge başına 24 saatte BİR üretilir (admin in-app bildirimi + error
   * log/Sentry); aynı belge sonraki turlarda yalnız warn ile sayılır. Eskiden
   * 30 dakikalık her tur aynı beş belgeyi Sentry'ye yeniden yazıyordu.
   */
  async reportExhaustedInvoices(): Promise<number> {
    const exhausted = await this.prisma.elogoInvoice.findMany({
      where: {
        status: "failed",
        attemptCount: { gte: ELOGO_MAX_SEND_ATTEMPTS },
      },
      select: {
        id: true,
        type: true,
        sourceId: true,
        invoiceNumber: true,
        elogoResultMsg: true,
      },
      take: 100,
    });
    if (exhausted.length === 0) return 0;

    const invoicesLink = `${adminUrl()}/finance/invoices?status=failed`;
    let fresh = 0;
    for (const inv of exhausted) {
      const line = `ELOGO_INVOICE_EXHAUSTED id=${inv.id} type=${inv.type} source=${inv.sourceId} no=${inv.invoiceNumber}: ${inv.elogoResultMsg ?? "-"}`;
      // Bildirim servisi yoksa (birim testleri, kısmi kurulum) tekilleştirme de
      // yoktur: alarm her turda görünür kalsın — sessizlikten iyidir.
      const isNew = this.notifications
        ? await this.notifications
            .notifyAllAdminsOnce(
              `elogo-exhausted:${inv.id}`,
              24 * 60 * 60,
              NotificationType.ELOGO_INVOICE_EXHAUSTED,
              {
                invoiceId: inv.id,
                invoiceNumber: inv.invoiceNumber ?? inv.id,
                typeLabel: LINE_DESCRIPTION[inv.type] ?? inv.type,
                reason: (inv.elogoResultMsg ?? "-").slice(0, 200),
                adminLink: invoicesLink,
              },
            )
            .catch((err: unknown) => {
              this.logger.warn(
                `tükenmiş fatura admin bildirimi başarısız (${inv.id}): ${(err as Error)?.message}`,
              );
              return true;
            })
        : true;
      if (isNew) {
        fresh++;
        this.logger.error(line);
      } else {
        this.logger.warn(`${line} (daha önce bildirildi)`);
      }
    }
    return exhausted.length;
  }

  /**
   * Admin müdahalesi: deneme sayacını sıfırlar ve gönderimi yeniden başlatır.
   * Sağlayıcı arızası giderildikten sonra DB'ye elle dokunmadan kurtarma yolu.
   * Numara/ETTN korunur (aynı belge yeniden gönderilir) → çift fatura oluşmaz.
   */
  async resetInvoiceAttempts(invoiceId: string): Promise<void> {
    await this.prisma.elogoInvoice.update({
      where: { id: invoiceId },
      data: { attemptCount: 0, status: "pending" },
    });
    await this.sendRecord(invoiceId);
  }
}
