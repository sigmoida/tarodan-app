import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma";
import {
  PaymentStatus,
  OrderStatus,
  ShipmentStatus,
  RefundAttemptStatus,
  RefundRequestStatus,
} from "@prisma/client";
import { PaymentRefundService } from "./payment-refund.service";

/**
 * İade odaklı mutabakat süpürmeleri (cron). PaymentReconciliationService facade'i
 * aynı imzalarla buraya delege eder (asiklik: REC→REF).
 */
@Injectable()
export class RefundReconciliationService {
  private readonly logger = new Logger(RefundReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentRefund: PaymentRefundService,
  ) {}

  /**
   * İptal/iade edilmiş ama ödemesi hâlâ `completed` olan siparişleri bulup PayTR iadesini
   * GÜVENİLİR şekilde tamamlar. Tek bir DB-tabanlı, idempotent, crash'e dayanıklı sweep
   * şu boşlukları birden yedekler:
   *  - K3: alıcı iptali → OrderService.cancel order'ı `refunded` yapar ama iade tetiklemezdi.
   *  - Y9: handleExpiredPreparingOrders order'ı `cancelled` yapıp tx-dışı processRefund çağırır;
   *        başarısızsa eskiden yalnız "MANUAL INTERVENTION" log'u kalırdı — artık burada retry edilir.
   *  - Y7: processSuccessfulPayment cron-yarışı dalındaki tx-dışı iade başarısızlığı.
   * processRefund order'ı `cancelled` + payment'ı `refunded` yaptığından (ve payout
   * tamamlandıysa K1 guard'ı bloke ettiğinden) sweep idempotenttir: işlenen sipariş bir
   * daha eşleşmez, kalıcı bloke olan nadir vaka her turda loglanır (manuel alarm sinyali).
   * Yani bu sweep aynı zamanda tx-dışı iadeler için bir retry/outbox görevi görür.
   */
  async processRefundedOrders(): Promise<{ refunded: number; failed: number }> {
    // 1) Tekil (order-bazlı) ödemeler — Order.payment doğrudan siparişe bağlı.
    const orders = await this.prisma.order.findMany({
      where: {
        status: { in: [OrderStatus.refunded, OrderStatus.cancelled] },
        payment: { is: { status: PaymentStatus.completed } },
      },
      select: { id: true },
      take: 50,
    });

    // 2) MONEY-H5: GRUP (sepet) siparişleri. Grup ödemesinde Order.payment NULL'dur —
    // ödeme CheckoutGroup'a bağlıdır — bu yüzden yukarıdaki `payment.is.status`
    // filtresi sepet siparişlerini HİÇ görmez ve iptal edilen sepet siparişi asla
    // iade edilmezdi. Grup ödemesi ancak grubun TÜM siparişleri iade edilince
    // `refunded` olduğundan, hâlâ `completed` olan gruptaki iptal/iade siparişleri
    // henüz iade edilmemiş adaylardır. Zaten iade edilmişleri (grup payment
    // metadata.refundedOrders) app tarafında eleriz — aksi halde processRefund
    // `orderAlreadyRefunded` fırlatıp her turda gürültülü REFUND_MANUAL_REVIEW üretir.
    const groupOrders = await this.prisma.order.findMany({
      where: {
        status: { in: [OrderStatus.refunded, OrderStatus.cancelled] },
        payment: { is: null },
        checkoutGroupId: { not: null },
        checkoutGroup: {
          is: { payment: { is: { status: PaymentStatus.completed } } },
        },
      },
      select: {
        id: true,
        checkoutGroup: {
          select: { payment: { select: { metadata: true } } },
        },
      },
      take: 50,
    });
    const pendingGroupOrderIds = groupOrders
      .filter((o) => {
        const meta =
          (o.checkoutGroup?.payment?.metadata as Record<string, unknown>) || {};
        const refundedOrders =
          (meta.refundedOrders as Record<string, number>) || {};
        return !refundedOrders[o.id];
      })
      .map((o) => o.id);

    // 3) SEAM-B3 recovery: outbound paket göndericiye İADE DÖNMÜŞ (shipment.status=returned)
    // ama processRefund başarısız olduğu için `refund_requested`'da TAKILI siparişler.
    // surat-tracking `applyTrackingUpdate` bunları refund_requested yapıp processRefund'ı
    // dener; başarısız olursa poller terminal (returned) shipment'ı ARTIK POLLAMADIĞINDAN
    // kendi retry EDEMEZ → burada güvenilir retry. `shipment.status=returned` bunları
    // normal-akış refund_requested siparişlerinden (outbound `delivered`, iade RefundRequest'te
    // ayrı izlenir) ayıran güvenli ayraçtır. processRefund başarınca order=cancelled → bir
    // daha eşleşmez (idempotent).
    const returnedStuckOrders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.refund_requested,
        shipment: { is: { status: ShipmentStatus.returned } },
      },
      select: { id: true },
      take: 50,
    });

    const allOrderIds = [
      ...orders.map((o) => o.id),
      ...pendingGroupOrderIds,
      ...returnedStuckOrders.map((o) => o.id),
    ];

    let refunded = 0;
    let failed = 0;
    const failedIds: string[] = [];
    for (const orderId of allOrderIds) {
      try {
        await this.paymentRefund.processRefund(orderId);
        refunded++;
      } catch (error: any) {
        failed++;
        failedIds.push(orderId);
        this.logger.error(
          `Auto-refund (iptal edilen sipariş ${orderId}) başarısız: ${error.message}`,
        );
      }
    }
    // Görünürlük: kalıcı başarısız para iadeleri sessizce sonsuza dek retry edilmesin —
    // tek satırlık greplenebilir alarm sinyali (ör. log-tabanlı uyarı kuralı buna bağlanır).
    // NOT: stok geri-yükleme artık OrderService.cancel'da (iptalle senkron) yapıldığından
    // takılı iade YALNIZ para tarafını etkiler; envanter piyasadan silinmez.
    if (failed > 0) {
      this.logger.warn(
        `REFUND_MANUAL_REVIEW: ${failed} sipariş için otomatik para iadesi hâlâ başarısız — manuel inceleme gerekli: ${failedIds.join(", ")}`,
      );
    }
    return { refunded, failed };
  }

  async reconcileStuckRefundMarkers(): Promise<{
    checked: number;
    recovered: number;
    manualReview: number;
  }> {
    const candidates = await this.prisma.refundAttempt.findMany({
      where: {
        orderId: { not: null },
        status: {
          in: [RefundAttemptStatus.prepared, RefundAttemptStatus.succeeded],
        },
      },
      orderBy: { createdAt: "asc" },
      take: 50,
    });

    let checked = 0;
    let recovered = 0;
    for (const attempt of candidates) {
      if (!attempt.orderId) continue;
      checked++;
      try {
        const result = await this.paymentRefund.processRefund(
          attempt.orderId,
          Number(attempt.amount),
          { idempotencyKey: attempt.idempotencyKey },
        );
        const refundRequestPrefix = "refund-request:";
        if (attempt.idempotencyKey.startsWith(refundRequestPrefix)) {
          const refundRequestId = attempt.idempotencyKey.slice(
            refundRequestPrefix.length,
          );
          await this.prisma.refundRequest.updateMany({
            where: {
              id: refundRequestId,
              status: { not: RefundRequestStatus.refunded },
            },
            data: {
              status: RefundRequestStatus.refunded,
              refundedAt: new Date(),
              providerRefundId: result?.providerRefundId ?? null,
            },
          });
        }
        recovered++;
        this.logger.warn(
          `REFUND_ATTEMPT_RECOVERED: attempt=${attempt.id} order=${attempt.orderId} ` +
            `payment=${attempt.paymentId} previousStatus=${attempt.status}`,
        );
      } catch (e: any) {
        this.logger.error(
          `Refund attempt recovery failed attempt=${attempt.id} order=${attempt.orderId}: ${e?.message}`,
        );
      }
    }

    const tradeCandidates = await this.prisma.refundAttempt.findMany({
      where: {
        tradeId: { not: null },
        status: {
          in: [RefundAttemptStatus.prepared, RefundAttemptStatus.succeeded],
        },
      },
      orderBy: { createdAt: "asc" },
      take: 50,
    });
    for (const attempt of tradeCandidates) {
      if (!attempt.tradeId) continue;
      checked++;
      try {
        const result =
          await this.paymentRefund.refundTradeCashPaymentIfCompleted(
            attempt.tradeId,
          );
        if (result.refunded) recovered++;
      } catch (e: any) {
        this.logger.error(
          `Trade refund attempt recovery failed attempt=${attempt.id} trade=${attempt.tradeId}: ${e?.message}`,
        );
      }
    }

    const staleBefore = new Date(Date.now() - 10 * 60 * 1000);
    const markedUnknown = await this.prisma.refundAttempt.updateMany({
      where: {
        status: RefundAttemptStatus.submitting,
        requestStartedAt: { lt: staleBefore },
      },
      data: {
        status: RefundAttemptStatus.manual_review,
        failureReason:
          "Refund submission ended without a durable provider response",
      },
    });
    const manualReview = await this.prisma.refundAttempt.count({
      where: { status: RefundAttemptStatus.manual_review },
    });

    if (markedUnknown.count > 0 || manualReview > 0) {
      this.logger.error(
        `REFUND_MANUAL_REVIEW: ${manualReview} unresolved refund attempt(s); ` +
          `${markedUnknown.count} stale submission(s) newly quarantined`,
      );
    }
    if (recovered > 0) {
      this.logger.warn(
        `Refund attempt reconciliation: ${recovered}/${checked} recovered`,
      );
    }
    return { checked, recovered, manualReview };
  }
}
