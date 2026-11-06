import { Inject, Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "crypto";
import {
  Prisma,
  type FiscalInvoice,
  type FiscalInvoiceType,
} from "@prisma/client";
import { PrismaService } from "../../prisma";
import {
  invoiceDiscountFromLines,
  invoiceTotalsFromLines,
  platformSaleRatesOf,
  readInvoiceLineItems,
  type InvoiceLineItem,
} from "./invoice/invoice-lines";
import {
  returnInvoiceAmountsOf,
  type ReturnInvoiceAmounts,
  type ReturnInvoiceAmountsInput,
} from "./invoice/return-invoice-amounts";
import { invoiceIssueYear } from "./invoice/invoice-datetime";
import { LINE_DESCRIPTION } from "./invoice/invoice-line-description";
import {
  PACKAGE_FEE_COMPONENT_BY_TYPE,
  PACKAGE_FEE_INVOICE_TYPES,
  isPackageFeeInvoiceType,
} from "./invoice/package-fee-components";
import type { PackageFeeDocument } from "./invoice/package-fee-basis";
import { retryOnWriteConflict } from "./helpers/invoice-write-conflict";
import { refundRequestIdOf } from "./helpers/refund-request-key";
import {
  formatInvoiceCancelClaim,
  isStaleInvoiceCancelClaim,
  parseInvoiceCancelClaim,
} from "./helpers/invoice-cancel-claim";
import { tradeRefundExcludesShipping } from "../trade/helpers/trade-refund-policy";
import { tradeHandedToCargo } from "../trade/helpers/trade-handed-to-cargo";
import type { InvoiceRefundReversePayload } from "../outbox/outbox.types";
import {
  E_INVOICE_PROVIDER,
  type EInvoiceCancelResult,
  type EInvoiceProvider,
} from "./provider/e-invoice-provider";
import { InvoiceDocumentService } from "./invoice-document.service";
import { InvoiceDeliveryService } from "./invoice-delivery.service";

type ResolvedRefundAdjustment = InvoiceRefundReversePayload & {
  finalizedAt: Date;
  refundRequestId?: string;
};

/** What a document should carry now; `lines` null for a single-line one. */
interface InvoiceDocumentNow {
  net: number;
  tax: number;
  total: number;
  lines: InvoiceLineItem[] | null;
}

/** An attempt's return inputs besides the returns cut so far. */
interface ReturnInputs {
  amounts: Omit<ReturnInvoiceAmountsInput, "priorReturnTotals">;
  /** The attempt refunds the document fully (a cancel is allowed). */
  fullyRefunded: boolean;
}

/** A return invoice cut (or found cut by the other handler) by one run. */
interface CreatedReturn {
  id: string;
  total: number;
  capped: boolean;
}

const cancelInProgress = (inv: { id: string; invoiceNumber: string | null }) =>
  new Error(
    `INVOICE_CANCEL_IN_PROGRESS invoice=${inv.invoiceNumber ?? inv.id}: another run is cancelling it`,
  );

/**
 * Kesilmiş bir belgenin GERİ ALINMASI — InvoicingService'ten birebir
 * taşındı. İade tutarı oranında düzeltme yapar: tam ve henüz düzeltme almamış
 * bir e-Arşiv ≤8 günde İPTAL edilir, diğer her durumda attempt bazlı bir İADE
 * faturası kesilir.
 *
 * Buradaki asimetri bilinçli ve mali: iptal belgeyi yok sayar, iade faturası
 * ise onu yeni bir belgeyle dengeler. Hangisinin geçerli olduğunu belgenin
 * yaşı ve daha önce düzeltilmiş olup olmaması belirler — yanlış seçim beyanı
 * bozar, ve geri alınamaz.
 *
 * Henüz GÖNDERİLMEMİŞ bir belge için üçüncü bir yol var: yeniden fiyatlama
 * (`repriceUnsentInvoice`). Ortada resmî bir belge olmadığı için iptal/iade
 * çifti yerine tutar doğrudan düzeltilir.
 */
@Injectable()
export class InvoiceReversalService {
  private readonly logger = new Logger(InvoiceReversalService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(E_INVOICE_PROVIDER) private readonly provider: EInvoiceProvider,
    private readonly documents: InvoiceDocumentService,
    private readonly delivery: InvoiceDeliveryService,
  ) {}

  /**
   * İade: siparişe ait Tarodan faturalarını refund-attempt oranında düzelt.
   * `adjustment` verilmezse eski tam-iade çağrıları için tüm kalan tutar terslenir.
   */
  async handleOrderRefund(
    orderId: string,
    adjustment?: InvoiceRefundReversePayload,
  ): Promise<void> {
    let resolved: ResolvedRefundAdjustment | undefined;
    if (adjustment) {
      if (
        adjustment.orderId !== orderId ||
        !(adjustment.refundRatio > 0 && adjustment.refundRatio <= 1)
      ) {
        throw new Error(`Invalid eLogo refund adjustment for order ${orderId}`);
      }
      const attempt = await this.prisma.refundAttempt.findUnique({
        where: { id: adjustment.refundAttemptId },
        select: {
          id: true,
          orderId: true,
          status: true,
          finalizedAt: true,
          idempotencyKey: true,
        },
      });
      if (
        !attempt ||
        attempt.orderId !== orderId ||
        attempt.status !== "finalized" ||
        !attempt.finalizedAt
      ) {
        throw new Error(
          `Refund attempt ${adjustment.refundAttemptId} is not finalized`,
        );
      }
      resolved = {
        ...adjustment,
        finalizedAt: attempt.finalizedAt,
        refundRequestId: refundRequestIdOf(attempt.idempotencyKey),
      };
    }
    await this.reverseByKeys(await this.relatedInvoiceKeys(orderId), resolved);
  }

  /**
   * İade: takas satırının hizmet faturasını iptal/iade et. Hangi türün kesildiği
   * satırın sürümüne bağlı olduğundan (v1 komisyon / v2 hizmet bedeli) İKİSİ de
   * denenir — `reverseByKeys` var olmayan anahtarı sessizce atlar.
   */
  async handleTradeCashRefund(tradeCashPaymentId: string): Promise<void> {
    await this.reverseByKeys(await this.tradeReversalKeys(tradeCashPaymentId));
  }

  /**
   * Takas iadesinde HANGİ belgelerin terslendiği.
   *
   * Karar burada verilir, tutar üzerinden değil: takasta iade KALEM BAZLIDIR ve
   * belgeler birbirinden bağımsız ayakta kalabilir (`trade-refund-policy.ts`
   * tek kaynaktır). Sipariş tarafındaki gibi bir oran uygulanamaz.
   *
   *  - **Hizmet bedeli** hiçbir iptalde iade edilmez → belgesi ayakta kalır.
   *    Tek istisna KUSURSUZ tarafın tam iadesidir (`fullRefundEntitled`):
   *    orada bedel de geri verilir, belge de terslenir.
   *  - **Kargo** yalnız fiilen kullanıldıysa (koli kargoya verildiyse) elde
   *    kalır; kargolanmadan iptalde iade edilir ve belgesi terslenir.
   *
   * Para hiç iade edilmediyse hiçbir belgeye dokunulmaz.
   */
  private async tradeReversalKeys(
    tradeCashPaymentId: string,
  ): Promise<Array<{ type: string; sourceId: string }>> {
    // Okuma hatası YUTULMAZ: `null`/`0`'a düşmek "iade edilmemiş" ya da
    // "kargolanmamış" demek olur — ilki ters kaydı sessizce düşürür, ikincisi
    // geçerli bir kargo belgesini geri alınamaz biçimde iptal ettirir. Hata
    // yukarı taşınır, outbox yeniden dener.
    const tcp = await this.prisma.tradeCashPayment.findUnique({
      where: { id: tradeCashPaymentId },
      select: { tradeId: true, refundedAt: true, fullRefundEntitled: true },
    });
    if (!tcp?.refundedAt) return [];

    const key = (type: string) => ({ type, sourceId: tradeCashPaymentId });
    if (tcp.fullRefundEntitled) {
      return ["trade_commission", "trade_service_fee", "trade_shipping"].map(
        key,
      );
    }

    // Eşik iade yolununkiyle AYNI yardımcıdan okunur; ayrı hesaplanırsa iade
    // edilen tutar ile ayakta kalan belge birbirinden sapar.
    const handedToCargo = await tradeHandedToCargo(this.prisma, tcp.tradeId);
    // Kargoya verildiyse hizmet tüketilmiştir → kargo belgesi de ayakta kalır.
    return tradeRefundExcludesShipping(tcp, { handedToCargo })
      ? []
      : [key("trade_shipping")];
  }

  /**
   * Bir siparişe bağlı tüm gelir faturası anahtarları
   * (packageId / orderId / boostId / membershipPaymentId).
   *
   * Komisyon ve hizmet bedeli PAKET anahtarlıdır; iade bu yüzden siparişin
   * paketini de sormak zorunda. Sipariş anahtarlı varyantlar, paket anahtarına
   * geçilmeden önce kesilmiş kayıtlar için korunur — `reverseByKeys` var olmayan
   * anahtarı sessizce atlar, dolayısıyla iki nesli birlikte aramak güvenlidir.
   */
  private async relatedInvoiceKeys(
    orderId: string,
  ): Promise<Array<{ type: string; sourceId: string }>> {
    const order = await this.prisma.order
      .findUnique({ where: { id: orderId }, select: { packageId: true } })
      .catch(() => null);
    const packageId = order?.packageId ?? null;

    const keys: Array<{ type: string; sourceId: string }> = [
      ...(packageId
        ? [
            // Hizmet başına belgeler + eski birleşik nesil. Paket hangi nesille
            // faturalandıysa yalnız onun anahtarı bulunur; `reverseByKeys` var
            // olmayanı sessizce atlar.
            ...PACKAGE_FEE_INVOICE_TYPES.map((type) => ({
              type: type as string,
              sourceId: packageId,
            })),
            { type: "commission", sourceId: packageId },
            { type: "service_fee", sourceId: packageId },
          ]
        : []),
      { type: "commission", sourceId: orderId },
      { type: "service_fee", sourceId: orderId },
      { type: "platform_sale", sourceId: orderId },
      { type: "membership", sourceId: orderId },
    ];
    const boost = await this.prisma.productBoost
      .findUnique({ where: { orderId }, select: { id: true } })
      .catch(() => null);
    if (boost) keys.push({ type: "boost", sourceId: boost.id });
    const pay = await this.prisma.payment
      .findFirst({
        where: { orderId },
        select: { providerPaymentId: true },
        orderBy: { createdAt: "desc" },
      })
      .catch(() => null);
    if (pay?.providerPaymentId) {
      const mp = await this.prisma.membershipPayment
        .findFirst({
          where: { providerPaymentId: pay.providerPaymentId },
          select: { id: true },
        })
        .catch(() => null);
      if (mp) keys.push({ type: "membership", sourceId: mp.id });
    }
    return keys;
  }

  private async reverseByKeys(
    keys: Array<{ type: string; sourceId: string }>,
    adjustment?: ResolvedRefundAdjustment,
  ): Promise<void> {
    const failures: string[] = [];
    for (const k of keys) {
      const inv = await this.prisma.fiscalInvoice.findUnique({
        where: {
          type_sourceId: {
            type: k.type as FiscalInvoiceType,
            sourceId: k.sourceId,
          },
        },
      });
      if (!inv || inv.status === "cancelled") continue;
      try {
        if (inv.status === "processing") {
          throw new Error(
            `invoice ${inv.invoiceNumber ?? inv.id} is currently being sent`,
          );
        }
        if (inv.status === "pending" || inv.status === "failed") {
          await this.repriceUnsentInvoice(inv, adjustment);
          continue;
        }
        if (inv.status === "sent" || inv.status === "signed") {
          await this.reverseInvoice(inv, adjustment);
        }
      } catch (error: unknown) {
        const message = `${inv.invoiceNumber ?? inv.id}: ${(error as Error)?.message ?? error}`;
        failures.push(message);
        this.logger.error(`eLogo refund/cancel failed (${message})`);
      }
    }
    if (failures.length > 0) {
      throw new Error(
        `eLogo invoice adjustment failed: ${failures.join("; ")}`,
      );
    }
  }

  /**
   * Henüz sağlayıcıya gitmemiş belgeyi güncel refund snapshot'ına netleştir.
   * Tam iadede belge yerel olarak iptal edilir ve hiçbir zaman gönderilmez.
   *
   * A document with lines is rebuilt WITH its lines: the send path writes the
   * record's amounts from the line snapshot, so stale lines would send the
   * pre-refund amount (a platform sale repriced to 240.00 went out at 400.00).
   */
  private async repriceUnsentInvoice(
    inv: FiscalInvoice,
    adjustment?: ResolvedRefundAdjustment,
  ): Promise<void> {
    let now: InvoiceDocumentNow | null = null;
    if (adjustment) {
      now = await this.invoiceDocumentNow(inv, adjustment);
      if (!now) {
        // A type whose amount never follows a refund through its own
        // source (membership, boost, seller shipping): the earlier rule.
        const gross = await this.resolveCurrentInvoiceGross(inv);
        const doc = await this.resolvePackageFeeDocument(inv);
        now =
          gross > 0.009
            ? {
                ...this.documents.invoiceAmounts(
                  inv.type,
                  gross,
                  Number(inv.vatRate),
                ),
                lines: doc?.lines ?? null,
              }
            : null;
      }
    }
    if (!now || now.total <= 0.009) {
      await this.prisma.fiscalInvoice.update({
        where: { id: inv.id },
        data: {
          status: "cancelled",
          cancelledAt: new Date(),
          cancelReason: "refunded_before_issue",
          refundAdjustedAt: adjustment?.finalizedAt,
        },
      });
      return;
    }
    const amounts = now.lines ? invoiceTotalsFromLines(now.lines) : now;
    await this.prisma.fiscalInvoice.update({
      where: { id: inv.id },
      data: {
        netAmount: amounts.net,
        taxAmount: amounts.tax,
        total: amounts.total,
        status: "pending",
        providerResultMsg: null,
        refundAdjustedAt: adjustment?.finalizedAt,
        ...(now.lines
          ? {
              lineItems: now.lines as unknown as Prisma.InputJsonValue,
              // İskonto da matrahla birlikte küçülür; kayıt satırlarla tutmalı.
              discountTotal: invoiceDiscountFromLines(now.lines),
            }
          : {}),
      },
    });
  }

  /**
   * What `inv` should carry NOW, after every finalized refund, computed by
   * the same reader as its cut and at the VAT rate(s) it was cut with, so it
   * compares with the document to the kuruş. The cap of every return
   * (`return-invoice-amounts.ts`) and the reprice of an unsent document read
   * it.
   *
   * Null for a type whose amount never follows a refund through its own
   * source: membership and boost (cut at the full charge at payment), the
   * seller shipping share (its refund runs through the package
   * reconciliation), trade documents, and a legacy fee document without a
   * ledger. Read errors propagate (the outbox retries); a missing source of a
   * type that has one throws `INVOICE_BASIS_MISSING`.
   */
  private async invoiceDocumentNow(
    inv: FiscalInvoice,
    adjustment?: ResolvedRefundAdjustment,
  ): Promise<InvoiceDocumentNow | null> {
    const vatRate = Number(inv.vatRate);
    const missing = () =>
      new Error(
        `INVOICE_BASIS_MISSING invoice=${inv.invoiceNumber ?? inv.id} type=${inv.type}: the document's source is gone`,
      );

    if (isPackageFeeInvoiceType(inv.type)) {
      if (!PACKAGE_FEE_COMPONENT_BY_TYPE[inv.type].refundComponent) return null;
      const basis = await this.documents.resolvePackageFeeBasis(inv.sourceId, {
        vatRate,
        refundedRequestIds: adjustment?.refundRequestId
          ? [adjustment.refundRequestId]
          : [],
        strict: true,
      });
      if (!basis) throw missing();
      const lines =
        basis.documents.find((doc) => doc.type === inv.type)?.lines ?? [];
      return { ...invoiceTotalsFromLines(lines), lines };
    }

    if (inv.type === "commission" || inv.type === "service_fee") {
      const totals = await this.documents.resolveFeeLedgerTotals(inv.sourceId);
      if (!totals) return null;
      const net = Math.max(
        0,
        inv.type === "commission"
          ? totals.netSellerCommission
          : totals.netBuyerFee,
      );
      return {
        ...this.documents.invoiceAmounts(inv.type, net, vatRate),
        lines: null,
      };
    }

    if (inv.type === "platform_sale") {
      const cutRates = platformSaleRatesOf(readInvoiceLineItems(inv.lineItems));
      const doc = await this.documents.resolvePlatformSaleDocument(
        inv.sourceId,
        {
          productVatRate: cutRates.productVatRate ?? vatRate,
          serviceVatRate: cutRates.serviceVatRate,
        },
      );
      if (!doc) throw missing();
      return doc.lines.length
        ? { ...invoiceTotalsFromLines(doc.lines), lines: doc.lines }
        : {
            ...this.documents.invoiceAmounts(
              "platform_sale",
              doc.netSaleAmount,
              vatRate,
            ),
            lines: null,
          };
    }

    return null;
  }

  /**
   * Kesilmiş faturayı tersine çevir.
   *
   * The return is the attempt's share capped by what the document carries
   * beyond what it should carry now (`return-invoice-amounts.ts`): a
   * document cut net of a refund is never reversed for it again, whatever
   * the order of cut, refunds and handlers. A full refund that would close
   * an e-Arşiv without earlier returns cancels it within the provider's
   * window, under an exclusive claim (`invoice-cancel-claim.ts`): the other
   * handler of the same attempt, or another attempt's return, backs off and
   * retries instead of reversing it a second time.
   */
  private async reverseInvoice(
    found: FiscalInvoice,
    adjustment?: ResolvedRefundAdjustment,
  ): Promise<void> {
    if (!found.ettn || !found.invoiceNumber || !found.issuedAt) {
      throw new Error(`Invoice ${found.id} is missing reversal identifiers`);
    }
    const settled = await this.settleCancelClaim({
      ...found,
      ettn: found.ettn,
    });
    if (!settled) return;
    const invoiceNumber = found.invoiceNumber;
    const inv = {
      ...settled,
      ettn: found.ettn,
      invoiceNumber,
      issuedAt: found.issuedAt,
    };

    // İADE FATURASI: aynı refund attempt yeniden işlense bile aynı sourceId kullanılır.
    const reversalSourceId = adjustment
      ? `${inv.id}:${adjustment.refundAttemptId}`
      : inv.id;
    const exists = await this.prisma.fiscalInvoice.findUnique({
      where: {
        type_sourceId: { type: "return_invoice", sourceId: reversalSourceId },
      },
    });
    if (exists) {
      if (exists.status === "pending" || exists.status === "failed") {
        await this.delivery.sendRecord(exists.id);
      } else if (exists.status === "processing") {
        throw new Error(
          `Return invoice ${exists.invoiceNumber ?? exists.id} is processing`,
        );
      }
      return;
    }

    const inputs = await this.returnInputs(inv, adjustment);
    if (!inputs) return;
    const prior = await this.priorReturnTotals(this.prisma, invoiceNumber);
    const preview = returnInvoiceAmountsOf({
      ...inputs.amounts,
      priorReturnTotals: prior,
    });
    if (!preview) {
      // Traced only when the document still carries something: a replay of
      // a fully reversed document is not news.
      const returned = prior.reduce((sum, total) => sum + total, 0);
      if (inputs.amounts.issued.total - returned > 0.009) {
        this.traceCappedReturn(inv, adjustment, inputs, null);
      }
      return;
    }

    const canCancel =
      inputs.fullyRefunded &&
      preview.closesDocument &&
      prior.reduce((sum, total) => sum + total, 0) <= 0.009 &&
      inv.documentType === "EARCHIVE" &&
      this.provider.eArchiveReversalStrategy(inv.issuedAt) === "CANCEL";
    if (canCancel && (await this.cancelForRefund(inv)) !== "return") return;

    // The amount is decided again INSIDE the Serializable transaction that
    // cuts the return, from the returns it reads there: two attempts'
    // handlers at once would otherwise both reverse the same outstanding
    // amount. Postgres aborts one of them (P2034) and the retry recomputes.
    const created = await this.createReturnInvoice(
      inv,
      reversalSourceId,
      async (tx) =>
        returnInvoiceAmountsOf({
          ...inputs.amounts,
          priorReturnTotals: await this.priorReturnTotals(tx, invoiceNumber),
        }),
    );
    this.traceCappedReturn(inv, adjustment, inputs, created);
  }

  /**
   * Everything the attempt's return depends on besides the returns cut so
   * far: the document, its target and the attempt's share. Null when the
   * document is already net of this attempt by the older stamp: a document
   * without a target that an unsent reprice adjusted to this refund or a
   * later one (`refundAdjustedAt`).
   */
  private async returnInputs(
    inv: FiscalInvoice,
    adjustment?: ResolvedRefundAdjustment,
  ): Promise<ReturnInputs | null> {
    const issued = { total: Number(inv.total), net: Number(inv.netAmount) };
    if (!adjustment) {
      return {
        amounts: { issued, targetTotal: null, share: null, componentLines: [] },
        fullyRefunded: true,
      };
    }
    const now = await this.invoiceDocumentNow(inv, adjustment);
    if (
      !now &&
      inv.refundAdjustedAt &&
      inv.refundAdjustedAt >= adjustment.finalizedAt
    ) {
      return null;
    }
    const invoiceAdjustment = await this.resolveInvoiceAdjustment(
      inv,
      adjustment,
    );
    const componentLines = await this.refundComponentLinesForInvoice(
      inv,
      adjustment,
    );
    const share =
      componentLines.length || invoiceAdjustment.fullyRefunded
        ? null
        : this.documents.round2(
            (await this.resolveInvoiceRefundBase(inv)) *
              invoiceAdjustment.refundRatio,
          );
    return {
      amounts: {
        issued,
        targetTotal: now?.total ?? null,
        share,
        componentLines,
      },
      fullyRefunded: invoiceAdjustment.fullyRefunded,
    };
  }

  /** Totals of the return invoices standing against the document. */
  private async priorReturnTotals(
    client: Pick<Prisma.TransactionClient, "fiscalInvoice">,
    invoiceNumber: string,
  ): Promise<number[]> {
    const rows = await client.fiscalInvoice.findMany({
      where: {
        type: "return_invoice",
        billingReference: invoiceNumber,
        status: { not: "cancelled" },
      },
      select: { total: true },
    });
    return rows.map((row) => Number(row.total));
  }

  /**
   * The cap took part (or all) of the attempt's share: expected when the
   * document was cut net of the refund or another attempt already reversed
   * it, and traced with ids and amounts only.
   */
  private traceCappedReturn(
    inv: FiscalInvoice,
    adjustment: ResolvedRefundAdjustment | undefined,
    inputs: ReturnInputs,
    created: CreatedReturn | null,
  ): void {
    const target = inputs.amounts.targetTotal;
    if (!adjustment || target === null) return;
    if (created && !created.capped) return;
    this.logger.warn(
      `INVOICE_RETURN_CAPPED invoice=${inv.invoiceNumber} attempt=${adjustment.refundAttemptId} target=${target} due=${created?.total ?? 0}`,
    );
  }

  /**
   * Cuts the RETURN invoice of `inv` under `reversalSourceId` (one per refund
   * attempt, idempotent through `(type, sourceId)`) and sends it. `amounts`
   * runs inside the Serializable transaction. A document cancelled meanwhile
   * gets nothing; one being cancelled under a claim makes the run back off
   * (throw, the outbox retries), so a return never lands next to a cancel.
   * Returns what was cut, or null.
   */
  private async createReturnInvoice(
    inv: FiscalInvoice & { invoiceNumber: string; issuedAt: Date },
    reversalSourceId: string,
    amounts: (
      tx: Prisma.TransactionClient,
    ) => Promise<ReturnInvoiceAmounts | null>,
  ): Promise<CreatedReturn | null> {
    const now = new Date();
    // Aynı sayaç satırında başka bir kesimle çakışırsa (P2034) yeniden dene;
    // kaybeden transaction numara tüketmez. Bkz. invoice-write-conflict.ts.
    const record = await retryOnWriteConflict(() =>
      this.prisma.$transaction(
        async (tx) => {
          const raced = await tx.fiscalInvoice.findUnique({
            where: {
              type_sourceId: {
                type: "return_invoice",
                sourceId: reversalSourceId,
              },
            },
          });
          // The other handler of this attempt cut it: send it (the send
          // lease keeps it to one delivery).
          if (raced) {
            return { id: raced.id, total: Number(raced.total), capped: false };
          }
          const original = await tx.fiscalInvoice.findUnique({
            where: { id: inv.id },
            select: { status: true, cancelReason: true },
          });
          if (!original || original.status === "cancelled") return null;
          if (parseInvoiceCancelClaim(original.cancelReason)) {
            throw cancelInProgress(inv);
          }
          const due = await amounts(tx);
          if (!due) return null;
          const number =
            await this.documents.allocateDocumentNumberInTransaction(
              tx,
              invoiceIssueYear(now),
            );
          const created = await tx.fiscalInvoice.create({
            data: {
              type: "return_invoice",
              sourceId: reversalSourceId,
              // İade faturasını gönderecek sağlayıcı — kayıt kimin kestiğini taşır.
              provider: this.provider.name,
              recipientUserId: inv.recipientUserId,
              recipientVknTckn: inv.recipientVknTckn,
              recipientName: inv.recipientName,
              // İletişim/adres snapshot'ı da TAŞINIR: misafir siparişlerinde tüm
              // alıcılar tek sistem kullanıcısını paylaşır, kullanıcı kaydına
              // dönmek iade faturasını sistem e-postasına ve boş adrese yazıyordu.
              recipientEmail: inv.recipientEmail,
              recipientCity: inv.recipientCity,
              recipientDistrict: inv.recipientDistrict,
              recipientStreet: inv.recipientStreet,
              documentType: inv.documentType,
              sendType: "ELEKTRONIK",
              invoiceNumber: number,
              ettn: randomUUID(),
              netAmount: due.net,
              taxAmount: this.documents.round2(due.total - due.net),
              total: due.total,
              originalTotal: due.total,
              vatRate: inv.vatRate,
              status: "pending",
              billingReference: inv.invoiceNumber,
              billingReferenceIssueDate: inv.issuedAt,
              // İade faturası da hangi koliden doğduğunu taşır — orijinalin
              // referansı aynen devralınır.
              sourceReference: inv.sourceReference,
              lineDescription: `İade: ${
                inv.lineDescription ||
                LINE_DESCRIPTION[inv.type] ||
                "Hizmet bedeli"
              }`,
              lineItems: due.lines.length
                ? (due.lines as unknown as Prisma.InputJsonValue)
                : undefined,
              createdAt: now,
            },
          });
          return { id: created.id, total: due.total, capped: due.capped };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
    if (!record) return null;
    await this.delivery.sendRecord(record.id);
    return record;
  }

  // ───────────────────────── cancel claim ─────────────────────────

  /**
   * Cancels the e-Arşiv for a refund under an exclusive claim.
   * `cancelled`/`gone`: nothing else to do. `return`: a return exists, an
   * earlier cancel was refused, or eLogo refused this one; the return path
   * decides. Another run holding a fresh claim makes this one throw
   * `INVOICE_CANCEL_IN_PROGRESS` (the outbox retries).
   */
  private async cancelForRefund(
    inv: FiscalInvoice & { ettn: string; invoiceNumber: string },
  ): Promise<"cancelled" | "gone" | "return"> {
    const claim = await this.claimCancel(inv);
    if (claim.kind === "busy") throw cancelInProgress(inv);
    if (claim.kind !== "claimed") return claim.kind;
    const outcome = await this.cancelUnderClaim(inv, claim.claim);
    return outcome === "cancelled" ? "cancelled" : "return";
  }

  /**
   * Claims the cancel, exclusively: in one Serializable transaction, no
   * return exists against the document and its `cancelReason` moves
   * (compare-and-set on the value read) from nothing, or a stale claim, to
   * this run's claim.
   *
   * - `claimed`: this run alone may call eLogo's cancel;
   * - `busy`: another run holds a fresh claim;
   * - `return`: a return exists, or an earlier cancel was refused
   *   (`cancelReason = refund`), so the return path decides;
   * - `gone`: the document is no longer standing (cancelled meanwhile).
   */
  private async claimCancel(
    inv: FiscalInvoice & { invoiceNumber: string },
  ): Promise<
    { kind: "claimed"; claim: string } | { kind: "busy" | "return" | "gone" }
  > {
    return retryOnWriteConflict(() =>
      this.prisma.$transaction(
        async (tx) => {
          const returns = await tx.fiscalInvoice.count({
            where: {
              type: "return_invoice",
              billingReference: inv.invoiceNumber,
              status: { not: "cancelled" },
            },
          });
          if (returns > 0) return { kind: "return" as const };
          const row = await tx.fiscalInvoice.findUnique({
            where: { id: inv.id },
            select: { status: true, cancelReason: true },
          });
          if (!row || (row.status !== "sent" && row.status !== "signed")) {
            return { kind: "gone" as const };
          }
          const held = parseInvoiceCancelClaim(row.cancelReason);
          if (held && !isStaleInvoiceCancelClaim(held)) {
            return { kind: "busy" as const };
          }
          if (row.cancelReason && !held) return { kind: "return" as const };
          const claim = formatInvoiceCancelClaim(randomUUID(), new Date());
          const taken = await tx.fiscalInvoice.updateMany({
            // `?? null`: an undefined filter would match any value.
            where: { id: inv.id, cancelReason: row.cancelReason ?? null },
            data: { cancelReason: claim },
          });
          return taken.count === 1
            ? { kind: "claimed" as const, claim }
            : { kind: "busy" as const };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  /**
   * Cancels the e-Arşiv under `claim`. `cancelled`: done (also when eLogo
   * refused but its status says cancelled). `fallback`: eLogo refused for
   * good; the claim is released to `refund` (only if this run still holds
   * it) and the return path reverses the document. An unknown outcome throws
   * and leaves the claim, which goes stale and is settled from the
   * provider's status by a later run.
   */
  private async cancelUnderClaim(
    inv: FiscalInvoice & { ettn: string; invoiceNumber: string },
    claim: string,
  ): Promise<"cancelled" | "fallback"> {
    let outcomeUnknown = false;
    const res: EInvoiceCancelResult = await this.provider
      .cancelEArchive({ ettn: inv.ettn, providerRef: inv.providerRef })
      .catch((e: unknown): EInvoiceCancelResult => {
        outcomeUnknown = true;
        return { success: false, resultMsg: String((e as Error)?.message) };
      });
    if (res.success) {
      await this.markCancelled(inv, { resultMsg: res.resultMsg ?? null });
      this.logger.log(`eLogo cancel ${inv.invoiceNumber}: OK`);
      return "cancelled";
    }
    // Timeout/transport hatasında provider iptali uygulamış olabilir. IADE
    // faturasına düşmeden önce ETTN durumunu sorgula; aksi halde çift ters kayıt olur.
    const status = await this.provider
      .getStatus({ ettn: inv.ettn, providerRef: inv.providerRef }, "EARCHIVE")
      .catch(() => null);
    if (status?.state === "cancelled") {
      await this.markCancelled(inv, {
        resultCode: status.resultCode ?? null,
        resultMsg: status.resultMsg ?? res.resultMsg ?? null,
      });
      return "cancelled";
    }
    // The cancel call itself failed (timeout, transport): only a status that
    // shows the document standing makes the return safe. Anything else keeps
    // the claim; it goes stale and is settled from the status later.
    if (outcomeUnknown && status?.state !== "completed") {
      throw new Error(
        `INVOICE_CANCEL_OUTCOME_UNKNOWN invoice=${inv.invoiceNumber}: cancel outcome is unknown, the claim stays until it is settled`,
      );
    }
    const released = await this.prisma.fiscalInvoice.updateMany({
      where: { id: inv.id, cancelReason: claim },
      data: {
        cancelReason: "refund",
        providerResultMsg: res.resultMsg ?? null,
      },
    });
    if (released.count !== 1) {
      throw new Error(
        `INVOICE_CANCEL_CLAIM_LOST invoice=${inv.invoiceNumber}: another run took the claim over`,
      );
    }
    this.logger.warn(
      `eLogo cancel refused (${inv.invoiceNumber}): ${res.resultMsg}; falling back to a return invoice`,
    );
    return "fallback";
  }

  private async markCancelled(
    inv: FiscalInvoice,
    result: { resultCode?: number | null; resultMsg: string | null },
  ): Promise<void> {
    await this.prisma.fiscalInvoice.update({
      where: { id: inv.id },
      data: {
        status: "cancelled",
        cancelledAt: new Date(),
        cancelReason: "refund",
        ...(result.resultCode !== undefined
          ? { providerResultCode: result.resultCode }
          : {}),
        providerResultMsg: result.resultMsg,
      },
    });
  }

  /**
   * A claim found before deciding anything. Fresh: another run is
   * cancelling, so back off (throw, the outbox retries). Stale: its holder
   * died or the outcome stayed unknown; logged as an error (Sentry) and
   * settled from the provider's status: cancelled -> marked cancelled (null
   * returned, nothing else to do); standing -> the claim is cleared and the
   * normal path decides again (cancel within the window, else a return);
   * unknown -> throw, the outbox retries.
   */
  private async settleCancelClaim(
    inv: FiscalInvoice & { ettn: string },
  ): Promise<FiscalInvoice | null> {
    const claim = parseInvoiceCancelClaim(inv.cancelReason);
    if (!claim) return inv;
    if (!isStaleInvoiceCancelClaim(claim)) throw cancelInProgress(inv);
    this.logger.error(
      `INVOICE_CANCEL_CLAIM_STUCK invoice=${inv.invoiceNumber} claimedAt=${claim.claimedAt.toISOString()}: settling it from the provider status`,
    );
    const status = await this.provider
      .getStatus({ ettn: inv.ettn, providerRef: inv.providerRef }, "EARCHIVE")
      .catch(() => null);
    if (status?.state === "cancelled") {
      await this.markCancelled(inv, {
        resultCode: status.resultCode ?? null,
        resultMsg: status.resultMsg ?? null,
      });
      return null;
    }
    if (status?.state !== "completed") {
      throw new Error(
        `INVOICE_CANCEL_OUTCOME_UNKNOWN invoice=${inv.invoiceNumber}: provider status ${status?.state ?? "unavailable"}`,
      );
    }
    const cleared = await this.prisma.fiscalInvoice.updateMany({
      where: { id: inv.id, cancelReason: claim.raw },
      data: { cancelReason: null },
    });
    if (cleared.count !== 1) {
      throw new Error(
        `INVOICE_CANCEL_CLAIM_LOST invoice=${inv.invoiceNumber}: another run took the claim over`,
      );
    }
    return { ...inv, cancelReason: null };
  }

  /** İade sonrası ilgili faturanın bugün itibarıyla kesilmesi gereken net brüt tutar. */
  private async resolveCurrentInvoiceGross(
    inv: FiscalInvoice,
  ): Promise<number> {
    if (isPackageFeeInvoiceType(inv.type)) {
      const doc = await this.resolvePackageFeeDocument(inv);
      return doc ? doc.net : 0;
    }

    if (inv.type === "commission" || inv.type === "service_fee") {
      const totals = await this.documents.resolveFeeLedgerTotals(inv.sourceId);
      if (!totals) return 0;
      return Math.max(
        0,
        inv.type === "commission"
          ? totals.netSellerCommission
          : totals.netBuyerFee,
      );
    }

    if (inv.type === "platform_sale" || inv.type === "membership") {
      const order = await this.prisma.order
        .findUnique({
          where: { id: inv.sourceId },
          select: { id: true, totalAmount: true, checkoutGroupId: true },
        })
        .catch(() => null);
      if (order) {
        return this.resolveNetOrderAmount(
          order.id,
          order.checkoutGroupId,
          Number(order.totalAmount),
        );
      }
    }

    if (inv.type === "boost") {
      const boost = await this.prisma.productBoost
        .findUnique({
          where: { id: inv.sourceId },
          select: { orderId: true, price: true },
        })
        .catch(() => null);
      if (boost?.orderId) {
        const order = await this.prisma.order.findUnique({
          where: { id: boost.orderId },
          select: { checkoutGroupId: true, totalAmount: true },
        });
        if (order) {
          const orderNet = await this.resolveNetOrderAmount(
            boost.orderId,
            order.checkoutGroupId,
            Number(order.totalAmount),
          );
          const ratio =
            Number(order.totalAmount) > 0
              ? orderNet / Number(order.totalAmount)
              : 0;
          return Math.max(0, Number(boost.price) * ratio);
        }
      }
    }

    return Number(inv.total);
  }

  private async resolveNetOrderAmount(
    orderId: string,
    checkoutGroupId: string | null,
    orderTotal: number,
  ): Promise<number> {
    const payment = await this.prisma.payment.findFirst({
      where: {
        OR: [{ orderId }, ...(checkoutGroupId ? [{ checkoutGroupId }] : [])],
      },
      orderBy: { createdAt: "desc" },
      select: { metadata: true },
    });
    const refundedOrders =
      ((payment?.metadata as Record<string, unknown> | null)?.refundedOrders as
        Record<string, number> | undefined) ?? {};
    return Math.max(0, orderTotal - Number(refundedOrders[orderId] ?? 0));
  }

  /**
   * Kalem bazlı paket belgesinin GÜNCEL matrahı — kesimle iade aynı kaynaktan
   * okur. Belge bu türden değilse ya da paket çözülemezse null.
   */
  private async resolvePackageFeeDocument(
    inv: FiscalInvoice,
  ): Promise<PackageFeeDocument | null> {
    if (!isPackageFeeInvoiceType(inv.type)) return null;
    const basis = await this.documents.resolvePackageFeeBasis(inv.sourceId);
    return basis?.documents.find((doc) => doc.type === inv.type) ?? null;
  }

  private async refundComponentLinesForInvoice(
    inv: FiscalInvoice,
    adjustment?: ResolvedRefundAdjustment,
  ): Promise<InvoiceLineItem[]> {
    if (!adjustment?.refundRequestId) return [];
    // Kalem bazlı belgede karşılık TEK bileşendir; karşılığı olmayan kalem
    // (satıcı kargo payı) genel iade oranına düşer.
    const componentSpec = isPackageFeeInvoiceType(inv.type)
      ? PACKAGE_FEE_COMPONENT_BY_TYPE[inv.type].refundComponent
      : null;
    if (isPackageFeeInvoiceType(inv.type) && !componentSpec) return [];
    const treatment =
      componentSpec?.treatment ??
      (inv.type === "commission" ? "seller_refund" : "buyer_refund");
    const rr = await this.prisma.refundRequest.findUnique({
      where: { id: adjustment.refundRequestId },
      select: {
        refundQuantity: true,
        financialComponents: {
          where: { treatment },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!rr?.financialComponents.length) return [];
    const allowed = componentSpec
      ? new Set<string>([componentSpec.code])
      : inv.type === "commission"
        ? new Set(["seller_commission", "seller_platform_fee"])
        : inv.type === "service_fee"
          ? new Set(["buyer_commission", "buyer_platform_fee"])
          : inv.type === "platform_sale"
            ? new Set([
                "product",
                "outbound_shipping",
                "buyer_commission",
                "buyer_platform_fee",
              ])
            : new Set<string>();
    const names: Record<string, string> = {
      product: "İade edilen ürün bedeli",
      outbound_shipping: "İade edilen gidiş kargosu",
      buyer_commission: "İade edilen alıcı komisyonu",
      buyer_platform_fee: "İade edilen alıcı platform hizmet bedeli",
      seller_commission: "İade edilen satıcı komisyonu",
      seller_platform_fee: "İade edilen satıcı platform hizmet bedeli",
    };

    return rr.financialComponents
      .filter(
        (component) =>
          allowed.has(component.componentCode) &&
          Number(component.netAmount) > 0,
      )
      .map((component) => {
        const net = Number(component.netAmount);
        const tax = Number(component.taxAmount);
        const quantity =
          component.componentCode === "product"
            ? Math.max(1, rr.refundQuantity)
            : 1;
        return {
          name: names[component.componentCode] ?? component.componentCode,
          quantity,
          net,
          unitPrice: net / quantity,
          vatRate: net > 0 ? this.documents.round2((tax / net) * 100) : 0,
          // İade bileşeninin KDV'si politika tarafından hesaplanmıştır; orandan
          // yeniden türetmek (oran zaten tutardan geri hesaplandı) kuruş
          // kaydırabilir. İade faturası, gerçekten geri verilen KDV'yi yazar.
          taxAmount: tax,
        };
      });
  }

  private async resolveInvoiceAdjustment(
    inv: FiscalInvoice,
    adjustment?: ResolvedRefundAdjustment,
  ): Promise<{ refundRatio: number; fullyRefunded: boolean }> {
    if (!adjustment) {
      return { refundRatio: 1, fullyRefunded: true };
    }
    // Kalem bazlı belgede oran, o KALEMİN kendi iade tutarının belgenin iade
    // ÖNCESİ matrahına bölümüdür. Paketin toplam iade oranı burada yanlış olur:
    // ürün iade edilirken kargo payı hiç geri verilmemiş olabilir.
    if (isPackageFeeInvoiceType(inv.type)) {
      const spec = PACKAGE_FEE_COMPONENT_BY_TYPE[inv.type].refundComponent;
      const doc = await this.resolvePackageFeeDocument(inv);
      if (spec && adjustment.refundRequestId && doc && doc.base > 0) {
        const component = await this.prisma.refundFinancialComponent
          .findFirst({
            where: {
              refundRequestId: adjustment.refundRequestId,
              componentCode: spec.code,
              treatment: spec.treatment,
            },
            select: { netAmount: true },
          })
          .catch(() => null);
        const refundRatio = Math.min(
          Math.max(Number(component?.netAmount ?? 0) / doc.base, 0),
          1,
        );
        return { refundRatio, fullyRefunded: refundRatio >= 0.9999 };
      }
    }

    if (
      (inv.type === "commission" &&
        adjustment.sellerFeeRefundAmount !== undefined) ||
      (inv.type === "service_fee" &&
        adjustment.buyerFeeRefundAmount !== undefined)
    ) {
      // Oran, faturanın KENDİ matrahı üzerinden hesaplanır: fatura paket
      // başınadır, iade ise tek siparişin ücretini geri verir. Paketin toplamına
      // bölmek, çok siparişli pakette doğru kısmi orana götürür.
      const totals = await this.documents.resolveFeeLedgerTotals(inv.sourceId);
      if (totals) {
        const original =
          inv.type === "commission" ? totals.sellerCommission : totals.buyerFee;
        const refund =
          inv.type === "commission"
            ? Number(adjustment.sellerFeeRefundAmount)
            : Number(adjustment.buyerFeeRefundAmount);
        const refundRatio =
          original > 0 ? Math.min(Math.max(refund / original, 0), 1) : 0;
        return {
          refundRatio,
          fullyRefunded: refundRatio >= 0.9999,
        };
      }
    }
    return {
      refundRatio: adjustment.refundRatio,
      fullyRefunded: adjustment.fullyRefunded,
    };
  }

  /** Refund oranının uygulanacağı faturanın iade öncesi ekonomik brüt bazı. */
  private async resolveInvoiceRefundBase(inv: FiscalInvoice): Promise<number> {
    if (isPackageFeeInvoiceType(inv.type)) {
      const doc = await this.resolvePackageFeeDocument(inv);
      if (doc) {
        return this.documents.invoiceAmounts(
          inv.type,
          doc.base,
          Number(inv.vatRate),
        ).total;
      }
    }

    if (inv.type === "commission" || inv.type === "service_fee") {
      const totals = await this.documents.resolveFeeLedgerTotals(inv.sourceId);
      if (totals) {
        const sourceAmount =
          inv.type === "commission" ? totals.sellerCommission : totals.buyerFee;
        return this.documents.invoiceAmounts(
          inv.type,
          sourceAmount,
          Number(inv.vatRate),
        ).total;
      }
    }
    if (inv.type === "platform_sale" || inv.type === "membership") {
      const order = await this.prisma.order
        .findUnique({
          where: { id: inv.sourceId },
          select: { totalAmount: true },
        })
        .catch(() => null);
      if (order) {
        return this.documents.invoiceAmounts(
          inv.type,
          Number(order.totalAmount),
          Number(inv.vatRate),
        ).total;
      }
      if (inv.type === "membership") {
        const membershipPayment = await this.prisma.membershipPayment
          .findUnique({
            where: { id: inv.sourceId },
            select: { amount: true },
          })
          .catch(() => null);
        if (membershipPayment) {
          return this.documents.invoiceAmounts(
            inv.type,
            Number(membershipPayment.amount),
            Number(inv.vatRate),
          ).total;
        }
      }
    }
    if (inv.type === "boost") {
      const boost = await this.prisma.productBoost
        .findUnique({
          where: { id: inv.sourceId },
          select: { price: true },
        })
        .catch(() => null);
      if (boost) {
        return this.documents.invoiceAmounts(
          inv.type,
          Number(boost.price),
          Number(inv.vatRate),
        ).total;
      }
    }
    return Number(inv.originalTotal ?? inv.total);
  }
}
