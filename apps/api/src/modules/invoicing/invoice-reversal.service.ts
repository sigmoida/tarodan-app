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
  type InvoiceLineItem,
} from "./invoice/invoice-lines";
import { invoiceIssueYear } from "./invoice/invoice-datetime";
import { LINE_DESCRIPTION } from "./invoice/invoice-line-description";
import {
  PACKAGE_FEE_COMPONENT_BY_TYPE,
  PACKAGE_FEE_INVOICE_TYPES,
  isPackageFeeInvoiceType,
} from "./invoice/package-fee-components";
import type { PackageFeeDocument } from "./invoice/package-fee-basis";
import {
  buildInstallmentFeeDocument,
  installmentFeeReturnOf,
  type InstallmentFeeReturn,
} from "./invoice/installment-fee-basis";
import { refundInstallmentFeeOf } from "../payment/helpers/charged-amount";
import { retryOnWriteConflict } from "./helpers/invoice-write-conflict";
import { refundRequestIdOf } from "./helpers/refund-request-key";
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
  /**
   * The installment fee share this attempt gave back
   * (`RefundAttempt.installmentFeeAmount`), read from the attempt: the fee
   * document is reversed by it, never by the goods `refundRatio` (AS-F3).
   */
  installmentFeeRefund: number;
};

const INSTALLMENT_FEE_TYPE =
  "buyer_installment_fee" satisfies FiscalInvoiceType;

/**
 * `FiscalInvoice.cancelReason` while a refund cancels an installment fee
 * e-Arşiv (shown as is in the admin detail until the cancel settles).
 */
const INSTALLMENT_FEE_CANCEL_CLAIM = "refund_cancelling";

/** The amounts of a return invoice: VAT-included total, its net, its lines. */
interface ReturnAmounts {
  total: number;
  net: number;
  lines: InvoiceLineItem[];
}

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
          installmentFeeAmount: true,
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
        installmentFeeRefund: refundInstallmentFeeOf(attempt).toNumber(),
      };
    }
    await this.reverseByKeys(
      await this.relatedInvoiceKeys(orderId, resolved),
      resolved,
    );
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
    adjustment?: ResolvedRefundAdjustment,
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
      ...(await this.installmentFeeInvoiceKeys(orderId, packageId, adjustment)),
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

  /**
   * The installment fee documents a refund of `orderId` can touch: its own
   * package's, and, when the attempt gave fee back and the payment's whole
   * fee is now back, every other package of the payment. The refund that
   * closes the payment takes the rest of the fee, which can be another
   * package's shortfall; that package has no refund event of its own left to
   * reverse it. Single payments and fee-less refunds read nothing extra. A
   * read error propagates: the outbox retries it.
   */
  private async installmentFeeInvoiceKeys(
    orderId: string,
    packageId: string | null,
    adjustment?: ResolvedRefundAdjustment,
  ): Promise<Array<{ type: string; sourceId: string }>> {
    const sweep =
      adjustment && adjustment.installmentFeeRefund > 0
        ? await this.documents.installmentFeeSweepPackageIds(orderId)
        : [];
    return [...new Set([...(packageId ? [packageId] : []), ...sweep])].map(
      (sourceId) => ({ type: INSTALLMENT_FEE_TYPE, sourceId }),
    );
  }

  /**
   * What the installment fee document of `inv` should carry now (VAT
   * included), at the document's own VAT rate. 0 when the package has no fee
   * left.
   */
  private async installmentFeeDocumentNow(inv: FiscalInvoice) {
    const basis = await this.documents.resolveInstallmentFeeBasis(inv.sourceId);
    if (!basis) return null;
    return buildInstallmentFeeDocument({
      orders: basis.orders,
      paymentFeeFullyRefunded: basis.paymentFeeFullyRefunded,
      vatRatePct: Number(inv.vatRate),
    });
  }

  /**
   * The inputs of the return this refund owes the fee document, read once:
   * what the document should carry now, and the share this attempt reverses
   * on it. On the attempt's own package that is its fee share; on another
   * package of the payment (the closing sweep) only that package's
   * shortfall, the part of its fee its own refunds did not give back, so the
   * closing refund never takes a share another attempt still has to reverse.
   * Without an adjustment (a refund event without an attempt): everything.
   */
  private async installmentFeeReturnInputs(
    inv: FiscalInvoice,
    adjustment: ResolvedRefundAdjustment | undefined,
  ): Promise<{ targetGross: number; refundedFee: number | null }> {
    if (!adjustment) return { targetGross: 0, refundedFee: null };
    const basis = await this.documents.resolveInstallmentFeeBasis(inv.sourceId);
    if (!basis) return { targetGross: 0, refundedFee: 0 };
    const vatRatePct = Number(inv.vatRate);
    const now = buildInstallmentFeeDocument({ ...basis, vatRatePct });
    const own = basis.orders.some((order) => order.id === adjustment.orderId);
    const shortfall = own
      ? Infinity
      : (buildInstallmentFeeDocument({
          ...basis,
          paymentFeeFullyRefunded: false,
          vatRatePct,
        })?.gross ?? 0);
    return {
      targetGross: now?.gross ?? 0,
      refundedFee: Math.min(adjustment.installmentFeeRefund, shortfall),
    };
  }

  /**
   * Claims the cancel of an installment fee document: in one Serializable
   * transaction, no return exists against it and its `cancelReason` becomes
   * the claim (a retry of an unfinished cancel may re-claim). The cancel
   * flow then overwrites it (`refund`, cancelled or fallen back to a
   * return). False: a return got there first, so the return path decides.
   */
  private async claimInstallmentFeeCancel(
    inv: FiscalInvoice,
  ): Promise<boolean> {
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
          if (returns > 0) return false;
          const claimed = await tx.fiscalInvoice.updateMany({
            where: {
              id: inv.id,
              status: { in: ["sent", "signed"] },
              OR: [
                { cancelReason: null },
                { cancelReason: INSTALLMENT_FEE_CANCEL_CLAIM },
              ],
            },
            data: { cancelReason: INSTALLMENT_FEE_CANCEL_CLAIM },
          });
          return claimed.count === 1;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  /** `installmentFeeReturnOf` for `inv` against the returns cut so far. */
  private installmentFeeReturnWith(
    inv: FiscalInvoice,
    inputs: { targetGross: number; refundedFee: number | null },
    priorReturns: ReadonlyArray<{
      total: Prisma.Decimal;
      netAmount: Prisma.Decimal;
    }>,
  ): InstallmentFeeReturn | null {
    return installmentFeeReturnOf({
      issued: { total: Number(inv.total), net: Number(inv.netAmount) },
      priorReturns: priorReturns.map((row) => ({
        total: Number(row.total),
        net: Number(row.netAmount),
      })),
      targetGross: inputs.targetGross,
      refundedFee: inputs.refundedFee,
      vatRatePct: Number(inv.vatRate),
    });
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
          // Fatura bu refund finalize edildikten sonra kesildiyse finansal kaynaklar
          // zaten net tutarı taşıyordu; aynı attempt için ikinci kez ters kayıt üretme.
          if (
            adjustment &&
            inv.refundAdjustedAt &&
            inv.refundAdjustedAt >= adjustment.finalizedAt
          ) {
            continue;
          }
          await this.reverseInvoice(inv, adjustment);
        }
      } catch (error: unknown) {
        const message = `${inv.invoiceNumber ?? inv.id}: ${(error as Error)?.message ?? error}`;
        failures.push(message);
        this.logger.error(`eLogo iade/iptal hata (${message})`);
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
   */
  private async repriceUnsentInvoice(
    inv: FiscalInvoice,
    adjustment?: ResolvedRefundAdjustment,
  ): Promise<void> {
    if (inv.type === INSTALLMENT_FEE_TYPE) {
      return this.repriceUnsentInstallmentFeeInvoice(inv, adjustment);
    }
    const gross = adjustment ? await this.resolveCurrentInvoiceGross(inv) : 0;
    if (gross <= 0.009) {
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
    const rate = Number(inv.vatRate);
    // Kalem bazlı paket belgesinde satırlar da yeniden kurulur: KDV satır satır
    // yuvarlandığı için eski satırlarla yeni toplam birbirini tutmazdı.
    const doc = await this.resolvePackageFeeDocument(inv);
    const amounts = doc
      ? invoiceTotalsFromLines(doc.lines)
      : this.documents.invoiceAmounts(inv.type, gross, rate);
    await this.prisma.fiscalInvoice.update({
      where: { id: inv.id },
      data: {
        netAmount: amounts.net,
        taxAmount: amounts.tax,
        total: amounts.total,
        status: "pending",
        providerResultMsg: null,
        refundAdjustedAt: adjustment?.finalizedAt,
        ...(doc
          ? {
              lineItems: doc.lines as unknown as Prisma.InputJsonValue,
              // İskonto da matrahla birlikte küçülür; kayıt satırlarla tutmalı.
              discountTotal: invoiceDiscountFromLines(doc.lines),
            }
          : {}),
      },
    });
  }

  /**
   * An unsent installment fee document follows the fee left after refunds:
   * repriced in place (amounts and its single line, at its own VAT rate), or
   * cancelled locally when nothing is left. Like the other documents, a
   * refund event without an attempt cancels it.
   */
  private async repriceUnsentInstallmentFeeInvoice(
    inv: FiscalInvoice,
    adjustment?: ResolvedRefundAdjustment,
  ): Promise<void> {
    const now = adjustment ? await this.installmentFeeDocumentNow(inv) : null;
    if (!now || now.gross <= 0.009) {
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
    await this.prisma.fiscalInvoice.update({
      where: { id: inv.id },
      data: {
        netAmount: now.net,
        taxAmount: now.tax,
        total: now.gross,
        status: "pending",
        providerResultMsg: null,
        refundAdjustedAt: adjustment?.finalizedAt,
        lineItems: now.lines as unknown as Prisma.InputJsonValue,
      },
    });
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
   * Kesilmiş faturayı tersine çevir. Tam ve daha önce düzeltme almamış e-Arşiv
   * ≤8 günde iptal edilir; diğer durumlarda attempt-bazlı IADE faturası kesilir.
   */
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

  private async reverseInvoice(
    inv: FiscalInvoice,
    adjustment?: ResolvedRefundAdjustment,
  ): Promise<void> {
    if (!inv.ettn || !inv.invoiceNumber || !inv.issuedAt) {
      throw new Error(`Invoice ${inv.id} is missing reversal identifiers`);
    }
    const priorReturns = await this.prisma.fiscalInvoice.findMany({
      where: {
        type: "return_invoice",
        billingReference: inv.invoiceNumber,
        status: { not: "cancelled" },
      },
      select: { total: true, netAmount: true },
    });
    const alreadyReversed = this.documents.round2(
      priorReturns.reduce((sum, row) => sum + Number(row.total), 0),
    );
    const remaining = this.documents.round2(
      Math.max(0, Number(inv.total) - alreadyReversed),
    );
    if (remaining <= 0.009) return;

    // The installment fee document is reversed by the fee refunded, not by
    // the goods ratio (AS-F3); its return is decided before the cancel check
    // because "fully refunded" means "this return takes all that is left".
    const isInstallmentFee = inv.type === INSTALLMENT_FEE_TYPE;
    const installmentInputs = isInstallmentFee
      ? await this.installmentFeeReturnInputs(inv, adjustment)
      : null;
    const installmentReturn = installmentInputs
      ? this.installmentFeeReturnWith(inv, installmentInputs, priorReturns)
      : null;
    const invoiceAdjustment = isInstallmentFee
      ? {
          refundRatio: 0,
          fullyRefunded: installmentReturn?.closesDocument ?? false,
        }
      : await this.resolveInvoiceAdjustment(inv, adjustment);
    const canCancel =
      (isInstallmentFee
        ? invoiceAdjustment.fullyRefunded
        : !adjustment || invoiceAdjustment.fullyRefunded) &&
      alreadyReversed <= 0.009 &&
      inv.documentType === "EARCHIVE" &&
      this.provider.eArchiveReversalStrategy(inv.issuedAt) === "CANCEL";

    // The installment fee document is cancelled only under a claim taken in
    // a Serializable transaction that sees no return: a concurrent handler
    // of another attempt either aborts there (P2034) or, holding no claim,
    // finds the claim inside its own return transaction and cuts nothing.
    const cancel =
      canCancel && isInstallmentFee
        ? await this.claimInstallmentFeeCancel(inv)
        : canCancel;
    if (cancel) {
      let cancellationOutcomeUnknown = false;
      const res: EInvoiceCancelResult = await this.provider
        .cancelEArchive({ ettn: inv.ettn, providerRef: inv.providerRef })
        .catch((e: unknown): EInvoiceCancelResult => {
          cancellationOutcomeUnknown = true;
          return {
            success: false,
            resultMsg: String((e as Error)?.message),
          };
        });
      if (res.success) {
        await this.prisma.fiscalInvoice.update({
          where: { id: inv.id },
          data: {
            status: "cancelled",
            cancelledAt: new Date(),
            cancelReason: "refund",
            providerResultMsg: res.resultMsg ?? null,
          },
        });
        this.logger.log(`eLogo iptal ${inv.invoiceNumber}: OK`);
        return;
      }
      // Timeout/transport hatasında provider iptali uygulamış olabilir. IADE
      // faturasına düşmeden önce ETTN durumunu sorgula; aksi halde çift ters kayıt olur.
      const providerStatus = await this.provider
        .getStatus({ ettn: inv.ettn, providerRef: inv.providerRef }, "EARCHIVE")
        .catch(() => null);
      if (providerStatus?.state === "cancelled") {
        await this.prisma.fiscalInvoice.update({
          where: { id: inv.id },
          data: {
            status: "cancelled",
            cancelledAt: new Date(),
            cancelReason: "refund",
            providerResultCode: providerStatus.resultCode ?? null,
            providerResultMsg:
              providerStatus.resultMsg ?? res.resultMsg ?? null,
          },
        });
        return;
      }
      if (cancellationOutcomeUnknown && !providerStatus) {
        throw new Error(
          `Cancellation outcome is unknown for ${inv.invoiceNumber}`,
        );
      }
      // İptal BAŞARISIZ → İADE FATURASINA düş (her durumda reversal garanti; orijinali 'sent' bırak).
      this.logger.warn(
        `eLogo iptal başarısız (${inv.invoiceNumber}): ${res.resultMsg} → iade faturasına düşülüyor`,
      );
      await this.prisma.fiscalInvoice.update({
        where: { id: inv.id },
        data: {
          cancelReason: "refund",
          providerResultMsg: res.resultMsg ?? null,
        },
      });
      // aşağıdaki İADE FATURASI yoluna devam (return yok)
    }

    // İADE FATURASI: aynı refund attempt yeniden işlense bile aynı sourceId kullanılır.
    const reversalSourceId = adjustment
      ? `${inv.id}:${adjustment.refundAttemptId}`
      : inv.id;
    const exists = await this.prisma.fiscalInvoice.findUnique({
      where: {
        type_sourceId: {
          type: "return_invoice",
          sourceId: reversalSourceId,
        },
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

    if (installmentInputs) {
      // The amount is decided again INSIDE the Serializable transaction, from
      // the returns it reads there: two attempts' handlers running at once
      // would otherwise both reverse the same outstanding amount. Postgres
      // aborts one of them (P2034) and the retry recomputes.
      const created = await this.createReturnInvoice(
        inv,
        reversalSourceId,
        async (tx) => {
          const original = await tx.fiscalInvoice.findUnique({
            where: { id: inv.id },
            select: { status: true, cancelReason: true },
          });
          // Being cancelled (or cancelled) by another handler: the cancel
          // reverses everything, a return on top would reverse it twice.
          if (
            !original ||
            original.status === "cancelled" ||
            original.cancelReason === INSTALLMENT_FEE_CANCEL_CLAIM
          ) {
            return null;
          }
          const prior = await tx.fiscalInvoice.findMany({
            where: {
              type: "return_invoice",
              billingReference: inv.invoiceNumber,
              status: { not: "cancelled" },
            },
            select: { total: true, netAmount: true },
          });
          const due = this.installmentFeeReturnWith(
            inv,
            installmentInputs,
            prior,
          );
          return due
            ? { total: due.total, net: due.net, lines: due.lines }
            : null;
        },
      );
      const share = adjustment?.installmentFeeRefund ?? 0;
      const reversed = created ? Number(created.total) : 0;
      if (adjustment && share > 0 && reversed + 0.009 < share) {
        // Less than the attempt's fee share was due here: the document was
        // cut after the refund, another attempt's return or the closing sweep
        // covers the rest, or (sweep) only the shortfall belonged to it.
        // Traceable without PII.
        this.logger.warn(
          `INSTALLMENT_FEE_RETURN_CAPPED invoice=${inv.invoiceNumber} attempt=${adjustment.refundAttemptId} share=${share} due=${reversed}`,
        );
      }
      return;
    }

    const baseGross = adjustment
      ? await this.resolveInvoiceRefundBase(inv)
      : Number(inv.total);
    const rawComponentLines = await this.refundComponentLinesForInvoice(
      inv,
      adjustment,
    );
    const rawComponentTotals = rawComponentLines.length
      ? invoiceTotalsFromLines(rawComponentLines)
      : null;
    const componentScale =
      rawComponentTotals && rawComponentTotals.total > remaining
        ? remaining / rawComponentTotals.total
        : 1;
    const componentLines = rawComponentLines.map((line) => ({
      ...line,
      net: this.documents.round2(line.net * componentScale),
      unitPrice: (line.net * componentScale) / line.quantity,
      // KDV de matrahla BİRLİKTE ölçeklenmeli: satır artık kendi KDV'sini açıkça
      // taşıdığı için (taxAmount) ölçeklenmeyen tutar, küçültülmüş matrahın
      // üstünde tam KDV beyan ederdi — iade belgesi kalan bakiyeyi aşardı.
      ...(typeof line.taxAmount === "number"
        ? {
            taxAmount: this.documents.round2(line.taxAmount * componentScale),
          }
        : {}),
    }));
    const componentTotals = componentLines.length
      ? invoiceTotalsFromLines(componentLines)
      : null;
    const returnTotal = componentTotals
      ? Math.min(remaining, componentTotals.total)
      : invoiceAdjustment.fullyRefunded
        ? remaining
        : Math.min(
            remaining,
            this.documents.round2(baseGross * invoiceAdjustment.refundRatio),
          );
    if (returnTotal <= 0.009) return;
    const originalTotal = Number(inv.total);
    const netRatio =
      originalTotal > 0 ? Number(inv.netAmount) / originalTotal : 0;
    const returnNet = componentTotals
      ? Math.min(componentTotals.net, returnTotal)
      : this.documents.round2(returnTotal * netRatio);

    await this.createReturnInvoice(inv, reversalSourceId, {
      total: returnTotal,
      net: returnNet,
      lines: componentLines,
    });
  }

  /**
   * Cuts the RETURN invoice of `inv` under `reversalSourceId` (one per refund
   * attempt, idempotent through `(type, sourceId)`) and sends it.
   */
  private async createReturnInvoice(
    inv: FiscalInvoice,
    reversalSourceId: string,
    amounts:
      | ReturnAmounts
      | ((tx: Prisma.TransactionClient) => Promise<ReturnAmounts | null>),
  ): Promise<FiscalInvoice | null> {
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
          if (raced) return raced;
          const resolved =
            typeof amounts === "function" ? await amounts(tx) : amounts;
          if (!resolved || resolved.total <= 0.009) return null;
          const {
            total: returnTotal,
            net: returnNet,
            lines: componentLines,
          } = resolved;
          const number =
            await this.documents.allocateDocumentNumberInTransaction(
              tx,
              invoiceIssueYear(now),
            );
          return tx.fiscalInvoice.create({
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
              netAmount: returnNet,
              taxAmount: this.documents.round2(returnTotal - returnNet),
              total: returnTotal,
              originalTotal: returnTotal,
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
              lineItems: componentLines.length
                ? (componentLines as unknown as Prisma.InputJsonValue)
                : undefined,
              createdAt: now,
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
    if (!record) return null;
    await this.delivery.sendRecord(record.id);
    return record;
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
