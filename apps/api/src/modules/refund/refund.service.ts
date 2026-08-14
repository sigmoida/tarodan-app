import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { RefundReason, RefundRequestStatus } from "@prisma/client";
import { PrismaService } from "../../prisma";
import { CreateRefundRequestDto } from "./dto/create-refund-request.dto";
import { NotificationType } from "../notification/dto/notification.dto";
import { i18nMessage } from "../i18n";
import { type RefundFaultPartyV2 } from "./helpers/refund-financial-policy-v2";
import { PUBLIC_NAME_SELECT } from "../../common/helpers/public-identity";
import { RefundNotificationService } from "./refund-notification.service";
import { RefundFinancialService } from "./refund-financial.service";
import { RefundShipmentService } from "./refund-shipment.service";
import { RefundCreationService } from "./refund-creation.service";
import { RefundDecisionService } from "./refund-decision.service";

/**
 * İade modülünün dış yüzü. Kendi başına iş yapmaz: talebin doğuşu, para hesabı,
 * fiziksel dönüş ve admin kararı ayrı servislerde yaşar (§2). Burada yalnız
 * çağıranların tanıdığı imzalar ile alıcı/satıcı okuma yolları durur — tek bir
 * `RefundService` adresi vardır, arkasındaki bölünme çağıranı ilgilendirmez.
 */
@Injectable()
export class RefundService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: RefundNotificationService,
    private readonly financials: RefundFinancialService,
    private readonly shipments: RefundShipmentService,
    private readonly creation: RefundCreationService,
    private readonly decisions: RefundDecisionService,
  ) {}

  /**
   * Admin karar ekranının önizlemesi. Hesap RefundFinancialService'te yaşar;
   * bu imza admin tarafının bildiği tek giriş noktası olduğu için burada kalır.
   */
  previewRefundDecision(
    refundRequestId: string,
    resolvedReason: RefundReason,
    faultParty: RefundFaultPartyV2,
    allowNonReview = false,
  ) {
    return this.financials.previewRefundDecision(
      refundRequestId,
      resolvedReason,
      faultParty,
      allowNonReview,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Talep açılışı — RefundCreationService
  // ─────────────────────────────────────────────────────────────────────────────

  createRefundRequest(
    orderId: string,
    requesterId: string,
    dto: CreateRefundRequestDto,
  ) {
    return this.creation.createRefundRequest(orderId, requesterId, dto);
  }

  createCancellationRefund(
    ...args: Parameters<RefundCreationService["createCancellationRefund"]>
  ) {
    return this.creation.createCancellationRefund(...args);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Admin kararı — RefundDecisionService
  // ─────────────────────────────────────────────────────────────────────────────

  adminApproveRefundRequest(
    ...args: Parameters<RefundDecisionService["adminApproveRefundRequest"]>
  ) {
    return this.decisions.adminApproveRefundRequest(...args);
  }

  adminRejectRefundRequest(
    ...args: Parameters<RefundDecisionService["adminRejectRefundRequest"]>
  ) {
    return this.decisions.adminRejectRefundRequest(...args);
  }

  adminCloseRefundRequest(
    ...args: Parameters<RefundDecisionService["adminCloseRefundRequest"]>
  ) {
    return this.decisions.adminCloseRefundRequest(...args);
  }

  adminMarkRefundDisputed(
    ...args: Parameters<RefundDecisionService["adminMarkRefundDisputed"]>
  ) {
    return this.decisions.adminMarkRefundDisputed(...args);
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
    await this.financials.unfreezeHoldForRefund(rr.order.id);
    await this.notifications.appendHistory(refundRequestId, {
      action: "cancelled_by_buyer",
      by: requesterId,
      details: { previousStatus: rr.status },
    });
    await this.notifications.safeNotify(
      rr.order.sellerId,
      NotificationType.REFUND_CANCELLED,
      {
        refundNumber: rr.refundNumber,
        orderId: rr.order.id,
        // Alıcı KENDİ talebini iptal etti → bildirim SATICIYA gider; hedef
        // ekran audience'tan seçilir (satıcının sipariş sayfası).
        audience: "seller",
      },
    );
    return updated;
  }

  async getById(refundRequestId: string, userId: string, isAdmin = false) {
    const rr = await this.prisma.refundRequest.findUnique({
      where: { id: refundRequestId },
      include: {
        order: {
          include: {
            buyer: {
              select: { id: true, ...PUBLIC_NAME_SELECT, avatarUrl: true },
            },
            seller: {
              select: { id: true, ...PUBLIC_NAME_SELECT, avatarUrl: true },
            },
            product: { select: { id: true, title: true, images: true } },
            shipment: true,
            payment: { select: { amount: true, currency: true, paidAt: true } },
          },
        },
        requester: { select: { id: true, ...PUBLIC_NAME_SELECT } },
      },
    });
    if (!rr) throw new NotFoundException(i18nMessage("server.refund.notFound"));

    if (!isAdmin && rr.requesterId !== userId && rr.order.sellerId !== userId) {
      throw new ForbiddenException(i18nMessage("server.refund.viewForbidden"));
    }
    return this.notifications.withResolvedImages(rr);
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
    return rows.map((rr) => this.notifications.withResolvedImages(rr));
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
        requester: { select: { id: true, ...PUBLIC_NAME_SELECT } },
      },
    });
    return rows.map((rr) => this.notifications.withResolvedImages(rr));
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // İade kargosu — RefundShipmentService'e delege edilir. İmzalar burada kalır
  // çünkü çağıranlar (refund-scheduler, admin, Sürat takip senkronu) RefundService'i
  // tanır; taşınan tek şey uygulama.
  // ─────────────────────────────────────────────────────────────────────────────

  openReturnShipment(refundRequestId: string) {
    return this.shipments.openReturnShipment(refundRequestId);
  }

  finalizeRefundForReturnedShipment(refundRequestId: string) {
    return this.shipments.finalizeRefundForReturnedShipment(refundRequestId);
  }

  findPendingDeliveryToOpenReturn(): Promise<string[]> {
    return this.shipments.findPendingDeliveryToOpenReturn();
  }

  findReturnDeliveredPendingFinalize(): Promise<string[]> {
    return this.shipments.findReturnDeliveredPendingFinalize();
  }

  expireStaleOpenReturns(): Promise<number> {
    return this.shipments.expireStaleOpenReturns();
  }

  expireStaleWaitForDelivery(): Promise<number> {
    return this.shipments.expireStaleWaitForDelivery();
  }

  applyReturnTrackingUpdate(
    ...args: Parameters<RefundShipmentService["applyReturnTrackingUpdate"]>
  ) {
    return this.shipments.applyReturnTrackingUpdate(...args);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Internal helpers
  // ─────────────────────────────────────────────────────────────────────────────

  // NOT: overrideRefundPolicy / setReturnShippingPayer / computePartialRefundAmount
  // KALDIRILDI. `policyCode === "legacy"` şartına bağlıydılar; refundFinancialData
  // her kayda gerçek policy kodu yazdığı için hiçbir üretim kaydında çalışamıyorlardı
  // ve computePartialRefundAmount vergileri tamamen yok sayan ÜÇÜNCÜ bir tutar
  // formülüydü. Karar akışı tek kaynaktan yürür: previewRefundDecision +
  // finalizeV2RefundDecision (bileşen bazlı politika).
}
