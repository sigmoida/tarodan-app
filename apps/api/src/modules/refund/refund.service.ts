import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import {
  OrderStatus,
  OrderCancellationReason,
  PaymentHoldStatus,
  PaymentStatus,
  Prisma,
  RefundReason,
  RefundRequestStatus,
  SellerAdjustmentType,
  ShipmentStatus,
} from "@prisma/client";
import { PrismaService } from "../../prisma";
import { ACTIVE_REFUND_REQUEST_STATUSES } from "./refund-active-statuses";
import { generateUniqueReference } from "../../common/helpers/generate-reference";
import { REFERENCE_PREFIX } from "../../common/helpers/code-prefixes";
import { PaymentService } from "../payment/payment.service";
import { RefundPendingReconciliationException } from "../payment-providers/refund-errors";
import { SuratCargoService } from "../surat-cargo/surat-cargo.service";
import { SuratTrackingService } from "../surat-cargo/surat-tracking.service";
import { canTransitionShipmentStatus } from "../shipping/shipment-state-machine";
import { buildStandardGonderiPayload } from "../surat-cargo/surat-address.util";
import { CreateRefundRequestDto } from "./dto/create-refund-request.dto";
import { NotificationService } from "../notification/notification.service";
import { NotificationType } from "../notification/dto/notification.dto";
import { StorageService } from "../storage/storage.service";
import { i18nMessage } from "../i18n";
import { ShippingTariffService } from "../shipping/shipping-tariff.service";
import { shippingAmountForDesi } from "../shipping/shipping-tariff.helper";
import {
  calculateRefundFinancials,
  RefundFinancialResult,
  RefundPolicyDecision,
  resolveCancellationPolicy,
  resolveReturnPolicy,
} from "./refund-financial-policy";

const COOLING_OFF_DAYS = 14;

type RefundFinancialPersistenceData = Pick<
  Prisma.RefundRequestUncheckedCreateInput,
  | "policyCode"
  | "financialPolicySnapshot"
  | "returnBillableDesi"
  | "returnShippingAmount"
  | "refundedProductAmount"
  | "refundedOutboundShippingAmount"
  | "refundedBuyerProtectionAmount"
  | "refundedSellerFeeAmount"
  | "retainedSellerPlatformFeeAmount"
  | "returnShippingChargeToBuyer"
  | "returnShippingChargeToSeller"
  | "sellerShippingCompensationAmount"
  | "outboundShippingChargeToSeller"
  | "requiresAdminReview"
  | "penaltyReviewRequired"
  | "refundProductAmount"
  | "refundShippingFee"
  | "refundBuyerFee"
  | "refundSellerCommission"
  | "returnShippingPayer"
>;

@Injectable()
export class RefundService {
  private readonly logger = new Logger(RefundService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentService: PaymentService,
    private readonly suratCargoService: SuratCargoService,
    private readonly suratTrackingService: SuratTrackingService,
    private readonly notificationService: NotificationService,
    private readonly storageService: StorageService,
    @Optional()
    private readonly shippingTariffService?: ShippingTariffService,
  ) {}

  /**
   * Refund yanıtlarında ürün resimlerini ham ProductImage kaydı yerine
   * herkesin doğrudan <img src> olarak kullanabileceği public URL dizisine
   * çevirir. Web/mobil/admin tüm iade ekranları bu şekli bekliyor.
   */
  private toProductImageUrls(images: unknown): string[] {
    if (!Array.isArray(images)) return [];
    return images
      .map((img: any) =>
        img?.cardKey ? this.storageService.getPublicAssetUrl(img.cardKey) : "",
      )
      .filter(Boolean);
  }

  private withResolvedImages<T extends Record<string, any>>(rr: T): T {
    const product = rr?.order?.product;
    if (product?.images) {
      product.images = this.toProductImageUrls(product.images);
    }
    return rr;
  }

  /**
   * Append a transition entry to RefundRequest.metadata.history. Used as a
   * lightweight audit trail for buyer/seller actions (AuditLog requires an
   * AdminUser FK and isn't applicable here).
   */
  private async appendHistory(
    refundRequestId: string,
    entry: { action: string; by: string; details?: Record<string, any> },
  ): Promise<void> {
    const current = await this.prisma.refundRequest.findUnique({
      where: { id: refundRequestId },
      select: { metadata: true },
    });
    const meta = (current?.metadata as Record<string, any>) || {};
    const history = Array.isArray(meta.history) ? meta.history : [];
    history.push({ ...entry, at: new Date().toISOString() });
    await this.prisma.refundRequest.update({
      where: { id: refundRequestId },
      data: { metadata: { ...meta, history } },
    });
  }

  /**
   * Best-effort notification dispatch — failures are logged, never thrown.
   * createInAppNotification artık in_app + canlı websocket + PUSH'u birlikte
   * yapıyor (notification.service), o yüzden burada tek çağrı yeterli.
   * Email ayrı: markalı şablonlar için sendRefundEmail kullanılır.
   */
  private async safeNotify(
    userId: string,
    type: NotificationType,
    data?: Record<string, any>,
  ): Promise<void> {
    try {
      await this.notificationService.createInAppNotification(
        userId,
        type,
        data,
      );
    } catch (err: any) {
      this.logger.error(
        `Notification ${type} → ${userId} failed: ${err?.message}`,
      );
    }
  }

  /**
   * İade akışı e-postaları. refundRequestId'den order/ürün/taraf bilgilerini
   * tazeden çeker ve ilgili tarafa (alıcı veya satıcı) markalı şablonu gönderir.
   * Asla throw etmez; in-app bildirimlerin yanında çalışır.
   */
  private async sendRefundEmail(
    refundRequestId: string,
    recipient: "buyer" | "seller",
    templateKey: string,
    extra?: Record<string, any>,
  ): Promise<void> {
    try {
      const rr = await this.prisma.refundRequest.findUnique({
        where: { id: refundRequestId },
        select: {
          amount: true,
          orderId: true,
          requesterId: true,
          order: {
            select: {
              orderNumber: true,
              sellerId: true,
              buyer: { select: { displayName: true } },
              seller: { select: { displayName: true } },
              product: { select: { title: true } },
            },
          },
        },
      });
      if (!rr) return;
      const recipientId =
        recipient === "buyer" ? rr.requesterId : rr.order?.sellerId;
      if (!recipientId) return;
      await this.notificationService.sendTemplateEmailToUser(
        recipientId,
        templateKey,
        {
          buyerName: rr.order?.buyer?.displayName ?? "",
          sellerName: rr.order?.seller?.displayName ?? "",
          orderNumber: rr.order?.orderNumber,
          orderId: rr.orderId,
          productTitle: rr.order?.product?.title ?? "",
          refundAmount: Number(rr.amount),
          ...extra,
        },
      );
    } catch (err: any) {
      this.logger.error(
        `Refund email ${templateKey} failed for ${refundRequestId}: ${err?.message}`,
      );
    }
  }

  async createRefundRequest(
    orderId: string,
    requesterId: string,
    dto: CreateRefundRequestDto,
  ) {
    // KOŞULSUZ 14 GÜN İADE (Mesafeli Satış cayma hakkı): teslimden sonraki 14 gün
    // içinde sebep belirtmeden (changed_mind dahil) ve kanıt fotoğrafı olmadan iade
    // edilebilir. changed_mind reddi KALDIRILDI; sebep/foto zorunluluğu yalnızca
    // 14 gün GEÇTİKTEN sonra (past_cooling_off) uygulanır.
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        payment: true,
        checkoutGroup: { include: { payment: true } },
        shipment: true,
        refundRequests: true,
        package: {
          select: {
            shippingTariffId: true,
            shippingTariffVersion: true,
          },
        },
        product: { select: { shippingDesi: true } },
      },
    });
    if (!order) {
      throw new NotFoundException(i18nMessage("server.refund.orderNotFound"));
    }
    // Üyelik/dijital siparişler (sanal ürün + platform satıcısı) genel iade akışına girmez;
    // üyeliğin kendi iptal akışı vardır.
    if (order.orderNumber?.startsWith("MEM-")) {
      throw new BadRequestException(
        i18nMessage("server.refund.membershipOrderNotEligible"),
      );
    }
    if (order.buyerId !== requesterId) {
      throw new ForbiddenException(
        i18nMessage("server.refund.onlyBuyerCanRequest"),
      );
    }

    if (order.status === OrderStatus.pending_payment) {
      throw new BadRequestException(
        i18nMessage("server.refund.orderNotPaidYet"),
      );
    }
    if (
      order.status === OrderStatus.cancelled ||
      order.status === OrderStatus.refunded
    ) {
      throw new BadRequestException(
        i18nMessage("server.refund.orderAlreadyCancelledOrRefunded"),
      );
    }
    const payment =
      order.payment ?? (order as any).checkoutGroup?.payment ?? null;
    if (!payment || payment.status !== PaymentStatus.completed) {
      throw new BadRequestException(
        i18nMessage("server.refund.completedPaymentNotFound"),
      );
    }

    const hasActive = order.refundRequests.some((r) =>
      ACTIVE_REFUND_REQUEST_STATUSES.includes(r.status),
    );
    if (hasActive) {
      throw new BadRequestException(i18nMessage("server.refund.alreadyActive"));
    }

    // Adet bazlı kısmi iade: istenen adet (verilmezse tümü), sipariş adediyle sınırlı.
    const orderQty = (order as any).quantity ?? 1;
    const reqQty = Math.min(
      Math.max(dto.refundQuantity ?? orderQty, 1),
      orderQty,
    );

    const phase = this.classifyOrderPhase(order);
    const policy =
      phase === "preparing" || phase === "paid"
        ? resolveCancellationPolicy(
            dto.reason === RefundReason.changed_mind ? "changed_mind" : "other",
            // Bu dal yalnız `paid`/`preparing` fazında çalışır: paket henüz
            // taşıyıcıya verilmemiştir, dolayısıyla taşıma maliyeti doğmamıştır.
            { hasShipped: false },
          )
        : resolveReturnPolicy(dto.reason);

    if (
      policy.requiresEvidence &&
      (!dto.evidencePhotoUrls || dto.evidencePhotoUrls.length === 0)
    ) {
      throw new BadRequestException(
        "Bu iade nedeni için en az bir kanıt görseli zorunludur",
      );
    }

    if (phase === "preparing" || phase === "paid") {
      return this.createInstantRefund(order, requesterId, dto, reqQty, policy);
    }

    if (phase === "in_cooling_off") {
      return this.createCoolingOffRefund(
        order,
        requesterId,
        dto,
        reqQty,
        policy,
      );
    }

    if (phase === "past_cooling_off") {
      // 14 GÜNDEN SONRA İADE YOK: cayma penceresi kapandıktan sonra alıcı iade
      // talebi oluşturamaz. (Escrow de gün 15'te payout ettiği için bu kural
      // sayesinde payout anında asla açık/açılabilir iade kalmaz.)
      throw new BadRequestException(
        i18nMessage("server.refund.coolingOffExpired"),
      );
    }

    throw new BadRequestException(
      i18nMessage("server.refund.orderStatusNotEligible"),
    );
  }

  async createCancellationRefund(
    orderId: string,
    requesterId: string,
    reasonCode: OrderCancellationReason,
    description?: string,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        payment: true,
        checkoutGroup: { include: { payment: true } },
        shipment: true,
        refundRequests: true,
        package: {
          select: {
            shippingTariffId: true,
            shippingTariffVersion: true,
          },
        },
        product: { select: { shippingDesi: true } },
      },
    });
    if (!order) {
      throw new NotFoundException(i18nMessage("server.refund.orderNotFound"));
    }
    if (order.buyerId !== requesterId) {
      throw new ForbiddenException(
        i18nMessage("server.refund.onlyBuyerCanRequest"),
      );
    }
    if (
      order.status !== OrderStatus.paid &&
      order.status !== OrderStatus.preparing
    ) {
      throw new BadRequestException(
        "Yalnız ödenmiş ve kargo öncesindeki siparişler iptal edilebilir",
      );
    }
    const preHandoverShipmentStatuses: ShipmentStatus[] = [
      ShipmentStatus.pending,
      ShipmentStatus.cancelled,
      ShipmentStatus.failed,
    ];
    if (
      order.shipment &&
      !preHandoverShipmentStatuses.includes(order.shipment.status)
    ) {
      throw new BadRequestException(
        "Kargoya teslim edilmiş sipariş iptal edilemez; iade talebi oluşturun",
      );
    }
    const payment =
      order.payment ?? (order as any).checkoutGroup?.payment ?? null;
    if (!payment || payment.status !== PaymentStatus.completed) {
      throw new BadRequestException(
        i18nMessage("server.refund.completedPaymentNotFound"),
      );
    }
    const hasActive = order.refundRequests.some((request) =>
      ACTIVE_REFUND_REQUEST_STATUSES.includes(request.status),
    );
    if (hasActive) {
      throw new BadRequestException(i18nMessage("server.refund.alreadyActive"));
    }

    // Kargoya teslim edilmiş sipariş yukarıda reddedildi (iade talebine
    // yönlendirilir), bu yüzden burada taşıma maliyeti hiç doğmamıştır.
    const policy = resolveCancellationPolicy(reasonCode, { hasShipped: false });
    const financial = await this.buildFinancialPolicySnapshot(
      order,
      policy,
      reasonCode,
      order.quantity ?? 1,
      false,
    );
    const refundNumber = await this.generateRefundNumber();
    let created;
    try {
      created = await this.prisma.refundRequest.create({
        data: {
          refundNumber,
          orderId: order.id,
          requesterId,
          reason:
            reasonCode === OrderCancellationReason.delivery_delayed
              ? RefundReason.other
              : RefundReason.changed_mind,
          description: description?.trim() || null,
          amount: financial.financials.buyerRefundAmount,
          refundQuantity: order.quantity ?? 1,
          status: policy.requiresAdminReview
            ? RefundRequestStatus.pending_review
            : RefundRequestStatus.approved,
          ...this.refundFinancialData(policy, financial),
        },
      });
    } catch (error) {
      if (this.isDuplicateActiveRefund(error)) {
        throw new BadRequestException(
          i18nMessage("server.refund.alreadyActive"),
        );
      }
      throw error;
    }
    await this.freezeHoldForRefund(order.id, created.id);
    await this.prisma.order.update({
      where: { id: order.id },
      data: {
        cancellationReasonCode: reasonCode,
        cancelReason: description?.trim() || reasonCode,
        cancellationPolicySnapshot: financial.snapshot,
      },
    });

    if (policy.requiresAdminReview) {
      await this.appendHistory(created.id, {
        action: "cancellation_pending_admin_review",
        by: requesterId,
        details: { reasonCode, policyCode: policy.policyCode },
      });
      return created;
    }

    let refundResult: { providerRefundId?: string };
    try {
      refundResult = await this.paymentService.processRefund(
        order.id,
        financial.financials.buyerRefundAmount,
        {
          skipRefundEvent: true,
          refundQuantity: order.quantity ?? 1,
          idempotencyKey: `refund-request:${created.id}`,
          settlement: {
            closeOrder: true,
            holdPortion: 1,
            sellerFeeRefundAmount: financial.financials.sellerFeeRefundAmount,
            buyerFeeRefundAmount:
              financial.financials.buyerProtectionRefundAmount,
            ...this.shippingSettlement(created.id, financial.financials),
          },
        },
      );
    } catch (error) {
      if (!(error instanceof RefundPendingReconciliationException)) {
        await this.prisma.refundRequest.delete({ where: { id: created.id } });
        await this.unfreezeHoldForRefund(order.id);
      }
      throw error;
    }

    const updated = await this.prisma.refundRequest.update({
      where: { id: created.id },
      data: {
        status: RefundRequestStatus.refunded,
        decidedBy: "system",
        decidedAt: new Date(),
        refundedAt: new Date(),
        providerRefundId: refundResult.providerRefundId ?? null,
      },
    });
    await this.prisma.order.update({
      where: { id: order.id },
      data: { cancellationType: "iptal" },
    });
    await this.appendHistory(created.id, {
      action: "cancellation_refunded",
      by: "system",
      details: { reasonCode },
    });
    return updated;
  }

  async cancelRefundRequest(refundRequestId: string, requesterId: string) {
    const rr = await this.prisma.refundRequest.findUnique({
      where: { id: refundRequestId },
      include: { order: { select: { id: true, sellerId: true } } },
    });
    if (!rr) throw new NotFoundException(i18nMessage("server.refund.notFound"));
    if (rr.requesterId !== requesterId) {
      throw new ForbiddenException(i18nMessage("server.refund.cannotCancel"));
    }
    if (
      rr.status !== RefundRequestStatus.pending_review &&
      rr.status !== RefundRequestStatus.wait_for_delivery
    ) {
      throw new BadRequestException(
        i18nMessage("server.refund.cannotCancelAnymore"),
      );
    }
    const updated = await this.prisma.refundRequest.update({
      where: { id: refundRequestId },
      data: {
        status: RefundRequestStatus.cancelled,
        decidedAt: new Date(),
        decidedBy: requesterId,
      },
    });
    // İade iptal edildi → hold kilidini kaldır, normal escrow akışına dönsün.
    await this.unfreezeHoldForRefund(rr.order.id);
    await this.appendHistory(refundRequestId, {
      action: "cancelled_by_buyer",
      by: requesterId,
      details: { previousStatus: rr.status },
    });
    await this.safeNotify(
      rr.order.sellerId,
      NotificationType.REFUND_CANCELLED,
      {
        refundNumber: rr.refundNumber,
        orderId: rr.order.id,
      },
    );
    return updated;
  }

  async adminApproveRefundRequest(
    refundRequestId: string,
    adminId: string,
    note?: string,
  ) {
    const rr = await this.prisma.refundRequest.findUnique({
      where: { id: refundRequestId },
      include: {
        order: {
          select: {
            id: true,
            sellerId: true,
            status: true,
            quantity: true,
          },
        },
      },
    });
    if (!rr) throw new NotFoundException(i18nMessage("server.refund.notFound"));
    if (rr.status !== RefundRequestStatus.pending_review) {
      throw new BadRequestException(
        "Yalnız inceleme bekleyen iade talepleri onaylanabilir",
      );
    }

    const isPreShipmentCancellation = rr.policyCode.endsWith("_cancellation");
    if (isPreShipmentCancellation) {
      const refundResult = await this.paymentService.processRefund(
        rr.orderId,
        Number(rr.amount),
        {
          skipRefundEvent: true,
          refundQuantity: rr.refundQuantity,
          idempotencyKey: `refund-request:${rr.id}`,
          settlement: {
            closeOrder: rr.refundQuantity >= (rr.order.quantity ?? 1),
            holdPortion: Math.min(
              rr.refundQuantity / Math.max(rr.order.quantity ?? 1, 1),
              1,
            ),
            sellerFeeRefundAmount: Number(rr.refundedSellerFeeAmount),
            buyerFeeRefundAmount: Number(rr.refundedBuyerProtectionAmount),
            ...this.shippingSettlement(rr.id, {
              sellerShippingCompensationAmount: Number(
                rr.sellerShippingCompensationAmount,
              ),
              outboundShippingChargeToSeller: Number(
                rr.outboundShippingChargeToSeller,
              ),
              returnShippingChargeToSeller: Number(
                rr.returnShippingChargeToSeller,
              ),
            }),
          },
        },
      );
      const updated = await this.prisma.refundRequest.update({
        where: { id: rr.id },
        data: {
          status: RefundRequestStatus.refunded,
          decidedBy: adminId,
          decidedAt: new Date(),
          sellerResponse: note?.trim() || null,
          refundedAt: new Date(),
          providerRefundId: refundResult.providerRefundId ?? null,
        },
      });
      await this.prisma.order.update({
        where: { id: rr.orderId },
        data: { cancellationType: "iptal" },
      });
      await this.appendHistory(rr.id, {
        action: "approved_and_refunded_by_admin",
        by: adminId,
        details: { note: note?.trim() || null },
      });
      return updated;
    }

    const updated = await this.prisma.refundRequest.update({
      where: { id: rr.id },
      data: {
        status: RefundRequestStatus.wait_for_delivery,
        decidedBy: adminId,
        decidedAt: new Date(),
        sellerResponse: note?.trim() || null,
      },
    });
    await this.appendHistory(rr.id, {
      action: "approved_by_admin",
      by: adminId,
      details: { note: note?.trim() || null },
    });
    await this.safeNotify(rr.requesterId, NotificationType.REFUND_APPROVED, {
      refundNumber: rr.refundNumber,
      orderId: rr.orderId,
    });

    if (
      rr.order.status === OrderStatus.delivered ||
      rr.order.status === OrderStatus.awaiting_buyer_confirmation ||
      rr.order.status === OrderStatus.completed
    ) {
      try {
        return await this.openReturnShipment(rr.id);
      } catch (error: any) {
        this.logger.error(
          `Approved refund ${rr.refundNumber} could not open return shipment: ${error?.message}`,
        );
      }
    }
    return updated;
  }

  async adminRejectRefundRequest(
    refundRequestId: string,
    adminId: string,
    reason: string,
  ) {
    if (!reason?.trim()) {
      throw new BadRequestException("İade reddi için açıklama zorunludur");
    }
    const rr = await this.prisma.refundRequest.findUnique({
      where: { id: refundRequestId },
      include: { order: { select: { id: true } } },
    });
    if (!rr) throw new NotFoundException(i18nMessage("server.refund.notFound"));
    if (rr.status !== RefundRequestStatus.pending_review) {
      throw new BadRequestException(
        "Yalnız inceleme bekleyen iade talepleri reddedilebilir",
      );
    }

    const updated = await this.prisma.refundRequest.update({
      where: { id: rr.id },
      data: {
        status: RefundRequestStatus.rejected,
        decidedBy: adminId,
        decidedAt: new Date(),
        sellerResponse: reason.trim(),
      },
    });
    await this.unfreezeHoldForRefund(rr.order.id);
    await this.appendHistory(rr.id, {
      action: "rejected_by_admin",
      by: adminId,
      details: { reason: reason.trim() },
    });
    return updated;
  }

  /**
   * MONEY-H6: Admin, TAKILI bir iade talebini para iade ETMEDEN force-KAPATIR →
   * hold kilidi (frozenByRefundId) kalkar, satıcıya normal escrow akışında ödeme
   * gider. Teslim SONRASI açılıp alıcının hiç tamamlamadığı (`return_in_transit`/
   * `disputed`/`approved`/`wait_for_delivery`/`return_shipment_open`) iadelerde hold
   * `releaseAt`'i geçse bile donuk kaldığından satıcı hiç ödenmiyordu — terminal kaçış.
   * Zaten refunded ise reddedilir; zaten cancelled ise idempotent no-op.
   */
  async adminCloseRefundRequest(
    refundRequestId: string,
    adminId: string,
    reason?: string,
  ) {
    const rr = await this.prisma.refundRequest.findUnique({
      where: { id: refundRequestId },
      include: { order: { select: { id: true, sellerId: true } } },
    });
    if (!rr) throw new NotFoundException(i18nMessage("server.refund.notFound"));
    if (rr.status === RefundRequestStatus.refunded) {
      throw new BadRequestException(
        i18nMessage("server.refund.cannotCancelAnymore"),
      );
    }
    if (rr.status === RefundRequestStatus.cancelled) {
      return rr; // idempotent
    }
    const updated = await this.prisma.refundRequest.update({
      where: { id: refundRequestId },
      data: {
        status: RefundRequestStatus.cancelled,
        decidedAt: new Date(),
        decidedBy: adminId,
      },
    });
    // Hold kilidini kaldır → satıcıya normal escrow akışında ödeme.
    await this.unfreezeHoldForRefund(rr.order.id);
    await this.appendHistory(refundRequestId, {
      action: "closed_by_admin",
      by: adminId,
      details: { previousStatus: rr.status, reason: reason ?? null },
    });
    await this.safeNotify(rr.requesterId, NotificationType.REFUND_CANCELLED, {
      refundNumber: rr.refundNumber,
      orderId: rr.order.id,
    });
    return updated;
  }

  async getById(refundRequestId: string, userId: string, isAdmin = false) {
    const rr = await this.prisma.refundRequest.findUnique({
      where: { id: refundRequestId },
      include: {
        order: {
          include: {
            buyer: { select: { id: true, displayName: true, avatarUrl: true } },
            seller: {
              select: { id: true, displayName: true, avatarUrl: true },
            },
            product: { select: { id: true, title: true, images: true } },
            shipment: true,
            payment: { select: { amount: true, currency: true, paidAt: true } },
          },
        },
        requester: { select: { id: true, displayName: true } },
      },
    });
    if (!rr) throw new NotFoundException(i18nMessage("server.refund.notFound"));

    if (!isAdmin && rr.requesterId !== userId && rr.order.sellerId !== userId) {
      throw new ForbiddenException(i18nMessage("server.refund.viewForbidden"));
    }
    return this.withResolvedImages(rr);
  }

  async listForBuyer(userId: string) {
    const rows = await this.prisma.refundRequest.findMany({
      where: { requesterId: userId },
      orderBy: { createdAt: "desc" },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            totalAmount: true,
            product: { select: { id: true, title: true, images: true } },
          },
        },
      },
    });
    return rows.map((rr) => this.withResolvedImages(rr));
  }

  async listForSeller(userId: string) {
    const rows = await this.prisma.refundRequest.findMany({
      where: { order: { sellerId: userId } },
      orderBy: { createdAt: "desc" },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            totalAmount: true,
            product: { select: { id: true, title: true, images: true } },
          },
        },
        requester: { select: { id: true, displayName: true } },
      },
    });
    return rows.map((rr) => this.withResolvedImages(rr));
  }

  async openReturnShipment(refundRequestId: string) {
    const rr = await this.prisma.refundRequest.findUnique({
      where: { id: refundRequestId },
      include: {
        order: {
          include: {
            // Default adres yoksa default-olmayan adresi de kullan (default önce).
            buyer: {
              include: {
                addresses: { orderBy: { isDefault: "desc" }, take: 1 },
              },
            },
            seller: {
              include: {
                addresses: { orderBy: { isDefault: "desc" }, take: 1 },
              },
            },
            package: { select: { billableDesi: true } },
            product: { select: { shippingDesi: true } },
          },
        },
      },
    });
    if (!rr) throw new NotFoundException(i18nMessage("server.refund.notFound"));
    if (rr.returnTrackingNumber) {
      this.logger.log(`Return shipment already exists for ${rr.refundNumber}`);
      return rr;
    }
    if (
      rr.status !== RefundRequestStatus.wait_for_delivery &&
      rr.status !== RefundRequestStatus.approved
    ) {
      throw new BadRequestException(
        "İade kargosu yalnız onaylanmış bir talep için oluşturulabilir",
      );
    }

    // Alıcı (iade alım noktası): önce siparişin TESLİMAT adresi (ürün oraya gitti →
    // iade oradan alınır), yoksa alıcının kayıtlı adresi.
    const buyerAddr =
      this.fallbackAddressFromOrderJson(rr.order.shippingAddress) ??
      rr.order.buyer.addresses[0];
    // Satıcı (iade teslim noktası): satıcının kayıtlı adresi; YOKSA Tarodan deposu
    // (çoğu satıcı/platform mağazası kayıtlı adres tutmaz → iade bloke olmasın/askıda
    // kalmasın). Depo adresi env'den (varsayılanlarla) gelir, takas akışıyla aynı kaynak.
    const sellerAddr =
      rr.order.seller.addresses[0] ?? this.warehouseReturnAddress();

    // Yalnız alıcı adresi gerçekten bulunamazsa iade kargosu açılamaz.
    if (!buyerAddr) {
      throw new BadRequestException(
        i18nMessage("server.refund.buyerAddressNotFound"),
      );
    }

    if (!this.suratCargoService.isIntegrationEnabled()) {
      this.logger.warn(
        `Surat integration disabled, marking ${rr.refundNumber} as return_shipment_open without provider call`,
      );
      const updated = await this.prisma.refundRequest.update({
        where: { id: rr.id },
        data: {
          status: RefundRequestStatus.return_shipment_open,
          returnProvider: "manual",
          returnTrackingNumber: rr.refundNumber,
          returnCreatedAt: new Date(),
        },
      });
      await this.appendHistory(rr.id, {
        action: "return_opened",
        by: "system",
        details: { provider: "manual", trackingNumber: rr.refundNumber },
      });
      await this.safeNotify(
        rr.requesterId,
        NotificationType.REFUND_RETURN_OPENED,
        {
          refundNumber: rr.refundNumber,
          orderId: rr.orderId,
          trackingNumber: rr.refundNumber,
        },
      );
      await this.sendRefundEmail(rr.id, "buyer", "refund-return-label-buyer", {
        returnTrackingNumber: rr.refundNumber,
      });
      return updated;
    }

    const result = await this.suratCargoService.createShipmentWithBarcode({
      idempotencyKey: `surat:refund-return:${rr.refundNumber}`,
      correlationId: `refund-${rr.id}`,
      payload: buildStandardGonderiPayload({
        recipientName: sellerAddr.fullName || rr.order.seller.displayName,
        address: sellerAddr.address,
        city: sellerAddr.city,
        district: sellerAddr.district,
        phone: sellerAddr.phone,
        ref: rr.refundNumber,
        content: `İade: ${rr.order.orderNumber}`,
        isReturn: true,
        desi: rr.returnBillableDesi,
        // KisiKurum fallback burada seller.displayName (builder'ın "Alıcı"sı
        // değil) ve trim uygulanmıyor → birebir korumak için override.
        overrides: {
          KisiKurum: sellerAddr.fullName || rr.order.seller.displayName,
        },
      }),
    });

    if (!result.ok) {
      const r = result as any;
      const errMsg =
        r.kind === "business" ? r.suratMessage : `technical: ${r.code}`;
      throw new BadRequestException(`Sürat iade kargosu açılamadı: ${errMsg}`);
    }

    const updated = await this.prisma.refundRequest.update({
      where: { id: rr.id },
      data: {
        status: RefundRequestStatus.return_shipment_open,
        returnProvider: "surat",
        returnTrackingNumber: rr.refundNumber,
        // Real Sürat return code (KargoTakipNo) + label, created immediately.
        returnProviderTrackingId: result.kargoTakipNo,
        returnLabelZpl: result.labelZpl,
        returnStatus: ShipmentStatus.label_created,
        returnCreatedAt: new Date(),
      },
    });
    await this.appendHistory(rr.id, {
      action: "return_opened",
      by: "system",
      details: { provider: "surat", trackingNumber: rr.refundNumber },
    });
    await this.safeNotify(
      rr.requesterId,
      NotificationType.REFUND_RETURN_OPENED,
      {
        refundNumber: rr.refundNumber,
        orderId: rr.orderId,
        trackingNumber: rr.refundNumber,
      },
    );
    await this.sendRefundEmail(rr.id, "buyer", "refund-return-label-buyer", {
      returnTrackingNumber: rr.refundNumber,
      cargoCompany: "Sürat Kargo",
    });
    return updated;
  }

  async finalizeRefundForReturnedShipment(refundRequestId: string) {
    const rr = await this.prisma.refundRequest.findUnique({
      where: { id: refundRequestId },
      include: { order: true },
    });
    if (!rr) throw new NotFoundException(i18nMessage("server.refund.notFound"));
    if (rr.status === RefundRequestStatus.refunded) return rr;

    // MONEY-M1: Atomik CLAIM. Bu metod 3 yoldan EŞZAMANLI çağrılabilir
    // (finalizeReturnedShipments cron + Sürat sync + admin forceFinalize). Eski
    // `status===refunded` guard'ı TOCTOU'ya açıktı: ikisi de `return_delivered` okuyup
    // processRefund + finalize yan-etkilerini (order-update, history, ÇİFT bildirim/mail)
    // tekrarlardı. Yalnız BİR çağıran `return_delivered→refunded` geçişini kazanır;
    // count===0 → başka biri aldı → tekrarlama. (processRefund'ın kendi refundInProgress
    // marker'ı PayTR çift-çağrısını zaten engelliyor; bu CAS finalize yan-etkilerini tekilleştirir.)
    const claimed = await this.prisma.refundRequest.updateMany({
      where: {
        id: refundRequestId,
        status: RefundRequestStatus.return_delivered,
      },
      data: { status: RefundRequestStatus.refunded, refundedAt: new Date() },
    });
    if (claimed.count === 0) {
      return (
        (await this.prisma.refundRequest.findUnique({
          where: { id: refundRequestId },
        })) ?? rr
      );
    }

    let refundResult: { providerRefundId: string };
    try {
      refundResult = await this.paymentService.processRefund(
        rr.orderId,
        Number(rr.amount),
        {
          skipRefundEvent: true,
          refundQuantity: rr.refundQuantity,
          idempotencyKey: `refund-request:${rr.id}`,
          settlement: {
            closeOrder: rr.refundQuantity >= (rr.order.quantity ?? 1),
            holdPortion: Math.min(
              rr.refundQuantity / Math.max(rr.order.quantity ?? 1, 1),
              1,
            ),
            sellerFeeRefundAmount: Number(rr.refundedSellerFeeAmount),
            buyerFeeRefundAmount: Number(rr.refundedBuyerProtectionAmount),
            ...this.shippingSettlement(rr.id, {
              sellerShippingCompensationAmount: Number(
                rr.sellerShippingCompensationAmount,
              ),
              outboundShippingChargeToSeller: Number(
                rr.outboundShippingChargeToSeller,
              ),
              returnShippingChargeToSeller: Number(
                rr.returnShippingChargeToSeller,
              ),
            }),
          },
        }, // REFUND_COMPLETED'ı aşağıda kendimiz gönderiyoruz
      );
    } catch (err) {
      // processRefund BAŞARISIZ → claim'i GERİ AL (return_delivered) ki cron retry etsin.
      // (Money iade edilmedi; yalnız claim kilidini bıraktık.)
      await this.prisma.refundRequest
        .updateMany({
          where: {
            id: refundRequestId,
            status: RefundRequestStatus.refunded,
          },
          data: {
            status: RefundRequestStatus.return_delivered,
            refundedAt: null,
          },
        })
        .catch(() => undefined);
      throw err;
    }

    // Money iade EDİLDİ — buradan sonrası best-effort (claim geri ALINMAZ).
    const updated = await this.prisma.refundRequest.update({
      where: { id: rr.id },
      data: {
        providerRefundId: refundResult.providerRefundId,
        returnDeliveredAt: rr.returnDeliveredAt ?? new Date(),
      },
    });

    // Hold (adet bazlı) tüketimi processRefund içinde tek otoriteden yapıldı.
    // Kargo sonrası gerçek İADE → raporlama ayrımı.
    await this.prisma.order
      .update({
        where: { id: rr.orderId },
        data: { cancellationType: "iade" },
      })
      .catch(() => undefined);
    await this.appendHistory(rr.id, {
      action: "refund_completed",
      by: "system",
      details: { providerRefundId: refundResult.providerRefundId },
    });
    await this.safeNotify(rr.requesterId, NotificationType.REFUND_COMPLETED, {
      refundNumber: rr.refundNumber,
      orderId: rr.orderId,
    });
    // "Para iadeniz tamamlandı" maili eksikti (sadece zile düşüyordu) — eklendi.
    await this.sendRefundEmail(rr.id, "buyer", "refund-completed");
    // Satıcı tarafı: iade tamamlandı bildirimi + mail.
    await this.safeNotify(
      rr.order.sellerId,
      NotificationType.REFUND_COMPLETED_SELLER,
      {
        refundNumber: rr.refundNumber,
        orderId: rr.orderId,
      },
    );
    await this.sendRefundEmail(rr.id, "seller", "refund-completed-seller");
    return updated;
  }

  async findPendingDeliveryToOpenReturn(): Promise<string[]> {
    const candidates = await this.prisma.refundRequest.findMany({
      where: {
        status: RefundRequestStatus.wait_for_delivery,
        order: {
          status: {
            in: [
              OrderStatus.delivered,
              OrderStatus.awaiting_buyer_confirmation,
              OrderStatus.completed,
            ],
          },
        },
      },
      select: { id: true },
    });
    return candidates.map((c) => c.id);
  }

  /**
   * D25 (insani senaryo): alıcı iadeyi açtı ama paketi hiç şubeye götürmedi —
   * satıcının hold'u süresiz donuk kalıyordu. `return_shipment_open` + N gün
   * (env REFUND_RETURN_DROPOFF_DAYS, vars. 7) hareketsiz kalan Sürat iadelerini
   * iptal eder: hold çözülür, Sürat kaydı silinir (kod artık şubede
   * kullanılamaz), alıcıya bildirim gider.
   *
   * Güvenlik: iptal ETMEDEN önce Sürat'tan CANLI takip çekilir — pakette
   * hareket varsa (alıcı son anda götürdü, poll henüz görmedi) iptal atlanır ve
   * normal poll akışına bırakılır. Sorgu başarısızsa da (belirsizlik) iptal
   * edilmez, sonraki tick tekrar dener. Yalnız `surat` iadeler: manuel iade
   * poll'lanamadığından yanlış iptal riski var → ops takibi.
   */
  async expireStaleOpenReturns(): Promise<number> {
    const days = Number(process.env.REFUND_RETURN_DROPOFF_DAYS) || 7;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    let stale: Array<{
      id: string;
      refundNumber: string;
      requesterId: string;
      order: { id: string; sellerId: string };
    }>;
    try {
      stale = await this.prisma.refundRequest.findMany({
        where: {
          status: RefundRequestStatus.return_shipment_open,
          returnProvider: "surat",
          returnCreatedAt: { lt: cutoff },
        },
        select: {
          id: true,
          refundNumber: true,
          requesterId: true,
          order: { select: { id: true, sellerId: true } },
        },
        take: 25,
      });
    } catch (e: any) {
      this.logger.error(`expireStaleOpenReturns query failed: ${e?.message}`);
      return 0;
    }

    let expired = 0;
    for (const rr of stale) {
      try {
        // Canlı doğrulama: pakette hareket varsa iptal etme.
        const live = await this.suratTrackingService.fetchTrackingInfo(
          rr.refundNumber,
        );
        if (!live) continue; // belirsizlik → bu tick atla
        const gonderi = live.Gonderiler?.[0];
        const hasMovement =
          !!gonderi &&
          ((gonderi.Hareketler?.length ?? 0) > 0 ||
            (gonderi.KargonunDurumuSayi ?? 1) >= 2);
        if (hasMovement) {
          this.logger.log(
            `Skip expiry for ${rr.refundNumber}: live Surat data shows movement; poll will pick it up`,
          );
          continue;
        }

        await this.prisma.refundRequest.update({
          where: { id: rr.id },
          data: {
            status: RefundRequestStatus.cancelled,
            decidedAt: new Date(),
            decidedBy: "system",
          },
        });
        // Hold kilidini kaldır → normal escrow akışına dönsün.
        await this.unfreezeHoldForRefund(rr.order.id);
        // Sürat'taki iade gönderisini sil — süresi dolmuş kod şubede kullanılamasın
        // (best-effort; idempotency cache'i de temizlenir).
        await this.suratCargoService
          .cancelShipmentByOrderNumber(rr.refundNumber)
          .catch(() => undefined);
        await this.appendHistory(rr.id, {
          action: "return_dropoff_expired",
          by: "system",
          details: { days },
        });
        await this.safeNotify(
          rr.requesterId,
          NotificationType.REFUND_CANCELLED,
          {
            refundNumber: rr.refundNumber,
            orderId: rr.order.id,
          },
        );
        expired++;
        this.logger.log(
          `Refund ${rr.refundNumber} expired: return not dropped off within ${days}d`,
        );
      } catch (e: any) {
        this.logger.error(
          `Failed to expire stale refund ${rr.id}: ${e?.message}`,
        );
      }
    }
    return expired;
  }

  /**
   * MONEY-H6: `wait_for_delivery`'de N günden (REFUND_WAIT_DELIVERY_MAX_DAYS, vars. 30)
   * uzun TAKILI iadeler — orijinal sipariş hiç teslim edilmediğinden return HİÇ açılmadı,
   * hold süresiz donuk kaldı. İptal et + hold kilidini kaldır (satıcı normal escrow akışına
   * döner; sipariş sonradan teslim olursa alıcı yeni talep açabilir). return_shipment_open
   * ayrı bir sweep'le (D25) ele alınır; bu yalnız wait_for_delivery'yi hedefler.
   */
  async expireStaleWaitForDelivery(): Promise<number> {
    const days = Number(process.env.REFUND_WAIT_DELIVERY_MAX_DAYS) || 30;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    let stale: Array<{
      id: string;
      refundNumber: string;
      requesterId: string;
      order: { id: string; sellerId: string };
    }>;
    try {
      stale = await this.prisma.refundRequest.findMany({
        where: {
          status: RefundRequestStatus.wait_for_delivery,
          createdAt: { lt: cutoff },
        },
        select: {
          id: true,
          refundNumber: true,
          requesterId: true,
          order: { select: { id: true, sellerId: true } },
        },
        take: 25,
      });
    } catch (e: any) {
      this.logger.error(
        `expireStaleWaitForDelivery query failed: ${e?.message}`,
      );
      return 0;
    }

    let expired = 0;
    for (const rr of stale) {
      try {
        await this.prisma.refundRequest.update({
          where: { id: rr.id },
          data: {
            status: RefundRequestStatus.cancelled,
            decidedAt: new Date(),
            decidedBy: "system",
          },
        });
        await this.unfreezeHoldForRefund(rr.order.id);
        await this.appendHistory(rr.id, {
          action: "wait_for_delivery_expired",
          by: "system",
          details: { days },
        });
        await this.safeNotify(
          rr.requesterId,
          NotificationType.REFUND_CANCELLED,
          {
            refundNumber: rr.refundNumber,
            orderId: rr.order.id,
          },
        );
        expired++;
        this.logger.log(
          `Refund ${rr.refundNumber} expired: order not delivered within ${days}d (wait_for_delivery)`,
        );
      } catch (e: any) {
        this.logger.error(
          `Failed to expire stale wait_for_delivery refund ${rr.id}: ${e?.message}`,
        );
      }
    }
    return expired;
  }

  // D26 (insani senaryo): iade satıcıya teslim edildikten sonra parayı ANINDA
  // iade etme — satıcıya kutuyu açıp kontrol etmesi için bir pencere tanı
  // (REFUND_RETURN_INSPECTION_HOURS, vars. 24 saat). Sorun varsa admin kaydı
  // `disputed` yapar; bu sorgu yalnız `return_delivered` seçtiğinden disputed
  // kayıt finalize edilmez. Pencere dolunca cron otomatik finalize eder.
  // (Poller'daki anlık finalize kaldırıldı — tek finalize yolu bu cron.)
  async findReturnDeliveredPendingFinalize(): Promise<string[]> {
    const hours = Number(process.env.REFUND_RETURN_INSPECTION_HOURS) || 24;
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    const rows = await this.prisma.refundRequest.findMany({
      where: {
        status: RefundRequestStatus.return_delivered,
        returnDeliveredAt: { lt: cutoff },
      },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  async applyReturnTrackingUpdate(
    refundRequestId: string,
    update: { status: ShipmentStatus; deliveredAt?: Date; shippedAt?: Date },
  ) {
    // L4: diğer iki poll path'indeki (shipment/trade) terminal-regresyon
    // guard'ının paritesi — bayat/eski bir Sürat cevabı returnStatus'u geriye
    // sarmasın (ör. returned → in_transit).
    const current = await this.prisma.refundRequest.findUnique({
      where: { id: refundRequestId },
      select: { returnStatus: true },
    });
    if (
      current?.returnStatus &&
      !canTransitionShipmentStatus(
        current.returnStatus as ShipmentStatus,
        update.status,
      )
    ) {
      this.logger.warn(
        `Skipping illegal return-status transition ${current.returnStatus} → ${update.status} for refund ${refundRequestId}`,
      );
      return null;
    }

    const updated = await this.prisma.refundRequest.update({
      where: { id: refundRequestId },
      data: {
        returnStatus: update.status,
        returnShippedAt: update.shippedAt ?? undefined,
        returnDeliveredAt: update.deliveredAt ?? undefined,
        // Sürat kod 12 (İade Teslim Edildi) mapper'da ShipmentStatus.returned'a
        // maplenir; iade akışında bu "paket satıcıya geri teslim edildi" demektir
        // → return_delivered (otomatik iade finalize'i buna bağlı).
        // Doküman kod 9/10/11/13/14/15/16 (İade sürecinde/yolda/şubede/dağıtımda)
        // → return_in_progress'e maplenir; iade satıcıya geri yolda demektir
        // → return_in_transit.
        status:
          update.status === ShipmentStatus.delivered ||
          update.status === ShipmentStatus.returned
            ? RefundRequestStatus.return_delivered
            : update.status === ShipmentStatus.in_transit ||
                update.status === ShipmentStatus.picked_up ||
                update.status === ShipmentStatus.return_in_progress
              ? RefundRequestStatus.return_in_transit
              : undefined,
      },
      include: { order: { select: { sellerId: true } } },
    });

    // Kargo takip adımları önceden tamamen sessizdi. Her iki taraf da bilgilendirilsin.
    // Bell + push (her ping'de mail spam'i olmasın diye mail göndermiyoruz).
    const notifData = {
      refundNumber: updated.refundNumber,
      orderId: updated.orderId,
    };
    if (
      update.status === ShipmentStatus.in_transit ||
      update.status === ShipmentStatus.picked_up
    ) {
      await this.safeNotify(
        updated.requesterId,
        NotificationType.REFUND_RETURN_IN_TRANSIT,
        notifData,
      );
      await this.safeNotify(
        updated.order.sellerId,
        NotificationType.REFUND_RETURN_SHIPPED_SELLER,
        notifData,
      );
      // Satıcıya bir kez markalı mail: ürün kendisine geliyor.
      await this.sendRefundEmail(
        updated.id,
        "seller",
        "refund-return-incoming-seller",
        {
          returnTrackingNumber:
            updated.returnTrackingNumber ?? updated.refundNumber,
        },
      );
    } else if (
      update.status === ShipmentStatus.delivered ||
      update.status === ShipmentStatus.returned
    ) {
      await this.safeNotify(
        updated.requesterId,
        NotificationType.REFUND_RETURN_DELIVERED_BUYER,
        notifData,
      );
      await this.safeNotify(
        updated.order.sellerId,
        NotificationType.REFUND_RETURN_DELIVERED_SELLER,
        notifData,
      );
    }

    return updated;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Internal helpers
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Generate a non-guessable, unique refund number (e.g. "RFD-N4P7K2Q9M3").
   * Random by design so it leaks no sequence/count information. The
   * `refund_number` column's @unique constraint is the final collision guard.
   */
  /**
   * Kısmi tekil indeks (`refund_requests_order_id_active_key`) ihlalini, uygulama
   * guard'ının verdiği AYNI anlamlı hataya çevirir. Guard read-then-create olduğu
   * için eşzamanlı iki gönderimde ikinci istek buraya düşer; indeks olmasaydı iki
   * aktif talep + iki Sürat iade kargosu oluşurdu.
   */
  private isDuplicateActiveRefund(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    );
  }

  private async generateRefundNumber(): Promise<string> {
    return generateUniqueReference(
      REFERENCE_PREFIX.refundRequest,
      async (code) =>
        (await this.prisma.refundRequest.count({
          where: { refundNumber: code },
        })) > 0,
    );
  }

  private classifyOrderPhase(order: {
    status: OrderStatus;
    deliveredAt?: Date | null;
    shipment: { status: ShipmentStatus; deliveredAt: Date | null } | null;
  }): "paid" | "preparing" | "in_cooling_off" | "past_cooling_off" | "unknown" {
    if (
      order.status === OrderStatus.paid ||
      order.status === OrderStatus.preparing
    ) {
      // Sürat hasn't actually picked up if shipment is still pending, or if a
      // previous attempt was cancelled / failed. In those cases we can still
      // do an instant refund (no in-flight cargo to chase).
      const stillNotShipped =
        !order.shipment ||
        order.shipment.status === ShipmentStatus.pending ||
        order.shipment.status === ShipmentStatus.cancelled ||
        order.shipment.status === ShipmentStatus.failed;
      return stillNotShipped ? "preparing" : "in_cooling_off";
    }
    if (order.status === OrderStatus.shipped) {
      return "in_cooling_off";
    }
    if (
      order.status === OrderStatus.delivered ||
      order.status === OrderStatus.awaiting_buyer_confirmation ||
      order.status === OrderStatus.completed
    ) {
      // Teslim tarihi order.deliveredAt'e yazılır (shipping.worker). Track
      // güncellemesinde shipment.deliveredAt set edilmediği için order alanı
      // birincil kaynaktır; shipment yalnızca yedek.
      const deliveredAt =
        order.deliveredAt ?? order.shipment?.deliveredAt ?? null;
      if (!deliveredAt) return "in_cooling_off";
      const ageDays = (Date.now() - deliveredAt.getTime()) / (1000 * 3600 * 24);
      return ageDays <= COOLING_OFF_DAYS
        ? "in_cooling_off"
        : "past_cooling_off";
    }
    return "unknown";
  }

  /**
   * Adet bazlı iade tutarı: tam siparişte (refundQuantity >= orderQuantity)
   * totalAmount'ın tamamı; kısmi adette orantılı (totalAmount * adet / siparişAdedi).
   */
  private computeRefundAmount(
    order: { totalAmount: Prisma.Decimal; quantity?: number },
    refundQuantity: number,
  ): number {
    const total = Number(order.totalAmount);
    const orderQty = order.quantity ?? 1;
    if (refundQuantity >= orderQty || orderQty <= 1) return total;
    return Math.round(((total * refundQuantity) / orderQty) * 100) / 100;
  }

  private async buildFinancialPolicySnapshot(
    order: {
      totalAmount: Prisma.Decimal;
      quantity?: number;
      shippingCost?: Prisma.Decimal;
      buyerShippingAmount?: Prisma.Decimal;
      buyerFeeAmount?: Prisma.Decimal;
      buyerServiceFeeAmount?: Prisma.Decimal;
      sellerFeeAmount?: Prisma.Decimal;
      sellerCommissionAmount?: Prisma.Decimal;
      sellerPlatformFeeAmount?: Prisma.Decimal;
      sellerShippingAmount?: Prisma.Decimal;
      package?: {
        shippingTariffId: string | null;
        shippingTariffVersion: number | null;
      } | null;
      product?: { shippingDesi: number } | null;
    },
    policy: RefundPolicyDecision,
    reason: string,
    refundQuantity: number,
    includeReturnShipping: boolean,
  ): Promise<{
    financials: RefundFinancialResult;
    returnBillableDesi: number;
    snapshot: Prisma.InputJsonValue;
  }> {
    const returnBillableDesi = Math.max(
      1,
      (order.product?.shippingDesi ?? 1) * refundQuantity,
    );
    let returnShippingAmount = 0;
    let tariffSnapshot: Record<string, unknown> | null = null;

    if (includeReturnShipping && this.shippingTariffService) {
      const tariff = order.package?.shippingTariffId
        ? await this.shippingTariffService.getById(
            order.package.shippingTariffId,
          )
        : await this.shippingTariffService.getActiveOutboundTariff("surat");
      returnShippingAmount = shippingAmountForDesi(
        tariff,
        returnBillableDesi,
      ).toNumber();
      tariffSnapshot = {
        tariffId: tariff.id,
        tariffVersion: tariff.version,
        provider: tariff.provider,
        desi: returnBillableDesi,
        amount: returnShippingAmount,
      };
    }

    const financials = calculateRefundFinancials(policy, {
      totalAmount: Number(order.totalAmount),
      buyerShippingAmount: Number(
        order.buyerShippingAmount ?? order.shippingCost ?? 0,
      ),
      buyerFeeAmount: Number(order.buyerFeeAmount ?? 0),
      buyerServiceFeeAmount: Number(order.buyerServiceFeeAmount ?? 0),
      sellerFeeAmount: Number(order.sellerFeeAmount ?? 0),
      sellerCommissionAmount: Number(order.sellerCommissionAmount ?? 0),
      sellerPlatformFeeAmount: Number(order.sellerPlatformFeeAmount ?? 0),
      returnShippingAmount,
      sellerShippingAmount: Number(order.sellerShippingAmount ?? 0),
      orderQuantity: order.quantity ?? 1,
      refundQuantity,
    });

    return {
      financials,
      returnBillableDesi,
      snapshot: {
        version: 1,
        reason,
        policy,
        financials,
        returnTariff: tariffSnapshot,
        createdAt: new Date().toISOString(),
      } as unknown as Prisma.InputJsonValue,
    };
  }

  /**
   * İadenin KARGO bacağının settlement karşılığı — üç iade yolunun TEK kaynağı.
   *
   * Escrow hold TAM kargoyu düştüğü için satıcı kendi payını peşin ödemiş sayılır:
   * kusur alıcıdaysa (ya da gönderi hiç taşınmadıysa) bu pay hold'da satıcıya
   * bırakılır. Ters yönde, satıcı kusurunda alıcıya geri ödenen gidiş kargosu ve
   * dönüş kargosu satıcıya borç yazılır (Sürat faturası platforma gelir).
   */
  private shippingSettlement(
    refundRequestId: string,
    financials: {
      sellerShippingCompensationAmount: number;
      outboundShippingChargeToSeller: number;
      returnShippingChargeToSeller: number;
    },
  ): {
    holdRetainedAmount: number;
    sellerAdjustments: Array<{
      sourceKey: string;
      amount: number;
      type: SellerAdjustmentType;
      refundRequestId: string;
    }>;
  } {
    return {
      holdRetainedAmount: financials.sellerShippingCompensationAmount,
      sellerAdjustments: [
        {
          sourceKey: `refund-return-shipping:${refundRequestId}`,
          amount: financials.returnShippingChargeToSeller,
          type: SellerAdjustmentType.return_shipping,
          refundRequestId,
        },
        {
          sourceKey: `refund-outbound-shipping:${refundRequestId}`,
          amount: financials.outboundShippingChargeToSeller,
          type: SellerAdjustmentType.outbound_shipping,
          refundRequestId,
        },
      ].filter((adjustment) => adjustment.amount > 0),
    };
  }

  private refundFinancialData(
    policy: RefundPolicyDecision,
    result: Awaited<ReturnType<RefundService["buildFinancialPolicySnapshot"]>>,
  ): RefundFinancialPersistenceData {
    const { financials } = result;
    return {
      policyCode: policy.policyCode,
      financialPolicySnapshot: result.snapshot,
      returnBillableDesi: result.returnBillableDesi,
      returnShippingAmount: financials.returnShippingAmount,
      refundedProductAmount: financials.productRefundAmount,
      refundedOutboundShippingAmount: financials.outboundShippingRefundAmount,
      refundedBuyerProtectionAmount: financials.buyerProtectionRefundAmount,
      refundedSellerFeeAmount: financials.sellerFeeRefundAmount,
      retainedSellerPlatformFeeAmount:
        financials.sellerPlatformFeeRetainedAmount,
      returnShippingChargeToBuyer: financials.returnShippingChargeToBuyer,
      returnShippingChargeToSeller: financials.returnShippingChargeToSeller,
      sellerShippingCompensationAmount:
        financials.sellerShippingCompensationAmount,
      outboundShippingChargeToSeller: financials.outboundShippingChargeToSeller,
      requiresAdminReview: policy.requiresAdminReview,
      penaltyReviewRequired: policy.penaltyReviewRequired,
      refundProductAmount: true,
      refundShippingFee: policy.refundOutboundShipping,
      refundBuyerFee: policy.refundBuyerProtectionFee,
      refundSellerCommission: financials.sellerFeeRefundAmount > 0,
      returnShippingPayer: policy.returnShippingPayer ?? null,
    };
  }

  // ── PaymentHold kilit yardımcıları (escrow ↔ iade çakışmasını önler) ──

  /**
   * İade açıldığında satıcı PaymentHold'unu kilitle: hiçbir release yolu
   * frozenByRefundId dolu bir hold'u serbest bırakamaz (releaseHoldsDue hem
   * dueHolds filtresinde hem atomik updateMany guard'ında kontrol eder). Bu,
   * "14. günün son saniyesinde iade + payout çoktan gitti" yarışını kapatır.
   */
  private async freezeHoldForRefund(
    orderId: string,
    refundRequestId: string,
  ): Promise<void> {
    await this.prisma.paymentHold.updateMany({
      where: { orderId, status: PaymentHoldStatus.held },
      data: { frozenByRefundId: refundRequestId },
    });
  }

  /** İade reddedilir/iptal edilirse hold kilidini kaldır → normal escrow akışına döner. */
  private async unfreezeHoldForRefund(orderId: string): Promise<void> {
    await this.prisma.paymentHold.updateMany({
      where: {
        orderId,
        status: PaymentHoldStatus.held,
        NOT: { frozenByRefundId: null },
      },
      data: { frozenByRefundId: null },
    });
  }

  private async createInstantRefund(
    order: {
      id: string;
      totalAmount: Prisma.Decimal;
      orderNumber: string;
      quantity?: number;
      shippingCost?: Prisma.Decimal;
      buyerShippingAmount?: Prisma.Decimal;
      buyerFeeAmount?: Prisma.Decimal;
      buyerServiceFeeAmount?: Prisma.Decimal;
      sellerFeeAmount?: Prisma.Decimal;
      sellerCommissionAmount?: Prisma.Decimal;
      sellerPlatformFeeAmount?: Prisma.Decimal;
      sellerShippingAmount?: Prisma.Decimal;
      package?: {
        shippingTariffId: string | null;
        shippingTariffVersion: number | null;
      } | null;
      product?: { shippingDesi: number } | null;
    },
    requesterId: string,
    dto: CreateRefundRequestDto,
    refundQuantity = 1,
    policy = resolveCancellationPolicy("changed_mind"),
  ) {
    const refundNumber = await this.generateRefundNumber();
    const financial = await this.buildFinancialPolicySnapshot(
      order,
      policy,
      dto.reason,
      refundQuantity,
      false,
    );
    const amount = financial.financials.buyerRefundAmount;

    let created;
    try {
      created = await this.prisma.refundRequest.create({
        data: {
          refundNumber,
          orderId: order.id,
          requesterId,
          reason: dto.reason,
          description: dto.description ?? null,
          evidencePhotoUrls: dto.evidencePhotoUrls ?? [],
          amount,
          refundQuantity,
          status: policy.requiresAdminReview
            ? RefundRequestStatus.pending_review
            : RefundRequestStatus.approved,
          ...this.refundFinancialData(policy, financial),
        },
      });
    } catch (error) {
      if (this.isDuplicateActiveRefund(error)) {
        throw new BadRequestException(
          i18nMessage("server.refund.alreadyActive"),
        );
      }
      throw error;
    }

    if (policy.requiresAdminReview) {
      await this.freezeHoldForRefund(order.id, created.id);
      await this.appendHistory(created.id, {
        action: "pending_admin_review",
        by: requesterId,
        details: { policyCode: policy.policyCode },
      });
      return created;
    }

    let refundResult: { providerRefundId: string };
    try {
      refundResult = await this.paymentService.processRefund(order.id, amount, {
        skipRefundEvent: true, // REFUND_COMPLETED'ı aşağıda kendimiz gönderiyoruz
        refundQuantity,
        idempotencyKey: `refund-request:${created.id}`,
        settlement: {
          closeOrder: refundQuantity >= (order.quantity ?? 1),
          holdPortion: Math.min(
            refundQuantity / Math.max(order.quantity ?? 1, 1),
            1,
          ),
          sellerFeeRefundAmount: financial.financials.sellerFeeRefundAmount,
          buyerFeeRefundAmount:
            financial.financials.buyerProtectionRefundAmount,
          ...this.shippingSettlement(created.id, financial.financials),
        },
      });
    } catch (err) {
      // A definite provider rejection can be retried as a new request. An
      // unknown provider outcome must remain visible and blocked until the
      // durable refund attempt is reconciled.
      if (!(err instanceof RefundPendingReconciliationException)) {
        await this.prisma.refundRequest.delete({ where: { id: created.id } });
      }
      this.logger.warn(
        `Instant refund failed for order ${order.orderNumber}, RefundRequest ${created.refundNumber} ` +
          `${err instanceof RefundPendingReconciliationException ? "retained for reconciliation" : "rolled back"}: ${(err as Error).message}`,
      );
      throw err;
    }

    // Hold tüketimi processRefund içinde yapıldı (tek otorite).
    // Kargo öncesi → İPTAL olarak işaretle (raporlama ayrımı).
    await this.prisma.order
      .update({
        where: { id: order.id },
        data: { cancellationType: "iptal" },
      })
      .catch(() => undefined);

    const updated = await this.prisma.refundRequest.update({
      where: { id: created.id },
      data: {
        status: RefundRequestStatus.refunded,
        refundedAt: new Date(),
        providerRefundId: refundResult.providerRefundId,
      },
    });

    // Anında iade önceden TAMAMEN sessizdi — alıcı para iadesini hiç öğrenmiyordu.
    // in_app + push (safeNotify) + markalı mail.
    await this.safeNotify(requesterId, NotificationType.REFUND_COMPLETED, {
      refundNumber,
      orderId: order.id,
    });
    await this.sendRefundEmail(created.id, "buyer", "refund-completed");
    // Satıcı tarafı: iade tamamlandı bildirimi + mail.
    const sellerRow = await this.prisma.order.findUnique({
      where: { id: order.id },
      select: { sellerId: true },
    });
    if (sellerRow?.sellerId) {
      await this.safeNotify(
        sellerRow.sellerId,
        NotificationType.REFUND_COMPLETED_SELLER,
        {
          refundNumber,
          orderId: order.id,
        },
      );
    }
    await this.sendRefundEmail(created.id, "seller", "refund-completed-seller");

    return updated;
  }

  /**
   * Cooling-off refund (≤14 days). 14-day right-of-withdrawal is statutory in
   * Türkiye — the seller cannot reject it. We auto-approve and either:
   *   - shipped/in_transit → wait_for_delivery; cron opens return shipment
   *     once the buyer actually has the item.
   *   - delivered → open return shipment immediately.
   */
  private async createCoolingOffRefund(
    order: {
      id: string;
      totalAmount: Prisma.Decimal;
      status: OrderStatus;
      shipment: { status: ShipmentStatus } | null;
      quantity?: number;
      shippingCost?: Prisma.Decimal;
      buyerShippingAmount?: Prisma.Decimal;
      buyerFeeAmount?: Prisma.Decimal;
      buyerServiceFeeAmount?: Prisma.Decimal;
      sellerFeeAmount?: Prisma.Decimal;
      sellerCommissionAmount?: Prisma.Decimal;
      sellerPlatformFeeAmount?: Prisma.Decimal;
      sellerShippingAmount?: Prisma.Decimal;
      package?: {
        shippingTariffId: string | null;
        shippingTariffVersion: number | null;
      } | null;
      product?: { shippingDesi: number } | null;
    },
    requesterId: string,
    dto: CreateRefundRequestDto,
    refundQuantity = 1,
    policy = resolveReturnPolicy(dto.reason),
  ) {
    const refundNumber = await this.generateRefundNumber();
    const financial = await this.buildFinancialPolicySnapshot(
      order,
      policy,
      dto.reason,
      refundQuantity,
      true,
    );
    const amount = financial.financials.buyerRefundAmount;
    const requiresReview = policy.requiresAdminReview;

    let created;
    try {
      created = await this.prisma.refundRequest.create({
        data: {
          refundNumber,
          orderId: order.id,
          requesterId,
          reason: dto.reason,
          description: dto.description ?? null,
          evidencePhotoUrls: dto.evidencePhotoUrls ?? [],
          amount,
          refundQuantity,
          status: requiresReview
            ? RefundRequestStatus.pending_review
            : RefundRequestStatus.wait_for_delivery,
          decidedBy: requiresReview ? null : "system",
          decidedAt: requiresReview ? null : new Date(),
          ...this.refundFinancialData(policy, financial),
        },
      });
    } catch (error) {
      if (this.isDuplicateActiveRefund(error)) {
        throw new BadRequestException(
          i18nMessage("server.refund.alreadyActive"),
        );
      }
      throw error;
    }

    // İade açıldı → satıcı hold'unu kilitle (payout bu iade kapanana kadar bloke).
    await this.freezeHoldForRefund(order.id, created.id);

    if (requiresReview) {
      await this.appendHistory(created.id, {
        action: "pending_admin_review",
        by: requesterId,
        details: {
          policyCode: policy.policyCode,
          penaltyReviewRequired: policy.penaltyReviewRequired,
        },
      });
      return created;
    }

    // 14 gün cayma hakkı → otomatik onay. Alıcıya talebinin onaylandığını bildir
    // (önceden talep anında hiç bildirim yoktu). in_app + push + mail.
    await this.safeNotify(requesterId, NotificationType.REFUND_APPROVED, {
      refundNumber,
      orderId: order.id,
    });
    await this.sendRefundEmail(created.id, "buyer", "refund-approved-buyer");

    // Ürün alıcıya ulaşmışsa (delivered/awaiting_buyer_confirmation/completed)
    // iade kargosunu hemen aç; aksi hâlde cron teslimatta açar.
    if (
      order.status === OrderStatus.delivered ||
      order.status === OrderStatus.awaiting_buyer_confirmation ||
      order.status === OrderStatus.completed
    ) {
      // Non-fatal: talep bu noktada zaten oluştu (hold frozen + bildirim gitti).
      // Sürat çökükse hatayı alıcıya 500 olarak yansıtma — kayıt
      // wait_for_delivery'de kalır ve refund-scheduler (10 dk) tam açılışı
      // yeniden dener (findPendingDeliveryToOpenReturn bu durumu kapsar).
      try {
        await this.openReturnShipment(created.id);
      } catch (e: any) {
        this.logger.error(
          `openReturnShipment failed inline for ${created.id} (${refundNumber}): ${e?.message}. Scheduler will retry.`,
        );
      }
      return this.prisma.refundRequest.findUnique({
        where: { id: created.id },
      });
    }

    return created;
  }

  private fallbackAddressFromOrderJson(json: Prisma.JsonValue | null) {
    if (!json || typeof json !== "object" || Array.isArray(json)) return null;
    const j = json as Record<string, any>;
    if (!j.fullName || !j.address || !j.city || !j.district || !j.phone)
      return null;
    return {
      fullName: String(j.fullName),
      address: String(j.address),
      city: String(j.city),
      district: String(j.district),
      phone: String(j.phone),
    };
  }

  /**
   * Satıcının kayıtlı adresi olmadığında iade kargosunun gideceği Tarodan deposu
   * adresi. Takas akışıyla (trade.service) aynı env kaynağını kullanır; env yoksa
   * mantıklı varsayılanlara düşer (asla null dönmez) → adressiz satıcı iadeyi bloke etmez.
   */
  private warehouseReturnAddress() {
    return {
      fullName: process.env.TARODAN_WAREHOUSE_NAME?.trim() || "Tarodan Depo",
      address:
        process.env.TARODAN_WAREHOUSE_ADDRESS?.trim() ||
        "Tarodan Merkez Depo Adresi",
      city: process.env.TARODAN_WAREHOUSE_CITY?.trim() || "Istanbul",
      district: process.env.TARODAN_WAREHOUSE_DISTRICT?.trim() || "Maltepe",
      phone: process.env.TARODAN_WAREHOUSE_PHONE?.trim() || "05000000000",
    };
  }

  // NOT (M4): iade barkodu için ayrı bir retry yüzeyi YOK — bilinçli.
  // openReturnShipment BLOCKING'tir: Sürat başarısızsa throw eder ve hiçbir şey
  // yazmaz (returnProvider="surat" + kodsuz durum oluşamaz). Kurtarma yolu
  // refund-scheduler'dır: kayıt wait_for_delivery'de kalır ve
  // openReturnShipmentsForDeliveredOrders (10 dk) tam açılışı yeniden dener.

  /**
   * Admin: RefundRequest policy override (Faz 4B.1 + 4F).
   * 4 boolean alandan herhangi biri/hepsi güncellenebilir.
   * Yeni policy'ye göre RefundRequest.amount yeniden hesaplanır (Faz 4F).
   */
  async overrideRefundPolicy(
    refundRequestId: string,
    adminId: string,
    payload: {
      refundProductAmount?: boolean;
      refundShippingFee?: boolean;
      refundBuyerFee?: boolean;
      refundSellerCommission?: boolean;
    },
  ) {
    const before = await this.prisma.refundRequest.findUnique({
      where: { id: refundRequestId },
      include: { order: true },
    });
    if (!before) {
      throw new NotFoundException(i18nMessage("server.refund.notFound"));
    }
    if (
      before.policyCode !== "legacy" ||
      before.status !== RefundRequestStatus.pending_review
    ) {
      throw new BadRequestException(
        "Snapshot tabanlı iade politikası değiştirilemez",
      );
    }

    // Yeni policy değerleri (mevcut + payload merge)
    const policy = {
      refundProductAmount:
        payload.refundProductAmount ?? before.refundProductAmount,
      refundShippingFee: payload.refundShippingFee ?? before.refundShippingFee,
      refundBuyerFee: payload.refundBuyerFee ?? before.refundBuyerFee,
      refundSellerCommission:
        payload.refundSellerCommission ?? before.refundSellerCommission,
    };

    // Yeni iade tutarı (kısmi iade — Faz 4F)
    const newAmount = this.computePartialRefundAmount(policy, before.order);

    const updated = await this.prisma.refundRequest.update({
      where: { id: refundRequestId },
      data: {
        refundProductAmount: policy.refundProductAmount,
        refundShippingFee: policy.refundShippingFee,
        refundBuyerFee: policy.refundBuyerFee,
        refundSellerCommission: policy.refundSellerCommission,
        amount: newAmount,
      },
    });

    await this.appendHistory(refundRequestId, {
      action: "policy_overridden",
      by: adminId,
      details: {
        before: {
          refundProductAmount: before.refundProductAmount,
          refundShippingFee: before.refundShippingFee,
          refundBuyerFee: before.refundBuyerFee,
          refundSellerCommission: before.refundSellerCommission,
          amount: before.amount,
        },
        after: { ...policy, amount: newAmount.toString() },
      },
    });

    this.logger.log(
      `RefundRequest ${refundRequestId} policy overridden by admin ${adminId}; new amount=${newAmount}`,
    );
    return updated;
  }

  /**
   * Kısmi iade tutarı hesaplaması (Faz 4F).
   * Spec Bölüm 7 — policy boolean'larına göre order'ın
   * subtotal/shipping/buyerFee toplamı.
   *
   * NOT: refundSellerCommission satıcıdan tahsil işidir; alıcının iade
   * tutarına eklenmez. Satıcı tahsilatı PaymentHold / PayoutTransfer
   * mahsuplaşmasıyla yapılır (kapsam dışı — Faz 5+).
   */
  private computePartialRefundAmount(
    policy: {
      refundProductAmount: boolean;
      refundShippingFee: boolean;
      refundBuyerFee: boolean;
    },
    order: {
      totalAmount: any;
      subtotal: any | null;
      shippingCost: any;
      buyerFeeAmount: any;
    },
  ): any {
    const D = (Prisma as any).Decimal;
    const shippingCost = new D(order.shippingCost ?? 0);
    const buyerFeeAmount = new D(order.buyerFeeAmount ?? 0);

    // Ürün için iade edilecek tutar = alıcının ürüne FİİLEN ödediği tutar.
    // totalAmount = ödenenÜrünTutarı + shipping + buyerFee (bkz. order.service checkout)
    // olduğundan ödenenÜrünTutarı = totalAmount - shipping - buyerFee.
    // Stored subtotal kullanılmaz: (a) çoğu eski/seed siparişte NULL,
    // (b) indirim ÖNCESİ orijinal fiyatı tutar -> indirimli siparişte fazla iade.
    const productAmount = new D(order.totalAmount ?? 0)
      .sub(shippingCost)
      .sub(buyerFeeAmount);

    let amount = new D(0);
    if (policy.refundProductAmount) {
      amount = amount.add(
        productAmount.isNegative() ? new D(0) : productAmount,
      );
    }
    if (policy.refundShippingFee) {
      amount = amount.add(shippingCost);
    }
    if (policy.refundBuyerFee) {
      amount = amount.add(buyerFeeAmount);
    }
    return amount;
  }

  /**
   * Admin: İade kargosu kim öder (Faz 4B.1).
   */
  async setReturnShippingPayer(
    refundRequestId: string,
    adminId: string,
    payer: "buyer" | "seller" | "platform",
  ) {
    const before = await this.prisma.refundRequest.findUnique({
      where: { id: refundRequestId },
      select: {
        id: true,
        status: true,
        policyCode: true,
        returnShippingPayer: true,
      },
    });
    if (!before) {
      throw new NotFoundException(i18nMessage("server.refund.notFound"));
    }
    if (
      before.policyCode !== "legacy" ||
      before.status !== RefundRequestStatus.pending_review
    ) {
      throw new BadRequestException(
        "Snapshot tabanlı iade kargo tarafı değiştirilemez",
      );
    }

    const updated = await this.prisma.refundRequest.update({
      where: { id: refundRequestId },
      data: { returnShippingPayer: payer as any },
    });

    await this.appendHistory(refundRequestId, {
      action: "return_shipping_payer_changed",
      by: adminId,
      details: { before: before.returnShippingPayer, after: payer },
    });

    this.logger.log(
      `RefundRequest ${refundRequestId} returnShippingPayer set to ${payer} by admin ${adminId}`,
    );
    return updated;
  }
}
