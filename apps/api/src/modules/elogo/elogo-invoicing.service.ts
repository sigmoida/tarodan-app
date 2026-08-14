import { Injectable, Logger, Optional } from "@nestjs/common";
import { randomUUID } from "crypto";
import { PrismaService } from "../../prisma";
import {} from "./helpers/elogo-retry-policy";
import { type GuestInvoiceRecipient } from "./invoice/elogo-guest-recipient";
import { ElogoService } from "./elogo.service";
import { ElogoQueryService } from "./elogo-query.service";
import { ElogoDocumentService } from "./elogo-document.service";
import { ElogoDeliveryService } from "./elogo-delivery.service";
import { ElogoIssuingService } from "./elogo-issuing.service";
import { LINE_DESCRIPTION } from "./invoice/invoice-line-description";
import { StorageService } from "../storage/storage.service";
import { SmtpProvider } from "../mail/smtp.provider";
import { Prisma, type ElogoInvoice } from "@prisma/client";
import { invoiceIssueYear } from "./invoice/invoice-datetime";
import {
  invoiceTotalsFromLines,
  type InvoiceLineItem,
} from "./invoice/invoice-lines";
import type { InvoiceRefundReversePayload } from "../outbox/outbox.types";

/**
 * Tarodan'ın KENDİ gelir e-belgelerini (komisyon, hizmet bedeli, üyelik, boost, iade)
 * eLogo'ya keser. Düzenleyen HEP platform firması (Serhatlar) — satıcı adına DEĞİL.
 *
 * İlkeler:
 *  - Tutarlar olay anındaki KAYITLI snapshot'tan gelir (CommissionLedger / MembershipPayment /
 *    ProductBoost). Oran/fiyat sonradan değişse bile kesilen fatura etkilenmez.
 *  - Idempotent: (type, sourceId) tekil; aynı kaynak iki kez kesilmez.
 *  - Non-blocking: hata ödeme/sipariş akışını ETKİLEMEZ; failed kayıt + retry cron.
 *  - Numara gap-free (ElogoDocSequence); retry aynı numara/ETTN'i yeniden kullanır.
 */
export type RevenueType =
  | "commission"
  | "service_fee"
  | "membership"
  | "boost"
  | "trade_commission"
  | "trade_service_fee"
  | "platform_sale";

type ResolvedRefundAdjustment = InvoiceRefundReversePayload & {
  finalizedAt: Date;
  refundRequestId?: string;
};

/** `cut()` çağrısının türe göre değişen bağlamı. */
export interface CutOptions {
  /** Kesim anında snapshot'lanan kalem açıklaması; boşsa LINE_DESCRIPTION[type]. */
  lineDescription?: string;
  /** Misafir siparişinin gerçek alıcı kimliği (paylaşılan sistem kullanıcısı yerine). */
  guestRecipient?: GuestInvoiceRecipient | null;
  /** Ürün satışında KDV oranını belirleyen kategori. */
  categoryId?: string | null;
  /** Çok kalemli belge (ürün + kargo + hizmet bedeli). Boşsa tek kalem kesilir. */
  lineItems?: InvoiceLineItem[];
}

@Injectable()
export class ElogoInvoicingService {
  private readonly logger = new Logger(ElogoInvoicingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly elogo: ElogoService,
    private readonly queries: ElogoQueryService,
    private readonly documents: ElogoDocumentService,
    private readonly delivery: ElogoDeliveryService,
    private readonly issuing: ElogoIssuingService,
    @Optional() private readonly storage?: StorageService,
    @Optional() private readonly smtp?: SmtpProvider,
  ) {}

  // ───────────────────────── public API (tetikleyiciler çağırır) ─────────────────────────
  // ───────────────────────── kesme ─────────────────────────
  // Sipariş yaşam döngüsü, üyelik, boost, takas ve outbox handler'ları bu
  // servisi adresliyor; gövde ElogoIssuingService'te.

  issueOrderRevenueInvoices(orderId: string): Promise<void> {
    return this.issuing.issueOrderRevenueInvoices(orderId);
  }

  issueCommissionInvoice(packageId: string): Promise<void> {
    return this.issuing.issueCommissionInvoice(packageId);
  }

  issueServiceFeeInvoice(packageId: string): Promise<void> {
    return this.issuing.issueServiceFeeInvoice(packageId);
  }

  issuePlatformSaleInvoice(orderId: string): Promise<void> {
    return this.issuing.issuePlatformSaleInvoice(orderId);
  }

  issueMembershipInvoice(membershipPaymentId: string): Promise<void> {
    return this.issuing.issueMembershipInvoice(membershipPaymentId);
  }

  issueMembershipInvoiceForOrder(orderId: string): Promise<void> {
    return this.issuing.issueMembershipInvoiceForOrder(orderId);
  }

  issueVirtualOrderInvoice(
    ...args: Parameters<ElogoIssuingService["issueVirtualOrderInvoice"]>
  ) {
    return this.issuing.issueVirtualOrderInvoice(...args);
  }

  issueBoostInvoice(boostId: string): Promise<void> {
    return this.issuing.issueBoostInvoice(boostId);
  }

  issueTradeCashFeeInvoice(tradeCashPaymentId: string): Promise<void> {
    return this.issuing.issueTradeCashFeeInvoice(tradeCashPaymentId);
  }

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
        refundRequestId: attempt.idempotencyKey?.startsWith("refund-request:")
          ? attempt.idempotencyKey.slice("refund-request:".length)
          : undefined,
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
    await this.reverseByKeys([
      { type: "trade_commission", sourceId: tradeCashPaymentId },
      { type: "trade_service_fee", sourceId: tradeCashPaymentId },
    ]);
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
      const inv = await this.prisma.elogoInvoice.findUnique({
        where: { type_sourceId: { type: k.type as any, sourceId: k.sourceId } },
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
      } catch (error: any) {
        const message = `${inv.invoiceNumber ?? inv.id}: ${error?.message ?? error}`;
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
    inv: ElogoInvoice,
    adjustment?: ResolvedRefundAdjustment,
  ): Promise<void> {
    const gross = adjustment ? await this.resolveCurrentInvoiceGross(inv) : 0;
    if (gross <= 0.009) {
      await this.prisma.elogoInvoice.update({
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
    const amounts = this.documents.invoiceAmounts(inv.type, gross, rate);
    await this.prisma.elogoInvoice.update({
      where: { id: inv.id },
      data: {
        netAmount: amounts.net,
        taxAmount: amounts.tax,
        total: amounts.total,
        status: "pending",
        elogoResultMsg: null,
        refundAdjustedAt: adjustment?.finalizedAt,
      },
    });
  }

  /** İade sonrası ilgili faturanın bugün itibarıyla kesilmesi gereken net brüt tutar. */
  private async resolveCurrentInvoiceGross(inv: ElogoInvoice): Promise<number> {
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

  // ───────────────────────── cron: gönderim kurtarma ─────────────────────────
  // elogo-scheduler bu servisi adresliyor; gövde ElogoDeliveryService'te.

  retryPendingInvoices(
    ...args: Parameters<ElogoDeliveryService["retryPendingInvoices"]>
  ) {
    return this.delivery.retryPendingInvoices(...args);
  }

  reportExhaustedInvoices(): Promise<number> {
    return this.delivery.reportExhaustedInvoices();
  }

  resetInvoiceAttempts(invoiceId: string): Promise<void> {
    return this.delivery.resetInvoiceAttempts(invoiceId);
  }

  // ───────────────────────── app: görüntüleme/indirme ─────────────────────────
  // Uygulama ve elogo-invoice.controller bu servisi adresliyor; gövde
  // ElogoQueryService'e taşındı, imzalar burada kaldı.

  listForUser(...args: Parameters<ElogoQueryService["listForUser"]>) {
    return this.queries.listForUser(...args);
  }

  findOrderInvoiceForUser(
    ...args: Parameters<ElogoQueryService["findOrderInvoiceForUser"]>
  ) {
    return this.queries.findOrderInvoiceForUser(...args);
  }

  getInvoiceDownload(
    ...args: Parameters<ElogoQueryService["getInvoiceDownload"]>
  ) {
    return this.queries.getInvoiceDownload(...args);
  }

  /**
   * Kesilmiş faturayı tersine çevir. Tam ve daha önce düzeltme almamış e-Arşiv
   * ≤8 günde iptal edilir; diğer durumlarda attempt-bazlı IADE faturası kesilir.
   */
  private async refundComponentLinesForInvoice(
    inv: ElogoInvoice,
    adjustment?: ResolvedRefundAdjustment,
  ): Promise<InvoiceLineItem[]> {
    if (!adjustment?.refundRequestId) return [];
    const rr = await this.prisma.refundRequest.findUnique({
      where: { id: adjustment.refundRequestId },
      select: {
        refundQuantity: true,
        financialComponents: {
          where: {
            treatment:
              inv.type === "commission" ? "seller_refund" : "buyer_refund",
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!rr?.financialComponents.length) return [];
    const allowed =
      inv.type === "commission"
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
        };
      });
  }

  private async reverseInvoice(
    inv: ElogoInvoice,
    adjustment?: ResolvedRefundAdjustment,
  ): Promise<void> {
    if (!inv.ettn || !inv.invoiceNumber || !inv.issuedAt) {
      throw new Error(`Invoice ${inv.id} is missing reversal identifiers`);
    }
    const priorReturns = await this.prisma.elogoInvoice.findMany({
      where: {
        type: "return_invoice",
        billingReference: inv.invoiceNumber,
        status: { not: "cancelled" },
      },
      select: { total: true },
    });
    const alreadyReversed = this.documents.round2(
      priorReturns.reduce((sum, row) => sum + Number(row.total), 0),
    );
    const remaining = this.documents.round2(
      Math.max(0, Number(inv.total) - alreadyReversed),
    );
    if (remaining <= 0.009) return;

    const invoiceAdjustment = await this.resolveInvoiceAdjustment(
      inv,
      adjustment,
    );
    const canCancel =
      (!adjustment || invoiceAdjustment.fullyRefunded) &&
      alreadyReversed <= 0.009 &&
      inv.documentType === "EARCHIVE" &&
      this.elogo.refundStrategy(inv.issuedAt) === "CANCEL";

    if (canCancel) {
      let cancellationOutcomeUnknown = false;
      const res = await this.elogo
        .cancelEArchiveInvoice(inv.ettn, inv.elogoRefId ?? undefined)
        .catch((e: any) => {
          cancellationOutcomeUnknown = true;
          return {
            success: false,
            description: String(e?.message),
          } as any;
        });
      if (res.success) {
        await this.prisma.elogoInvoice.update({
          where: { id: inv.id },
          data: {
            status: "cancelled",
            cancelledAt: new Date(),
            cancelReason: "refund",
            elogoResultMsg: res.description ?? null,
          },
        });
        this.logger.log(`eLogo iptal ${inv.invoiceNumber}: OK`);
        return;
      }
      // Timeout/transport hatasında provider iptali uygulamış olabilir. IADE
      // faturasına düşmeden önce ETTN durumunu sorgula; aksi halde çift ters kayıt olur.
      const providerStatus = await this.elogo
        .getDocumentStatus(inv.ettn, "EARCHIVE")
        .catch(() => null);
      if (providerStatus?.isCancel) {
        await this.prisma.elogoInvoice.update({
          where: { id: inv.id },
          data: {
            status: "cancelled",
            cancelledAt: new Date(),
            cancelReason: "refund",
            elogoResultCode: providerStatus.code ?? null,
            elogoResultMsg:
              providerStatus.description ?? res.description ?? null,
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
        `eLogo iptal başarısız (${inv.invoiceNumber}): ${res.description} → iade faturasına düşülüyor`,
      );
      await this.prisma.elogoInvoice.update({
        where: { id: inv.id },
        data: {
          cancelReason: "refund",
          elogoResultMsg: res.description ?? null,
        },
      });
      // aşağıdaki İADE FATURASI yoluna devam (return yok)
    }

    // İADE FATURASI: aynı refund attempt yeniden işlense bile aynı sourceId kullanılır.
    const reversalSourceId = adjustment
      ? `${inv.id}:${adjustment.refundAttemptId}`
      : inv.id;
    const exists = await this.prisma.elogoInvoice.findUnique({
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

    const now = new Date();
    const record = await this.prisma.$transaction(
      async (tx) => {
        const raced = await tx.elogoInvoice.findUnique({
          where: {
            type_sourceId: {
              type: "return_invoice",
              sourceId: reversalSourceId,
            },
          },
        });
        if (raced) return raced;
        const number = await this.documents.allocateInvoiceNumberInTransaction(
          tx,
          invoiceIssueYear(now),
        );
        return tx.elogoInvoice.create({
          data: {
            type: "return_invoice",
            sourceId: reversalSourceId,
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
    );
    await this.delivery.sendRecord(record.id);
  }

  private async resolveInvoiceAdjustment(
    inv: ElogoInvoice,
    adjustment?: ResolvedRefundAdjustment,
  ): Promise<{ refundRatio: number; fullyRefunded: boolean }> {
    if (!adjustment) {
      return { refundRatio: 1, fullyRefunded: true };
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
  private async resolveInvoiceRefundBase(inv: ElogoInvoice): Promise<number> {
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
