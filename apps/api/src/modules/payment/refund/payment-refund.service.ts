import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  Optional,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../../prisma";
import {
  Prisma,
  PaymentStatus,
  PaymentHoldStatus,
  OfferStatus,
  OrderStatus,
  RefundAttemptStatus,
  SellerAdjustmentType,
} from "@prisma/client";
import { OFFER_CANCEL_REASON } from "../../trade/helpers/trade-cancel-reasons";
import { getProductStatusFromQuantity } from "../../product/helpers/product-status.helper";
import { PaymentProviderRegistry } from "../../payment-providers/payment-provider.registry";
import { PaymentProvider } from "../dto";
import { EventService } from "../../events";
import { NotificationService } from "../../notification/notification.service";
import { DiscountService } from "../../discount/discount.service";
import { NotificationType } from "../../notification/dto/notification.dto";
import { CommissionLedgerService } from "../../commission/commission-ledger.service";
import { ElogoInvoicingService } from "../../elogo";
import { PaymentCommonService } from "../payment-common.service";
import { PaymentProviderEventService } from "../payment-provider-event.service";
import { OutboxService } from "../../outbox/outbox.service";
import {
  OUTBOX_SHIPMENT_CANCEL,
  OUTBOX_INVOICE_REFUND_REVERSE,
  type InvoiceRefundReversePayload,
} from "../../outbox/outbox.types";
import { LedgerService } from "../../ledger/ledger.service";
import { MONEY_EPSILON } from "../helpers/payment.constants";
import { errorMessage } from "../../../common/helpers/error-message";
import { i18nMessage, localizedPayloadOf } from "../../i18n";
import {
  ProviderRefundOutcomeUnknownException,
  ProviderRefundRejectedException,
  RefundPendingReconciliationException,
} from "../../payment-providers/refund-errors";
import {
  PUBLIC_NAME_SELECT,
  publicName,
} from "../../../common/helpers/public-identity";
import { isProduction } from "../../../config/environment";
import { PaymentHoldReleaseService } from "./payment-hold-release.service";
import { PaymentRefundAttemptService } from "./payment-refund-attempt.service";
import { PaymentTradeRefundService } from "./payment-trade-refund.service";

/**
 * İade / escrow serbest bırakma metodları — PaymentService'ten birebir taşındı
 * (facade-delege deseni). PaymentService aynı imzalarla buraya delege eder.
 * scheduleHoldReleaseOnDelivery'nin pencere değerleri (returnWindowDays/payoutGraceDays)
 * PAYMENT_CONFIG_KEYS'ten okunur — varsayılanlar orada tek kaynaktır.
 */
/**
 * 11.4c — Kısmi iade ORANI (TEK otorite): hold tüketimi ve ledger pro-rate AYNI formülü
 * kullanır. `amount/threshold`, [0,1] arasına clamp'li; threshold ≤ 0 iken 1 (tam). Eskiden
 * iki yerde birebir kopyalanıyordu → drift riski; artık tek yerden.
 */
function refundPortion(amountToRefund: number, threshold: number): number {
  return threshold > 0 ? Math.min(amountToRefund / threshold, 1) : 1;
}

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
  /** V2 four-way fee reversal; aggregate fields above remain dual-written. */
  buyerCommissionRefundAmount?: number;
  buyerPlatformFeeRefundAmount?: number;
  sellerCommissionRefundAmount?: number;
  sellerPlatformFeeRefundAmount?: number;
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

@Injectable()
export class PaymentRefundService {
  private readonly logger = new Logger(PaymentRefundService.name);

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
    private readonly holdRelease: PaymentHoldReleaseService,
    private readonly attempts: PaymentRefundAttemptService,
    private readonly tradeRefunds: PaymentTradeRefundService,
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
    // İ25: bedel dahil TAM iadede takas kampanya bütçesi geri döner.
    @Optional()
    private readonly discountService?: DiscountService,
  ) {}

  // ───────────────────────────────────────────────────────────────────────────
  // Escrow serbest bırakma — PaymentHoldReleaseService'e delege edilir. İmzalar
  // burada kalır: PaymentService facade'ı, payment-scheduler ve e2e testleri bu
  // servisi adresliyor.
  // ───────────────────────────────────────────────────────────────────────────

  releasePayment(
    ...args: Parameters<PaymentHoldReleaseService["releasePayment"]>
  ) {
    return this.holdRelease.releasePayment(...args);
  }

  scheduleHoldReleaseOnDelivery(
    ...args: Parameters<
      PaymentHoldReleaseService["scheduleHoldReleaseOnDelivery"]
    >
  ) {
    return this.holdRelease.scheduleHoldReleaseOnDelivery(...args);
  }

  announceOrderDelivered(orderId: string): Promise<void> {
    return this.holdRelease.announceOrderDelivered(orderId);
  }

  claimPackageAnnouncement(
    ...args: Parameters<PaymentHoldReleaseService["claimPackageAnnouncement"]>
  ) {
    return this.holdRelease.claimPackageAnnouncement(...args);
  }

  handleOrderDelivered(
    ...args: Parameters<PaymentHoldReleaseService["handleOrderDelivered"]>
  ) {
    return this.holdRelease.handleOrderDelivered(...args);
  }

  releaseHoldsDue() {
    return this.holdRelease.releaseHoldsDue();
  }

  releasePaymentIfHeld(orderId: string): Promise<boolean> {
    return this.holdRelease.releasePaymentIfHeld(orderId);
  }

  /**
   * 11.2d — İade sonucu bildirimleri (POST-COMMIT best-effort). Eskiden finalize tx'i
   * İÇİNDE koşuyordu → FOR UPDATE kilidini uzatıyor + bir bildirim hatası para-tx'ini
   * abort edebiliyordu. Artık tx commit'inden SONRA çağrılır (para zaten geri döndü;
   * bildirim hatası iadeyi bozmaz). Guard/iptal-vs-refunded dallanması birebir korundu.
   * (Recovery no-op'ta çağrılmaz — finalize tx null döner, .then erken çıkar.)
   */
  // ───────────────────────────────────────────────────────────────────────────
  // Takas nakit iadesi — PaymentTradeRefundService'e delege edilir. İmzalar
  // burada kalır: PaymentService facade'ı, trade/admin servisleri ve
  // refund-reconciliation bu servisi adresliyor.
  // ───────────────────────────────────────────────────────────────────────────

  refundTradeCashPaymentIfCompleted(
    ...args: Parameters<
      PaymentTradeRefundService["refundTradeCashPaymentIfCompleted"]
    >
  ) {
    return this.tradeRefunds.refundTradeCashPaymentIfCompleted(...args);
  }

  refundTradeCashTracked(
    ...args: Parameters<PaymentTradeRefundService["refundTradeCashTracked"]>
  ) {
    return this.tradeRefunds.refundTradeCashTracked(...args);
  }

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
          buyer: { select: { id: true, email: true, ...PUBLIC_NAME_SELECT } },
          seller: { select: { id: true, email: true, ...PUBLIC_NAME_SELECT } },
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
            buyerName: publicName(order.buyer),
            sellerId: order.sellerId,
            sellerEmail: order.seller.email,
            sellerName: publicName(order.seller),
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
    const refundAttempt = await this.attempts.claimRefundAttempt(
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
        await this.attempts.startRefundSubmission(refundAttempt.attempt.id);
        if (isZeroCashSettlement) {
          refundResult = {
            status: "success",
            return_amount: 0,
            zeroCashSettlement: true,
          };
        } else {
          const bypassEnabled =
            !isProduction() &&
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
      let shipmentCancellationRequired = false;
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
                buyerCommissionAmount:
                  opts.settlement.buyerCommissionRefundAmount,
                buyerPlatformFeeAmount:
                  opts.settlement.buyerPlatformFeeRefundAmount,
                sellerCommissionAmount:
                  opts.settlement.sellerCommissionRefundAmount,
                sellerPlatformFeeAmount:
                  opts.settlement.sellerPlatformFeeRefundAmount,
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
                offerId: true,
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
            shipmentCancellationRequired = isFullRefund;
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
              // Teklif siparişi: teklif `accepted` kalırsa reactivate/"Ödemeyi
              // tamamla" iade edilmiş siparişi yeniden ödemeye açar. Tam iade
              // = anlaşma bitti.
              if (orderRow?.offerId) {
                await tx.offer.updateMany({
                  where: {
                    id: orderRow.offerId,
                    status: OfferStatus.accepted,
                  },
                  data: {
                    status: OfferStatus.cancelled,
                    cancelReason: OFFER_CANCEL_REASON.orderRefunded,
                  },
                });
              }
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

          // Kargo yalnız sipariş KÜMÜLATİF olarak tamamen iade edilip kapandığında
          // iptal edilir. Tutar/adet bazlı kısmi iade siparişi açık bırakır; aktif
          // kolinin takibini kesmek kalan ürünleri görünmez yapardı.
          if (shipmentCancellationRequired) {
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
          }

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
          if (shipmentCancellationRequired) {
            // Para commit'inden sonra hızlı yol; aynı iş outbox'ta kalıcıdır.
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
        `Refund error for payment ${payment.id}: ${errorMessage(error)}`,
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
        // Sarmalarken katalog payload'unu KORU: `error.message` yerelleştirilmiş
        // istisnalarda "Bad Request Exception"a düşer, yani istemci de log da
        // gerçek sebebi kaybederdi.
        throw error instanceof RefundPendingReconciliationException
          ? error
          : new RefundPendingReconciliationException(
              localizedPayloadOf(error) ?? errorMessage(error),
            );
      }
      throw error;
    }
  }
}
