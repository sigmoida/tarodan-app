import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
  Optional,
} from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { isShipmentHandedToCarrier } from "../shipping/shipment-handover";
import { i18nMessage } from "../i18n";
import { CacheService } from "../cache/cache.service";
import { CancelOrderDto, GuestOrderCancelDto } from "./dto";
import { OrderStatus, OfferStatus, RefundRequestStatus } from "@prisma/client";
import { getAvailableQuantity } from "../product/helpers/product-availability.helper";
import { ProductLockService } from "../product/lock/product-lock.service";
import { NotificationService } from "../notification/notification.service";
import { CommissionLedgerService } from "../commission/commission-ledger.service";
import { ElogoInvoicingService } from "../elogo";
import { OrderCommonService } from "./order-common.service";
import { OrderQueryService } from "./order-query.service";
import { DiscountService } from "../discount/discount.service";
import { RefundService } from "../refund/refund.service";
import { PUBLIC_NAME_SELECT } from "../../common/helpers/public-identity";
import { paymentWindowEnd } from "../payment/helpers/payment.constants";

/**
 * Sipariş yaşam döngüsü (adres güncelleme, durum geçişleri, tamamlama/onay,
 * iptal, yeniden aktive etme, hazırlama/teslim onayı) — OrderService'ten
 * birebir taşındı. OrderService aynı imzalarla buraya delege eder.
 */
@Injectable()
export class OrderLifecycleService {
  private readonly logger = new Logger(OrderLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly notificationService: NotificationService,
    private readonly productLockService: ProductLockService,
    private readonly commissionLedger: CommissionLedgerService,
    private readonly orderCommon: OrderCommonService,
    private readonly orderQuery: OrderQueryService,
    private readonly elogoInvoicing: ElogoInvoicingService,
    @Optional() private readonly discountService?: DiscountService,
    private readonly refundService?: RefundService,
  ) {}

  /**
   * Set shipping address on an existing order (buyer only, pending_payment).
   * Used when completing payment for offer-accepted orders that had no address at creation.
   */
  async setShippingAddress(
    orderId: string,
    userId: string,
    dto: {
      fullName: string;
      phone: string;
      city: string;
      district: string;
      address: string;
      zipCode?: string;
    },
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        product: { include: { images: { take: 1 } } },
        buyer: true,
        seller: true,
        shipment: true,
        payment: true,
      },
    });
    if (!order)
      throw new NotFoundException(i18nMessage("server.order.notFound"));
    if (order.buyerId !== userId)
      throw new ForbiddenException(
        i18nMessage("server.order.setAddressForbidden"),
      );
    if (order.status !== OrderStatus.pending_payment) {
      throw new BadRequestException(
        i18nMessage("server.order.addressOnlyPendingPayment"),
      );
    }
    const shippingAddress = {
      fullName: dto.fullName.trim(),
      phone: dto.phone.trim(),
      city: dto.city.trim(),
      district: dto.district.trim(),
      address: dto.address.trim(),
      zipCode: dto.zipCode?.trim() || null,
    };
    await this.prisma.order.update({
      where: { id: orderId },
      data: { shippingAddress: shippingAddress as any },
    });
    return this.orderCommon.formatOrderResponse(
      { ...order, shippingAddress },
      userId,
    );
  }

  /**
   * 48h pencere ortak tamamlama. Spec Bölüm 6.4.
   * Atomik: status guard + open-refund guard + ledger.markEarned.
   */
  async completeOrder(
    orderId: string,
    type: "manual_ok" | "auto_timeout" | "admin_force",
    /** admin_force gerekçesi — bildirim payload'una taşınır (matris sözü). */
    reason?: string,
  ): Promise<{ completed: boolean }> {
    const result = await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`;
      const openRefund = await tx.refundRequest.findFirst({
        where: {
          orderId,
          status: {
            in: [
              RefundRequestStatus.pending_review,
              RefundRequestStatus.approved,
              RefundRequestStatus.wait_for_delivery,
              RefundRequestStatus.return_shipment_open,
              RefundRequestStatus.return_in_transit,
              RefundRequestStatus.return_delivered,
              RefundRequestStatus.disputed,
            ],
          },
        },
        select: { id: true },
      });
      if (openRefund) {
        throw new BadRequestException(
          i18nMessage("server.order.openRefundExists"),
        );
      }

      const updated = await tx.order.updateMany({
        where: { id: orderId, status: OrderStatus.awaiting_buyer_confirmation },
        data: {
          status: OrderStatus.completed,
          completedAt: now,
          buyerConfirmedAt: now,
          buyerConfirmationType: type as any,
          version: { increment: 1 },
        },
      });

      if (updated.count === 0) {
        this.logger.warn(
          `completeOrder noop: order ${orderId} not in awaiting_buyer_confirmation`,
        );
        return { completed: false };
      }

      const ledgerResult = await this.commissionLedger.markEarned(orderId, tx);
      if (!ledgerResult.updated) {
        this.logger.warn(
          `completeOrder: ledger not in pending for order ${orderId}`,
        );
      }

      // YENİ ESCROW KURALI: completeOrder artık PaymentHold'u SERBEST BIRAKMAZ.
      // Satıcı payout'u tek otoriteden (releaseHoldsDue cron) ve yalnızca
      // teslim + returnWindow + grace dolunca + açık iade yokken yapılır. Alıcı
      // onayı / 48h auto-timeout payout'u erkene ALMAZ; ledger 'earned' yalnızca
      // muhasebe işaretidir (fiili ödeme = hold release).
      this.logger.log(
        `Order ${orderId} completed (type=${type}); ledger=${ledgerResult.updated}; hold release escrow cron'a bırakıldı`,
      );
      return { completed: true };
    });

    // Tx commit sonrası bildirimler (non-blocking). Faz 3B.3.
    if (result.completed) {
      try {
        const order = await this.prisma.order.findUnique({
          where: { id: orderId },
          select: { buyerId: true, sellerId: true },
        });
        if (order) {
          if (type === "manual_ok") {
            await this.notificationService
              .notifyOrderManuallyConfirmed(order.sellerId, orderId)
              .catch((e) =>
                this.logger.warn(`notify manual_ok failed: ${e.message}`),
              );
          } else if (type === "auto_timeout") {
            // Aynı bildirim iki tarafa gider; hedef ekran `audience` ile
            // ayrışır (alıcı `/profile/orders/:id`, satıcı `/seller/...`).
            await Promise.allSettled([
              this.notificationService.notifyOrderAutoCompleted(
                order.buyerId,
                orderId,
                "buyer",
              ),
              this.notificationService.notifyOrderAutoCompleted(
                order.sellerId,
                orderId,
                "seller",
              ),
            ]);
          } else if (type === "admin_force") {
            await Promise.allSettled([
              this.notificationService.notifyOrderForceCompletedByAdmin(
                order.buyerId,
                orderId,
                "buyer",
                reason,
              ),
              this.notificationService.notifyOrderForceCompletedByAdmin(
                order.sellerId,
                orderId,
                "seller",
                reason,
              ),
            ]);
          }
        }
      } catch (e: any) {
        this.logger.warn(
          `completeOrder post-commit notify error for ${orderId}: ${e?.message}`,
        );
      }

      // Tarodan gelir e-Arşivleri (komisyon → satıcı, hizmet bedeli → alıcı,
      // platform satışı → alıcı). SARMALAYICI üzerinden: tekil issue* çağrıları
      // `revenueInvoicedAt` işaretini KOYMUYORDU ve tam faturalı sipariş backfill
      // aday penceresinde yer tutmaya devam ediyordu. Fire-and-forget: sipariş
      // tamamlamayı BLOKLAMAZ; servis idempotent + retry cron'lu.
      void this.elogoInvoicing
        .issueOrderRevenueInvoices(orderId)
        .catch((e) =>
          this.logger.warn(
            `eLogo gelir faturaları tetik hatası ${orderId}: ${e?.message}`,
          ),
        );
    }

    return result;
  }

  /**
   * Alıcının "Sorun yok" erken onay endpoint'i. Spec Bölüm 6.2.
   */
  async confirmReceipt(
    orderId: string,
    userId: string,
  ): Promise<{ completed: boolean }> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, buyerId: true, status: true },
    });

    if (!order) {
      throw new NotFoundException(i18nMessage("server.order.notFound"));
    }
    if (order.buyerId !== userId) {
      throw new ForbiddenException(
        i18nMessage("server.order.confirmForbidden"),
      );
    }
    if (order.status !== OrderStatus.awaiting_buyer_confirmation) {
      throw new BadRequestException(
        i18nMessage("server.order.notConfirmableStatus", {
          status: order.status,
        }),
      );
    }

    const openRefund = await this.prisma.refundRequest.findFirst({
      where: {
        orderId,
        status: {
          in: [
            "pending_review",
            "approved",
            "wait_for_delivery",
            "return_shipment_open",
            "return_in_transit",
            "return_delivered",
            "disputed",
          ] as any,
        },
      },
      select: { id: true },
    });
    if (openRefund) {
      throw new BadRequestException(
        i18nMessage("server.order.openRefundExists"),
      );
    }

    return this.completeOrder(orderId, "manual_ok");
  }

  /**
   * Admin force-complete: awaiting_buyer_confirmation → completed.
   * Spec Bölüm 9.1. Audit log için reason parametresi.
   */
  async forceComplete(
    orderId: string,
    adminId: string,
    reason?: string,
  ): Promise<{ completed: boolean }> {
    this.logger.log(
      `Admin ${adminId} force-completing order ${orderId}. reason="${reason ?? ""}"`,
    );
    // Gerekçe bildirime de taşınır — eskiden yalnız log/audit'te kalıyordu,
    // kullanıcı payload'da hep undefined görüyordu.
    return this.completeOrder(orderId, "admin_force", reason);
  }

  /**
   * Admin 48h penceresini uzatır.
   * Spec Bölüm 9.1.
   */
  async extendConfirmation(
    orderId: string,
    adminId: string,
    hours: number,
    reason?: string,
  ): Promise<{ newDeadline: Date }> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, status: true, confirmationDeadline: true },
    });
    if (!order)
      throw new NotFoundException(i18nMessage("server.order.notFound"));
    if (order.status !== OrderStatus.awaiting_buyer_confirmation) {
      throw new BadRequestException(
        i18nMessage("server.order.extendOnlyWithinWindow"),
      );
    }

    const base = order.confirmationDeadline ?? new Date();
    const newDeadline = new Date(base.getTime() + hours * 3_600_000);
    await this.prisma.order.update({
      where: { id: orderId },
      data: { confirmationDeadline: newDeadline },
    });

    this.logger.log(
      `Admin ${adminId} extended confirmationDeadline of ${orderId} by ${hours}h → ${newDeadline.toISOString()} reason="${reason ?? ""}"`,
    );
    return { newDeadline };
  }

  /**
   * Cancel order
   * Business Rules:
   * - Only buyer can cancel
   * - Can only cancel before shipping
   * - If paid, triggers refund process
   */
  /**
   * Grup iptali (R4): iptal SEPET bazındadır. Tüm üyeler iptal edilebilir
   * olmalı — herhangi bir üye taşıyıcıya geçtiyse grup iptali TAMAMEN kapalıdır
   * (kısmi iptal yok; kalan kalemler teslim sonrası iade akışını kullanır).
   * Zaten iptal olmuş üyeler atlanır; kalanlar mevcut tekil iptal akışıyla
   * (ödeme iadesi dahil) sırayla iptal edilir.
   */
  async cancelGroup(groupId: string, userId: string, dto: CancelOrderDto) {
    const group = await this.prisma.checkoutGroup.findUnique({
      where: { id: groupId },
      include: {
        orders: {
          select: {
            id: true,
            status: true,
            shipment: { select: { status: true, shippedAt: true } },
          },
        },
      },
    });
    if (!group) {
      throw new NotFoundException(i18nMessage("server.order.groupNotFound"));
    }
    if (group.buyerId !== userId) {
      throw new ForbiddenException(i18nMessage("server.order.cancelForbidden"));
    }

    const cancellable = [
      OrderStatus.pending_payment,
      OrderStatus.paid,
      OrderStatus.preparing,
    ] as OrderStatus[];

    const remaining = group.orders.filter(
      (o) => o.status !== OrderStatus.cancelled,
    );
    if (remaining.length === 0) {
      throw new BadRequestException(
        i18nMessage("server.order.groupAlreadyCancelled"),
      );
    }
    // Devir tanımı TEK KAYNAK (shipment-handover): hareket eden durum VEYA
    // shippedAt mührü.
    const blocked = remaining.some(
      (o) =>
        !cancellable.includes(o.status) ||
        isShipmentHandedToCarrier(o.shipment ?? null),
    );
    if (blocked) {
      throw new BadRequestException(
        i18nMessage("server.order.groupCancelBlockedShipped"),
      );
    }

    // Sıralı iptal: her sipariş kendi atomik akışından geçer (stok, kupon,
    // grup ödemesine kısmi iade). Paralel çalıştırma kilit çakışması yaratır.
    for (const member of remaining) {
      await this.cancel(member.id, userId, dto);
    }

    return this.orderQuery.findCheckoutGroup(groupId, userId);
  }

  /**
   * Misafir iptali: üyeliksiz alıcı, sipariş numarası + e-posta ile kimliğini
   * doğrular (takip ucuyla aynı kural) ve ÜYE İPTALİYLE AYNI komuta düşer —
   * ayrı bir para yolu yoktur, dolayısıyla kesinti politikası, kargoya-devir
   * kilidi ve escrow davranışı birebir aynıdır.
   *
   * Gerekliydi: misafir siparişi sentetik bir alıcıya bağlıdır ve oturum
   * tabanlı uçlar bu kullanıcı için hiç çalışmaz; süreç dokümanının "alıcı,
   * kargoya verilene kadar iptal edebilir" taahhüdü misafirde karşılıksızdı.
   */
  async cancelAsGuest(dto: GuestOrderCancelDto) {
    const access = await this.orderQuery.resolveGuestOrderAccess({
      orderNumber: dto.orderNumber,
      email: dto.email,
    });
    return this.cancel(access.id, access.buyerId, {
      reasonCode: dto.reasonCode,
      reason: dto.reason,
    });
  }

  async cancel(orderId: string, userId: string, dto: CancelOrderDto) {
    const preflight = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { shipment: { select: { status: true, shippedAt: true } } },
    });
    if (!preflight) {
      throw new NotFoundException(i18nMessage("server.order.notFound"));
    }
    if (preflight.buyerId !== userId) {
      throw new ForbiddenException(i18nMessage("server.order.cancelForbidden"));
    }
    if (
      preflight.status === OrderStatus.paid ||
      preflight.status === OrderStatus.preparing
    ) {
      if (!dto?.reasonCode) {
        throw new BadRequestException(
          i18nMessage("server.order.cancelReasonRequired"),
        );
      }
      // Ön kontrol (net hata mesajı için); bağlayıcı doğrulama
      // createCancellationRefund içinde sipariş satırı KİLİTLİYKEN yapılır.
      if (isShipmentHandedToCarrier(preflight.shipment)) {
        throw new BadRequestException(
          i18nMessage("server.order.cancelAfterHandover"),
        );
      }
      if (!this.refundService) {
        throw new Error("RefundService is not available");
      }
      await this.refundService.createCancellationRefund(
        orderId,
        userId,
        dto.reasonCode,
        dto.reason,
      );
      return this.orderQuery.findOne(orderId, userId);
    }

    // Ödenmiş iptal/iade gerçek kupon kullanımını geri vermez. pending_payment
    // iptalinde ise yalnız geçici CouponReservation serbest bırakılır.
    let productIdToInvalidate: string | null = null;
    const result = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { product: true },
      });

      if (!order) {
        throw new NotFoundException(i18nMessage("server.order.notFound"));
      }
      productIdToInvalidate = order.productId;

      // Only buyer can cancel
      if (order.buyerId !== userId) {
        throw new ForbiddenException(
          i18nMessage("server.order.cancelForbidden"),
        );
      }

      // Erken dal paid/preparing'i tüketti (createCancellationRefund) — buraya
      // yalnız pending_payment ulaşmalı. Preflight ile tx arasında ödeme
      // tamamlandıysa (yarış) iptali burada sürdürmek PARAYI İADE ETMEDEN statü
      // yazmak olurdu; reddet — alıcı yeniden dener ve paid yolu iade
      // makinesiyle iptal eder.
      if (order.status !== OrderStatus.pending_payment) {
        throw new BadRequestException(
          i18nMessage("server.order.cannotCancelShipped"),
        );
      }

      // Ödenmemiş iptal: PSP'ye gidilmez, statü doğrudan cancelled olur.
      // cancellationType='iptal' raporlama/admin için "İADE değil İPTAL" der.
      const cancelReasonText =
        dto?.reason?.trim() || "Alıcı tarafından iptal edildi";
      const cancelledOrder = await tx.order.update({
        where: {
          id: orderId,
          version: order.version,
        },
        data: {
          status: OrderStatus.cancelled,
          cancellationType: "iptal",
          cancellationReasonCode: dto?.reasonCode,
          cancelReason: cancelReasonText,
          version: { increment: 1 },
        },
        include: {
          product: {
            include: {
              images: { take: 1, orderBy: { sortOrder: "asc" } },
            },
          },
          buyer: {
            select: {
              id: true,
              ...PUBLIC_NAME_SELECT,
              isVerified: true,
              avatarUrl: true,
            },
          },
          seller: {
            select: {
              id: true,
              ...PUBLIC_NAME_SELECT,
              isVerified: true,
              avatarUrl: true,
            },
          },
        },
      });

      // Rezervasyonu kaldır (sipariş adedi kadar serbest bırak).
      // GUARD: reservationReleasedAt doluysa rezervasyon 5dk cron (releaseExpiredOrder
      // Reservations) tarafından ZATEN bırakılmıştır; burada 2. kez düşmemeliyiz —
      // yoksa reservedQuantity negatife düşer (oversell).
      // CLAMP: GREATEST(...,0) ile atomik + 0'a sabitli (read-modify-write yarışına kapalı),
      // invalidatePendingOrdersForProduct'taki pattern ile aynı.
      // (pending_payment'ta quantity hiç düşmediği için stok geri-yükleme yoktur;
      // ödenmiş iptallerin stok geri-yüklemesi processRefund'da tek yazıcıdır.)
      if (!order.reservationReleasedAt) {
        await tx.$executeRaw`
          UPDATE "products"
          SET "reserved_quantity" = GREATEST("reserved_quantity" - ${order.quantity ?? 1}, 0)
          WHERE "id" = ${order.productId}
        `;
      }

      // Re-enable the offer (or mark as cancelled)
      if (order.offerId) {
        await tx.offer.update({
          where: { id: order.offerId },
          data: { status: OfferStatus.cancelled },
        });
      }

      // Ledger: paid/preparing'den iptalse pending → waived (Faz 3B.5).
      // pending_payment'da ledger henüz yaratılmamıştır (PaymentService.processSuccessfulPayment'da
      // upsert ediliyor); markWaived noop döner. Spec Bölüm 7.4 (buyer-initiated)
      // ile uyumlu — komisyon alınmaz çünkü iş tamamlanmadı.
      await this.commissionLedger.markWaived(orderId, "buyer_cancelled", tx);

      if (order.status === OrderStatus.pending_payment) {
        let reservationOrderIds = [order.id];
        let canRelease = true;
        if (order.checkoutGroupId) {
          const aliveSibling = await tx.order.findFirst({
            where: {
              checkoutGroupId: order.checkoutGroupId,
              status: OrderStatus.pending_payment,
              id: { not: order.id },
            },
            select: { id: true },
          });
          canRelease = !aliveSibling;
          if (canRelease) {
            const groupOrders = await tx.order.findMany({
              where: { checkoutGroupId: order.checkoutGroupId },
              select: { id: true },
            });
            reservationOrderIds = groupOrders.map((item) => item.id);
          }
        }
        if (canRelease) {
          await this.discountService?.releaseReservedUsageForOrders(
            reservationOrderIds,
            tx,
          );
        }
      }

      // Note: Refund will be handled by PaymentModule when status is 'refunded'

      return await this.orderCommon.formatOrderResponse(cancelledOrder, userId);
    });
    if (productIdToInvalidate) {
      await this.orderCommon.invalidateProductCaches(productIdToInvalidate);
    }
    return result;
  }

  /**
   * Reactivate a cancelled order that came from an accepted offer.
   * Allowed when: order is cancelled, has offerId, offer still accepted, product still available, user is buyer.
   * Used when the order was auto-cancelled by payment timeout; buyer can reopen to complete payment.
   */
  async reactivate(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { product: true, offer: true },
    });
    if (!order) {
      throw new NotFoundException(i18nMessage("server.order.notFound"));
    }
    if (order.buyerId !== userId) {
      throw new ForbiddenException(
        i18nMessage("server.order.reactivateForbidden"),
      );
    }
    if (order.status !== OrderStatus.cancelled) {
      throw new BadRequestException(
        i18nMessage("server.order.reactivateOnlyCancelled"),
      );
    }
    if (!order.offerId || !order.offer) {
      throw new BadRequestException(
        i18nMessage("server.order.reactivateNotFromOffer"),
      );
    }
    // O8: Ödeme zaman aşımı teklifi `payment_expired`'a çeker ("tekrar
    // ödenebilir" niyetiyle) ve siparişi iptal eder — bu ucun var olma sebebi
    // tam olarak o durumdur. Eskiden yalnız `accepted` kabul edildiği ve hiçbir
    // iptal yolu teklifi accepted bırakmadığı için uç HİÇ çalışamıyordu.
    // Alıcının kendi iptali (offer.status=cancelled) yeniden açılamaz.
    if (
      order.offer.status !== OfferStatus.accepted &&
      order.offer.status !== OfferStatus.payment_expired
    ) {
      throw new BadRequestException(
        i18nMessage("server.order.reactivateOfferNotAccepted"),
      );
    }
    const available = getAvailableQuantity(order.product);
    if (available !== null && available < 1) {
      throw new BadRequestException(
        i18nMessage("server.order.reactivateInsufficientStock"),
      );
    }

    await this.prisma.$transaction(async (tx) => {
      // Yeniden rezerve et (FOR UPDATE ile)
      await this.productLockService.checkAndReserve(tx, order.productId, 1);
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.pending_payment,
          // TAZE ödeme penceresi: sıfırlanmazsa süresi geçmiş paymentExpiresAt
          // yüzünden bir sonraki cron taraması siparişi anında yeniden iptal
          // ederdi. Pencere, teklif kabulündekiyle aynı (24 saat).
          paymentExpiresAt: paymentWindowEnd(),
          // Rezervasyon YUKARIDA tazelendi; bayrak temizlenmezse ödeme
          // başlatma "rezervasyon bırakılmış" dalına girip aynı adetleri
          // İKİNCİ kez rezerve eder (tekil üründe kalıcı stok-dışı görünüm).
          reservationReleasedAt: null,
          version: { increment: 1 },
        },
      });
      // Teklif tekrar "anlaşma" durumuna döner; ödeme tamamlanınca normal akış.
      if (order.offer!.status === OfferStatus.payment_expired) {
        await tx.offer.update({
          where: { id: order.offerId! },
          data: { status: OfferStatus.accepted },
        });
      }
    });

    return this.orderQuery.findOne(orderId, userId);
  }

  /**
   * Mark order as preparing (seller only)
   */
  async markAsPreparing(orderId: string, sellerId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException(i18nMessage("server.order.notFound"));
    }

    if (order.sellerId !== sellerId) {
      throw new ForbiddenException(i18nMessage("server.order.updateForbidden"));
    }

    if (order.status !== OrderStatus.paid) {
      throw new BadRequestException(
        i18nMessage("server.order.prepareOnlyPaid"),
      );
    }

    const updatedOrder = await this.prisma.order.update({
      where: {
        id: orderId,
        version: order.version,
      },
      data: {
        status: OrderStatus.preparing,
        version: { increment: 1 },
      },
      include: {
        product: {
          include: {
            images: { take: 1, orderBy: { sortOrder: "asc" } },
          },
        },
        buyer: {
          select: {
            id: true,
            ...PUBLIC_NAME_SELECT,
            isVerified: true,
            avatarUrl: true,
          },
        },
        seller: {
          select: {
            id: true,
            ...PUBLIC_NAME_SELECT,
            isVerified: true,
            avatarUrl: true,
          },
        },
        shipment: true,
      },
    });

    return await this.orderCommon.formatOrderResponse(updatedOrder, sellerId);
  }

  /**
   * Confirm delivery (buyer only)
   */
  async confirmDelivery(orderId: string, buyerId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException(i18nMessage("server.order.notFound"));
    }

    if (order.buyerId !== buyerId) {
      throw new ForbiddenException(
        i18nMessage("server.order.confirmForbidden"),
      );
    }

    if (order.status !== OrderStatus.delivered) {
      throw new BadRequestException(
        i18nMessage("server.order.confirmOnlyDelivered"),
      );
    }

    const updatedOrder = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`;
      const fresh = await tx.order.findUnique({ where: { id: orderId } });
      if (!fresh) {
        throw new NotFoundException(i18nMessage("server.order.notFound"));
      }
      if (fresh.buyerId !== buyerId) {
        throw new ForbiddenException(
          i18nMessage("server.order.confirmForbidden"),
        );
      }
      if (fresh.status !== OrderStatus.delivered) {
        throw new BadRequestException(
          i18nMessage("server.order.confirmOnlyDelivered"),
        );
      }
      const openRefund = await tx.refundRequest.findFirst({
        where: {
          orderId,
          status: {
            in: [
              RefundRequestStatus.pending_review,
              RefundRequestStatus.approved,
              RefundRequestStatus.wait_for_delivery,
              RefundRequestStatus.return_shipment_open,
              RefundRequestStatus.return_in_transit,
              RefundRequestStatus.return_delivered,
              RefundRequestStatus.disputed,
            ],
          },
        },
        select: { id: true },
      });
      if (openRefund) {
        throw new BadRequestException(
          i18nMessage("server.order.openRefundExists"),
        );
      }

      const now = new Date();
      const updated = await tx.order.update({
        where: {
          id: orderId,
          version: fresh.version,
        },
        data: {
          status: OrderStatus.completed,
          completedAt: now,
          buyerConfirmedAt: now,
          buyerConfirmationType: "manual_ok",
          version: { increment: 1 },
        },
        include: {
          product: {
            include: {
              images: { take: 1, orderBy: { sortOrder: "asc" } },
            },
          },
          buyer: {
            select: {
              id: true,
              ...PUBLIC_NAME_SELECT,
              isVerified: true,
              avatarUrl: true,
            },
          },
          seller: {
            select: {
              id: true,
              ...PUBLIC_NAME_SELECT,
              isVerified: true,
              avatarUrl: true,
            },
          },
          shipment: true,
        },
      });
      await this.commissionLedger.markEarned(orderId, tx);
      return updated;
    });

    // NOT: confirmDelivery satıcı payout'unu TETİKLEMEZ. Payout tek otoriteden
    // (releaseHoldsDue cron) ve yalnız releaseAt dolunca (=teslim+return+grace) yapılır;
    // releaseAt teslimde handleOrderDelivered ile set edilir, alıcı onayıyla değil.
    // Burada yalnız komisyon "earned" + e-Arşiv tetiklenir (muhasebe).

    // Tarodan gelir e-Arşivleri (komisyon → satıcı, hizmet bedeli → alıcı,
    // platform satışı → alıcı). SARMALAYICI üzerinden — tekil issue* çağrıları
    // `revenueInvoicedAt` işaretini koymuyordu (backfill pencere doygunluğu).
    // Fire-and-forget: tamamlamayı BLOKLAMAZ; servis idempotent + retry cron'lu.
    this.logger.log(
      `confirmDelivery: ${orderId} tamamlandı → e-Arşiv tetikleniyor (komisyon+hizmet+platform)`,
    );
    void this.elogoInvoicing
      .issueOrderRevenueInvoices(orderId)
      .catch((e) =>
        this.logger.warn(
          `eLogo gelir faturaları tetik hatası ${orderId}: ${e?.message}`,
        ),
      );

    return await this.orderCommon.formatOrderResponse(updatedOrder, buyerId);
  }

  /**
   * TESLİMDE Tarodan gelir e-Arşivlerini kes (komisyon→satıcı, hizmet bedeli→alıcı, platform satışı→alıcı)
   * + komisyonu 'earned' işaretle. YENİ MODEL: fatura teslim anında kesilir (yasal ≤7g); sipariş
   * "tamamlandı"ya iade penceresi kapanınca (teslim + RETURN_WINDOW_DAYS) geçer (processDeliveredOrders cron).
   * İdempotent: cut() (type,sourceId) tekil → cron tekrar çağırsa no-op. Fire-and-forget, akışı bloklamaz.
   */
  async emitDeliveryRevenueInvoices(orderId: string): Promise<void> {
    await this.commissionLedger
      .markEarned(orderId, this.prisma)
      .catch((e: any) =>
        this.logger.warn(`teslim markEarned hatası ${orderId}: ${e?.message}`),
      );
    // Faturalama + `revenueInvoicedAt` işareti TEK kaynakta (ElogoInvoicingService):
    // teslim yaşam-döngüsü, teslim tx'inin outbox görevi ve backfill cron'u aynı
    // metodu çağırır.
    await this.elogoInvoicing.issueOrderRevenueInvoices(orderId);
  }

  /**
   * İade penceresi kapanan (teslim + RETURN_WINDOW_DAYS) `delivered` siparişi 'tamamlandı'ya geçirir.
   * Fatura zaten teslimde kesildi; bu yalnız yaşam döngüsü kapanışı (status). Açık iade varsa cron atlar.
   */
  async autoCompleteDeliveredOrder(
    orderId: string,
  ): Promise<{ completed: boolean }> {
    const completed = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`;
      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: { status: true, version: true },
      });
      if (!order || order.status !== OrderStatus.delivered) return false;
      const openRefund = await tx.refundRequest.findFirst({
        where: {
          orderId,
          status: {
            in: [
              RefundRequestStatus.pending_review,
              RefundRequestStatus.approved,
              RefundRequestStatus.wait_for_delivery,
              RefundRequestStatus.return_shipment_open,
              RefundRequestStatus.return_in_transit,
              RefundRequestStatus.return_delivered,
              RefundRequestStatus.disputed,
            ],
          },
        },
        select: { id: true },
      });
      if (openRefund) return false;

      await tx.order.update({
        where: { id: orderId, version: order.version },
        data: {
          status: OrderStatus.completed,
          completedAt: new Date(),
          buyerConfirmationType: "auto_timeout",
          version: { increment: 1 },
        },
      });
      await this.commissionLedger.markEarned(orderId, tx);
      return true;
    });
    if (!completed) return { completed: false };
    // Emniyet: teslimde kesilmemişse burada da tetikle (idempotent).
    await this.emitDeliveryRevenueInvoices(orderId);
    // İki tarafa da haber ver — 48h bayraklı eski yol (completeOrder
    // auto_timeout) bildirim gönderiyordu, aktif yol sessiz kalıyordu.
    const parties = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { buyerId: true, sellerId: true },
    });
    if (parties && this.notificationService) {
      await Promise.allSettled([
        this.notificationService.notifyOrderAutoCompleted(
          parties.buyerId,
          orderId,
          "buyer",
        ),
        this.notificationService.notifyOrderAutoCompleted(
          parties.sellerId,
          orderId,
          "seller",
        ),
      ]);
    }
    this.logger.log(
      `Order ${orderId} auto-completed (iade penceresi kapandı: teslim + returnWindow)`,
    );
    return { completed: true };
  }
}
