import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { Prisma } from "@prisma/client";
import { PaymentStatus, OrderStatus, ShipmentStatus } from "@prisma/client";
import { PaymentRefundService } from "./payment-refund.service";
import { asPaymentMetadata } from "./payment-metadata.types";

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

  /**
   * MONEY-M4: `refundInProgressOrders` marker'ı yazılıp PayTR iadesi YAPILDIKTAN sonra
   * DB tx'i (finalize) hiç çalışmayan siparişleri toparlar. Böyle bir sipariş için para
   * PayTR'de iade edildi ama payment `completed` kaldı → payout cron satıcıya ödeyebilir
   * (çift kayıp). Marker başarılı finalize'da temizlendiğinden (undefined), marker HÂLÂ
   * duran orderId'ler gerçekten takılıdır. processRefund'ı marker'daki TUTAR ile çağırırız:
   * PayTR atlanır (marker recovered) ve tx bu sefer finalize eder. İdempotent.
   */
  async reconcileStuckRefundMarkers(): Promise<{
    checked: number;
    recovered: number;
  }> {
    const candidates = await this.prisma.payment.findMany({
      where: {
        provider: "paytr",
        metadata: {
          path: ["refundInProgressOrders"],
          not: Prisma.DbNull,
        },
      },
      select: { id: true, metadata: true },
      take: 50,
    });

    let checked = 0;
    let recovered = 0;
    for (const p of candidates) {
      const meta = asPaymentMetadata(p.metadata);
      const inProgress = meta.refundInProgressOrders || {};
      // Finding 1: Takılı = marker VAR (finalize başarıda marker'ı siler → hâlâ duruyorsa
      // PayTR yapıldı ama tx finalize etmedi). Eski `!(oid in refundedOrders)` guard'ı
      // YANLIŞTI: MONEY-H4 tek ödemede çoklu kısmi iadeye izin verdiğinden, önceki bir
      // kısmi iade refundedOrders'a yazılınca sonraki takılı marker'ı elerdi (sessizce
      // toparlanmazdı). processRefund'ın marker-skip'i (Fix 1a) order başına ≤1 marker
      // garantiler → her marker tek bir takılı iadedir; hepsini finalize et.
      const stuckOrderIds = Object.keys(inProgress);
      for (const orderId of stuckOrderIds) {
        checked++;
        try {
          // Marker'daki tutar (yeni format {amount,at}); eski/timestamp formatında
          // undefined → processRefund tam iade varsayar (eski davranış).
          const stored = inProgress[orderId];
          const amount =
            stored && typeof stored === "object" && "amount" in stored
              ? Number((stored as { amount: number }).amount)
              : undefined;
          await this.paymentRefund.processRefund(orderId, amount);
          recovered++;
          this.logger.warn(
            `STUCK_REFUND_RECOVERED: refundInProgress marker finalize edildi ` +
              `order=${orderId} payment=${p.id} amount=${amount ?? "full"}`,
          );
        } catch (e: any) {
          this.logger.error(
            `reconcileStuckRefundMarkers: order ${orderId} recovery başarısız (payment=${p.id}): ${e?.message}`,
          );
        }
      }
    }
    if (recovered > 0) {
      this.logger.warn(
        `Stuck refund marker taraması: ${recovered}/${checked} finalize edildi`,
      );
    }
    return { checked, recovered };
  }
}
