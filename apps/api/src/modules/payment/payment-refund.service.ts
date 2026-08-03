import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  Optional,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../prisma";
import {
  Prisma,
  PaymentStatus,
  PaymentHoldStatus,
  OrderStatus,
  TradeStatus,
  RefundRequestStatus,
  RefundAttemptStatus,
  SellerAdjustmentType,
} from "@prisma/client";
import { getProductStatusFromQuantity } from "../product/helpers/product-status.helper";
import { PaymentProviderRegistry } from "../payment-providers/payment-provider.registry";
import { PaymentProvider } from "./dto";
import { EventService } from "../events";
import { NotificationService } from "../notification/notification.service";
import { NotificationType } from "../notification/dto/notification.dto";
import { CommissionLedgerService } from "../commission/commission-ledger.service";
import { ElogoInvoicingService } from "../elogo";
import { PaymentCommonService } from "./payment-common.service";
import { PaymentProviderEventService } from "./payment-provider-event.service";
import { OutboxService } from "../outbox/outbox.service";
import {
  OUTBOX_SHIPMENT_CANCEL,
  OUTBOX_INVOICE_REFUND_REVERSE,
  OUTBOX_INVOICE_TRADE_CASH_REFUND_REVERSE,
  OUTBOX_ORDER_REVENUE_INVOICE,
  type InvoiceRefundReversePayload,
  type OrderRevenueInvoicePayload,
} from "../outbox/outbox.types";
import { LedgerService } from "../ledger/ledger.service";
import { MONEY_EPSILON } from "./payment.constants";
import { i18nMessage } from "../i18n";
import {
  ProviderRefundOutcomeUnknownException,
  ProviderRefundRejectedException,
  RefundPendingReconciliationException,
} from "../payment-providers/refund-errors";

/**
 * İade / escrow serbest bırakma metodları — PaymentService'ten birebir taşındı
 * (facade-delege deseni). PaymentService aynı imzalarla buraya delege eder.
 * scheduleHoldReleaseOnDelivery hold penceresi hesabı için holdDays/returnWindowDays/
 * payoutGraceDays alanlarını KENDİ constructor'ında bayt-bayt aynı mantıkla yeniden üretir.
 */
/**
 * 11.4c — Kısmi iade ORANI (TEK otorite): hold tüketimi ve ledger pro-rate AYNI formülü
 * kullanır. `amount/threshold`, [0,1] arasına clamp'li; threshold ≤ 0 iken 1 (tam). Eskiden
 * iki yerde birebir kopyalanıyordu → drift riski; artık tek yerden.
 */
function refundPortion(amountToRefund: number, threshold: number): number {
  return threshold > 0 ? Math.min(amountToRefund / threshold, 1) : 1;
}

const PAYOUT_ELIGIBLE_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.delivered,
  OrderStatus.awaiting_buyer_confirmation,
  OrderStatus.completed,
];

export interface RefundSettlementOptions {
  /** Ürünlerin tamamı fiziksel olarak döndü; nakit iade toplamdan düşük olsa da siparişi kapat. */
  closeOrder?: boolean;
  /** Satıcı hold'unun tüketilecek adet oranı. Nakit iade oranından bağımsızdır. */
  holdPortion?: number;
  /**
   * Bu iadeden sonra hold'da satıcıya BIRAKILACAK tutar (kendi kargo payının
   * tazmini). Escrow hold TAM kargoyu düştüğü için satıcı payını peşin ödemiş
   * sayılır; kusur alıcıdaysa geri verilir. Tüketimi YALNIZ aşağı çeker.
   */
  holdRetainedAmount?: number;
  /** Terslenecek satıcı kesintisinin kesin TL tutarı. */
  sellerFeeRefundAmount?: number;
  /** Terslenecek alıcı hizmet/komisyon kesintisinin kesin TL tutarı. */
  buyerFeeRefundAmount?: number;
  /**
   * Satıcıya yazılacak borçlar (payout mahsubu). İadenin kargo bacağı iki ayrı
   * kalem doğurabilir: dönüş kargosu (`return_shipping`) ve satıcı kusurunda
   * alıcıya geri ödenen gidiş kargosu (`outbound_shipping`). `sourceKey` unique
   * olduğundan tekrar denemede borç ikilenmez.
   */
  sellerAdjustments?: Array<{
    sourceKey: string;
    amount: number;
    type: SellerAdjustmentType;
    refundRequestId?: string;
  }>;
}

export interface ProcessRefundOptions {
  skipRefundEvent?: boolean;
  refundQuantity?: number;
  idempotencyKey?: string;
  settlement?: RefundSettlementOptions;
}

const OPEN_REFUND_STATUSES: RefundRequestStatus[] = [
  RefundRequestStatus.pending_review,
  RefundRequestStatus.approved,
  RefundRequestStatus.wait_for_delivery,
  RefundRequestStatus.return_shipment_open,
  RefundRequestStatus.return_in_transit,
  RefundRequestStatus.return_delivered,
  RefundRequestStatus.disputed,
];

@Injectable()
export class PaymentRefundService {
  private readonly logger = new Logger(PaymentRefundService.name);
  private readonly holdDays: number;
  // Escrow yeni model: satıcıya ödeme TESLİMDEN sonra serbest bırakılır.
  // İade TALEP penceresi = teslim + returnWindowDays (14). Satıcı payout uygunluğu
  // = teslim + returnWindowDays + payoutGraceDays. Grace, iade penceresi kapandıktan
  // SONRA payout'u başlatır → "14. günün son saniyesinde iade + payout çoktan gitti"
  // çakışması imkânsız olur (payout, return cutoff'tan grace kadar SONRA uygundur).
  private readonly returnWindowDays: number;
  private readonly payoutGraceDays: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly paymentProviders: PaymentProviderRegistry,
    private readonly eventService: EventService,
    private readonly notificationService: NotificationService,
    private readonly commissionLedger: CommissionLedgerService,
    private readonly elogoInvoicing: ElogoInvoicingService,
    private readonly paymentCommon: PaymentCommonService,
    private readonly providerEvents: PaymentProviderEventService,
    // Faz 5: iade tx'iyle AYNI anda "Sürat iptali" outbox satırı yaz → çökmeye dayanıklı
    // backstop (post-commit anlık iptal hızlı-yol kalır; handler idempotent). @Optional:
    // prod'da global OutboxModule daima enjekte eder; birim testleri (mock tx) sağlamak
    // zorunda kalmasın diye opsiyonel — yoksa yalnız anlık best-effort yola düşülür.
    @Optional()
    private readonly outbox?: OutboxService,
    // Faz 6.2: iade tx'inde `refund_issued` çift-taraflı defter kaydı (oransal ters kayıt).
    // @Optional + best-effort — defter hatası iadeyi BOZMAZ; reconciliation açığı yakalar.
    @Optional()
    private readonly ledger?: LedgerService,
  ) {
    this.holdDays = parseInt(
      this.configService.get("PAYMENT_HOLD_DAYS") || "7",
      10,
    );
    this.returnWindowDays = parseInt(
      this.configService.get("RETURN_WINDOW_DAYS") || "14",
      10,
    );
    this.payoutGraceDays = parseInt(
      this.configService.get("PAYOUT_GRACE_DAYS") || "1",
      10,
    );
  }

  private async claimRefundAttempt(
    paymentId: string,
    orderId: string,
    amountToRefund: number,
    refundCap: number,
    isGroupPayment: boolean,
    idempotencyKey: string,
    provider: string,
    providerReference: string,
  ): Promise<{
    action: "submit" | "finalize" | "done";
    attempt: {
      id: string;
      status: RefundAttemptStatus;
      providerRefundId: string | null;
      providerResponse: Prisma.JsonValue | null;
    };
  }> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM payments WHERE id = ${paymentId} FOR UPDATE`;
      const fresh = await tx.payment.findUnique({
        where: { id: paymentId },
        select: { metadata: true },
      });
      const meta = (fresh?.metadata as Record<string, any>) || {};
      const refundedOrders =
        (meta.refundedOrders as Record<string, number>) || {};

      if (isGroupPayment && refundedOrders[orderId]) {
        throw new BadRequestException(
          i18nMessage("server.payment.orderAlreadyRefunded"),
        );
      }
      if (!isGroupPayment) {
        const prior = Number(refundedOrders[orderId] || 0);
        if (prior + amountToRefund > refundCap + MONEY_EPSILON) {
          throw new BadRequestException(
            i18nMessage("server.payment.refundAmountExceedsLimit", {
              amountToRefund,
              refundCap: Math.max(
                Math.round((refundCap - prior) * 100) / 100,
                0,
              ),
            }),
          );
        }
      }

      let attempt = await tx.refundAttempt.findUnique({
        where: { idempotencyKey },
      });
      if (attempt) {
        if (
          attempt.paymentId !== paymentId ||
          attempt.orderId !== orderId ||
          Math.abs(Number(attempt.amount) - amountToRefund) > MONEY_EPSILON
        ) {
          throw new BadRequestException(
            i18nMessage("server.payment.refundInitiationFailed"),
          );
        }
        if (attempt.status === RefundAttemptStatus.finalized) {
          return { action: "done" as const, attempt };
        }
        if (attempt.status === RefundAttemptStatus.succeeded) {
          return { action: "finalize" as const, attempt };
        }
        if (
          attempt.status === RefundAttemptStatus.submitting ||
          attempt.status === RefundAttemptStatus.manual_review
        ) {
          throw new RefundPendingReconciliationException(
            i18nMessage("server.payment.refundInitiationFailed"),
          );
        }
        if (attempt.status === RefundAttemptStatus.failed) {
          attempt = await tx.refundAttempt.update({
            where: { id: attempt.id },
            data: {
              status: RefundAttemptStatus.prepared,
              failureReason: null,
              requestStartedAt: null,
            },
          });
        }
        return { action: "submit" as const, attempt };
      }

      const unresolved = await tx.refundAttempt.findFirst({
        where: {
          paymentId,
          orderId,
          status: {
            in: [
              RefundAttemptStatus.prepared,
              RefundAttemptStatus.submitting,
              RefundAttemptStatus.succeeded,
              RefundAttemptStatus.manual_review,
            ],
          },
        },
      });
      if (unresolved) {
        throw new RefundPendingReconciliationException(
          i18nMessage("server.payment.refundInitiationFailed"),
        );
      }

      attempt = await tx.refundAttempt.create({
        data: {
          paymentId,
          orderId,
          idempotencyKey,
          amount: amountToRefund,
          provider,
          providerReference,
        },
      });
      return { action: "submit" as const, attempt };
    });
  }

  private async startRefundSubmission(attemptId: string): Promise<void> {
    const started = await this.prisma.refundAttempt.updateMany({
      where: { id: attemptId, status: RefundAttemptStatus.prepared },
      data: {
        status: RefundAttemptStatus.submitting,
        requestStartedAt: new Date(),
      },
    });
    if (started.count !== 1) {
      throw new RefundPendingReconciliationException(
        i18nMessage("server.payment.refundInitiationFailed"),
      );
    }
  }

  private async claimTradeRefundAttempt(
    paymentId: string,
    tradeId: string,
    amount: number,
    provider: string,
    providerReference: string,
  ): Promise<{
    action: "submit" | "finalize" | "done";
    attempt: {
      id: string;
      status: RefundAttemptStatus;
      providerRefundId: string | null;
      providerResponse: Prisma.JsonValue | null;
    };
  }> {
    const idempotencyKey = `trade-cash-refund:${paymentId}`;
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM payments WHERE id = ${paymentId} FOR UPDATE`;
      let attempt = await tx.refundAttempt.findUnique({
        where: { idempotencyKey },
      });
      if (attempt) {
        if (
          attempt.paymentId !== paymentId ||
          attempt.tradeId !== tradeId ||
          Math.abs(Number(attempt.amount) - amount) > MONEY_EPSILON
        ) {
          throw new BadRequestException(
            i18nMessage("server.payment.refundInitiationFailed"),
          );
        }
        if (attempt.status === RefundAttemptStatus.finalized) {
          return { action: "done" as const, attempt };
        }
        if (attempt.status === RefundAttemptStatus.succeeded) {
          return { action: "finalize" as const, attempt };
        }
        if (
          attempt.status === RefundAttemptStatus.submitting ||
          attempt.status === RefundAttemptStatus.manual_review
        ) {
          throw new RefundPendingReconciliationException(
            i18nMessage("server.payment.refundInitiationFailed"),
          );
        }
        if (attempt.status === RefundAttemptStatus.failed) {
          attempt = await tx.refundAttempt.update({
            where: { id: attempt.id },
            data: {
              status: RefundAttemptStatus.prepared,
              failureReason: null,
              requestStartedAt: null,
            },
          });
        }
        return { action: "submit" as const, attempt };
      }

      const unresolved = await tx.refundAttempt.findFirst({
        where: {
          paymentId,
          tradeId,
          status: {
            in: [
              RefundAttemptStatus.prepared,
              RefundAttemptStatus.submitting,
              RefundAttemptStatus.succeeded,
              RefundAttemptStatus.manual_review,
            ],
          },
        },
      });
      if (unresolved) {
        throw new RefundPendingReconciliationException(
          i18nMessage("server.payment.refundInitiationFailed"),
        );
      }

      attempt = await tx.refundAttempt.create({
        data: {
          paymentId,
          tradeId,
          idempotencyKey,
          amount,
          provider,
          providerReference,
        },
      });
      return { action: "submit" as const, attempt };
    });
  }

  /**
   * 11.2d — İade sonucu bildirimleri (POST-COMMIT best-effort). Eskiden finalize tx'i
   * İÇİNDE koşuyordu → FOR UPDATE kilidini uzatıyor + bir bildirim hatası para-tx'ini
   * abort edebiliyordu. Artık tx commit'inden SONRA çağrılır (para zaten geri döndü;
   * bildirim hatası iadeyi bozmaz). Guard/iptal-vs-refunded dallanması birebir korundu.
   * (Recovery no-op'ta çağrılmaz — finalize tx null döner, .then erken çıkar.)
   */
  private async notifyRefundOutcome(
    orderId: string,
    amountToRefund: number,
    payment: any,
    providerRefundId: string | undefined,
    skipRefundEvent: boolean | undefined,
  ): Promise<void> {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: {
          buyer: { select: { id: true, email: true, displayName: true } },
          seller: { select: { id: true, email: true, displayName: true } },
        },
      });
      // refund.service akışı kendi REFUND_COMPLETED (push+mail) bildirimini gönderiyor;
      // oradan çağrıldığında payment_refunded'ı atla ki alıcı çift push almasın.
      if (order && !skipRefundEvent) {
        if (order.cancellationType === "iptal") {
          // Kargo öncesi İPTAL: para iade ediliyor ama kullanıcıya "iade" değil "iptal"
          // denmeli. Alıcı + satıcıya iptal bildirimi + order-cancelled maili; refunded ATLA.
          await this.notificationService.createInAppNotification(
            order.buyerId,
            NotificationType.ORDER_CANCELLED,
            { orderId, orderNumber: order.orderNumber, amount: amountToRefund },
          );
          await this.notificationService.createInAppNotification(
            order.sellerId,
            NotificationType.ORDER_CANCELLED_SELLER,
            { orderId, orderNumber: order.orderNumber },
          );
          await this.notificationService.sendOrderCancelledEmails(orderId);
          this.logger.log(
            `order_cancelled notification sent for order ${orderId} (cancellationType=iptal)`,
          );
        } else {
          await this.eventService.emitPaymentRefunded({
            paymentId: payment.id,
            orderId,
            orderNumber: order.orderNumber,
            buyerId: order.buyerId,
            buyerEmail: order.buyer.email,
            buyerName: order.buyer.displayName || order.buyer.email,
            sellerId: order.sellerId,
            sellerEmail: order.seller.email,
            sellerName: order.seller.displayName || order.seller.email,
            refundAmount: amountToRefund,
            totalAmount: Number(payment.amount),
            provider: payment.provider,
            providerRefundId,
          });
          this.logger.log(
            `payment.refunded event emitted for payment ${payment.id}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(`Failed to emit payment.refunded event: ${error}`);
    }
  }

  /**
   * Process refund
   * Requirement: Refund handling (project.md)
   */
  async processRefund(
    orderId: string,
    refundAmount?: number,
    opts?: ProcessRefundOptions,
  ) {
    let payment = await this.prisma.payment.findFirst({
      where: {
        orderId,
        status: { in: [PaymentStatus.completed, PaymentStatus.refunded] },
      },
      include: {
        order: true,
      },
    });

    // Grup ödemesi: payment.orderId null → siparişin checkoutGroupId'si üzerinden çöz
    const refundTargetOrder = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        totalAmount: true,
        checkoutGroupId: true,
      },
    });
    if (!payment && refundTargetOrder?.checkoutGroupId) {
      payment = await this.prisma.payment.findFirst({
        where: {
          checkoutGroupId: refundTargetOrder.checkoutGroupId,
          status: { in: [PaymentStatus.completed, PaymentStatus.refunded] },
        },
        include: { order: true },
      });
    }

    if (!payment) {
      throw new NotFoundException(
        i18nMessage("server.payment.completedPaymentNotFound"),
      );
    }

    const isGroupPayment = !payment.orderId && !!payment.checkoutGroupId;
    if (isGroupPayment && !refundTargetOrder) {
      throw new NotFoundException(i18nMessage("server.payment.orderNotFound"));
    }

    // Grup ödemesinde varsayılan iade tutarı SİPARİŞİN tutarıdır (grubun değil)
    const amountToRefund =
      refundAmount ??
      (isGroupPayment
        ? Number(refundTargetOrder!.totalAmount)
        : Number(payment.amount));
    const isZeroCashSettlement =
      amountToRefund === 0 && Boolean(opts?.settlement);
    if (
      !Number.isFinite(amountToRefund) ||
      amountToRefund < 0 ||
      (amountToRefund === 0 && !isZeroCashSettlement)
    ) {
      throw new BadRequestException(
        i18nMessage("server.payment.refundInitiationFailed"),
      );
    }

    // O12: İade tutarı üst sınırı. Aksi halde tek çağrıda işlem tutarından FAZLA iade
    // talep edilebilir (yalnız PayTR reddi engelliyordu). Üst sınır = ilgili siparişin
    // tutarı (grup) veya ödeme tutarı (tekil).
    const refundCap = isGroupPayment
      ? Number(refundTargetOrder!.totalAmount)
      : Number(payment.amount);
    if (amountToRefund > refundCap + 0.01) {
      throw new BadRequestException(
        i18nMessage("server.payment.refundAmountExceedsLimit", {
          amountToRefund,
          refundCap,
        }),
      );
    }

    if (payment.provider !== PaymentProvider.paytr) {
      throw new BadRequestException(
        i18nMessage("server.payment.unknownProvider", {
          provider: payment.provider,
        }),
      );
    }
    const idempotencyKey =
      opts?.idempotencyKey?.trim() ||
      (amountToRefund >= refundCap - MONEY_EPSILON
        ? `full-refund:${payment.id}:${orderId}`
        : undefined);
    if (!idempotencyKey) {
      throw new BadRequestException(
        i18nMessage("server.payment.refundInitiationFailed"),
      );
    }
    const priorAttempt = await this.prisma.refundAttempt.findUnique({
      where: { idempotencyKey },
    });
    if (priorAttempt?.status === RefundAttemptStatus.finalized) {
      if (
        priorAttempt.paymentId !== payment.id ||
        priorAttempt.orderId !== orderId ||
        Math.abs(Number(priorAttempt.amount) - amountToRefund) > MONEY_EPSILON
      ) {
        throw new BadRequestException(
          i18nMessage("server.payment.refundInitiationFailed"),
        );
      }
      return {
        success: true,
        paymentId: payment.id,
        refundAmount: amountToRefund,
        providerRefundId: priorAttempt.providerRefundId ?? undefined,
        idempotent: true,
      };
    }
    if (payment.status !== PaymentStatus.completed) {
      throw new BadRequestException(
        i18nMessage("server.payment.orderAlreadyRefunded"),
      );
    }

    // Grup ödemesinde aynı sipariş ikinci kez iade edilemez
    const previouslyRefundedOrders: Record<string, number> =
      ((payment.metadata as any)?.refundedOrders as Record<string, number>) ||
      {};
    if (isGroupPayment && previouslyRefundedOrders[orderId]) {
      throw new BadRequestException(
        i18nMessage("server.payment.orderAlreadyRefunded"),
      );
    }

    // MONEY-H4: Tekil ödemede KÜMÜLATİF iade tavanı. Kısmi iadelere izin verdiğimiz
    // için (payment `completed` kalır) art arda iadelerin TOPLAMI işlem tutarını
    // aşamaz. PayTR'den ÖNCE kontrol et ki PayTR'da fazladan para iade edilmesin.
    // (NOT: aynı sipariş üzerinde EŞZAMANLI kısmi iadeler tx-öncesi bu okumada
    // yarışabilir — nadir, admin manuel akış; kalıcı çözüm sabit idempotency +
    // reconciliation, Faz 2.)
    if (!isGroupPayment) {
      const priorRefunded = Number(previouslyRefundedOrders[orderId] || 0);
      if (priorRefunded + amountToRefund > refundCap + MONEY_EPSILON) {
        throw new BadRequestException(
          i18nMessage("server.payment.refundAmountExceedsLimit", {
            amountToRefund,
            refundCap: Math.max(
              Math.round((refundCap - priorRefunded) * 100) / 100,
              0,
            ),
          }),
        );
      }
    }

    const paytrOid = payment.providerConversationId?.trim() ?? "";
    if (!paytrOid) {
      this.logger.error(
        `processRefund: captured merchant_oid is missing payment=${payment.id} order=${orderId}`,
      );
      throw new BadRequestException(
        i18nMessage("server.payment.paytrRefundFailed"),
      );
    }
    const refundAttempt = await this.claimRefundAttempt(
      payment.id,
      orderId,
      amountToRefund,
      refundCap,
      isGroupPayment,
      idempotencyKey,
      payment.provider,
      paytrOid,
    );
    if (refundAttempt.action === "done") {
      return {
        success: true,
        paymentId: payment.id,
        refundAmount: amountToRefund,
        providerRefundId: refundAttempt.attempt.providerRefundId ?? undefined,
        idempotent: true,
      };
    }

    // Çift-ödeme koruması (K1). Bunu PayTR/Sürat'a dokunmadan ÖNCE yap.
    // 1) Henüz icra edilmemiş payout'ları (pending/retry_pending) atomik olarak
    //    geçersiz kıl ki payout cron'u alıcıya iade yaparken satıcıya da ödeme yapmasın.
    //    Finding 3: void ettiğimiz payout ID'lerini SAKLA — catch'teki geri-alma yalnız
    //    BU çağrının void'lediklerini restore etsin (önceki bir başarılı iadenin void'lediği
    //    bayat/tam-net payout'u diriltip satıcıyı çift ödemeyelim). ID + status guard atomikliği
    //    korur (select↔void arası statü değişen satır void'lenmez, catch'te de restore edilmez).
    const payoutsToVoid = await this.prisma.payoutTransfer.findMany({
      where: {
        paymentHold: { orderId },
        status: { in: ["pending", "retry_pending"] },
      },
      select: { id: true },
    });
    const voidedPayoutIds = payoutsToVoid.map((p) => p.id);
    if (voidedPayoutIds.length > 0) {
      await this.prisma.payoutTransfer.updateMany({
        where: {
          id: { in: voidedPayoutIds },
          status: { in: ["pending", "retry_pending"] },
        },
        data: { status: "failed", failureReason: "order_refunded" },
      });
    }
    // 2) Payout zaten icra edildi (completed) veya icra ediliyor (processing) ise para
    //    satıcıya gitti/gidiyor → iade çift-ödeme olur. Engelle (manuel clawback gerekir).
    const inFlightPayout = await this.prisma.payoutTransfer.findFirst({
      where: {
        paymentHold: { orderId },
        status: { in: ["completed", "processing"] },
      },
    });
    if (inFlightPayout) {
      await this.prisma.refundAttempt.updateMany({
        where: {
          id: refundAttempt.attempt.id,
          status: RefundAttemptStatus.prepared,
        },
        data: {
          status: RefundAttemptStatus.manual_review,
          failureReason: `payout_${inFlightPayout.status}`,
        },
      });
      // Para satıcıya gitti/gidiyor → otomatik iade çift-ödeme olur. Borç/negatif-bakiye
      // (clawback) defteri henüz YOK (ertelendi) → iade OTOMATİK yapılamaz; satıcıdan
      // manuel geri-tahsilat gerekir. Ops aksiyon alabilsin diye AÇIKÇA logla (F2.2).
      this.logger.error(
        `CLAWBACK_REQUIRED: order ${orderId} iadesi engellendi — payout ` +
          `${inFlightPayout.id} zaten '${inFlightPayout.status}' (net ` +
          `${Number(inFlightPayout.netAmount)}, satıcı ${inFlightPayout.sellerId}). ` +
          `Satıcıdan manuel geri-tahsilat gerekiyor.`,
      );
      throw new BadRequestException(
        i18nMessage("server.payment.transferAlreadyStarted"),
      );
    }

    let paytrRefunded = false;
    let providerOutcomeUncertain = false;
    try {
      let refundResult: any;
      if (refundAttempt.action === "finalize") {
        refundResult = (refundAttempt.attempt.providerResponse as Record<
          string,
          unknown
        >) || {
          status: "success",
          recovered: true,
        };
      } else {
        await this.startRefundSubmission(refundAttempt.attempt.id);
        if (isZeroCashSettlement) {
          refundResult = {
            status: "success",
            return_amount: 0,
            zeroCashSettlement: true,
          };
        } else {
          const bypassEnabled =
            process.env.NODE_ENV !== "production" &&
            this.configService.get("PAYMENT_BYPASS") === "true";
          if (bypassEnabled) {
            this.logger.warn(
              `PAYMENT_BYPASS: PayTR refund atlandı payment=${payment.id} amount=${amountToRefund}`,
            );
            refundResult = {
              status: "success",
              err_msg: null,
              return_amount: amountToRefund,
              bypass: true,
            };
          } else {
            try {
              refundResult = await this.paymentProviders
                .resolve(payment.provider)
                // reference_no = attempt id: PayTR durum-sorgu yanıtında geri
                // döner, mutabakatta iade ↔ attempt eşlemesini mümkün kılar.
                .createRefund(
                  paytrOid,
                  amountToRefund,
                  refundAttempt.attempt.id,
                );
            } catch (err) {
              const reason = (err as Error).message || "refund request failed";
              if (err instanceof ProviderRefundRejectedException) {
                await this.prisma.refundAttempt.updateMany({
                  where: {
                    id: refundAttempt.attempt.id,
                    status: RefundAttemptStatus.submitting,
                  },
                  data: {
                    status: RefundAttemptStatus.failed,
                    failureReason: reason,
                  },
                });
                if (
                  /odeme henuz siteye bildirilmemis|henuz siteye bildirilmemi/i.test(
                    reason,
                  )
                ) {
                  throw new BadRequestException(
                    i18nMessage("server.payment.paymentNotYetSynced"),
                  );
                }
                throw err;
              }

              providerOutcomeUncertain = true;
              await this.prisma.refundAttempt
                .updateMany({
                  where: {
                    id: refundAttempt.attempt.id,
                    status: RefundAttemptStatus.submitting,
                  },
                  data: {
                    status: RefundAttemptStatus.manual_review,
                    failureReason: reason,
                  },
                })
                .catch(() => undefined);
              throw err instanceof ProviderRefundOutcomeUnknownException
                ? err
                : new RefundPendingReconciliationException(reason);
            }
          }
        }

        // Provider success is persisted before any order/hold/ledger mutation.
        // A crash after this point is safely recoverable without calling PayTR again.
        paytrRefunded = true;
        const providerRefundId =
          refundResult?.paymentId || refundResult?.merchant_oid || null;
        const persisted = await this.prisma.refundAttempt.updateMany({
          where: {
            id: refundAttempt.attempt.id,
            status: RefundAttemptStatus.submitting,
          },
          data: {
            status: RefundAttemptStatus.succeeded,
            providerRefundId,
            providerResponse: refundResult as Prisma.InputJsonValue,
            providerSucceededAt: new Date(),
          },
        });
        if (persisted.count !== 1) {
          providerOutcomeUncertain = true;
          throw new RefundPendingReconciliationException(
            i18nMessage("server.payment.refundInitiationFailed"),
          );
        }
        if (!isZeroCashSettlement) {
          await this.providerEvents.record({
            eventType: "refund",
            merchantOid: paytrOid,
            paymentId: payment.id,
            status: refundResult?.status ?? "success",
            amount: amountToRefund,
            totalAmount: amountToRefund,
            raw: {
              ...(refundResult as Record<string, unknown>),
              refundAttemptId: refundAttempt.attempt.id,
            },
          });
        }
      }

      paytrRefunded = true;

      // Update payment status after successful refund
      let invoiceAdjustment: InvoiceRefundReversePayload | null = null;
      const refundCommitResult = await this.prisma
        .$transaction(async (tx) => {
          const oldStatus = payment.status;
          // O7: Grup iadesinde refundedOrders read-modify-write'ı SERİLEŞTİR. Eşzamanlı
          // kardeş iadeler aynı eski snapshot'ı okuyup birbirini EZMESİN diye payment
          // satırını kilitle ve metadata'yı TX İÇİNDE taze oku (lost-update guard).
          await tx.$queryRaw`SELECT id FROM payments WHERE id = ${payment.id} FOR UPDATE`;
          await tx.$queryRaw`SELECT id FROM refund_attempts WHERE id = ${refundAttempt.attempt.id} FOR UPDATE`;
          const freshAttempt = await tx.refundAttempt.findUnique({
            where: { id: refundAttempt.attempt.id },
          });
          if (freshAttempt?.status === RefundAttemptStatus.finalized) {
            return null;
          }
          if (freshAttempt?.status !== RefundAttemptStatus.succeeded) {
            throw new RefundPendingReconciliationException(
              i18nMessage("server.payment.refundInitiationFailed"),
            );
          }
          const freshPayment = await tx.payment.findUnique({
            where: { id: payment.id },
            select: { metadata: true },
          });
          const existingMetadata = (freshPayment?.metadata as any) || {};
          const auditHistory = existingMetadata.auditHistory || [];
          const currentRefundedOrders: Record<string, number> =
            (existingMetadata.refundedOrders as Record<string, number>) || {};

          // Kısmi iade birikimi: sipariş başına iade TOPLANIR. Grup zaten order
          // başına biriktiriyordu; MONEY-H4: tekil ödemede de biriktir — aksi halde
          // tek bir kısmi iade `fullyRefunded=!isGroupPayment` yüzünden payment'ı
          // tümden `refunded` yapıp sonraki kısmi iadeleri (top query `completed`
          // arar) İMKÂNSIZLAŞTIRIYORDU. Aynı orderId'ye art arda kısmi iadeler
          // ÜST ÜSTE yazılmayıp toplanır (grup'ta order-başına çift-iade zaten engelli).
          const priorForOrder = Number(currentRefundedOrders[orderId] || 0);
          const refundedOrders = {
            ...currentRefundedOrders,
            [orderId]: priorForOrder + amountToRefund,
          };
          const totalRefunded = Object.values(refundedOrders).reduce(
            (sum, v) => sum + Number(v || 0),
            0,
          );
          // Payment yalnız KÜMÜLATİF toplam işlem tutarına ulaşınca `refunded` olur.
          const fullyRefunded =
            totalRefunded >= Number(payment.amount) - MONEY_EPSILON;
          // Bu SİPARİŞİN kümülatif iadesi tamamlandı mı → order cancel + stok geri-yükle
          // + e-Arşiv reverse tek buradan karar verir (tekilde çoklu kısmi iade toplanır,
          // grupta order başına tek iade). Grup eşiği siparişin tutarı, tekil eşiği
          // payment tutarı (= o siparişin tutarı).
          const orderRefundThreshold = isGroupPayment
            ? Number(refundTargetOrder!.totalAmount)
            : Number(payment.amount);
          const isOrderFullyRefunded =
            Number(refundedOrders[orderId] || 0) >=
            orderRefundThreshold - MONEY_EPSILON;

          await tx.payment.update({
            where: { id: payment.id },
            data: {
              status: fullyRefunded ? PaymentStatus.refunded : payment.status,
              metadata: {
                ...existingMetadata,
                refundAmount: totalRefunded,
                refundedAt: new Date().toISOString(),
                refundResult,
                // MONEY-H4: tekilde de persist et — kümülatif iade takibi ve tavan
                // kontrolü buna dayanır (yoksa art arda kısmi iadeler biriktirilemez).
                refundedOrders,
                auditHistory: auditHistory.concat({
                  action: "payment.refunded",
                  timestamp: new Date().toISOString(),
                  oldStatus,
                  newStatus: fullyRefunded ? PaymentStatus.refunded : oldStatus,
                  refundAmount: amountToRefund,
                  orderId,
                  partial: !isOrderFullyRefunded,
                }),
              },
            },
          });

          // Hold'u iptal et. held VEYA released olabilir: releaseHoldsDue cron'u hold'u
          // released yapmış ama payout henüz icra edilmemiş olabilir (K1). Her iki durumda
          // da hold iptal edilmeli ki satıcıya ödeme yapılmasın.
          const activeHold = await tx.paymentHold.findFirst({
            where: {
              orderId,
              status: {
                in: [PaymentHoldStatus.held, PaymentHoldStatus.released],
              },
            },
          });
          if (activeHold) {
            // Savunma amaçlı TOCTOU kontrolü: erken guard zaten completed/processing'i
            // engelledi ve pending/retry_pending'i void etti, ama tx içinde tekrar bak.
            const activePayout = await tx.payoutTransfer.findFirst({
              where: {
                paymentHoldId: activeHold.id,
                status: { in: ["completed", "processing"] },
              },
            });
            if (activePayout) {
              throw new BadRequestException(
                i18nMessage("server.payment.transferAlreadyStarted"),
              );
            }
            // Hold tüketimi TUTAR oranına göre (MONEY-H3). Adet-bazlı iade akışları
            // amount = total*adet/siparişAdedi gönderdiğinden bu oran adet oranıyla
            // BİREBİR örtüşür; tutar-bazlı admin/jest iadesinde ise yalnız iade edilen
            // TUTAR kadarı tüketilir. Eskiden refundQuantity yoksa portion=1 olup TÜM
            // hold tüketiliyor, 1000 TL siparişte 50 TL jest satıcı payout'unu 0'a
            // düşürüyordu. Ledger portion ile AYNI formül (tek otorite). Tam iadede hold
            // cancelled; kısmi iadede held/released kalır, payout'ta netAmount =
            // amount - refundedAmount ödenir. orderRefundThreshold = siparişin tutarı
            // (grup'ta order.totalAmount, tekilde payment.amount) — tx başında hesaplandı.
            const sellerAmount = Number(activeHold.amount);
            const portion = Math.min(
              Math.max(
                opts?.settlement?.holdPortion ??
                  refundPortion(amountToRefund, orderRefundThreshold),
                0,
              ),
              1,
            );
            let refundedSeller = Math.round(sellerAmount * portion * 100) / 100;
            // Satıcıya bırakılacak tutar (kargo payı tazmini): tüketimi YALNIZ aşağı
            // çeker. Oran zaten daha azını tüketiyorsa dokunulmaz; bırakılacak tutar
            // hold'u aşarsa hiç tüketim olmaz.
            const retained = opts?.settlement?.holdRetainedAmount;
            if (retained != null && retained > 0) {
              const consumable =
                Math.round(Math.max(0, sellerAmount - retained) * 100) / 100;
              refundedSeller = Math.min(refundedSeller, consumable);
            }
            const newRefunded =
              Number(activeHold.refundedAmount ?? 0) + refundedSeller;
            if (newRefunded >= sellerAmount - 0.01) {
              await tx.paymentHold.update({
                where: { id: activeHold.id },
                data: {
                  status: PaymentHoldStatus.cancelled,
                  refundedAmount: sellerAmount,
                  frozenByRefundId: null,
                },
              });
            } else {
              await tx.paymentHold.update({
                where: { id: activeHold.id },
                data: { refundedAmount: newRefunded, frozenByRefundId: null },
              });
            }
          }

          // #88: Ledger'ı iade oranınca PRO-RATE et (kısmi iadede de). Original alanlar
          // korunur; refunded* kümülatif artar → net komisyon = original - refunded
          // (elogo net faturalar). Kümülatif tam iadeye ulaşınca status=refunded olur ve
          // e-Arşiv reverse tetiklenir (eski davranış: yalnız tam iadede reverse — korunur).
          // ledger threshold = siparişin tutarı (orderRefundThreshold, tx başında).
          const ledgerPortion = refundPortion(
            amountToRefund,
            orderRefundThreshold,
          );
          if (opts?.settlement) {
            await this.commissionLedger.applyRefundAmounts(
              orderId,
              {
                sellerFeeAmount: opts.settlement.sellerFeeRefundAmount ?? 0,
                buyerFeeAmount: opts.settlement.buyerFeeRefundAmount ?? 0,
                closeOrder: opts.settlement.closeOrder ?? false,
              },
              tx,
            );
          } else {
            await this.commissionLedger.applyRefund(orderId, ledgerPortion, tx);
          }

          // Faz 6.2 (ledger): `refund_issued` oransal ters kayıt. orderRefundThreshold =
          // sipariş tutarı (T); komisyon/stopaj sipariş satırından okunur; LedgerService
          // oranı ve yuvarlamayı yönetir. `refundAttemptId` idempotency anahtarını besler
          // → aynı deneme yeniden işlenirse ikinci ters kayıt DB'de düşer.
          //
          // FAIL-LOUD (best-effort DEĞİL): bu yazım iade TX'İNİN İÇİNDE. Hata yutulursa
          // para geri dönmüş ama defter ters kaydı eksik kalıyordu — sessiz muhasebe
          // açığı. Fırlatmak tüm iadeyi geri alır: ya ikisi ya hiçbiri. (Post-commit
          // yollarda — capture, payout tamamlama — best-effort kalıbı KORUNUR: orada
          // para zaten commit'li olduğundan fırlatmanın geri alacağı bir şey yoktur.)
          const ledgerOrder = await tx.order.findUnique({
            where: { id: orderId },
            select: {
              sellerId: true,
              buyerId: true,
              commissionAmount: true,
              withholdingTaxAmount: true,
            },
          });
          if (ledgerOrder) {
            await this.ledger?.recordRefund(tx, {
              orderId,
              paymentId: payment.id,
              refundAttemptId: freshAttempt.id,
              sellerId: ledgerOrder.sellerId,
              buyerId: ledgerOrder.buyerId,
              orderTotal: orderRefundThreshold,
              commission: Number(ledgerOrder.commissionAmount ?? 0),
              withholdingTax: Number(ledgerOrder.withholdingTaxAmount ?? 0),
              refundAmount: amountToRefund,
            });
          }

          // Her başarılı refund attempt kendi eLogo düzeltme olayını üretir. Kısmi
          // iadede daha önce kesilmiş faturaya oransal IADE belgesi; tam iadede
          // mümkünse iptal veya kalan tutar için IADE uygulanır.
          invoiceAdjustment = {
            orderId,
            refundAttemptId: freshAttempt.id,
            refundRatio: ledgerPortion,
            fullyRefunded: isOrderFullyRefunded,
            sellerFeeRefundAmount: opts?.settlement?.sellerFeeRefundAmount,
            buyerFeeRefundAmount: opts?.settlement?.buyerFeeRefundAmount,
          };

          // Update order status + restore stock on full refund.
          // Idempotent: skip stock restore if order is already cancelled (e.g.
          // handleExpiredPreparingOrders already restocked before calling us).
          {
            const orderRow = await tx.order.findUnique({
              where: { id: orderId },
              select: {
                status: true,
                productId: true,
                sellerId: true,
                quantity: true,
                stockRestoredAt: true,
              },
            });
            const sellerAdjustments = (
              opts?.settlement?.sellerAdjustments ?? []
            ).filter((adjustment) => adjustment.amount > 0);
            if (orderRow?.sellerId) {
              for (const adjustment of sellerAdjustments) {
                await tx.sellerAccountAdjustment.upsert({
                  where: { sourceKey: adjustment.sourceKey },
                  create: {
                    sellerId: orderRow.sellerId,
                    orderId,
                    refundRequestId: adjustment.refundRequestId ?? null,
                    sourceKey: adjustment.sourceKey,
                    type: adjustment.type,
                    amount: adjustment.amount,
                    remainingAmount: adjustment.amount,
                    metadata: {
                      refundAttemptId: freshAttempt.id,
                    },
                  },
                  update: {},
                });
              }
            }
            const alreadyCancelled = orderRow?.status === OrderStatus.cancelled;
            // MONEY-H4: sipariş cancel + stok geri-yükleme siparişin KÜMÜLATİF iadesine
            // göre (isOrderFullyRefunded, tx başında hesaplandı). Tek bir kısmi iade
            // artık "tam iade" sanılmaz; art arda kısmi iadeler tamı bulunca kapanır.
            const isFullRefund =
              isOrderFullyRefunded || Boolean(opts?.settlement?.closeOrder);
            // Stok: adet-bazlı iadede o kadar adet; TAM iadede tüm adet; tutar-bazlı
            // KISMİ iadede (admin jest/telafi) stok geri YÜKLENMEZ — alıcı malı elinde
            // tutar. Aksi halde 50 TL jest 1000 TL siparişin TÜM stoğunu geri yükler +
            // her kısmi iadede tekrarlardı (MONEY-H3 ile aynı kök).
            const restoreQty =
              opts?.refundQuantity ??
              (isFullRefund ? (orderRow?.quantity ?? 1) : 0);

            // Tam iade → sipariş cancelled. Kısmi adet iadesinde sipariş açık kalır
            // (kalan adetler hâlâ alıcıda); yalnız stok ve para kısmen geri döner.
            if (isFullRefund) {
              await tx.order.update({
                where: { id: orderId },
                data: { status: OrderStatus.cancelled },
              });
            }

            // Stok geri-yükleme YALNIZ BİR KEZ: order.cancel() ödenmiş iptalde stoğu zaten
            // geri yükleyip stockRestoredAt işaretlemiş olabilir → burada tekrar yükleme
            // (çift-sayım engeli, tek yazıcı). Kısmi adet iadeleri stockRestoredAt İŞARETLEMEZ:
            // sipariş açık kalır ve birden çok kısmi iade mümkündür.
            if (
              !alreadyCancelled &&
              !orderRow?.stockRestoredAt &&
              orderRow?.productId &&
              restoreQty > 0
            ) {
              const product = await tx.product.findUnique({
                where: { id: orderRow.productId },
                select: { quantity: true },
              });
              if (
                product?.quantity !== null &&
                product?.quantity !== undefined
              ) {
                const newQty = product.quantity + restoreQty;
                await tx.product.update({
                  where: { id: orderRow.productId },
                  data: {
                    quantity: { increment: restoreQty },
                    status: getProductStatusFromQuantity(newQty),
                  },
                });
                this.logger.log(
                  `Restored ${restoreQty} stock for product ${orderRow.productId} after refund of order ${orderId}`,
                );
              }
              // Tam iadede işaretle → sonraki cron turlarında çift-restore engeli.
              // Kısmi iadede işaretleme (çoklu kısmi iade desteklenir).
              if (isFullRefund) {
                await tx.order.update({
                  where: { id: orderId },
                  data: { stockRestoredAt: new Date() },
                });
              }
            }
          }

          this.logger.log(
            `Refund processed for payment ${payment.id}: ${amountToRefund} TRY`,
          );

          const refundResponse = {
            success: true,
            paymentId: payment.id,
            refundAmount: amountToRefund,
            providerRefundId:
              refundResult.paymentId ||
              refundResult.merchant_oid ||
              freshAttempt.providerRefundId ||
              undefined,
          };

          // 11.2d: iade sonucu bildirimleri (payment.refunded / order_cancelled) artık
          // finalize tx'inde DEĞİL, POST-COMMIT çağrılır (notifyRefundOutcome, aşağıdaki
          // .then) → FOR UPDATE kilidi kısalır + bir bildirim hatası para-tx'ini abort etmez.

          // Faz 5 (outbox): iade commit'iyle ATOMİK olarak "Sürat iptali" satırını yaz.
          // Böylece post-commit anlık iptal (aşağıda) çökme/hata ile kaçsa bile drainer
          // güvenilir şekilde iptal eder. Handler idempotent → çift iptal zararsız.
          await this.outbox?.enqueue(tx, {
            type: OUTBOX_SHIPMENT_CANCEL,
            payload: {
              orderId,
              orderNumber:
                payment.order?.orderNumber ??
                refundTargetOrder?.orderNumber ??
                orderId,
            },
            dedupeKey: `${OUTBOX_SHIPMENT_CANCEL}:${orderId}`,
          });

          // Başarılı iadenin eLogo düzeltmesini de iade commit'iyle
          // Para/ledger mutasyonuyla ATOMİK sıraya al. Her refund attempt ayrı
          // dedupe anahtarı taşır; art arda kısmi iadeler birbirini ezmez.
          if (invoiceAdjustment) {
            await this.outbox?.enqueue(tx, {
              type: OUTBOX_INVOICE_REFUND_REVERSE,
              payload: invoiceAdjustment as unknown as Prisma.InputJsonValue,
              dedupeKey: `${OUTBOX_INVOICE_REFUND_REVERSE}:${freshAttempt.id}`,
            });
          }

          await tx.refundAttempt.update({
            where: { id: freshAttempt.id },
            data: {
              status: RefundAttemptStatus.finalized,
              finalizedAt: new Date(),
            },
          });

          return refundResponse;
        })
        .then(async (response) => {
          // Finding 2: tx idempotent no-op döndüyse (eşzamanlı kurtarma zaten finalize
          // etti) Sürat iptalini TEKRAR yapma — onu kazanan çağrı zaten yaptı.
          if (!response) return response;
          // 11.2d: iade bildirimleri POST-COMMIT (tx dışında, best-effort — para geri döndü).
          await this.notifyRefundOutcome(
            orderId,
            amountToRefund,
            payment,
            response.providerRefundId,
            opts?.skipRefundEvent,
          );
          // After PayTR refund + DB updates succeed, cancel the Sürat shipment.
          // Best-effort: a failure here doesn't undo the refund (money is already back).
          try {
            await this.paymentCommon.cancelSuratShipmentIfExists(
              orderId,
              payment.order?.orderNumber ??
                refundTargetOrder?.orderNumber ??
                orderId,
            );
          } catch (err) {
            this.logger.error(
              `Sürat cancel failed after successful refund for order ${orderId}: ${(err as Error).message}. Manual cleanup may be needed.`,
            );
          }
          return response;
        });

      // Post-commit hızlı yol. Aynı olay outbox'ta kalıcıdır; servis attempt-bazında
      // idempotent olduğu için iki tetik güvenlidir.
      if (invoiceAdjustment) {
        void this.elogoInvoicing
          .handleOrderRefund(orderId, invoiceAdjustment)
          .catch((e) =>
            this.logger.warn(
              `eLogo iade tetik hatası ${orderId}: ${e?.message}`,
            ),
          );
      }
      return refundCommitResult;
    } catch (error: any) {
      this.logger.error(
        `Refund error for payment ${payment.id}: ${error.message}`,
      );
      // MONEY-M3: PayTR iadeyi YAPMADAN patladıysak, PayTR'den önce void ettiğimiz
      // payout'ları GERİ AL (order_refunded → pending) ki satıcı ödenebilsin. PayTR
      // başardıysa (paytrRefunded=true) void kalır — para iade edildi, satıcı ödenmemeli.
      // Finding 3: yalnız BU çağrının void'lediği ID'leri restore et — önceki bir başarılı
      // iadenin void'lediği bayat payout'u diriltip satıcıyı çift ödemeyelim.
      if (
        !paytrRefunded &&
        !providerOutcomeUncertain &&
        voidedPayoutIds.length > 0
      ) {
        await this.prisma.payoutTransfer
          .updateMany({
            where: {
              id: { in: voidedPayoutIds },
              status: "failed",
              failureReason: "order_refunded",
            },
            data: { status: "pending", failureReason: null },
          })
          .catch(() => undefined);
      }
      if (!paytrRefunded && !providerOutcomeUncertain) {
        await this.prisma.payoutTransfer
          .updateMany({
            where: {
              paymentHold: { orderId },
              status: "failed",
              failureReason: "refund_pending",
            },
            data: { status: "pending", failureReason: null },
          })
          .catch(() => undefined);
      }
      if (paytrRefunded || providerOutcomeUncertain) {
        throw error instanceof RefundPendingReconciliationException
          ? error
          : new RefundPendingReconciliationException(error.message);
      }
      throw error;
    }
  }

  /**
   * Takas nakit ödemesi PayTR ile tamamlanmışken iptal: PayTR iade API + payment / trade_cash_payment güncelleme.
   * Tamamlanmış PayTR trade ödemesi yoksa no-op (refunded: false).
   */
  async refundTradeCashPaymentIfCompleted(tradeId: string): Promise<{
    refunded: boolean;
    paymentId?: string;
    skippedReason?: string;
  }> {
    const payment = await this.prisma.payment.findFirst({
      where: {
        tradeCashPayment: {
          tradeId,
          // Escrow: sadece bırakılmamış ve daha önce iade edilmemiş olanlar
          releasedAt: null,
          refundedAt: null,
        },
        status: PaymentStatus.completed,
        provider: PaymentProvider.paytr,
      },
      include: { tradeCashPayment: true },
    });

    if (!payment) {
      return { refunded: false, skippedReason: "no_completed_paytr_payment" };
    }

    // Defensive guard: eğer ilişkili tradeCashPayment bırakılmış veya iade edilmişse atla
    if (
      payment.tradeCashPayment?.releasedAt ||
      payment.tradeCashPayment?.refundedAt
    ) {
      return {
        refunded: false,
        skippedReason: payment.tradeCashPayment.releasedAt
          ? "already_released"
          : "already_refunded",
      };
    }

    // FLOW-M5: iade GERÇEKTEN çekilen merchant_oid ile yapılmalı = tamamlanan
    // ödemenin providerConversationId'si (capture anında çekilen oid'e senkronlanır).
    // Eski `tradeId.replace(/-/g,"")` fallback'i UUID'yi oid sanıyordu (gerçek oid
    // `TRADE{no}T{...}`) → yanlış/eşleşmeyen oid'le PayTR çağrısı. Kaldırıldı; gerçek
    // yolda (bypass değil) oid yoksa reddedilir (aşağıda).
    const oid = payment.providerConversationId?.trim() ?? "";
    // Always refund the full charged amount (product + commission). PayTR was
    // charged the totalAmount at capture time; partial commission retention
    // would leave the payer short when the admin reject is no-fault.
    const amount = Number(
      payment.tradeCashPayment?.totalAmount ?? payment.amount,
    );

    const existingMeta = (payment.metadata as Record<string, unknown>) || {};
    if (!oid) {
      this.logger.error(
        `refundTradeCashPaymentIfCompleted: providerConversationId yok — iade oid'i ` +
          `belirlenemiyor (tradeId=${tradeId}, paymentId=${payment.id}). Manuel inceleme gerekir.`,
      );
      throw new BadRequestException(
        i18nMessage("server.payment.paytrRefundFailed"),
      );
    }
    const refundAttempt = await this.claimTradeRefundAttempt(
      payment.id,
      tradeId,
      amount,
      payment.provider,
      oid,
    );
    if (refundAttempt.action === "done") {
      return { refunded: true, paymentId: payment.id };
    }

    await this.prisma.payoutTransfer.updateMany({
      where: {
        tradeCashPaymentId: payment.tradeCashPaymentId,
        status: { in: ["pending", "retry_pending"] },
      },
      data: {
        status: "failed",
        failureReason: "trade_refund_pending",
      },
    });
    const existingPayout = await this.prisma.payoutTransfer.findFirst({
      where: {
        tradeCashPaymentId: payment.tradeCashPaymentId,
        status: { in: ["completed", "processing"] },
      },
    });
    if (existingPayout) {
      await this.prisma.refundAttempt.updateMany({
        where: {
          id: refundAttempt.attempt.id,
          status: RefundAttemptStatus.prepared,
        },
        data: {
          status: RefundAttemptStatus.manual_review,
          failureReason: `payout_${existingPayout.status}`,
        },
      });
      return {
        refunded: false,
        skippedReason: "payout_already_in_progress",
      };
    }

    const bypassEnabled =
      process.env.NODE_ENV !== "production" &&
      this.configService.get("PAYMENT_BYPASS") === "true";
    let refundResult =
      (refundAttempt.attempt.providerResponse as Record<string, unknown>) ||
      null;
    if (refundAttempt.action === "submit") {
      await this.startRefundSubmission(refundAttempt.attempt.id);
      if (bypassEnabled) {
        this.logger.warn(
          `PAYMENT_BYPASS: PayTR trade refund atlandı tradeId=${tradeId} amount=${amount}`,
        );
        refundResult = { status: "success", bypass: true };
      } else {
        try {
          refundResult = (await this.paymentProviders
            .resolve(payment.provider)
            // reference_no = attempt id (durum-sorgu mutabakatı için).
            .createRefund(
              oid,
              amount,
              refundAttempt.attempt.id,
            )) as unknown as Record<string, unknown>;
        } catch (e: any) {
          const reason = e?.message || "trade refund request failed";
          if (e instanceof ProviderRefundRejectedException) {
            await this.prisma.refundAttempt.updateMany({
              where: {
                id: refundAttempt.attempt.id,
                status: RefundAttemptStatus.submitting,
              },
              data: {
                status: RefundAttemptStatus.failed,
                failureReason: reason,
              },
            });
            await this.prisma.payoutTransfer.updateMany({
              where: {
                tradeCashPaymentId: payment.tradeCashPaymentId,
                status: "failed",
                failureReason: {
                  in: ["refund_pending", "trade_refund_pending"],
                },
              },
              data: { status: "pending", failureReason: null },
            });
            if (
              /odeme henuz siteye bildirilmemis|henuz siteye bildirilmemi/i.test(
                reason,
              )
            ) {
              throw new BadRequestException(
                i18nMessage("server.payment.paymentNotYetSynced"),
              );
            }
            throw e;
          }
          await this.prisma.refundAttempt
            .updateMany({
              where: {
                id: refundAttempt.attempt.id,
                status: RefundAttemptStatus.submitting,
              },
              data: {
                status: RefundAttemptStatus.manual_review,
                failureReason: reason,
              },
            })
            .catch(() => undefined);
          throw new RefundPendingReconciliationException(reason);
        }
      }

      const providerRefundId =
        (refundResult?.paymentId as string | undefined) ||
        (refundResult?.merchant_oid as string | undefined) ||
        null;
      const persisted = await this.prisma.refundAttempt.updateMany({
        where: {
          id: refundAttempt.attempt.id,
          status: RefundAttemptStatus.submitting,
        },
        data: {
          status: RefundAttemptStatus.succeeded,
          providerRefundId,
          providerResponse: refundResult as Prisma.InputJsonValue,
          providerSucceededAt: new Date(),
        },
      });
      if (persisted.count !== 1) {
        throw new RefundPendingReconciliationException(
          i18nMessage("server.payment.refundInitiationFailed"),
        );
      }
      try {
        await this.providerEvents.record({
          eventType: "refund",
          merchantOid: oid,
          paymentId: payment.id,
          status: "success",
          amount,
          totalAmount: amount,
          raw: {
            ...refundResult,
            refundAttemptId: refundAttempt.attempt.id,
          },
        });
      } catch (e: any) {
        this.logger.error(
          `Trade refund provider event could not be recorded attempt=${refundAttempt.attempt.id}: ${e?.message}`,
        );
      }
    }

    // Provider success is durable. Finalize local state and the attempt together.
    let persisted = false;
    for (let attempt = 1; attempt <= 3 && !persisted; attempt++) {
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM refund_attempts WHERE id = ${refundAttempt.attempt.id} FOR UPDATE`;
          const currentAttempt = await tx.refundAttempt.findUnique({
            where: { id: refundAttempt.attempt.id },
          });
          if (currentAttempt?.status === RefundAttemptStatus.finalized) return;
          if (currentAttempt?.status !== RefundAttemptStatus.succeeded) {
            throw new RefundPendingReconciliationException(
              i18nMessage("server.payment.refundInitiationFailed"),
            );
          }
          await tx.payment.update({
            where: { id: payment.id },
            data: {
              status: PaymentStatus.refunded,
              metadata: {
                ...existingMeta,
                refundAmount: amount,
                refundedAt: new Date().toISOString(),
                tradeCashRefund: true,
              },
            },
          });
          if (payment.tradeCashPaymentId) {
            await tx.tradeCashPayment.update({
              where: { id: payment.tradeCashPaymentId },
              data: { status: PaymentStatus.refunded, refundedAt: new Date() },
            });
            // Faz 5.3 (outbox): eLogo takas-iade ters kaydını iade persist'iyle ATOMİK
            // sıraya al (post-commit anlık tetik hızlı-yol kalır; handler idempotent).
            await this.outbox?.enqueue(tx, {
              type: OUTBOX_INVOICE_TRADE_CASH_REFUND_REVERSE,
              payload: { tradeCashPaymentId: payment.tradeCashPaymentId },
              dedupeKey: `${OUTBOX_INVOICE_TRADE_CASH_REFUND_REVERSE}:${payment.tradeCashPaymentId}`,
            });
          }
          await tx.refundAttempt.update({
            where: { id: currentAttempt.id },
            data: {
              status: RefundAttemptStatus.finalized,
              finalizedAt: new Date(),
            },
          });
        });
        persisted = true;
      } catch (persistErr: any) {
        this.logger.error(
          `refundTradeCash persist denemesi ${attempt}/3 başarısız (tradeId=${tradeId}): ${persistErr?.message}`,
        );
      }
    }
    if (!persisted) {
      this.logger.error(
        `REFUND_MANUAL_REVIEW: trade-cash provider success could not be finalized ` +
          `(tradeId=${tradeId}, paymentId=${payment.id}, attempt=${refundAttempt.attempt.id}).`,
      );
      throw new RefundPendingReconciliationException(
        i18nMessage("server.payment.refundInitiationFailed"),
      );
    }

    this.logger.log(
      `Trade cash refunded via PayTR tradeId=${tradeId} paymentId=${payment.id}`,
    );

    // Takas komisyon e-Arşivini iptal et / iade faturası kes (post-commit, non-blocking).
    if (payment.tradeCashPaymentId) {
      void this.elogoInvoicing
        .handleTradeCashRefund(payment.tradeCashPaymentId)
        .catch((e) =>
          this.logger.warn(`eLogo takas iade tetik hatası: ${e?.message}`),
        );
    }
    return { refunded: true, paymentId: payment.id };
  }

  /**
   * MONEY-H2: Takas nakit iadesini FAILURE-TRACKING ile yapar. `cancelTrade` /
   * `resolveDispute` gibi kullanıcı/admin akışlarında iade PayTR'da patlarsa
   * `trade.refundFailureReason` marker'ı yazılır → admin `retryTradeRefund` ve
   * `retryFailedTradeRefunds` süpürme cron'u devreye girip parayı toparlar.
   * Başarıda marker temizlenir + `trade.refund-completed` yayınlanır.
   *
   * ASLA throw ETMEZ: takas bu noktada zaten iptal/çözüm ile terminal duruma
   * commit edilmiştir; iade hatası iptali geri almaz (`rejectWarehouseTrade` ile
   * aynı felsefe). Çağıran, kullanıcıya sahte bir 500 döndürmek yerine sonucu okur.
   */
  async refundTradeCashTracked(tradeId: string): Promise<{
    refunded: boolean;
    failed: boolean;
    skippedReason?: string;
    reason?: string;
  }> {
    try {
      const result = await this.refundTradeCashPaymentIfCompleted(tradeId);
      // Başarı (veya "iade edilecek tamamlanmış ödeme yok" no-op) → varsa eski
      // hata marker'ını temizle. Best-effort; iade zaten yapıldı.
      await this.prisma.trade
        .update({
          where: { id: tradeId },
          data: { refundFailureReason: null, refundFailureAt: null },
        })
        .catch(() => {});
      if (result.refunded) {
        try {
          const cashPayment = await this.prisma.tradeCashPayment.findFirst({
            where: { tradeId },
            select: { payerId: true },
          });
          await this.eventService.emitTradeRefundCompleted({
            tradeId,
            cashPayerId: cashPayment?.payerId ?? null,
          });
        } catch (emitErr) {
          this.logger.error(
            `Failed to emit trade.refund-completed for trade ${tradeId}: ${emitErr}`,
          );
        }
      }
      return {
        refunded: result.refunded,
        failed: false,
        skippedReason: result.skippedReason,
      };
    } catch (err: any) {
      const reason = err?.message ?? "Bilinmeyen hata (PayTR iade başarısız)";
      this.logger.error(
        `refundTradeCashTracked failed for trade ${tradeId}: ${reason}`,
      );
      // Marker'ı yaz ki admin retryTradeRefund + retryFailedTradeRefunds cron'u
      // bu takası bulup yeniden denesin (yoksa para alıcıda sessizce kalır).
      await this.prisma.trade
        .update({
          where: { id: tradeId },
          data: {
            refundFailureReason: reason.slice(0, 500),
            refundFailureAt: new Date(),
          },
        })
        .catch((persistErr: any) =>
          this.logger.error(
            `Failed to persist refund failure for trade ${tradeId}: ${persistErr?.message}`,
          ),
        );
      try {
        const cashPayment = await this.prisma.tradeCashPayment.findFirst({
          where: { tradeId },
          select: { payerId: true },
        });
        await this.eventService.emitTradeRefundFailed({
          tradeId,
          cashPayerId: cashPayment?.payerId ?? null,
          reason,
        });
      } catch (emitErr) {
        this.logger.error(
          `Failed to emit trade.refund-failed for trade ${tradeId}: ${emitErr}`,
        );
      }
      return { refunded: false, failed: true, reason };
    }
  }

  /**
   * Release held payment to seller
   * Called when order is completed
   */
  async releasePayment(orderId: string) {
    // H4: açık iade ile DONDURULMUŞ (frozenByRefundId dolu) bir hold ASLA serbest
    // bırakılamaz — aksi halde admin manuel release, açık iadeyle birlikte çift
    // kayba yol açar (satıcıya öde + alıcıya iade). releaseHoldsDue/releasePaymentIfHeld
    // ile aynı invaryant. Hem okuma hem güncelleme frozenByRefundId:null ile sınırlı.
    const now = new Date();
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        status: true,
        refundRequests: {
          where: { status: { in: OPEN_REFUND_STATUSES } },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (
      !order ||
      !PAYOUT_ELIGIBLE_ORDER_STATUSES.includes(order.status) ||
      order.refundRequests.length > 0
    ) {
      throw new BadRequestException(
        i18nMessage("server.payment.holdNotReleasable"),
      );
    }

    const hold = await this.prisma.paymentHold.findFirst({
      where: {
        orderId,
        status: PaymentHoldStatus.held,
        frozenByRefundId: null,
        releaseAt: { lte: now },
      },
    });

    if (!hold) {
      throw new NotFoundException(
        i18nMessage("server.payment.holdNotReleasable"),
      );
    }

    // Atomik son guard: held + frozenByRefundId:null WHERE içinde — eşzamanlı açılan
    // bir iade (freeze) yarışını kapatır (TOCTOU yok).
    const released = await this.prisma.paymentHold.updateMany({
      where: {
        id: hold.id,
        status: PaymentHoldStatus.held,
        frozenByRefundId: null,
        releaseAt: { lte: now },
      },
      data: {
        status: PaymentHoldStatus.released,
        releasedAt: now,
      },
    });

    if (released.count === 0) {
      throw new NotFoundException(
        i18nMessage("server.payment.holdNotReleasable"),
      );
    }

    // In production: transfer funds to seller
    this.logger.log(
      `Payment hold ${hold.id} released to seller ${hold.sellerId}`,
    );

    return { success: true, holdId: hold.id, amount: Number(hold.amount) };
  }

  /**
   * Release all payment holds whose releaseAt date has passed (for cron).
   * Also releases TradeCashPayment (safe-trade escrow) records whose
   * holdReleaseAt has passed.
   * Returns the number of order holds and trade cash payments released.
   */
  /**
   * Teslimde çağrılır: ürünün PaymentHold(ler)inin releaseAt'ini
   * deliveredAt + returnWindowDays + payoutGraceDays olarak ayarlar.
   * Tek otorite kaynağı: hold serbestliği SADECE bu tarihten sonra (ve açık iade
   * yokken) olur. Idempotent: held olmayan hold'a dokunmaz.
   */
  async scheduleHoldReleaseOnDelivery(
    orderId: string,
    deliveredAt: Date,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const db = tx ?? this.prisma;
    const releaseAt = new Date(deliveredAt.getTime());
    releaseAt.setDate(
      releaseAt.getDate() + this.returnWindowDays + this.payoutGraceDays,
    );
    await db.paymentHold.updateMany({
      where: { orderId, status: PaymentHoldStatus.held },
      data: { releaseAt },
    });
    this.logger.log(
      `Hold release scheduled for order ${orderId} at ${releaseAt.toISOString()} (teslim+${this.returnWindowDays}+${this.payoutGraceDays}g)`,
    );
  }

  /**
   * Tek kanonik TESLİM handler'ı. Bir sipariş teslim edildiğinde çağrılır — hangi
   * yoldan gelirse gelsin (generic webhook, worker, Sürat poll cron, admin). İki işi
   * ATOMIK bir mantıkta birleştirir:
   *   1) Order.status/deliveredAt/confirmationDeadline'ı FEATURE_48H'e göre ayarlar,
   *   2) escrow release'ini planlar (scheduleHoldReleaseOnDelivery) — satıcıya ödemenin
   *      TEK tetikleyicisi budur; atlanırsa PaymentHold.releaseAt null kalır ve satıcı
   *      hiç ödenmez.
   *
   * Idempotent + güvenli: yalnız HENÜZ teslim edilmemiş (deliveredAt null) ve terminal
   * olmayan (completed/cancelled/refund_requested/refunded değil) bir siparişte ilerler.
   * Böylece re-poll/replay deliveredAt'i TAŞIMAZ → releaseAt kaymaz; iptal/iade edilmiş
   * sipariş yanlışlıkla "delivered"a çekilmez. Eski poll'un status=delivered ama
   * deliveredAt=null bıraktığı takılı siparişler bir sonraki teslim çağrısında iyileşir.
   *
   * Bildirim ÇAĞIRANDA kalır (metod acted + use48h + confirmationDeadline + buyerId döner)
   * ki teslim I/O'su alıcı bildirim çağrısını beklemesin ve mevcut çağıran davranışı korunsun.
   */
  async handleOrderDelivered(
    orderId: string,
    deliveredAt: Date,
    tx?: Prisma.TransactionClient,
  ): Promise<{
    acted: boolean;
    use48h: boolean;
    confirmationDeadline: Date | null;
    buyerId: string | null;
  }> {
    const db = tx ?? this.prisma;
    const use48h =
      this.configService.get<string>("FEATURE_48H_CONFIRMATION_WINDOW") ===
      "true";
    const confirmationDeadline = use48h
      ? new Date(deliveredAt.getTime() + 48 * 60 * 60 * 1000)
      : null;
    const targetStatus = use48h
      ? OrderStatus.awaiting_buyer_confirmation
      : OrderStatus.delivered;

    const updated = await db.order.updateMany({
      where: {
        id: orderId,
        deliveredAt: null,
        status: {
          notIn: [
            OrderStatus.completed,
            OrderStatus.cancelled,
            OrderStatus.refund_requested,
            OrderStatus.refunded,
          ],
        },
      },
      data: {
        status: targetStatus,
        deliveredAt,
        confirmationDeadline,
        version: { increment: 1 },
      },
    });

    if (updated.count === 0) {
      // Zaten teslim işlenmiş / teslim-uygun değil → no-op (replay-safe).
      return {
        acted: false,
        use48h,
        confirmationDeadline: null,
        buyerId: null,
      };
    }

    // Escrow saatini teslimden başlat — para akışının TEK tetikleyicisi.
    await this.scheduleHoldReleaseOnDelivery(orderId, deliveredAt, tx);

    // Teslim gelir faturalarını AYNI tx'te dayanıklı olarak kuyruğa al. Eskiden
    // faturalama yalnız 2 dakikalık backfill cron'una bağlıydı; cron'un aday
    // penceresi doyduğunda veya cron gecikince e-Arşiv'in 7 günlük yasal süresi
    // kaçırılabiliyordu. Outbox at-least-once + issue* idempotent olduğu için
    // cron ile birlikte çalışması güvenli.
    if (this.outbox && tx) {
      await this.outbox.enqueue(tx, {
        type: OUTBOX_ORDER_REVENUE_INVOICE,
        payload: { orderId } satisfies OrderRevenueInvoicePayload,
        dedupeKey: `${OUTBOX_ORDER_REVENUE_INVOICE}:${orderId}`,
      });
    }

    const order = await db.order.findUnique({
      where: { id: orderId },
      select: { buyerId: true },
    });
    return {
      acted: true,
      use48h,
      confirmationDeadline,
      buyerId: order?.buyerId ?? null,
    };
  }

  async releaseHoldsDue(): Promise<{
    count: number;
    tradeCashReleased: number;
  }> {
    const now = new Date();

    // 1) Sipariş ödeme bekletmeleri (PaymentHold) — atomik: sadece held VE
    // dondurulmamış (frozenByRefundId null) olanları release et. releaseAt artık
    // teslim + return + grace olduğu için süre dolduğunda iade penceresi zaten
    // kapanmıştır; açık iade varsa frozen + status guard'ları release'i engeller.
    const dueHolds = await this.prisma.paymentHold.findMany({
      where: {
        status: PaymentHoldStatus.held,
        releaseAt: { lte: now },
        frozenByRefundId: null,
      },
    });

    // Y1: Escrow yalnızca ürün en az sevk edildiyse VE açık bir iade/itiraz yoksa
    // serbest bırakılmalı. releaseAt ödeme anında NULL'dır; yalnız teslimde
    // handleOrderDelivered/scheduleHoldReleaseOnDelivery ile teslim+return+grace olarak
    // set edilir. Bu yüzden aşağıdaki durum guard'ı ek bir güvenlik katmanıdır: teslim
    // edilmemiş ya da iadesi açık bir siparişte (releaseAt bir şekilde geçmişte olsa bile)
    // parayı satıcıya BIRAKMAYIZ (held bırakmak, yanlış ödemekten güvenlidir). preparing'de
    // takılan siparişler zaten handleExpiredPreparingOrders tarafından iptal+iade edilir.
    let holdCount = 0;
    for (const hold of dueHolds) {
      const order = await this.prisma.order.findUnique({
        where: { id: hold.orderId },
        select: {
          status: true,
          refundRequests: {
            where: { status: { in: OPEN_REFUND_STATUSES } },
            select: { id: true },
            take: 1,
          },
        },
      });
      if (
        !order ||
        !PAYOUT_ELIGIBLE_ORDER_STATUSES.includes(order.status) ||
        order.refundRequests.length > 0
      ) {
        // Henüz serbest bırakma — bir sonraki cron turunda tekrar denenir.
        continue;
      }
      // Atomik son guard: frozenByRefundId null kontrolü WHERE içinde — bu cron
      // turuyla eşzamanlı açılan bir iade (freeze) yarışını kapatır (TOCTOU yok).
      const updated = await this.prisma.paymentHold.updateMany({
        where: {
          id: hold.id,
          status: PaymentHoldStatus.held,
          frozenByRefundId: null,
        },
        data: { status: PaymentHoldStatus.released, releasedAt: now },
      });
      if (updated.count > 0) holdCount++;
    }
    if (holdCount > 0) {
      this.logger.log(
        `Released ${holdCount} payment hold(s) (releaseAt <= ${now.toISOString()})`,
      );
    }

    // 2) Safe-trade nakit ödemeleri: holdReleaseAt süresi geçmiş olanları bırak
    let tradeCashReleased = 0;
    const dueTradeCash = await this.prisma.tradeCashPayment.findMany({
      where: {
        status: PaymentStatus.completed,
        holdReleaseAt: { lte: now },
        releasedAt: null,
        refundedAt: null,
      },
    });

    for (const tcp of dueTradeCash) {
      // Takas nakit guard: takas yalnızca COMPLETED ise payout serbest bırakılır.
      // returning/disputed/cancelled/admin_reviewing'de SERBEST BIRAKMA — aksi halde
      // iade/iptal sürecindeki takasta satıcıya da para gider (çift-ödeme açığı).
      const trade = await this.prisma.trade.findUnique({
        where: { id: tcp.tradeId },
        select: { status: true },
      });
      if (!trade || trade.status !== TradeStatus.completed) {
        continue;
      }
      // Atomik guard: sadece hâlâ released/refunded olmamış olanları güncelle
      const updated = await this.prisma.tradeCashPayment.updateMany({
        where: { id: tcp.id, releasedAt: null, refundedAt: null },
        data: { releasedAt: now },
      });
      if (updated.count > 0) tradeCashReleased++;
    }

    if (tradeCashReleased > 0) {
      this.logger.log(
        `Released ${tradeCashReleased} trade cash payment(s) (holdReleaseAt <= ${now.toISOString()})`,
      );
    }

    return { count: holdCount, tradeCashReleased };
  }

  /**
   * Try to release payment hold for an order (e.g. on delivery). Idempotent: no-op if already released or not found.
   */
  async releasePaymentIfHeld(orderId: string): Promise<boolean> {
    // frozenByRefundId dolu (açık iade) hold ASLA serbest bırakılamaz — defansif:
    // bu metod artık teslim akışlarında çağrılmıyor (teslim→scheduleHoldReleaseOnDelivery)
    // ama başka çağıran olursa frozen invaryantı bozulmasın.
    const now = new Date();
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        status: true,
        refundRequests: {
          where: { status: { in: OPEN_REFUND_STATUSES } },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (
      !order ||
      !PAYOUT_ELIGIBLE_ORDER_STATUSES.includes(order.status) ||
      order.refundRequests.length > 0
    ) {
      return false;
    }
    const updated = await this.prisma.paymentHold.updateMany({
      where: {
        orderId,
        status: PaymentHoldStatus.held,
        frozenByRefundId: null,
        releaseAt: { lte: now },
      },
      data: { status: PaymentHoldStatus.released, releasedAt: now },
    });
    if (updated.count === 0) return false;
    this.logger.log(`Payment hold released for order ${orderId}`);
    return true;
  }
}
