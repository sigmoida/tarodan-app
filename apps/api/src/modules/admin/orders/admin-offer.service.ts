import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { OfferStatus, OrderStatus } from "@prisma/client";
import { PrismaService } from "../../../prisma";
import { AdminAuditService } from "../ops/admin-audit.service";
import { OrderService } from "../../order/order.service";
import { NotificationService } from "../../notification/notification.service";
import { AdminCancelOfferDto } from "../dto";
import { AdminOfferQueryService } from "./admin-offer-query.service";
import { offerAdminCancelReason } from "../../trade/helpers/trade-cancel-reasons";
import { i18nMessage } from "../../i18n";

/**
 * Admin teklif müdahalesi: iptal. Yalnız `pending` veya ödenmemiş `accepted`
 * teklif iptal edilir; bağlı ödeme bekleyen sipariş de aynı tx'te kapanır
 * (alıcı iptaliyle aynı yardımcı: rezervasyon, ledger, kupon). Ödenmiş sipariş
 * → 400 (iade akışı kullanılmalı).
 */
@Injectable()
export class AdminOfferService {
  private readonly logger = new Logger(AdminOfferService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
    private readonly orderService: OrderService,
    private readonly notificationService: NotificationService,
    private readonly query: AdminOfferQueryService,
  ) {}

  async cancelOffer(
    adminId: string,
    offerId: string,
    dto: AdminCancelOfferDto,
  ) {
    const reasonText = offerAdminCancelReason(dto.reason);

    const result = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT o.id FROM "offers" o WHERE o.id = ${offerId} FOR UPDATE
      `;
      if (!locked.length) {
        throw new NotFoundException(i18nMessage("server.offer.offerNotFound"));
      }
      const offer = await tx.offer.findUnique({
        where: { id: offerId },
        include: {
          product: { select: { id: true, title: true } },
          order: {
            select: {
              id: true,
              status: true,
              version: true,
              quantity: true,
              productId: true,
              offerId: true,
              checkoutGroupId: true,
              reservationReleasedAt: true,
            },
          },
        },
      });
      if (!offer) {
        throw new NotFoundException(i18nMessage("server.offer.offerNotFound"));
      }
      // payment_expired: sipariş iptal ama alıcı "Ödemeyi tamamla" ile
      // canlandırabilir (reactivate) — yönetici bu anlaşmayı da kapatabilmeli.
      if (
        offer.status !== OfferStatus.pending &&
        offer.status !== OfferStatus.accepted &&
        offer.status !== OfferStatus.payment_expired
      ) {
        throw new BadRequestException(
          i18nMessage("server.admin.offer.notCancellableStatus", {
            status: offer.status,
          }),
        );
      }
      if (
        offer.order &&
        offer.order.status !== OrderStatus.pending_payment &&
        offer.order.status !== OrderStatus.cancelled
      ) {
        throw new BadRequestException(
          i18nMessage("server.admin.offer.orderAlreadyPaid"),
        );
      }

      const before = {
        status: offer.status,
        cancelReason: offer.cancelReason,
        orderId: offer.order?.id ?? null,
        orderStatus: offer.order?.status ?? null,
      };

      await tx.offer.update({
        where: { id: offerId, version: offer.version },
        data: {
          status: OfferStatus.cancelled,
          cancelReason: reasonText,
          version: { increment: 1 },
        },
      });

      let cancelledOrderId: string | null = null;
      if (offer.order?.status === OrderStatus.pending_payment) {
        await this.orderService.cancelUnpaidOrderInTx(tx, offer.order, {
          reason: reasonText,
          ledgerReason: "admin_cancelled",
          skipOfferUpdate: true,
        });
        cancelledOrderId = offer.order.id;
      }

      return {
        before,
        buyerId: offer.buyerId,
        sellerId: offer.sellerId,
        productId: offer.productId,
        productTitle: offer.product.title,
        cancelledOrderId,
      };
    });

    if (result.cancelledOrderId) {
      await this.orderService.invalidateProductCaches(result.productId);
    }

    await this.audit.createRequiredAuditLog(
      adminId,
      "offer_cancel",
      "Offer",
      offerId,
      result.before,
      {
        status: OfferStatus.cancelled,
        cancelReason: reasonText,
        reason: dto.reason,
        cancelledOrderId: result.cancelledOrderId,
      },
    );

    try {
      const payload = {
        offerId,
        productId: result.productId,
        productTitle: result.productTitle,
        reason: dto.reason,
      };
      await Promise.all([
        this.notificationService.notifyOfferCancelledByAdmin(
          result.buyerId,
          payload,
        ),
        this.notificationService.notifyOfferCancelledByAdmin(
          result.sellerId,
          payload,
        ),
      ]);
    } catch (error) {
      this.logger.warn(
        `offer ${offerId} admin-cancel notification failed: ${error}`,
      );
    }

    return this.query.getOfferById(offerId);
  }
}
