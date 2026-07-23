import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../prisma";
import { OrderStatus, ProductStatus, TradeStatus } from "@prisma/client";
import { getReservedAwareStatus } from "../product/helpers/product-status.helper";
import { safeDecrementReserved } from "../product/helpers/product-availability.helper";
import { CacheService } from "../cache/cache.service";
import { NotificationService } from "../notification/notification.service";

// Takasta reservedQuantity, takas KABUL edildiğinde (checkAndReserve) artar ve
// ancak tamamlanma / iptal / red / iade-teslim adımlarında geri verilir. Bu
// statülerdeki bir takas, üründe HÂLÂ canlı bir rezervasyon tutar — sipariş gibi
// bir Order satırı OLMADAN. reconcileReservedQuantities sayacı sıfırlarken bunları
// görmezse takas-rezerveli ürünü yanlışlıkla "stokta" yapar. Hariç tutulanlar:
// pending (henüz rezerve etmedi), rejected/completed/cancelled (rezervasyon geri
// verildi). 'returning' DAHİL: red sonrası rezervasyon iade teslim alınana kadar
// (markReturnDelivered) açık kalır.
const TRADE_RESERVATION_HOLDING_STATUSES: TradeStatus[] = [
  TradeStatus.accepted,
  TradeStatus.initiator_shipped,
  TradeStatus.receiver_shipped,
  TradeStatus.both_shipped,
  TradeStatus.initiator_received,
  TradeStatus.receiver_received,
  TradeStatus.awaiting_payment,
  TradeStatus.shipping_to_warehouse,
  TradeStatus.at_warehouse,
  TradeStatus.admin_reviewing,
  TradeStatus.shipping_to_recipients,
  TradeStatus.returning,
  TradeStatus.disputed,
];

/**
 * Stok rezervasyonu mutabakat süpürmeleri (cron). PaymentReconciliationService
 * facade'i aynı imzalarla buraya delege eder.
 */
@Injectable()
export class ReservationReconciliationService {
  private readonly logger = new Logger(ReservationReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly configService: ConfigService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Rezervasyon serbest bırakma. pending_payment siparişler PAYMENT_TIMEOUT_MINUTES
   * (varsayılan 5 dk) içinde ödenmediyse stok rezervasyonu kaldırılır, AMA sipariş yaşamaya
   * devam eder (status pending_payment kalır, reservationReleasedAt set edilir). Alıcı
   * 24 saat içinde tekrar payment-initiate çağırırsa stok varsa yeniden rezerv alınır.
   * 24h kill-switch'i için ayrı method: expireUnpaidOrders.
   */
  async releaseExpiredOrderReservations(): Promise<{ count: number }> {
    const timeoutMinutes = parseInt(
      this.configService.get("PAYMENT_TIMEOUT_MINUTES") || "5",
      10,
    );
    const cutoff = new Date();
    cutoff.setMinutes(cutoff.getMinutes() - timeoutMinutes);

    const expiredOrders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.pending_payment,
        createdAt: { lt: cutoff },
        reservationReleasedAt: null,
        // #1 (OVERSELL FIX): YALNIZ gerçekten rezervasyon TUTAN siparişleri serbest bırak.
        // Direct-buy (offerId=null) checkout'ta rezerve eder → her zaman tutar. Teklif siparişi
        // (offerId!=null) YALNIZ ödeme başlatınca (Payment satırı oluşunca) rezerve eder; kabul
        // edilip ödenmemiş teklif siparişi HİÇ rezerve etmez. Onu da "serbest bırakırsak"
        // paylaşılan reservedQuantity'yi düşürüp BAŞKA bir siparişin/takasın canlı rezervasyonunu
        // ÇALARIZ → available yükselir → aynı birim tekrar satılır (oversell). reconcile'ın
        // ground-truth predicate'iyle birebir aynı: rezerve iff (offerId null) VEYA (payment var).
        OR: [
          { offerId: null },
          { offerId: { not: null }, payment: { isNot: null } },
        ],
      },
      select: {
        id: true,
        productId: true,
        orderNumber: true,
        buyerId: true,
        product: { select: { title: true } },
      },
    });

    let released = 0;
    const dispatched: {
      buyerId: string;
      orderId: string;
      productTitle: string;
    }[] = [];
    for (const order of expiredOrders) {
      if (!order.productId) continue;
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM orders WHERE id = ${order.id} FOR UPDATE`;
          const freshOrder = await tx.order.findUnique({
            where: { id: order.id },
            select: {
              status: true,
              reservationReleasedAt: true,
              quantity: true,
            },
          });
          if (
            !freshOrder ||
            freshOrder.status !== OrderStatus.pending_payment ||
            freshOrder.reservationReleasedAt !== null
          ) {
            return;
          }

          await tx.$queryRaw`SELECT id FROM products WHERE id = ${order.productId} FOR UPDATE`;
          const product = await tx.product.findUnique({
            where: { id: order.productId },
            select: { reservedQuantity: true, quantity: true, status: true },
          });

          if (product) {
            // Adet bazlı: rezervasyonu sipariş adedi kadar serbest bırak (1 değil).
            const newReserved = safeDecrementReserved(
              product.reservedQuantity,
              freshOrder.quantity ?? 1,
            );
            await tx.product.update({
              where: { id: order.productId },
              data: {
                reservedQuantity: newReserved,
                // Bulgu C: rezerv-duyarlı status (quantity=null → active, quantity=0 → inactive).
                status: getReservedAwareStatus(product.quantity, newReserved),
              },
            });
          }

          // Mark the reservation as released; order stays pending_payment so
          // the buyer can re-initiate within paymentExpiresAt (24h window).
          await tx.order.update({
            where: { id: order.id },
            data: { reservationReleasedAt: new Date() },
          });
        });
        await this.cache.del(`products:detail:${order.productId}`);
        released++;
        dispatched.push({
          buyerId: order.buyerId,
          orderId: order.id,
          productTitle: order.product?.title ?? "Ürün",
        });
        this.logger.log(
          `Released reservation for order ${order.orderNumber} (product ${order.productId})`,
        );
      } catch (error: any) {
        this.logger.error(
          `Failed to release expired order ${order.id}: ${error?.message}`,
        );
      }
    }

    for (const d of dispatched) {
      await this.notificationService
        .notifyReservationReleased(d.buyerId, d.orderId, d.productTitle)
        .catch((err) =>
          this.logger.warn(
            `reservation-released notify failed for ${d.buyerId}: ${err.message}`,
          ),
        );
    }

    return { count: released };
  }

  /**
   * Ground-truth reconciliation: bir ürünün reservedQuantity'si, o ürün için
   * gerçekten rezervasyon tutan sipariş sayısına (status=pending_payment AND
   * reservationReleasedAt IS NULL) eşit olmalı. Sipariş satırı silindiğinde veya
   * release adımı kaçırıldığında sayaç yukarıda takılı kalabilir; bu da
   * availableQuantity = quantity - reservedQuantity'yi yanlışlıkla 0 yaparak
   * stokta olan ürünü "Stok bitti" gösterir. Bu metod sapan sayaçları düzeltir.
   *
   * releaseExpiredOrderReservations() yalnızca HÂLÂ var olan süresi geçmiş
   * siparişleri serbest bırakır; orphan (siparişsiz) rezervasyonları yakalayamaz —
   * bu metod o boşluğu kapatan emniyet ağıdır.
   */
  async reconcileReservedQuantities(): Promise<{ count: number }> {
    // #1 heal: hem OVER-count (reservedQuantity>0 ama gerçekte daha az) hem UNDER-count
    // (rezervasyon TUTAN sipariş/takas var ama sayaç düşük/0) onarılsın. Adaylar = sayacı>0
    // olan ∪ aktif rezervasyon tutan (sipariş/takas) ürünler. Yalnız reservedQuantity>0
    // taransaydı 0'a düşmüş under-count asla düzelmezdi (release bug'ının bıraktığı iz).
    const [withReserved, reservingOrders, activeTradeItems] = await Promise.all(
      [
        this.prisma.product.findMany({
          where: { reservedQuantity: { gt: 0 } },
          select: { id: true },
        }),
        this.prisma.order.findMany({
          where: {
            status: OrderStatus.pending_payment,
            reservationReleasedAt: null,
            productId: { not: null },
            OR: [
              { offerId: null },
              { offerId: { not: null }, payment: { isNot: null } },
            ],
          },
          select: { productId: true },
          distinct: ["productId"],
        }),
        this.prisma.tradeItem.findMany({
          where: {
            trade: { status: { in: TRADE_RESERVATION_HOLDING_STATUSES } },
          },
          select: { productId: true },
          distinct: ["productId"],
        }),
      ],
    );
    const candidateIds = Array.from(
      new Set<string>([
        ...withReserved.map((p) => p.id),
        ...reservingOrders
          .map((o) => o.productId)
          .filter((x): x is string => !!x),
        ...activeTradeItems.map((t) => t.productId),
      ]),
    );

    let fixed = 0;
    for (const id of candidateIds) {
      try {
        // Ground-truth = sipariş rezervasyonları + AKTİF takas rezervasyonları.
        // Takaslar checkAndReserve ile reservedQuantity'yi artırır ama Order satırı
        // OLUŞTURMAZ; bu yüzden takas rezervasyonunu ayrıca toplamazsak sayaç drift
        // sanılıp sıfırlanır ve takas-rezerveli ürün yanlışlıkla "stokta" görünür.
        // Adet bazlı: rezervasyon order ADEDİ değil, order.quantity TOPLAMIdır.
        // Bulgu D: rezervasyon kuralıyla AYNI sayım. Bir sipariş rezervasyon tutar iff
        //   - direct-buy (offerId IS NULL): create'de rezerve edilir → her zaman sayılır
        //   - teklif (offerId IS NOT NULL): rezerv yalnız ödeme başlatınca (Payment satırı
        //     oluşunca) alınır → yalnız Payment satırı varsa sayılır.
        // Eski sürüm ödemesi hiç başlatılmamış teklif siparişlerini de sayıp reservedQuantity'yi
        // şişiriyordu → ürün yanlışlıkla "Stok bitti" görünüyordu.
        // (invalidatePendingOrdersForProduct'taki kuralla birebir aynı.)
        const directBuyHeldAgg = await this.prisma.order.aggregate({
          _sum: { quantity: true },
          where: {
            productId: id,
            status: OrderStatus.pending_payment,
            reservationReleasedAt: null,
            offerId: null,
          },
        });
        const offerWithPaymentHeldAgg = await this.prisma.order.aggregate({
          _sum: { quantity: true },
          where: {
            productId: id,
            status: OrderStatus.pending_payment,
            reservationReleasedAt: null,
            offerId: { not: null },
            payment: { isNot: null },
          },
        });
        const orderHeld =
          (directBuyHeldAgg._sum.quantity ?? 0) +
          (offerWithPaymentHeldAgg._sum.quantity ?? 0);
        const tradeHeldAgg = await this.prisma.tradeItem.aggregate({
          _sum: { quantity: true },
          where: {
            productId: id,
            trade: { status: { in: TRADE_RESERVATION_HOLDING_STATUSES } },
          },
        });
        const held = orderHeld + (tradeHeldAgg._sum.quantity ?? 0);
        await this.prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM products WHERE id = ${id} FOR UPDATE`;
          const product = await tx.product.findUnique({
            where: { id },
            select: { reservedQuantity: true, quantity: true, status: true },
          });
          if (!product || product.reservedQuantity === held) return;

          const remaining = (product.quantity ?? 0) - held;
          // Sayacı yanlışlıkla "reserved" yaptıysa ve stok varsa active'e döndür;
          // gerçekten satılmış/pasif (quantity 0) ürünlere dokunma.
          const nextStatus =
            product.status === ProductStatus.reserved &&
            held === 0 &&
            (product.quantity == null || remaining > 0)
              ? ProductStatus.active
              : undefined;

          await tx.product.update({
            where: { id },
            data: {
              reservedQuantity: held,
              ...(nextStatus ? { status: nextStatus } : {}),
            },
          });
          fixed++;
        });
        await this.cache.del(`products:detail:${id}`).catch(() => undefined);
      } catch (error: any) {
        this.logger.error(
          `reconcileReservedQuantities failed for ${id}: ${error?.message}`,
        );
      }
    }

    if (fixed > 0) {
      await this.cache.delPattern("products:list:*").catch(() => undefined);
    }
    return { count: fixed };
  }
}
