import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import {
  Prisma,
  type EInvoiceProviderName,
  type FiscalInvoice,
} from "@prisma/client";
import { AccountLaneService } from "../account-lane/account-lane.service";
import { PrismaService } from "../../prisma";
import { INVOICE_MAX_SEND_ATTEMPTS } from "./helpers/invoice-retry-policy";
import { retryOnWriteConflict } from "./helpers/invoice-write-conflict";
import { INVOICE_PDF_STORAGE } from "./helpers/invoice-pdf";
import {
  invoiceDescriptionOf,
  LINE_DESCRIPTION,
} from "./invoice/invoice-line-description";
import { resolveInvoiceParties } from "./invoice/invoice-parties";
import { invoiceIssueYear } from "./invoice/invoice-datetime";
import { renderManagedEmailTemplate } from "../../common/helpers/email-template-renderer";
import {
  adminUrl,
  frontendUrl as resolveFrontendUrl,
} from "../../config/app-urls";
import { NotificationService } from "../notification/notification.service";
import { NotificationType } from "../notification/dto";
import { computeFiscalDocumentTotals } from "./invoice/fiscal-document-totals";
import {
  invoiceDiscountFromLines,
  invoiceTotalsFromLines,
  readInvoiceLineItems,
} from "./invoice/invoice-lines";
import {
  E_INVOICE_PROVIDER,
  type EInvoiceProvider,
  type EInvoiceScenario,
  type FiscalDocumentInput,
  type FiscalDocumentLine,
  type RecipientKindResult,
} from "./provider/e-invoice-provider";
import {
  InvoiceProviderRegistry,
  providerForRecord,
} from "./provider/provider-registry";
import type { CutOptions, RevenueType } from "./invoicing.service";
import { i18nMessage } from "../i18n";
import { InvoiceDocumentService } from "./invoice-document.service";
import { StorageService } from "../storage/storage.service";
import { SmtpProvider } from "../mail/smtp.provider";

/**
 * Faturanın e-Logo'ya GİDİŞİ — InvoicingService'ten birebir taşındı.
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
const MAX_SEND_ATTEMPTS = INVOICE_MAX_SEND_ATTEMPTS;
/** Gönderim hakkının kilit süresi: bu kadar süre ilerlemeyen `processing` kayıt yeniden denenir. */
const SEND_LEASE_MS = 10 * 60 * 1000;

@Injectable()
export class InvoiceDeliveryService {
  private readonly logger = new Logger(InvoiceDeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(E_INVOICE_PROVIDER) private readonly provider: EInvoiceProvider,
    private readonly documents: InvoiceDocumentService,
    @Optional() private readonly storage?: StorageService,
    @Optional() private readonly smtp?: SmtpProvider,
    @Optional() private readonly notifications?: NotificationService,
    // Test şeridi kapısı. AccountLaneModule @Global olduğu için runtime'da her
    // zaman gelir; @Optional yalnız üç-argümanlı birim testleri için.
    @Optional() private readonly lanes?: AccountLaneService,
    // Kesilmiş kaydın KENDİ sağlayıcısı (eLogo belgesi Netsis'e geçildikten
    // sonra da eLogo'dan sorulur). Yoksa bağlı sağlayıcı — birim testleri.
    @Optional() private readonly registry?: InvoiceProviderRegistry,
  ) {}

  /** Kaydı kesen sağlayıcı — durum, gönderim ve PDF ona sorulur. */
  private providerOf(record: {
    provider?: EInvoiceProviderName | null;
  }): EInvoiceProvider {
    return providerForRecord(this.registry, this.provider, record.provider);
  }

  // ───────────────────────── core ─────────────────────────

  /** Gelir faturası kes (idempotent). Hata YUTULUR (non-blocking) — failed kayıt + cron retry. */
  async cut(
    type: RevenueType,
    sourceId: string,
    recipientUserId: string,
    grossAmount: number,
    opts: CutOptions = {},
  ): Promise<void> {
    // Test şeridi: alıcı test hesabıysa e-belge ÜRETME (GİB'e gerçek fatura
    // gider, seri numarası tükenirdi). Kayıt da açılmaz; retry kuyruğuna girmez.
    if (await this.lanes?.isTestLane(recipientUserId)) {
      this.logger.log(
        `eLogo skipped for test lane — ${type} source=${sourceId} recipient=${recipientUserId}`,
      );
      return;
    }
    const {
      lineDescription,
      guestRecipient,
      categoryId,
      lineItems,
      sourceReference,
    } = opts;
    try {
      const providerEnabled = this.provider.isEnabled();
      if (!providerEnabled) {
        this.logger.debug(
          `eLogo kapalı — ${type} faturası pending kaydedilecek (source=${sourceId})`,
        );
      }
      if (!(grossAmount > 0)) return;

      const existing = await this.prisma.fiscalInvoice.findUnique({
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
      // İşlemin tarafları ve gerçekleşme şekli KESİM ANINDA snapshot'lanır:
      // admin listesi bu kolonlarla filtreleyip sıralıyor, sonradan çözülen bir
      // değerle sunucu tarafı sayfalama kurulamaz.
      const parties = await resolveInvoiceParties(this.prisma, type, sourceId);
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
      // denenir — bkz. invoice-write-conflict.ts.
      const record = await retryOnWriteConflict(
        () =>
          this.prisma.$transaction(
            async (tx) => {
              const raced = await tx.fiscalInvoice.findUnique({
                where: { type_sourceId: { type, sourceId } },
              });
              if (raced) return raced;
              // Numarayı sağlayıcı veriyorsa `null`: kayıt numarasız açılır,
              // sayaç ilerlemez; numara gönderim sonucundan yazılır.
              const invoiceNumber =
                await this.documents.allocateDocumentNumberInTransaction(
                  tx,
                  invoiceIssueYear(now),
                );
              return tx.fiscalInvoice.create({
                data: {
                  type,
                  sourceId,
                  // Belgeyi kesecek sağlayıcı (`INVOICE_PROVIDER`). Gönderim,
                  // durum, iptal ve PDF bundan sonra hep bu kayda bakar.
                  provider: this.provider.name,
                  sellerUserId: parties.sellerUserId,
                  buyerUserId: parties.buyerUserId,
                  context: parties.context,
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
                  discountTotal: hasLines
                    ? invoiceDiscountFromLines(lineItems!)
                    : 0,
                  vatRate,
                  status: "pending",
                  sourceReference: sourceReference?.trim() || null,
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
    } catch (err: unknown) {
      // Idempotency yarışı (aynı anda iki create) veya beklenmedik hata — yut, cron toparlar.
      this.logger.error(
        `eLogo ${type} faturası kesimi hata (source=${sourceId}): ${(err as Error)?.message}`,
      );
    }
  }

  /**
   * DB tabanlı gönderim lease'i. Aynı pending/failed belgeyi yalnız bir API/worker
   * instance'ı sağlayıcıya yollar; çöken processing lease'i cron tarafından alınabilir.
   */
  private async claimInvoiceForSend(
    invoiceId: string,
  ): Promise<{ invoice: FiscalInvoice; reconcileFirst: boolean } | null> {
    const current = await this.prisma.fiscalInvoice.findUnique({
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

    const claim = await this.prisma.fiscalInvoice.updateMany({
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
    const invoice = await this.prisma.fiscalInvoice.findUnique({
      where: { id: current.id },
    });
    if (!invoice) return null;
    return {
      invoice,
      reconcileFirst:
        current.status === "processing" || current.attemptCount > 0,
    };
  }

  /** Kayıttaki snapshot'tan belgeyi kurup sağlayıcıya gönderir, durumu günceller. */
  async sendRecord(invoiceId: string): Promise<void> {
    const claimed = await this.claimInvoiceForSend(invoiceId);
    if (!claimed) return;
    const inv = claimed.invoice;
    const now = new Date();
    const issueMoment = inv.issuedAt ?? inv.createdAt;
    let currentNumber = inv.invoiceNumber ?? "";
    // Belgeyi kesen sağlayıcı. Numarayı o veriyorsa (Netsis) kayıt gönderime
    // kadar NUMARASIZDIR; numara ve referans gönderim sonucundan yazılır.
    const provider = this.providerOf(inv);
    const providerNumbered = provider.numbering === "provider";

    if (
      (!inv.invoiceNumber && !providerNumbered) ||
      !inv.ettn ||
      !inv.recipientVknTckn
    ) {
      await this.prisma.fiscalInvoice.update({
        where: { id: inv.id },
        data: {
          status: "failed",
          providerResultMsg:
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
    let documentType = inv.documentType as EInvoiceScenario;
    let alias: string | undefined;
    const isRealIdentifier =
      inv.recipientVknTckn !== "11111111111" &&
      (inv.recipientVknTckn.length === 10 ||
        inv.recipientVknTckn.length === 11);
    // Belge sağlayıcıda zaten oluşturulduysa (Netsis fişi var, yalnız gönderimi
    // kaldı) senaryo o belgeyle donmuştur: yeniden çözülmez.
    const createdAtProvider = providerNumbered && !!inv.providerRef;
    if (!isReturn && isRealIdentifier && !createdAtProvider) {
      let chk: RecipientKindResult | null = null;
      try {
        chk = await provider.resolveRecipientKind(inv.recipientVknTckn);
      } catch (err: unknown) {
        // Mükellef sorgusu ağ/sağlayıcı arızasıyla düşerse belge KALICI
        // `failed` olmamalı: bu, gönderimdeki geçici arızayla aynı durumdur —
        // sayaç geri alınır, kayıt `pending` kalır ve cron yeniden dener.
        const transient = provider.classifyError(err) === "network";
        const reason = String((err as Error)?.message ?? err).slice(0, 400);
        await this.prisma.fiscalInvoice
          .update({
            where: { id: inv.id },
            data: {
              status: transient ? "pending" : "failed",
              ...(transient ? { attemptCount: { decrement: 1 } } : {}),
              providerResultMsg: `Recipient e-Invoice status could not be resolved: ${reason}`,
            },
          })
          .catch(() => undefined);
        this.logger[transient ? "warn" : "error"](
          `eLogo ${inv.type} mükellef sorgusu hatası (${currentNumber}, ${transient ? "geçici" : "kalıcı"}): ${reason}`,
        );
        return;
      }
      if (!chk) {
        await this.prisma.fiscalInvoice.update({
          where: { id: inv.id },
          data: {
            status: "failed",
            providerResultMsg:
              "Recipient e-Invoice status could not be resolved",
          },
        });
        return;
      }
      documentType = chk.kind;
      alias = chk.kind === "EINVOICE" ? chk.alias : undefined;
      if (documentType !== inv.documentType) {
        await this.prisma.fiscalInvoice.update({
          where: { id: inv.id },
          data: { documentType },
        });
      }
    } else if (documentType === "EINVOICE") {
      const chk = await provider
        .resolveRecipientKind(inv.recipientVknTckn)
        .catch(() => null);
      alias = chk?.alias;
    }
    const isEInvoice = documentType === "EINVOICE";
    // PK etiketi yalnız belgeyi DOĞRUDAN entegratöre veren sağlayıcıda
    // gerekir. ERP (Netsis) e-Faturayı kendi carisinin etiketine yollar;
    // etiketi bizden beklemez.
    if (isEInvoice && !providerNumbered) {
      if (!alias) {
        await this.prisma.fiscalInvoice.update({
          where: { id: inv.id },
          data: {
            status: "failed",
            providerResultMsg:
              "E-INVOICE recipient alias could not be resolved",
          },
        });
        return;
      }
    }

    // Alıcı e-postası + adresi belgeye konur — e-Arşiv'i (ELEKTRONIK) sağlayıcı bu e-postaya gönderir.
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
    // e-Arşiv gönderim şekli: sağlayıcı ELEKTRONIK belgeyi alıcının e-postasına
    // yollar; e-posta yoksa GİB KAGIT bekler — ELEKTRONIK göndermek ya
    // reddedilir ya da belge alıcıya hiç ulaşmaz. e-Fatura'da bu alan yoktur.
    const sendType: "ELEKTRONIK" | "KAGIT" = recipientEmail
      ? "ELEKTRONIK"
      : "KAGIT";
    const desc =
      inv.lineDescription || LINE_DESCRIPTION[inv.type] || "Hizmet bedeli";
    // "Kayıt No" — belgenin hangi alışverişten doğduğunu taşımak zorunda; aynı
    // kod hakediş dökümünün "Kayıt No" kolonunda da durur. Hem belge notuna hem
    // kalemin açıklamasına yazılır: sağlayıcının görsel tasarımı hangisini bastığına
    // göre değişir, ikisinde de durması belgeyi bozmaz.
    const orderNote = inv.sourceReference?.trim()
      ? `Kayıt No: ${inv.sourceReference.trim()}`
      : null;

    let billingRef: FiscalDocumentInput["billingReference"];
    if (isReturn && inv.billingReference) {
      billingRef = {
        documentNumber: inv.billingReference,
        issueDate: this.documents.ymd(
          inv.billingReferenceIssueDate ?? issueMoment,
        ),
      };
    }

    // Kalem snapshot'ı varsa (ürün faturası) belge kalem kalem üretilir; yoksa
    // tek satırlı hizmet faturası. Snapshot kesim anında donduğu için retry
    // aynı belgeyi yeniden üretir.
    const snapshotLines = readInvoiceLineItems(inv.lineItems);
    const lines: FiscalDocumentLine[] = snapshotLines.length
      ? snapshotLines.map((l) => ({
          name: l.name,
          description: orderNote ?? undefined,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          lineExtension: l.net,
          discount: l.discount,
          vatRate: l.vatRate,
          taxAmount: l.taxAmount,
        }))
      : [
          {
            name: desc,
            description: orderNote ?? undefined,
            quantity: 1,
            unitPrice: net,
            vatRate: rate,
          },
        ];
    const fiscalDocument = (documentNumber: string): FiscalDocumentInput => ({
      scenario: documentType,
      kind: isReturn ? "RETURN" : "SALE",
      // Sağlayıcı numaralandırmasında numara henüz yoktur — boş gider.
      documentNumber: documentNumber || undefined,
      ettn,
      issueDate: this.documents.ymd(issueMoment),
      issueTime: this.documents.hms(issueMoment),
      currency: "TRY",
      // Gönderim şekli yalnız e-Arşiv'de gerekli (e-Fatura'da bu alan yok).
      sendType: isEInvoice ? undefined : sendType,
      note: orderNote ? `${desc} — ${orderNote}` : desc,
      supplier: this.documents.supplierParty(),
      customer: party,
      lines,
      ...(billingRef ? { billingReference: billingRef } : {}),
    });

    const deliver = (
      invoiceNumber: string,
      total: number,
      issuedEttn: string = ettn,
    ) => {
      void this.deliverPdf(
        provider,
        {
          id: inv.id,
          ettn: issuedEttn,
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
      const providerStatus = await provider
        .getStatus(
          { ettn: inv.ettn, providerRef: inv.providerRef },
          documentType,
        )
        .catch(() => null);
      if (providerStatus?.state === "cancelled") {
        await this.prisma.fiscalInvoice.update({
          where: { id: inv.id },
          data: {
            status: "cancelled",
            cancelledAt: now,
            providerResultCode: providerStatus.resultCode ?? null,
            providerResultMsg: providerStatus.resultMsg ?? null,
          },
        });
        return;
      }
      if (providerStatus?.state === "completed") {
        await this.prisma.fiscalInvoice.update({
          where: { id: inv.id },
          data: {
            status: "sent",
            providerResultCode: providerStatus.resultCode ?? null,
            providerResultMsg: providerStatus.resultMsg ?? null,
            issuedAt: issueMoment,
            sentAt: now,
          },
        });
        // Sağlayıcı numaralandırmasında numara, fiş oluştuğu denemede kayda
        // yazılmıştır; yine de yoksa PDF/e-posta adı olmadan teslim edilmez.
        if (inv.invoiceNumber) deliver(inv.invoiceNumber, Number(inv.total));
        return;
      }
      if (providerStatus?.state === "processing") {
        await this.prisma.fiscalInvoice.update({
          where: { id: inv.id },
          data: {
            status: "processing",
            providerResultCode: providerStatus.resultCode ?? null,
            providerResultMsg:
              providerStatus.resultMsg ?? "Provider is still processing",
          },
        });
        return;
      }
    }

    // Paylaşımlı eLogo hesabında (özellikle demo) fatura numarası çakışırsa yeni numara
    // alıp boşluğa kadar atlayarak yeniden dener. Böylece taze bir DB'nin sequence'i,
    // hesapta zaten kullanılmış numaralarla otomatik hizalanır (elle müdahale gerekmez).
    // Çakışma yalnız yerel numaralandırmada doğar (`numbering === "local"`).
    try {
      // Kayda yazılan tutarlar, sağlayıcıya giden belgeyle AYNI hesaptan gelir.
      const { totals } = computeFiscalDocumentTotals(lines);
      for (let attempt = 0; attempt < 12; attempt++) {
        const res = await provider.send(fiscalDocument(currentNumber), {
          ...(alias ? { recipientAlias: alias } : {}),
          // Belge sağlayıcıda zaten oluştuysa (önceki denemede fiş açıldı,
          // gönderim düştü) yeniden oluşturulmaz, yalnız gönderilir.
          ...(inv.providerRef ? { existingProviderRef: inv.providerRef } : {}),
          invoiceType: inv.type,
          ...(inv.recipientUserId
            ? { recipientUserId: inv.recipientUserId }
            : {}),
          ...(inv.sourceReference?.trim()
            ? { sourceReference: inv.sourceReference.trim() }
            : {}),
        });

        if (res.accepted) {
          // Numarayı sağlayıcı verdiyse kayda ŞİMDİ yazılır. ERP kendi ETTN'ini
          // atadıysa (Netsis) GİB'deki belgenin kimliği odur — bizim ürettiğimiz
          // ETTN onunla değiştirilir; eLogo bizimkini geri döndürür.
          const issuedNumber = providerNumbered
            ? (res.documentNumber ?? inv.invoiceNumber)
            : currentNumber;
          const issuedEttn =
            providerNumbered && res.ettn && res.ettn !== ettn ? res.ettn : ettn;
          await this.prisma.fiscalInvoice.update({
            where: { id: inv.id },
            data: {
              invoiceNumber: issuedNumber,
              ...(issuedEttn !== ettn ? { ettn: issuedEttn } : {}),
              netAmount: totals.taxExclusive,
              taxAmount: totals.tax,
              total: totals.payable,
              // İskonto da belgeden okunur: kayıt, gerçekten basılan XML ile
              // aynı iskontoyu taşımalı (rapor bu kolonu okur).
              discountTotal: totals.allowance,
              sendType,
              status: "sent",
              providerRef: res.providerRef ?? null,
              providerResultCode: res.resultCode ?? null,
              providerResultMsg: res.resultMsg ?? null,
              issuedAt: issueMoment,
              sentAt: now,
            },
          });
          this.logger.log(
            `eLogo ${inv.type} faturası gönderildi (${issuedNumber ?? "-"}, ref=${res.providerRef})`,
          );
          if (issuedNumber) {
            deliver(issuedNumber, totals.payable, issuedEttn);
          } else {
            this.logger.error(
              `${provider.name} ${inv.type} belgesini kabul etti ama numara döndürmedi (id=${inv.id}) — PDF/e-posta atlandı`,
            );
          }
          return;
        }

        // Numara çakışması → ARTAN adımla ileri atla (ardışık dolu numara bloğunu az
        // denemede geç: 1,2,3,... büyüyen sıçrama; 12 denemede ~78 numaralık blok aşılır).
        // Yalnız YEREL numaralandırmada: numarayı sağlayıcı veriyorsa bizim
        // sayacımızdan yeni numara almak anlamsızdır.
        if (
          !providerNumbered &&
          attempt < 11 &&
          res.category === "duplicate-number"
        ) {
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
        const configurationFailure = res.category === "configuration";
        // Belge sağlayıcıda OLUŞUP yalnız gönderimi ağ yüzünden düştüyse
        // (Netsis) bu, fırlatılan geçici arızayla aynıdır: bütçe tüketilmez.
        const transientRejection = res.category === "network";
        await this.prisma.fiscalInvoice.update({
          where: { id: inv.id },
          data: {
            invoiceNumber: providerNumbered
              ? (res.documentNumber ?? inv.invoiceNumber)
              : currentNumber,
            // Oluşmuş belgenin referansı: sonraki deneme yalnız gönderir.
            ...(res.providerRef ? { providerRef: res.providerRef } : {}),
            netAmount: totals.taxExclusive,
            taxAmount: totals.tax,
            total: totals.payable,
            discountTotal: totals.allowance,
            status: transientRejection ? "pending" : "failed",
            ...(configurationFailure
              ? { attemptCount: INVOICE_MAX_SEND_ATTEMPTS }
              : transientRejection
                ? { attemptCount: { decrement: 1 } }
                : {}),
            providerResultCode: res.resultCode ?? null,
            providerResultMsg: res.resultMsg ?? null,
          },
        });
        this.logger.error(
          configurationFailure
            ? `ELOGO_CONFIG_ERROR ${inv.type} faturası sağlayıcı yapılandırma reddi (${currentNumber}): ${res.resultMsg} — XSLT/hesap ayarı düzeltilmeden yeniden denenmeyecek`
            : `eLogo ${inv.type} faturası reddedildi (${currentNumber}): ${res.resultMsg}`,
        );
        return;
      }
    } catch (err: unknown) {
      // GEÇİCİ arıza (ağ/zaman aşımı/sağlayıcı 5xx) deneme bütçesini TÜKETMEMELİ:
      // 8 deneme × 30 dk cron ≈ 4 saat; sağlayıcı bir gün kapalı kalırsa fatura
      // kalıcı `failed`'e düşüp 7 günlük e-Arşiv süresini sessizce kaçırıyordu.
      // Sayaç geri alınır ve kayıt `pending`'de bırakılır → cron denemeye devam eder.
      const transient = provider.classifyError(err) === "network";
      await this.prisma.fiscalInvoice
        .update({
          where: { id: inv.id },
          data: {
            // Sağlayıcı numaralandırmasında numaraya dokunulmaz (boş numara
            // yazmak tekil kolonda ikinci numarasız kayıtla çakışırdı).
            ...(providerNumbered ? {} : { invoiceNumber: currentNumber }),
            status: transient ? "pending" : "failed",
            ...(transient ? { attemptCount: { decrement: 1 } } : {}),
            providerResultMsg: String((err as Error)?.message || err).slice(
              0,
              500,
            ),
          },
        })
        .catch(() => undefined);
      this.logger[transient ? "warn" : "error"](
        `eLogo ${inv.type} faturası gönderim hatası (${currentNumber}, ${transient ? "geçici" : "kalıcı"}): ${(err as Error)?.message}`,
      );
    }
  }

  /**
   * Kesilen e-Arşiv PDF'ini sağlayıcıdan çek → S3'e kaydet → alıcıya KENDİ SMTP'mizden e-postala.
   * Demo eLogo mail atmadığı için maili biz atıyoruz; PDF de uygulamada gösterilebilsin diye S3'te.
   * Tamamen best-effort: hata kesimi etkilemez.
   */
  private async deliverPdf(
    /** Belgeyi kesen sağlayıcı — PDF ondan istenir. */
    provider: EInvoiceProvider,
    inv: {
      id: string;
      ettn: string;
      invoiceNumber: string;
      type: string;
      total: number;
      currentPdfUrl: string | null;
      recipientName?: string | null;
      lineDescription?: string | null;
    },
    recipientEmail: string | null,
  ): Promise<void> {
    // MAIL-ONCE GARANTİSİ: bu fatura zaten maillendiyse ASLA tekrar gönderme. Çok sayıda tetik
    // (completeOrder/confirmDelivery/admin/cron/at_warehouse) aynı faturayı işleyebilir; emailSentAt
    // dolu ise çık. (cut() zaten sent'te no-op yapar; bu ikinci emniyet — yarış durumları için.)
    const fresh = await this.prisma.fiscalInvoice
      .findUnique({ where: { id: inv.id }, select: { emailSentAt: true } })
      .catch(() => null);
    if (fresh?.emailSentAt) {
      this.logger.debug(
        `eLogo mail zaten gönderilmiş (${inv.invoiceNumber}) — tekrar atlanıyor`,
      );
      return;
    }
    const pdf = await provider.fetchPdf({ ettn: inv.ettn }).catch(() => null);
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
          folder: INVOICE_PDF_STORAGE.folder,
          filename: `${inv.invoiceNumber}.pdf`,
          mimeType: "application/pdf",
          isPublic: false,
          entityType: INVOICE_PDF_STORAGE.entityType,
          entityId: inv.id,
        });
        pdfKey = up.key;
      }
    } catch (e: unknown) {
      this.logger.warn(
        `eLogo PDF S3 yükleme hatası (${inv.invoiceNumber}): ${(e as Error)?.message}`,
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
          // EmailLog + Mail Yönlendirme alanı (fatura) şablondan.
          template: tplKey,
          attachments: [{ filename: `${inv.invoiceNumber}.pdf`, content: pdf }],
        });
        emailedAt = new Date();
      }
    } catch (e: unknown) {
      this.logger.warn(
        `eLogo PDF e-posta hatası (${inv.invoiceNumber}): ${(e as Error)?.message}`,
      );
    }
    // 3) Kaydı güncelle (pdfUrl + emailSentAt).
    await this.prisma.fiscalInvoice
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
    if (!this.provider.isEnabled()) return;
    const staleBefore = new Date(Date.now() - SEND_LEASE_MS);
    const pend = await this.prisma.fiscalInvoice.findMany({
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
    const exhausted = await this.prisma.fiscalInvoice.findMany({
      where: {
        status: "failed",
        attemptCount: { gte: INVOICE_MAX_SEND_ATTEMPTS },
      },
      select: {
        id: true,
        type: true,
        sourceId: true,
        invoiceNumber: true,
        providerResultMsg: true,
      },
      take: 100,
    });
    if (exhausted.length === 0) return 0;

    const invoicesLink = `${adminUrl()}/finance/invoices?status=failed`;
    let fresh = 0;
    for (const inv of exhausted) {
      const line = `ELOGO_INVOICE_EXHAUSTED id=${inv.id} type=${inv.type} source=${inv.sourceId} no=${inv.invoiceNumber}: ${inv.providerResultMsg ?? "-"}`;
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
                reason: (inv.providerResultMsg ?? "-").slice(0, 200),
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
    await this.prisma.fiscalInvoice.update({
      where: { id: invoiceId },
      data: { attemptCount: 0, status: "pending" },
    });
    await this.sendRecord(invoiceId);
  }

  /**
   * Admin müdahalesi: kesilmiş faturayı alıcısına YENİDEN e-postalar.
   *
   * Kesim yolundaki "bir kez mail" güvencesini bilerek aşar — o güvence
   * otomatik tetikleyicilerin (completeOrder/cron/at_warehouse) aynı belgeyi
   * defalarca yollamasını engellemek içindir, "müşteriye ulaşmadı, tekrar
   * gönder" kararını değil. Bu yüzden `cut` yolundan ayrı bir metottur.
   *
   * PDF önce S3'ten okunur: kesilmiş belgenin kopyası zaten oradadır ve
   * sağlayıcıya bağımlı olmayan yol daha hızlıdır; yoksa sağlayıcıdan canlı çekilir.
   */
  async emailInvoice(invoiceId: string): Promise<{ sentTo: string }> {
    const invoice = await this.prisma.fiscalInvoice.findUnique({
      where: { id: invoiceId },
      select: {
        id: true,
        ettn: true,
        invoiceNumber: true,
        type: true,
        total: true,
        status: true,
        pdfUrl: true,
        recipientEmail: true,
        recipientName: true,
        lineDescription: true,
        provider: true,
        providerRef: true,
      },
    });
    if (!invoice)
      throw new NotFoundException(
        i18nMessage("server.elogo.archiveInvoiceNotFound"),
      );
    if (
      !invoice.ettn ||
      !invoice.invoiceNumber ||
      (invoice.status !== "sent" && invoice.status !== "signed")
    )
      throw new BadRequestException(
        i18nMessage("server.elogo.invoiceNotIssued"),
      );
    const to = invoice.recipientEmail?.trim();
    if (!to)
      throw new BadRequestException(
        i18nMessage("server.elogo.invoiceRecipientEmailMissing"),
      );
    if (!this.smtp)
      throw new ServiceUnavailableException(
        i18nMessage("server.elogo.invoiceMailUnavailable"),
      );

    const stored =
      invoice.pdfUrl && this.storage?.isStorageAvailable?.()
        ? await this.storage.downloadFileByKey(invoice.pdfUrl).catch(() => null)
        : null;
    const pdf =
      stored ??
      (await this.providerOf(invoice)
        .fetchPdf({ ettn: invoice.ettn, providerRef: invoice.providerRef })
        .catch(() => null));
    if (!pdf || pdf.length < 200)
      throw new ServiceUnavailableException(
        i18nMessage("server.elogo.invoicePdfUnavailable"),
      );

    const template = await this.prisma.emailTemplate
      .findUnique({ where: { key: "elogo-invoice" } })
      .catch(() => null);
    const email = renderManagedEmailTemplate(
      "elogo-invoice",
      {
        recipientName: invoice.recipientName || "Değerli Müşterimiz",
        description: invoiceDescriptionOf(
          invoice.type,
          invoice.lineDescription,
        ),
        invoiceNumber: invoice.invoiceNumber,
        total: Number(invoice.total),
        type: invoice.type,
        to,
      },
      template,
      resolveFrontendUrl(),
    );
    await this.smtp.sendEmail({
      to,
      subject: email.subject,
      html: email.html,
      template: "elogo-invoice",
      attachments: [{ filename: `${invoice.invoiceNumber}.pdf`, content: pdf }],
    });
    await this.prisma.fiscalInvoice.update({
      where: { id: invoice.id },
      data: { emailSentAt: new Date() },
    });
    this.logger.log(
      `eLogo fatura e-postası elle gönderildi (${invoice.invoiceNumber}) → ${to}`,
    );
    return { sentTo: to };
  }
}
