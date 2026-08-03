import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Optional,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { StorageService } from "../storage/storage.service";
import { AdminAuditService } from "./admin-audit.service";
import { Prisma, PaymentStatus, TradeStatus } from "@prisma/client";
import { PaymentService } from "../payment/payment.service";
import { EventService } from "../events/event.service";
import { RefundService } from "../refund/refund.service";
import { RefundRequestQueryDto } from "./dto";
import { paginate, resolveOrderBy } from "../../common/list";
import { primaryCashPayment } from "../trade/trade.constants";

/**
 * İade talepleri admin operasyonları (liste/detay, force-finalize) +
 * takas tazminat kapatma ve takas iade yeniden deneme — AdminService'in
 * REFUND REQUEST ADMIN bölümünden birebir taşındı.
 * AdminService aynı imzalarla buraya delege eder.
 */
@Injectable()
export class AdminRefundService {
  private readonly logger = new Logger(AdminRefundService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
    private readonly paymentService: PaymentService,
    private readonly refundService: RefundService,
    private readonly eventService: EventService,
    @Optional()
    private readonly storageService: StorageService,
  ) {}

  // AdminService'teki leaf yardımcı ile birebir aynı (bilinçli kopya; facade'da
  // başka bölümler de kullandığı için oradan kaldırılamadı).
  private resolveProductImageUrl(
    imageKeyOrUrl: string | null | undefined,
  ): string | null {
    if (!imageKeyOrUrl) return null;
    // Strip expired presigned S3 query params to get the clean public URL
    if (
      (imageKeyOrUrl.startsWith("http://") ||
        imageKeyOrUrl.startsWith("https://")) &&
      imageKeyOrUrl.includes("X-Amz-Signature")
    ) {
      try {
        const parsed = new URL(imageKeyOrUrl);
        parsed.search = "";
        return parsed.toString();
      } catch {
        // fall through
      }
    }
    if (
      imageKeyOrUrl.startsWith("http://") ||
      imageKeyOrUrl.startsWith("https://") ||
      imageKeyOrUrl.startsWith("/")
    )
      return imageKeyOrUrl;
    // Try to resolve any non-URL string as an S3 key (covers dev/, prod/, and other prefixes)
    if (this.storageService) {
      return this.storageService.getPublicAssetUrl(imageKeyOrUrl) ?? null;
    }
    return null;
  }

  // ==================== REFUND REQUEST ADMIN ====================

  /**
   * List refund requests for admin operations queue.
   */
  async listRefundRequests(query: RefundRequestQueryDto) {
    const where: Prisma.RefundRequestWhereInput = {};
    if (query.status && query.status.length > 0) {
      where.status = { in: query.status };
    }
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = new Date(query.from);
      if (query.to) where.createdAt.lte = new Date(query.to);
    }
    if (query.userSearch && query.userSearch.trim().length > 0) {
      const term = query.userSearch.trim();
      where.OR = [
        { requester: { displayName: { contains: term, mode: "insensitive" } } },
        { requester: { email: { contains: term, mode: "insensitive" } } },
        {
          order: {
            seller: { displayName: { contains: term, mode: "insensitive" } },
          },
        },
        {
          order: { seller: { email: { contains: term, mode: "insensitive" } } },
        },
        {
          order: {
            orderNumber: { contains: term, mode: "insensitive" },
          },
        },
        {
          order: {
            product: { title: { contains: term, mode: "insensitive" } },
          },
        },
        { refundNumber: { contains: term, mode: "insensitive" } },
        { description: { contains: term, mode: "insensitive" } },
        {
          returnTrackingNumber: { contains: term, mode: "insensitive" },
        },
      ];
    }

    const orderBy =
      resolveOrderBy<Prisma.RefundRequestOrderByWithRelationInput>(
        "RefundRequest",
        query,
        { defaultSort: { createdAt: "desc" } },
      );
    const result = await paginate(
      this.prisma.refundRequest,
      {
        where,
        orderBy,
        include: {
          requester: { select: { id: true, displayName: true, email: true } },
          order: {
            select: {
              id: true,
              orderNumber: true,
              totalAmount: true,
              seller: { select: { id: true, displayName: true, email: true } },
              product: {
                select: {
                  id: true,
                  title: true,
                  images: {
                    take: 1,
                    orderBy: { sortOrder: "asc" },
                    select: { cardKey: true },
                  },
                },
              },
            },
          },
        },
      },
      query,
    );
    const data = result.data.map((rr: any) => {
      const product = rr?.order?.product;
      if (product) {
        product.images = (product.images ?? [])
          .map((img: any) => ({
            url: this.resolveProductImageUrl(img?.cardKey),
          }))
          .filter((img: any) => img.url);
      }
      return rr;
    });
    return { ...result, data };
  }

  async getRefundRequestDetail(refundRequestId: string) {
    const rr = await this.prisma.refundRequest.findUnique({
      where: { id: refundRequestId },
      include: {
        requester: {
          select: { id: true, displayName: true, email: true, phone: true },
        },
        order: {
          include: {
            seller: {
              select: { id: true, displayName: true, email: true, phone: true },
            },
            product: { include: { images: { orderBy: { sortOrder: "asc" } } } },
            payment: true,
            shipment: true,
          },
        },
      },
    });
    if (!rr) throw new NotFoundException("İade talebi bulunamadı");
    const product = (rr as any)?.order?.product;
    if (product) {
      product.images = (product.images ?? [])
        .map((img: any) => ({ url: this.resolveProductImageUrl(img?.cardKey) }))
        .filter((img: any) => img.url);
    }
    return rr;
  }

  async approveRefundRequest(
    adminId: string,
    refundRequestId: string,
    note?: string,
  ) {
    const before = await this.prisma.refundRequest.findUnique({
      where: { id: refundRequestId },
      select: { status: true, policyCode: true },
    });
    if (!before) throw new NotFoundException("İade talebi bulunamadı");
    const result = await this.refundService.adminApproveRefundRequest(
      refundRequestId,
      adminId,
      note,
    );
    await this.audit.createRequiredAuditLog(
      adminId,
      "refund_approved",
      "RefundRequest",
      refundRequestId,
      { status: before.status, policyCode: before.policyCode },
      { status: result.status, note: note?.trim() || null },
    );
    return result;
  }

  async rejectRefundRequest(
    adminId: string,
    refundRequestId: string,
    reason: string,
  ) {
    const before = await this.prisma.refundRequest.findUnique({
      where: { id: refundRequestId },
      select: { status: true, policyCode: true },
    });
    if (!before) throw new NotFoundException("İade talebi bulunamadı");
    const result = await this.refundService.adminRejectRefundRequest(
      refundRequestId,
      adminId,
      reason,
    );
    await this.audit.createRequiredAuditLog(
      adminId,
      "refund_rejected",
      "RefundRequest",
      refundRequestId,
      { status: before.status, policyCode: before.policyCode },
      { status: result.status, reason: reason.trim() },
    );
    return result;
  }

  /**
   * Force-finalize a refund stuck in `return_delivered`: call the existing
   * finalize logic + audit log. Idempotent (finalizeRefundForReturnedShipment
   * returns the row unchanged if already refunded).
   */
  async forceFinalizeRefund(adminId: string, refundRequestId: string) {
    const rr = await this.prisma.refundRequest.findUnique({
      where: { id: refundRequestId },
      select: { id: true, status: true, refundedAt: true },
    });
    if (!rr) throw new NotFoundException("İade talebi bulunamadı");
    if (rr.refundedAt) {
      throw new BadRequestException("Bu iade zaten tamamlanmış");
    }
    if (rr.status !== "return_delivered") {
      throw new BadRequestException(
        `Talep durumu '${rr.status}' force-finalize için uygun değil. Beklenen: return_delivered`,
      );
    }
    const result = await this.refundService.finalizeRefundForReturnedShipment(
      rr.id,
    );
    await this.audit.createRequiredAuditLog(
      adminId,
      "refund_force_finalize",
      "RefundRequest",
      rr.id,
      { previousStatus: rr.status },
      { newStatus: result.status, providerRefundId: result.providerRefundId },
    );
    return { success: true, refundRequestId: rr.id, status: result.status };
  }

  /**
   * MONEY-H6: Admin, TAKILI bir iade talebini para iade ETMEDEN force-KAPATIR →
   * donuk hold çözülür, satıcıya normal escrow akışında ödeme gider. Alıcının hiç
   * tamamlamadığı (return_in_transit/disputed/approved/wait_for_delivery/...) iadeler
   * için terminal kaçış. finalize (para iade) için forceFinalizeRefund kullanılır.
   */
  async closeStuckRefund(
    adminId: string,
    refundRequestId: string,
    reason?: string,
  ) {
    const before = await this.prisma.refundRequest.findUnique({
      where: { id: refundRequestId },
      select: { status: true },
    });
    const result = await this.refundService.adminCloseRefundRequest(
      refundRequestId,
      adminId,
      reason,
    );
    await this.audit.createRequiredAuditLog(
      adminId,
      "refund_admin_close",
      "RefundRequest",
      refundRequestId,
      { previousStatus: before?.status ?? null, reason: reason ?? null },
      { newStatus: result.status },
    );
    return { success: true, refundRequestId, status: result.status };
  }

  /**
   * Admin closes a pending compensation flag after settling the user out of
   * band. Sets `compensationResolvedAt` so the banner disappears in the UI.
   */
  async resolveTradeCompensation(
    adminId: string,
    tradeId: string,
    note?: string,
  ) {
    const trade = await this.prisma.trade.findUnique({
      where: { id: tradeId },
      select: {
        id: true,
        compensationPendingUserId: true,
        compensationResolvedAt: true,
      },
    });
    if (!trade) {
      throw new NotFoundException("Takas bulunamadı");
    }
    if (!trade.compensationPendingUserId) {
      throw new BadRequestException("Bu takasta açık tazminat işareti yok");
    }
    if (trade.compensationResolvedAt) {
      throw new BadRequestException("Tazminat zaten kapatılmış");
    }

    // O13: Gerçek tazminat ödemesi bu akışın DIŞINDA (manuel) yapılır; bu metot yalnız
    // işareti kapatır. Kazara/kanıtsız kapatmayı önlemek için açıklama/dekont (note) ZORUNLU
    // — audit izine yazılır.
    if (!note || !note.trim()) {
      throw new BadRequestException(
        "Tazminat kapatma için açıklama/dekont (note) zorunludur",
      );
    }

    const now = new Date();
    await this.prisma.trade.update({
      where: { id: tradeId },
      data: { compensationResolvedAt: now },
    });

    await this.audit.createRequiredAuditLog(
      adminId,
      "trade_compensation_resolved",
      "Trade",
      tradeId,
      { compensationPendingUserId: trade.compensationPendingUserId },
      { resolvedAt: now, note: note ?? null },
    );

    return { success: true, tradeId, resolvedAt: now };
  }

  /**
   * Admin manually retries a PayTR refund that failed during
   * `rejectWarehouseTrade` (or a previous retry). On success the failure
   * markers on the trade are cleared; on repeated failure the marker is
   * refreshed with the new error message.
   */
  async retryTradeRefund(adminId: string, tradeId: string) {
    const trade = await this.prisma.trade.findUnique({
      where: { id: tradeId },
      select: {
        id: true,
        status: true,
        refundFailureReason: true,
        refundFailureAt: true,
        cashPayments: {
          select: { id: true, status: true, payerId: true },
        },
      },
    });
    if (!trade) {
      throw new NotFoundException("Takas bulunamadı");
    }

    const cashPayment = primaryCashPayment(trade.cashPayments);
    if (!cashPayment || cashPayment.status !== PaymentStatus.completed) {
      throw new BadRequestException(
        "İade edilebilecek tamamlanmış bir nakit ödeme yok",
      );
    }

    const eligibleStatuses: TradeStatus[] = [
      TradeStatus.returning,
      TradeStatus.cancelled,
      TradeStatus.disputed,
    ];
    if (!eligibleStatuses.includes(trade.status)) {
      throw new BadRequestException(
        `Takas durumu '${trade.status}' iade yeniden denemesi için uygun değil`,
      );
    }

    if (!trade.refundFailureReason) {
      throw new BadRequestException(
        "Bu takasta kayıtlı bir iade hatası yok; yeniden deneme gerekmiyor",
      );
    }

    try {
      const result =
        await this.paymentService.refundTradeCashPaymentIfCompleted(tradeId);
      await this.prisma.trade.update({
        where: { id: tradeId },
        data: { refundFailureReason: null, refundFailureAt: null },
      });
      await this.audit.createRequiredAuditLog(
        adminId,
        "trade_refund_retry_success",
        "Trade",
        tradeId,
        {
          previousFailureReason: trade.refundFailureReason,
          previousFailureAt: trade.refundFailureAt,
        },
        result,
      );
      try {
        await this.eventService.emitTradeRefundCompleted({
          tradeId,
          cashPayerId: cashPayment?.payerId ?? null,
        });
      } catch (emitErr) {
        this.logger.error(
          `Failed to emit trade.refund-completed for trade ${tradeId}: ${emitErr}`,
        );
      }
      return {
        success: true,
        tradeId,
        refunded: result.refunded,
        skippedReason: result.skippedReason,
      };
    } catch (err: any) {
      const message = err?.message ?? "Bilinmeyen hata (PayTR iade başarısız)";
      this.logger.error(
        `retryTradeRefund failed for trade ${tradeId}: ${message}`,
      );
      try {
        await this.prisma.trade.update({
          where: { id: tradeId },
          data: {
            refundFailureReason: message.slice(0, 500),
            refundFailureAt: new Date(),
          },
        });
      } catch (persistErr: any) {
        this.logger.error(
          `Failed to persist refund retry failure for trade ${tradeId}: ${persistErr?.message}`,
        );
      }
      await this.audit.createRequiredAuditLog(
        adminId,
        "trade_refund_retry_failure",
        "Trade",
        tradeId,
        {
          previousFailureReason: trade.refundFailureReason,
          previousFailureAt: trade.refundFailureAt,
        },
        { message },
      );
      try {
        await this.eventService.emitTradeRefundFailed({
          tradeId,
          cashPayerId: cashPayment?.payerId ?? null,
          reason: message,
        });
      } catch (emitErr) {
        this.logger.error(
          `Failed to emit trade.refund-failed for trade ${tradeId}: ${emitErr}`,
        );
      }
      throw err;
    }
  }
}
