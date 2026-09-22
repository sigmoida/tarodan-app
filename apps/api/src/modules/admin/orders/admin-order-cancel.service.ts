import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  preShipmentCancelBlocker,
  type AdminOrderCancelPreview,
  type AdminOrderCancelResult,
  type PreShipmentCancelBlocker,
} from "@tarodan/types";
import { PrismaService } from "../../../prisma";
import { AdminAuditService } from "../ops/admin-audit.service";
import { RefundService } from "../../refund/refund.service";
import { OrderService } from "../../order/order.service";
import { ACTIVE_REFUND_REQUEST_STATUSES } from "../../refund/helpers/refund-active-statuses";
import { i18nMessage } from "../../i18n";
import { errorMessage } from "../../../common/helpers/error-message";
import { AdminCancelOrderDto } from "../dto";

/**
 * Engel → admin'e gösterilen hata. `handed_over` iade talebi akışına,
 * `pending_cancellation` yarıda kalmış iptalin talebine yönlendirir.
 */
const BLOCKER_ERRORS: Record<
  PreShipmentCancelBlocker,
  (ctx: {
    refundNumber: string | null;
  }) => BadRequestException | ConflictException
> = {
  not_paid: () =>
    new BadRequestException(i18nMessage("server.admin.order.cancelNotPaid")),
  closed: () =>
    new ConflictException(
      i18nMessage("server.admin.order.cancelAlreadyClosed"),
    ),
  active_refund: () =>
    new ConflictException(i18nMessage("server.admin.order.cancelActiveRefund")),
  // Önceki iptal denemesi talebi açtı ama para yolu yarıda kaldı (PSP hatası
  // vb.): talep İade Talepleri'nde elle tamamlanmayı bekler.
  pending_cancellation: ({ refundNumber }) =>
    new ConflictException(
      i18nMessage("server.admin.order.cancelPendingManualCompletion", {
        refundNumber: refundNumber ?? "—",
      }),
    ),
  handed_over: () =>
    new BadRequestException(
      i18nMessage("server.admin.order.cancelAfterHandover"),
    ),
};

/**
 * Admin "Siparişi iptal et" — kargo öncesi, SİPARİŞ (sepet kalemi) başına
 * platform iptali. Para yolu yazılmaz: alıcı iptaliyle AYNI çekirdek
 * (RefundService.createPlatformCancellationRefund) talebi açar, v2 bileşenleri
 * kesinleştirir, processRefund ile iade eder (stok, teklif, defter, fatura
 * düzeltmesi, kargo iptali outbox'ı dahil). Burada yalnız uygunluk ön
 * kontrolü (panelle ORTAK kural, `@tarodan/types`), denetim kaydı ve önbellek
 * tazelemesi yaşar.
 */
@Injectable()
export class AdminOrderCancelService {
  private readonly logger = new Logger(AdminOrderCancelService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
    private readonly refundService: RefundService,
    private readonly orderService: OrderService,
  ) {}

  async previewCancel(orderId: string): Promise<AdminOrderCancelPreview> {
    await this.loadCancellableOrder(orderId);
    return this.refundService.previewPlatformCancellationRefund(orderId);
  }

  async cancelOrder(
    adminId: string,
    orderId: string,
    dto: AdminCancelOrderDto,
  ): Promise<AdminOrderCancelResult> {
    const reason = dto.reason.trim();
    if (!reason) {
      throw new BadRequestException(
        i18nMessage("server.admin.order.cancelReasonRequired"),
      );
    }
    const order = await this.loadCancellableOrder(orderId);
    const before = {
      status: order.status,
      cancellationType: order.cancellationType,
      cancelReason: order.cancelReason,
      shipmentStatus: order.shipment?.status ?? null,
      checkoutGroupId: order.checkoutGroupId,
      totalAmount: Number(order.totalAmount),
    };

    // Bağlayıcı kontrol (satır kilidi + aktif-talep tekil indeksi +
    // talep-bazlı idempotency anahtarı) çekirdektedir: çift tık / eşzamanlı
    // iptal ikinci talebi açamaz, ikinci kez para çıkmaz.
    const refund = await this.refundService
      .createPlatformCancellationRefund(orderId, adminId, reason)
      .catch(async (error: unknown) => {
        // Para hareketi başlamış olabilir (ör. PSP sonucu mutabakat
        // bekliyor): başarısız deneme de denetim izine girer. Best-effort —
        // asıl hata maskelenmez.
        await this.audit.createAuditLog(
          adminId,
          "order_cancel_failed",
          "Order",
          orderId,
          before,
          { reason, error: errorMessage(error) },
        );
        throw error;
      });

    await this.audit.createRequiredAuditLog(
      adminId,
      "order_cancel",
      "Order",
      orderId,
      before,
      {
        status: "cancelled",
        cancellationType: "iptal",
        cancelReason: reason,
        reason,
        refundRequestId: refund.id,
        refundNumber: refund.refundNumber,
        refundAmount: Number(refund.amount),
        refundStatus: refund.status,
      },
    );

    // Stok processRefund'da geri yüklendi; ürün sayfası önbelleği tazelensin.
    await this.orderService
      .invalidateProductCaches(order.productId)
      .catch((error: unknown) =>
        this.logger.warn(
          `order ${orderId} admin-cancel cache invalidation failed: ${errorMessage(error)}`,
        ),
      );

    return {
      orderId,
      refundRequestId: refund.id,
      refundNumber: refund.refundNumber,
      refundAmount: Number(refund.amount),
    };
  }

  /**
   * Düz okumayla uygunluk ön kontrolü — net hata mesajı için. Panel aynı
   * kuralla (preShipmentCancelBlocker) düğmeyi gösterir/gizler.
   */
  private async loadCancellableOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        productId: true,
        cancellationType: true,
        cancelReason: true,
        checkoutGroupId: true,
        totalAmount: true,
        shipment: { select: { status: true, shippedAt: true } },
        refundRequests: {
          where: { status: { in: ACTIVE_REFUND_REQUEST_STATUSES } },
          select: { id: true, refundNumber: true },
          take: 1,
        },
      },
    });
    if (!order) {
      throw new NotFoundException(i18nMessage("server.order.notFound"));
    }
    const blocker = preShipmentCancelBlocker({
      status: order.status,
      shipment: order.shipment,
      hasActiveRefund: order.refundRequests.length > 0,
    });
    if (blocker) {
      throw BLOCKER_ERRORS[blocker]({
        refundNumber: order.refundRequests[0]?.refundNumber ?? null,
      });
    }
    return order;
  }
}
