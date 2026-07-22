import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../prisma";
import { Prisma } from "@prisma/client";
import {
  PaymentStatus,
  PaymentHoldStatus,
  OrderStatus,
  ProductStatus,
  TradeStatus,
  OfferStatus,
  ShipmentStatus,
} from "@prisma/client";
import {
  getProductStatusFromQuantity,
  getReservedAwareStatus,
} from "../product/helpers/product-status.helper";
import { safeDecrementReserved } from "../product/helpers/product-availability.helper";
import { CacheService } from "../cache/cache.service";
import { PaymentProviderRegistry } from "../payment-providers/payment-provider.registry";
import { InvoiceService } from "../invoice/invoice.service";
import { NotificationService } from "../notification/notification.service";
import { NotificationType } from "../notification/dto/notification.dto";
import { CommissionLedgerService } from "../commission/commission-ledger.service";
import { PaymentRefundService } from "./payment-refund.service";
import { EventService } from "../events";
import { PaymentCommonService } from "./payment-common.service";
import { PaymentFulfillmentService } from "./payment-fulfillment.service";

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

// SEAM-B1: Paket Sürat'ta HAREKET ettiyse "satıcı göndermedi" DEĞİLDİR. Bu
// statüler poller tarafından gerçek kargo hareketiyle set edilir — böyle bir
// siparişi süre-doldu diye iptal+iade edersek alıcı hem malı hem parayı alır.
// `pending`/`label_created` HARİÇ: yalnız barkod/etiket var ama kargoya verilmemiş
// olabilir (immediate-barcode her ödemede etiket üretir) — onlar gerçek "göndermedi".
const SHIPMENT_IN_MOTION_STATUSES: ShipmentStatus[] = [
  ShipmentStatus.picked_up,
  ShipmentStatus.in_transit,
  ShipmentStatus.at_delivery_branch,
  ShipmentStatus.out_for_delivery,
  ShipmentStatus.delivered,
  ShipmentStatus.return_in_progress,
  ShipmentStatus.returned,
];

/**
 * Zamanlanmış mutabakat / süpürme (cron) metodları — PaymentService'ten birebir
 * taşındı (facade-delege deseni). PaymentService aynı imzalarla buraya delege eder.
 * processRefundedOrders + handleExpiredPreparingOrders iade için PaymentRefundService
 * inject eder (this.processRefund → this.paymentRefund.processRefund; asiklik: REC→REF).
 */
@Injectable()
export class PaymentReconciliationService {
  private readonly logger = new Logger(PaymentReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly configService: ConfigService,
    private readonly paymentProviders: PaymentProviderRegistry,
    private readonly invoiceService: InvoiceService,
    private readonly notificationService: NotificationService,
    private readonly commissionLedger: CommissionLedgerService,
    private readonly paymentRefund: PaymentRefundService,
    private readonly eventService: EventService,
    private readonly paymentCommon: PaymentCommonService,
    private readonly paymentFulfillment: PaymentFulfillmentService,
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
   * CAPI (Faz 3): store_card ödemesi sonrası callback'te dönen utoken ile kullanıcının
   * PayTR'daki kayıtlı kartlarını çekip SavedCard tablosuna upsert eder (recurring için).
   * KART NUMARASI/CVV SAKLANMAZ — yalnız PayTR token'ları + maskeli bilgi. ctoken @unique
   * olduğundan idempotenttir. Callback'ten çağrılır (dairesel bağımlılık olmasın diye persist
   * burada; kart listele/sil yönetimi MembershipService'tedir).
   */
  async syncSavedCardsFromUtoken(
    userId: string,
    utoken: string,
    mandate?: { ip?: string; termsVersion?: string },
  ): Promise<number> {
    if (!utoken) return 0;
    const cards = await this.paymentProviders.resolve().capiListCards(utoken);
    let saved = 0;
    for (const c of cards) {
      if (!c.ctoken) continue;
      await this.prisma.savedCard.upsert({
        where: { ctoken: c.ctoken },
        create: {
          userId,
          provider: "paytr",
          utoken,
          ctoken: c.ctoken,
          last4: c.last4 || "____",
          brand: c.brand,
          expMonth: c.month,
          expYear: c.year,
          requireCvv: c.requireCvv ?? false,
          status: "active",
          mandateAcceptedAt: new Date(),
          mandateIp: mandate?.ip,
          mandateTermsVersion: mandate?.termsVersion,
        },
        update: {
          utoken,
          last4: c.last4 || undefined,
          brand: c.brand,
          expMonth: c.month,
          expYear: c.year,
          requireCvv: c.requireCvv ?? false,
          status: "active",
        },
      });
      saved++;
    }
    if (saved > 0) {
      this.logger.log(
        `SavedCard senkron: user=${userId} ${saved} kart kaydedildi/güncellendi`,
      );
    }
    return saved;
  }

  /**
   * O6: Ödemesi tamamlanmış ama faturası oluşmamış siparişleri bulup faturayı yeniden üret.
   * processSuccessfulPayment'ta fatura üretimi tx-sonrası best-effort olduğundan (geçici hata
   * yutulup loglanır) bu sweep güvenilir bir TELAFİ/retry görevi görür. Yalnız faturası
   * OLMAYAN (invoices:none) siparişleri seçtiğinden çift-fatura riski yoktur. Membership/boost
   * sanal siparişlerine fatura kesilmez → hariç tutulur.
   */
  async reconcileMissingInvoices(): Promise<{ generated: number }> {
    const orders = await this.prisma.order.findMany({
      where: {
        status: {
          in: [
            OrderStatus.preparing,
            OrderStatus.shipped,
            OrderStatus.delivered,
            OrderStatus.awaiting_buyer_confirmation,
            OrderStatus.completed,
          ],
        },
        payment: { is: { status: PaymentStatus.completed } },
        invoices: { none: {} },
        NOT: {
          OR: [
            { productId: { startsWith: "membership-" } },
            { productId: { startsWith: "boost-" } },
          ],
        },
      },
      select: { id: true, orderNumber: true },
      take: 50,
    });

    // ESKİ makbuz KALDIRILDI + eLogo e-Arşiv faturaları ARTIK TESLİMDE kesiliyor
    // (order-scheduler.processDeliveredOrders). Bu telafi yolu ARTIK HİÇBİR ŞEY ÜRETMEZ;
    // eski "generated++" yanıltıcı "N fatura üretildi" logu üretiyordu → 0 döndürüyoruz.
    void orders;
    return { generated: 0 };
  }

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
    const candidates = await this.prisma.product.findMany({
      where: { reservedQuantity: { gt: 0 } },
      select: { id: true },
    });

    let fixed = 0;
    for (const { id } of candidates) {
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

  /**
   * 24h kill-switch: pending_payment siparişleri paymentExpiresAt geçtiğinde
   * iptal eder. Eğer rezerv hâlâ tutuluyorsa (cron 30dk pas'ı kaçırdıysa) önce
   * onu serbest bırakır. Bağlı offer payment_expired olur.
   */
  /**
   * FLOW-H2/H3: Ödemenin son 3DS çekimi hâlâ "canlı" olabilir mi? metadata.lastChargeStartedAt
   * (charge-claim anında damgalanır) PAYMENT_FAIL_TIMEOUT_MINUTES (vars. 35dk, PayTR 3DS
   * penceresi + grace) içindeyse EVET. Bu payment `failed` yapılmamalı / siparişi 24s
   * kill-switch'i öldürmemeli — aksi halde kullanıcı OTP ekranındayken PayTR parayı çeker
   * ve callback geldiğinde satır çoktan failed olur → orphan capture.
   */
  private isChargeLikelyLive(metadata: unknown): boolean {
    const windowMin = parseInt(
      this.configService.get("PAYMENT_FAIL_TIMEOUT_MINUTES") || "35",
      10,
    );
    return this.paymentCommon.isChargeLikelyLive(metadata, windowMin);
  }

  async expireUnpaidOrders(): Promise<{ count: number }> {
    const now = new Date();
    const expired = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.pending_payment,
        paymentExpiresAt: { lt: now },
      },
      select: {
        id: true,
        productId: true,
        offerId: true,
        buyerId: true,
        orderNumber: true,
        reservationReleasedAt: true,
        product: { select: { title: true } },
      },
    });

    let cancelled = 0;
    const dispatched: {
      buyerId: string;
      orderId: string;
      productTitle: string;
    }[] = [];
    for (const order of expired) {
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM orders WHERE id = ${order.id} FOR UPDATE`;
          const fresh = await tx.order.findUnique({
            where: { id: order.id },
            select: { status: true, quantity: true },
          });
          if (!fresh || fresh.status !== OrderStatus.pending_payment) return;

          // FLOW-H3: Canlı bir 3DS çekimi varsa 24s kill-switch'i siparişi ÖLDÜRMESİN
          // (orphan capture). Siparişin (veya grubunun) pending/processing ödemesinin
          // son charge-start'ı pencere içindeyse bu tur atla; bir sonraki turda tekrar
          // bakılır (charge penceresi kapanınca iptal edilir).
          const livePayment = await tx.payment.findFirst({
            where: {
              OR: [
                { orderId: order.id },
                { checkoutGroup: { orders: { some: { id: order.id } } } },
              ],
              status: {
                in: [PaymentStatus.pending, PaymentStatus.processing],
              },
            },
            select: { metadata: true },
          });
          if (livePayment && this.isChargeLikelyLive(livePayment.metadata)) {
            return;
          }

          // Rezerv hâlâ canlıysa serbest bırak (rare: 30dk cron'u kaçırdı)
          if (!order.reservationReleasedAt && order.productId) {
            await tx.$queryRaw`SELECT id FROM products WHERE id = ${order.productId} FOR UPDATE`;
            const product = await tx.product.findUnique({
              where: { id: order.productId },
              select: { reservedQuantity: true, quantity: true },
            });
            if (product) {
              // Adet bazlı: rezervasyonu sipariş adedi kadar serbest bırak (1 değil).
              const newReserved = safeDecrementReserved(
                product.reservedQuantity,
                fresh.quantity ?? 1,
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
          }

          await tx.order.update({
            where: { id: order.id },
            data: {
              status: OrderStatus.cancelled,
              cancelReason: "Ödeme süresi (24 saat) doldu",
            },
          });

          if (order.offerId) {
            await tx.offer.update({
              where: { id: order.offerId },
              data: { status: OfferStatus.payment_expired },
            });
          }

          await tx.payment.updateMany({
            where: { orderId: order.id, status: PaymentStatus.pending },
            data: {
              status: PaymentStatus.failed,
              failureReason:
                "Sipariş 24 saat içinde ödenmediği için iptal edildi",
            },
          });

          // Grup ödemesi: yalnızca gruptaki HİÇBİR kardeş sipariş pending_payment
          // kalmadıysa grup payment'ını da expire et (kardeş hâlâ ödenebilir olabilir)
          const orderRow = await tx.order.findUnique({
            where: { id: order.id },
            select: { checkoutGroupId: true },
          });
          if (orderRow?.checkoutGroupId) {
            const aliveSibling = await tx.order.findFirst({
              where: {
                checkoutGroupId: orderRow.checkoutGroupId,
                status: OrderStatus.pending_payment,
                id: { not: order.id },
              },
              select: { id: true },
            });
            if (!aliveSibling) {
              await tx.payment.updateMany({
                where: {
                  checkoutGroupId: orderRow.checkoutGroupId,
                  status: PaymentStatus.pending,
                },
                data: {
                  status: PaymentStatus.failed,
                  failureReason:
                    "Sipariş 24 saat içinde ödenmediği için iptal edildi",
                },
              });
            }
          }
        });
        if (order.productId) {
          await this.cache.del(`products:detail:${order.productId}`);
        }
        cancelled++;
        dispatched.push({
          buyerId: order.buyerId,
          orderId: order.id,
          productTitle: order.product?.title ?? "Ürün",
        });
        this.logger.log(`Expired unpaid order ${order.orderNumber} (24h TTL)`);
      } catch (err: any) {
        this.logger.error(
          `expireUnpaidOrders failed for ${order.id}: ${err.message}`,
        );
      }
    }

    for (const d of dispatched) {
      await this.notificationService
        .notifyOrderPaymentExpired(d.buyerId, d.orderId, d.productTitle)
        .catch((err) =>
          this.logger.warn(
            `order-expired notify failed for ${d.buyerId}: ${err.message}`,
          ),
        );
      // Sipariş iptali e-postaları (alıcı+satıcı). Asla throw etmez.
      await this.notificationService.sendOrderCancelledEmails(d.orderId);
    }

    return { count: cancelled };
  }

  /**
   * Handle orders stuck in "preparing" status past their deadline.
   * Two phases:
   * 1. Warn: Send notification to seller 24h before deadline (once only).
   * 2. Cancel: Auto-cancel + refund orders past deadline, re-stock product.
   */
  async handleExpiredPreparingOrders(): Promise<{
    warned: number;
    cancelled: number;
  }> {
    const now = new Date();
    const warningWindow = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24h from now

    // --- Phase 1: Warn sellers approaching deadline ---
    const approachingDeadline = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.preparing,
        preparingDeadline: { gt: now, lte: warningWindow },
        preparingWarningSentAt: null,
      },
      include: {
        seller: { select: { id: true, email: true, displayName: true } },
        product: { select: { id: true, title: true } },
      },
    });

    let warned = 0;
    for (const order of approachingDeadline) {
      try {
        const deadlineStr = order.preparingDeadline
          ? order.preparingDeadline.toLocaleDateString("tr-TR", {
              day: "numeric",
              month: "long",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "";

        await this.notificationService.createInAppNotification(
          order.sellerId,
          NotificationType.ORDER_PREPARING_DEADLINE_WARNING,
          {
            orderId: order.id,
            orderNumber: order.orderNumber,
            deadline: deadlineStr,
            productTitle: order.product.title,
          },
        );

        await this.prisma.order.update({
          where: { id: order.id },
          data: { preparingWarningSentAt: now },
        });

        warned++;
        this.logger.log(
          `Preparing deadline warning sent to seller ${order.sellerId} for order ${order.orderNumber}`,
        );
      } catch (err: any) {
        this.logger.error(
          `Failed to warn seller for order ${order.id}: ${err.message}`,
        );
      }
    }

    // --- Phase 2: Auto-cancel orders past deadline ---
    const expiredOrders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.preparing,
        preparingDeadline: { lt: now },
      },
      include: {
        buyer: { select: { id: true, email: true, displayName: true } },
        seller: { select: { id: true, email: true, displayName: true } },
        product: { select: { id: true, title: true, quantity: true } },
      },
    });

    let cancelled = 0;
    for (const order of expiredOrders) {
      try {
        let skippedInMotion = false;
        await this.prisma.$transaction(async (tx) => {
          // Lock the order row to prevent concurrent modifications (e.g., seller shipping at the same time)
          await tx.$queryRaw`SELECT id FROM orders WHERE id = ${order.id} FOR UPDATE`;

          const freshOrder = await tx.order.findUnique({
            where: { id: order.id },
            select: { status: true },
          });
          if (!freshOrder || freshOrder.status !== OrderStatus.preparing) {
            return; // Already shipped or handled by another process
          }

          // SEAM-B1: Satıcı "kargoladım" tıklamamış olsa bile paket Sürat'ta HAREKET
          // ediyorsa (poller shipment.status'ü ilerletmiş ya da shippedAt set) bu bir
          // "göndermedi" değildir → iptal+iade edersek alıcı hem malı hem parayı alır
          // (çift kayıp). İptal ETME; atla. Sipariş `preparing`'de kalsa bile teslimde
          // handleOrderDelivered onu ilerletip escrow'u başlatır, satıcı yine ödenir.
          const shipment = await tx.shipment.findUnique({
            where: { orderId: order.id },
            select: { status: true, shippedAt: true },
          });
          if (
            shipment &&
            (SHIPMENT_IN_MOTION_STATUSES.includes(shipment.status) ||
              shipment.shippedAt !== null)
          ) {
            skippedInMotion = true;
            return;
          }

          // Cancel order
          await tx.order.update({
            where: { id: order.id },
            data: {
              status: OrderStatus.cancelled,
              cancelReason:
                "Satıcı belirlenen süre içinde kargoya vermediği için otomatik iptal edildi",
              version: { increment: 1 },
            },
          });

          // Cancel the payment hold (escrow)
          await tx.paymentHold.updateMany({
            where: { orderId: order.id, status: PaymentHoldStatus.held },
            data: { status: PaymentHoldStatus.cancelled },
          });

          // Ledger: Senaryo A — komisyon waived (Faz 3B.7).
          // processRefund sonradan markRefunded çağıracak ama status guard
          // (sadece pending/earned) nedeniyle waived satıra dokunmaz.
          await this.commissionLedger.markWaived(
            order.id,
            "seller_did_not_ship",
            tx,
          );

          // Re-stock: iade edilen TÜM adet geri yüklenir (eskiden sabit +1 →
          // çok-adetli siparişte stok eksik kalıyordu). order.quantity kadar artır.
          const restoreQty = order.quantity ?? 1;
          const newQuantity =
            order.product.quantity !== null
              ? order.product.quantity + restoreQty
              : null;
          await tx.product.update({
            where: { id: order.product.id },
            data: {
              quantity:
                order.product.quantity !== null
                  ? { increment: restoreQty }
                  : undefined,
              status: getProductStatusFromQuantity(newQuantity),
            },
          });
        });

        // SEAM-B1: hareket eden paket yüzünden atlandıysa iade/restock/bildirim YOK.
        // Ops görünürlüğü için greplenebilir tek satır uyarı.
        if (skippedInMotion) {
          this.logger.warn(
            `SELLER_NO_SHIP_SKIPPED_MOVING: sipariş ${order.orderNumber} süre doldu ama ` +
              `paket Sürat'ta hareket ediyor — iptal/iade EDİLMEDİ (satıcı 'kargoladım' işaretlememiş olabilir).`,
          );
          continue;
        }

        // Process refund via PayTR (outside transaction — calls external API)
        try {
          await this.paymentRefund.processRefund(order.id);
          this.logger.log(
            `Refund processed for expired preparing order ${order.orderNumber}`,
          );
        } catch (refundError: any) {
          this.logger.error(
            `REFUND FAILED for expired preparing order ${order.orderNumber}: ${refundError.message}. MANUAL INTERVENTION REQUIRED.`,
          );
        }

        // Senaryo A bildirimi (Faz 3B.7) — alıcıya "satıcı göndermedi" haberi
        try {
          await this.notificationService.notifySellerDidNotShipRefunded(
            order.buyerId,
            order.id,
          );
        } catch (notifyErr: any) {
          this.logger.warn(
            `notify seller-no-ship failed for ${order.id}: ${notifyErr?.message}`,
          );
        }

        // Invalidate product cache
        await this.cache.del(`products:detail:${order.product.id}`);

        cancelled++;
        this.logger.log(
          `Auto-cancelled expired preparing order ${order.orderNumber} (seller: ${order.sellerId}, product: ${order.product.id})`,
        );
      } catch (err: any) {
        this.logger.error(
          `Failed to auto-cancel expired preparing order ${order.id}: ${err.message}`,
        );
      }
    }

    return { warned, cancelled };
  }

  /**
   * PayTR callback sunucuya ulaşmadan ödeme başarılı olduysa: durum-sorgu ile doğrula ve tamamla (1.4).
   * PAYTR_RECONCILIATION_ENABLED=false ile kapatılabilir.
   */
  async reconcilePendingPaytrPayments(): Promise<{
    checked: number;
    completed: number;
  }> {
    const enabled = this.configService.get("PAYTR_RECONCILIATION_ENABLED");
    if (enabled === "false" || enabled === "0") {
      return { checked: 0, completed: 0 };
    }

    const minAgeMin = parseInt(
      this.configService.get("PAYTR_RECONCILIATION_MIN_AGE_MINUTES") || "3",
      10,
    );
    const batch = parseInt(
      this.configService.get("PAYTR_RECONCILIATION_BATCH_LIMIT") || "40",
      10,
    );
    const tolerance = parseFloat(
      this.configService.get("PAYTR_RECONCILE_AMOUNT_TOLERANCE_TL") || "0.05",
    );

    const cutoff = new Date();
    cutoff.setMinutes(cutoff.getMinutes() - minAgeMin);

    const candidates = await this.prisma.payment.findMany({
      where: {
        provider: "paytr",
        status: PaymentStatus.pending,
        providerConversationId: { not: null },
        OR: [
          { order: { status: OrderStatus.pending_payment } },
          // Grup ödemesi: gruptaki en az bir sipariş hâlâ ödeme bekliyorsa
          {
            checkoutGroup: {
              orders: { some: { status: OrderStatus.pending_payment } },
            },
          },
        ],
        createdAt: { lt: cutoff },
      },
      include: {
        order: { select: { id: true, status: true, totalAmount: true } },
      },
      take: batch,
      orderBy: { createdAt: "asc" },
    });

    let checked = 0;
    let completed = 0;

    for (const row of candidates) {
      checked++;
      const ourAmount = Number(row.amount);
      try {
        // FLOW-M3: TÜM oid'leri tara (güncel providerConversationId + merchantOidHistory).
        // Capture rotate edilmiş ESKİ bir oid'de olmuş olabilir; yalnız güncel oid'i
        // sormak sahipsiz capture'ı kaçırırdı. İlk çekilmiş + tutar-tutan oid capture'dır.
        const oids = this.paymentCommon.collectPaymentOids(row);
        let capturedOid: string | null = null;
        let capturedInquiry: {
          paymentTotalTl: number;
          paymentDate?: string | null;
        } | null = null;
        for (const candidateOid of oids) {
          const inquiry = await this.paymentProviders
            .resolve()
            .queryPaymentStatus(candidateOid);
          if (!inquiry.ok) continue;
          if (Math.abs(inquiry.paymentTotalTl - ourAmount) > tolerance) {
            // O10: tutar uyuşmazlığı → ALARM (yüksek öncelik), completed YAPMA.
            this.logger.error(
              `ALARM: PayTR reconcile tutar uyuşmazlığı — payment=${row.id} oid=${candidateOid} ` +
                `paytr=${inquiry.paymentTotalTl} ours=${ourAmount}. Ödeme tamamlanmadı, manuel inceleme gerekir.`,
            );
            continue;
          }
          capturedOid = candidateOid;
          capturedInquiry = inquiry;
          break;
        }
        if (!capturedOid || !capturedInquiry) {
          continue;
        }

        const full = await this.prisma.payment.findUnique({
          where: { id: row.id },
          include: {
            order: { include: { buyer: true, seller: true, product: true } },
            checkoutGroup: {
              include: { orders: { select: { status: true } } },
            },
            tradeCashPayment: true,
          },
        });

        const orderStillPayable = full?.orderId
          ? full.order?.status === OrderStatus.pending_payment
          : (full?.checkoutGroup?.orders.some(
              (o) => o.status === OrderStatus.pending_payment,
            ) ?? false);

        if (
          !full ||
          full.status !== PaymentStatus.pending ||
          !orderStillPayable
        ) {
          continue;
        }

        const txnRef =
          capturedInquiry.paymentDate != null &&
          capturedInquiry.paymentDate !== ""
            ? `paytr:${capturedOid}:${capturedInquiry.paymentDate}`
            : `paytr:${capturedOid}`;

        const did = await this.paymentFulfillment.processSuccessfulPayment(
          full,
          txnRef,
          capturedOid, // FLOW-M5: çekilen oid'i providerConversationId'ye senkronla
        );
        if (did) {
          completed++;
          this.logger.log(
            `PayTR reconcile completed payment ${row.id} oid=${capturedOid}`,
          );
        }
      } catch (error: any) {
        this.logger.error(
          `PayTR reconcile failed payment ${row.id}: ${error?.message}`,
        );
      }
    }

    return { checked, completed };
  }

  /**
   * FLOW-M3 (2.1): `failed` işaretli ama PayTR'da GERÇEKTEN çekilmiş ödemeleri (orphan
   * capture) yakalar. Bir ödeme 3DS/callback yarışında `failed` olabilir ama para çekilmiş
   * olabilir → sipariş fulfil edilmez, iade edilmez, para havada kalır. TÜM oid'leri tarar;
   * capture bulursa:
   *  - sipariş hâlâ ödenebilir (pending_payment) → CAS ile failed→pending resetleyip TAMAMLA (telafi),
   *  - değilse (iptal/gitmiş) → yüksek-öncelik ALARM (ORPHAN_CAPTURE_REVIEW). Sipariş fulfil
   *    edilemeyen capture'ın OTO-İADESİ bilerek Faz 4'e bırakıldı (cron-tetikli para iadesi riski).
   * Cache dedup: aynı failed ödemeyi her turda PayTR'ye sormamak için 6s. Trade-cash orphan'ı
   * ayrı ele alınır (bu tarama order/grup ile sınırlı).
   */
  async detectOrphanCapturedFailedPayments(): Promise<{
    checked: number;
    recovered: number;
    alarms: number;
  }> {
    const enabled = this.configService.get("PAYTR_RECONCILIATION_ENABLED");
    if (enabled === "false" || enabled === "0") {
      return { checked: 0, recovered: 0, alarms: 0 };
    }
    const lookbackH = parseInt(
      this.configService.get("PAYTR_ORPHAN_LOOKBACK_HOURS") || "72",
      10,
    );
    const batch = parseInt(
      this.configService.get("PAYTR_RECONCILIATION_BATCH_LIMIT") || "40",
      10,
    );
    const tolerance = parseFloat(
      this.configService.get("PAYTR_RECONCILE_AMOUNT_TOLERANCE_TL") || "0.05",
    );
    const since = new Date();
    since.setHours(since.getHours() - lookbackH);

    const candidates = await this.prisma.payment.findMany({
      where: {
        provider: "paytr",
        status: PaymentStatus.failed,
        providerConversationId: { not: null },
        updatedAt: { gt: since },
        OR: [{ orderId: { not: null } }, { checkoutGroupId: { not: null } }],
      },
      take: batch,
      orderBy: { updatedAt: "desc" },
    });

    let checked = 0;
    let recovered = 0;
    let alarms = 0;
    for (const row of candidates) {
      const dedupKey = `orphan-checked:${row.id}`;
      if (await this.cache.get<boolean>(dedupKey)) continue;
      checked++;
      const ourAmount = Number(row.amount);
      try {
        const oids = this.paymentCommon.collectPaymentOids(row);
        let capturedOid: string | null = null;
        let capturedInquiry: {
          paymentTotalTl: number;
          paymentDate?: string | null;
        } | null = null;
        for (const oid of oids) {
          const inquiry = await this.paymentProviders
            .resolve()
            .queryPaymentStatus(oid);
          if (!inquiry.ok) continue;
          if (Math.abs(inquiry.paymentTotalTl - ourAmount) > tolerance)
            continue;
          capturedOid = oid;
          capturedInquiry = inquiry;
          break;
        }
        // Her sonuçta dedup yaz (captured değilse 6s tekrar sorma; captured+alarm ise
        // 6s'de bir tekrar-alarm makul; captured+telafi ise satır completed olur zaten).
        await this.cache.set(dedupKey, true, { ttl: 6 * 60 * 60 });

        if (!capturedOid || !capturedInquiry) continue;

        const full = await this.prisma.payment.findUnique({
          where: { id: row.id },
          include: {
            order: { include: { buyer: true, seller: true, product: true } },
            checkoutGroup: {
              include: { orders: { select: { status: true } } },
            },
            tradeCashPayment: true,
          },
        });
        const orderStillPayable = full?.orderId
          ? full.order?.status === OrderStatus.pending_payment
          : (full?.checkoutGroup?.orders.some(
              (o) => o.status === OrderStatus.pending_payment,
            ) ?? false);

        if (orderStillPayable) {
          // TELAFİ: CAS ile failed→pending resetle, sonra tamamla (capture doğrulandı).
          const reset = await this.prisma.payment.updateMany({
            where: { id: row.id, status: PaymentStatus.failed },
            data: { status: PaymentStatus.pending },
          });
          if (reset.count === 0) continue; // arada değişti
          const fresh = await this.prisma.payment.findUnique({
            where: { id: row.id },
            include: {
              order: { include: { buyer: true, seller: true, product: true } },
              checkoutGroup: {
                include: { orders: { select: { status: true } } },
              },
              tradeCashPayment: true,
            },
          });
          const txnRef =
            capturedInquiry.paymentDate != null &&
            capturedInquiry.paymentDate !== ""
              ? `paytr:${capturedOid}:${capturedInquiry.paymentDate}`
              : `paytr:${capturedOid}`;
          const did = await this.paymentFulfillment.processSuccessfulPayment(
            fresh,
            txnRef,
            capturedOid,
          );
          if (did) {
            recovered++;
            this.logger.warn(
              `ORPHAN_CAPTURE_RECOVERED: failed işaretli ama PayTR'da çekilmiş ödeme telafi edildi ` +
                `payment=${row.id} oid=${capturedOid}`,
            );
          }
        } else {
          // Sipariş gitmiş → fulfil edilemez. Oto-iade RİSKLİ (Faz 4). Yüksek öncelik ALARM.
          alarms++;
          this.logger.error(
            `ORPHAN_CAPTURE_REVIEW: PayTR'da ÇEKİLMİŞ ama sipariş fulfil EDİLEMEZ (iptal/gitmiş) — ` +
              `payment=${row.id} oid=${capturedOid} tutar=${ourAmount}. MANUEL İADE gerekir.`,
          );
        }
      } catch (error: any) {
        this.logger.error(
          `detectOrphanCapturedFailedPayments payment ${row.id}: ${error?.message}`,
        );
      }
    }
    if (recovered > 0 || alarms > 0) {
      this.logger.warn(
        `Orphan capture taraması: ${recovered} telafi, ${alarms} manuel-inceleme (checked=${checked})`,
      );
    }
    return { checked, recovered, alarms };
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
      const meta = (p.metadata as Record<string, any>) || {};
      const inProgress =
        (meta.refundInProgressOrders as Record<string, unknown>) || {};
      const refunded = (meta.refundedOrders as Record<string, number>) || {};
      // Gerçekten takılı = marker'da var ama refundedOrders'ta yok (tx finalize etmedi).
      const stuckOrderIds = Object.keys(inProgress).filter(
        (oid) => !(oid in refunded),
      );
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

  /**
   * Cancel expired pending payments
   * Called by scheduler to automatically cancel payments older than timeout period
   */
  async cancelExpiredPayments() {
    // H1: Ödeme SATIRINI `failed` yapma penceresi, REZERVASYON serbest bırakma
    // penceresinden (PAYMENT_TIMEOUT_MINUTES=5dk) AYRIDIR ve PayTR 3DS oturumundan
    // (createDirectPayment timeout_limit=30dk) MUTLAKA UZUN olmalıdır.
    // Aksi halde: kullanıcı 3DS'i 5-30dk arası tamamlar → PayTR parayı çeker →
    // callback gelir ama bu cron payment'ı çoktan `failed` yapmıştır → CAS düşer →
    // çekilen para sipariş'e bağlanmaz, iade yok (orphan capture). Pencereyi
    // PayTR oturum süresi + grace üstüne çekerek bu yarışı kökten kapatıyoruz.
    // Stok zaten 5dk'da releaseExpiredOrderReservations ile boşaldığı için bu
    // gecikme stok'u bağlamaz; sadece terk edilen payment satırı daha geç failed olur.
    const timeoutMinutes = parseInt(
      this.configService.get("PAYMENT_FAIL_TIMEOUT_MINUTES") || "35",
      10,
    );
    const timeoutDate = new Date();
    timeoutDate.setMinutes(timeoutDate.getMinutes() - timeoutMinutes);

    // H2 self-heal: `processing` claim'i normalde çekim süresince (saniyeler) tutulur ve
    // processDirectPayment finally'sinde `pending`'e döner. Süreç çekim ortasında çökerse
    // (hard kill) claim `processing`'de takılı kalır. 5dk'dan eski `processing` ödemeleri
    // `pending`'e döndürerek yeniden denenebilir/işlenebilir hale getir (callback CAS pending bekler).
    const staleProcessing = new Date();
    staleProcessing.setMinutes(staleProcessing.getMinutes() - 5);
    await this.prisma.payment.updateMany({
      where: {
        status: PaymentStatus.processing,
        updatedAt: { lt: staleProcessing },
      },
      data: { status: PaymentStatus.pending },
    });

    // Find pending payments older than timeout
    const expiredPayments = await this.prisma.payment.findMany({
      where: {
        status: PaymentStatus.pending,
        createdAt: {
          lt: timeoutDate,
        },
      },
      include: {
        order: {
          include: {
            buyer: { select: { id: true, email: true, displayName: true } },
          },
        },
        checkoutGroup: {
          include: {
            orders: {
              select: {
                id: true,
                orderNumber: true,
                status: true,
                paymentExpiresAt: true,
              },
            },
          },
        },
      },
    });

    let cancelledCount = 0;

    for (const payment of expiredPayments) {
      try {
        // Trade cash vb. siparişsiz/grupsuz ödemeleri bu cron'da atlama (eski davranış order'a bağlıydı)
        if (!payment.order && !payment.checkoutGroup) {
          continue;
        }

        // FLOW-H2: Fail penceresini `createdAt` yerine son 3DS charge-start'ından say.
        // Kullanıcı initiate'ten çok sonra 3DS'e girdiyse (createdAt eski, charge yeni)
        // canlı oturum hâlâ açıktır → bu payment'ı `failed` YAPMA (orphan capture).
        // Bir sonraki turda charge penceresi kapanınca failed edilir.
        if (this.isChargeLikelyLive(payment.metadata)) {
          continue;
        }

        // Split-window contract: if the parent order is still in pending_payment
        // and its 24h paymentExpiresAt has not yet passed, only fail the Payment
        // row. The order stays alive so the buyer can hit initiate again and a
        // new Payment row is created. The 30-min reservation cron and the 24h
        // kill-switch handle stock + order state independently.
        // Grup ödemesi: gruptaki HERHANGİ bir sipariş canlıysa ödeme yeniden başlatılabilir.
        const now = new Date();
        const orderStillAlive = payment.order
          ? payment.order.status === OrderStatus.pending_payment &&
            payment.order.paymentExpiresAt > now
          : payment.checkoutGroup!.orders.some(
              (o) =>
                o.status === OrderStatus.pending_payment &&
                o.paymentExpiresAt > now,
            );

        // H3: Atomik CAS — yalnızca HÂLÂ `pending` olan ödemeyi `failed` yap.
        // findMany (snapshot) ile bu update arasında gerçek bir başarı callback'i
        // ödemeyi `completed` yapmış olabilir; CAS'sız `update` bunu `failed`'a
        // ezerdi (TOCTOU → ödenmiş sipariş bozulur). count===0 ise ödeme bu turda
        // tamamlandı/işlendi demektir; stok/iade cleanup'ını ÇALIŞTIRMA, atla.
        const failedClaim = await this.prisma.payment.updateMany({
          where: { id: payment.id, status: PaymentStatus.pending },
          data: {
            status: PaymentStatus.failed,
            failureReason: `Ödeme ${timeoutMinutes} dakika içinde tamamlanmadığı için otomatik olarak iptal edildi`,
          },
        });
        if (failedClaim.count === 0) {
          continue;
        }

        if (!orderStillAlive) {
          // Order has been cancelled (or 24h passed): release stock + cleanup.
          if (payment.order) {
            await this.paymentFulfillment.releaseProductForFailedPayment(
              payment.orderId,
            );
            await this.paymentCommon.cancelSuratShipmentIfExists(
              payment.orderId,
              payment.order.orderNumber,
            );
          } else {
            for (const groupOrder of payment.checkoutGroup!.orders) {
              await this.paymentFulfillment.releaseProductForFailedPayment(
                groupOrder.id,
              );
              await this.paymentCommon.cancelSuratShipmentIfExists(
                groupOrder.id,
                groupOrder.orderNumber,
              );
            }
          }
        }

        // Emit payment.failed event (grup ödemesinde alıcı bilgisi sipariş bazında olmadığından atlanır; log yeterli)
        if (payment.order) {
          try {
            await this.eventService.emitPaymentFailed({
              paymentId: payment.id,
              orderId: payment.orderId,
              orderNumber: payment.order.orderNumber,
              buyerId: payment.order.buyerId,
              buyerEmail: payment.order.buyer.email,
              buyerName:
                payment.order.buyer.displayName || payment.order.buyer.email,
              amount: Number(payment.amount),
              provider: payment.provider,
              failureReason: `Ödeme ${timeoutMinutes} dakika içinde tamamlanmadığı için otomatik olarak iptal edildi`,
            });
          } catch (error) {
            // Log but don't fail
            this.logger.error(
              `Failed to emit payment.failed event for payment ${payment.id}: ${error}`,
            );
          }
        }

        cancelledCount++;
        this.logger.log(
          `Cancelled expired payment ${payment.id} for ${payment.order ? `order ${payment.order.orderNumber}` : `group ${payment.checkoutGroupId}`}`,
        );
      } catch (error: any) {
        this.logger.error(
          `Failed to cancel expired payment ${payment.id}: ${error.message}`,
        );
      }
    }

    return { count: cancelledCount };
  }
}
