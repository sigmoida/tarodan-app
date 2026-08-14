import { Injectable, Logger, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../../prisma";
import {
  PaymentStatus,
  PaymentHoldStatus,
  OrderStatus,
  OfferStatus,
  RefundRequestStatus,
} from "@prisma/client";
import {
  getProductStatusFromQuantity,
  getReservedAwareStatus,
} from "../../product/helpers/product-status.helper";
import { safeDecrementReserved } from "../../product/helpers/product-availability.helper";
import { CacheService } from "../../cache/cache.service";
import { NotificationService } from "../../notification/notification.service";
import { NotificationType } from "../../notification/dto/notification.dto";
import { CommissionLedgerService } from "../../commission/commission-ledger.service";
import { PaymentRefundService } from "../refund/payment-refund.service";
import { EventService } from "../../events";
import { PaymentCommonService } from "../payment-common.service";
import { PaymentFulfillmentService } from "../fulfillment/payment-fulfillment.service";
import { DiscountService } from "../../discount/discount.service";
import { isShipmentHandedToCarrier } from "../../shipping/helpers/shipment-handover";
import { ACTIVE_REFUND_REQUEST_STATUSES } from "../../refund/helpers/refund-active-statuses";
import {
  PUBLIC_NAME_SELECT,
  publicName,
} from "../../../common/helpers/public-identity";

// SEAM-B1: Paket Sürat'ta HAREKET ettiyse "satıcı göndermedi" DEĞİLDİR — böyle
// bir siparişi süre-doldu diye iptal+iade edersek alıcı hem malı hem parayı
// alır. Tanım artık iptal kapılarıyla ORTAK: shipment-handover.ts.

/**
 * Ödeme/sipariş süre-dolumu mutabakat süpürmeleri (cron). PaymentReconciliationService
 * facade'i aynı imzalarla buraya delege eder.
 */
@Injectable()
export class PaymentExpiryReconciliationService {
  private readonly logger = new Logger(PaymentExpiryReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly configService: ConfigService,
    private readonly notificationService: NotificationService,
    private readonly commissionLedger: CommissionLedgerService,
    private readonly paymentRefund: PaymentRefundService,
    private readonly eventService: EventService,
    private readonly paymentCommon: PaymentCommonService,
    private readonly paymentFulfillment: PaymentFulfillmentService,
    @Optional() private readonly discountService?: DiscountService,
  ) {}

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

  /**
   * 24h kill-switch: pending_payment siparişleri paymentExpiresAt geçtiğinde
   * iptal eder. Eğer rezerv hâlâ tutuluyorsa (cron 30dk pas'ı kaçırdıysa) önce
   * onu serbest bırakır. Bağlı offer payment_expired olur.
   */
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
      fromOffer: boolean;
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
          await tx.membershipPayment.updateMany({
            where: {
              orderId: order.id,
              status: {
                in: [PaymentStatus.pending, PaymentStatus.processing],
              },
            },
            data: {
              status: PaymentStatus.failed,
              idempotencyKey: null,
              metadata: {
                failureReason: "membership_payment_window_expired",
                failedAt: now.toISOString(),
              },
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
              const groupOrders = await tx.order.findMany({
                where: { checkoutGroupId: orderRow.checkoutGroupId },
                select: { id: true },
              });
              await this.discountService?.releaseReservedUsageForOrders(
                groupOrders.map((item) => item.id),
                tx,
              );
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
          } else {
            await this.discountService?.releaseReservedUsageForOrders(
              [order.id],
              tx,
            );
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
          // Teklif siparişinde teklif `payment_expired` olur ve alıcı siparişi
          // yeniden açabilir; bildirim metni bu hakkı söylemek zorunda.
          fromOffer: Boolean(order.offerId),
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
        .notifyOrderPaymentExpired(
          d.buyerId,
          d.orderId,
          d.productTitle,
          d.fromOffer,
        )
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
        seller: { select: { id: true, email: true, ...PUBLIC_NAME_SELECT } },
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
            // SATICIYA gider: hedef satıcının sipariş ekranı.
            audience: "seller",
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
        buyer: { select: { id: true, email: true, ...PUBLIC_NAME_SELECT } },
        seller: { select: { id: true, email: true, ...PUBLIC_NAME_SELECT } },
        product: { select: { id: true, title: true, quantity: true } },
      },
    });

    let cancelled = 0;
    for (const order of expiredOrders) {
      try {
        let skippedInMotion = false;
        // Kupon iadesi bildirimi tx İÇİNDE atılmaz; commit sonrası gönderilir.
        let restoredCoupons: { userId: string; code: string }[] = [];
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
          if (isShipmentHandedToCarrier(shipment)) {
            skippedInMotion = true;
            return;
          }

          // Cancel order — KARGO ÖNCESİ iptal olduğu için cancellationType
          // "iptal" yazılır: iade bildirimi bu sınıflandırmayla alıcıya
          // ORDER_CANCELLED, SATICIYA ORDER_CANCELLED_SELLER + iptal e-postası
          // gönderir. Eskiden tip yazılmadığından satıcıya iptalin kendisi hiç
          // bildirilmiyordu (yalnız "para iade edildi" çerçevesi gidiyordu).
          await tx.order.update({
            where: { id: order.id },
            data: {
              status: OrderStatus.cancelled,
              cancellationType: "iptal",
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

          // Kusur satıcıda: alıcının kupon hakkı yanmaz, geri verilir.
          const revoked = await this.discountService
            ?.revokeUsageForOrders([order.id], "cancel:seller_no_ship", tx)
            .catch((error) => {
              this.logger.warn(`kupon iadesi başarısız: ${error}`);
              return null;
            });
          restoredCoupons = revoked?.restoredCoupons ?? [];

          // İncelemede bekleyen alıcı iptal talebi varsa onu bu iptal DEVRALIR.
          // Sonuç para açısından zaten talebin isteyeceğinden iyidir (satıcı
          // kargolamadığı için kesintisiz TAM iade), ama talep kapatılmazsa
          // aktif kalıyor: admin sonradan onaylamayı denediğinde kümülatif iade
          // tavanına takılıp pending_review'a geri düşüyor ve sipariş sonsuza
          // dek "açık iade" görünüyordu (payout guard'ları da bu satıra bakar).
          const supersededAt = new Date();
          await tx.refundRequest.updateMany({
            where: {
              orderId: order.id,
              status: { in: ACTIVE_REFUND_REQUEST_STATUSES },
            },
            data: {
              status: RefundRequestStatus.cancelled,
              decidedAt: supersededAt,
              decidedBy: "system",
              sellerResponse:
                "Satıcı süresinde kargolamadığı için sipariş otomatik iptal edildi ve tam iade yapıldı; talep bu iptalle kapatıldı.",
            },
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

        // Kupon geri verildiyse haber ver — commit sonrası olduğumuz için doğru an.
        for (const coupon of restoredCoupons) {
          try {
            await this.notificationService.notifyCouponReturned(
              coupon.userId,
              coupon.code,
            );
          } catch (notifyErr: any) {
            this.logger.warn(
              `notify coupon-returned failed for ${order.id}: ${notifyErr?.message}`,
            );
          }
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
   * Cancel expired pending payments
   * Called by scheduler to automatically cancel payments older than timeout period
   */
  async cancelExpiredPayments() {
    // H1: Ödeme SATIRINI `failed` yapma penceresi, REZERVASYON serbest bırakma
    // penceresinden (PAYMENT_TIMEOUT_MINUTES=5dk) AYRIDIR ve PayTR 3DS oturumundan
    // (createDirectPaymentForm timeout_limit=30dk) MUTLAKA UZUN olmalıdır.
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
    // prepareDirectPayment finally'sinde `pending`'e döner. Süreç form hazırlarken çökerse
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
            buyer: { select: { id: true, email: true, ...PUBLIC_NAME_SELECT } },
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
              payment.order.id,
            );
            await this.paymentCommon.cancelSuratShipmentIfExists(
              payment.order.id,
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
              orderId: payment.order.id,
              orderNumber: payment.order.orderNumber,
              buyerId: payment.order.buyerId,
              buyerEmail: payment.order.buyer.email,
              buyerName: publicName(payment.order.buyer),
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
