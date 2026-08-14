import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { OrderStatus, RefundReason, RefundRequestStatus } from "@prisma/client";
import { PrismaService } from "../../prisma";
import { PaymentService } from "../payment/payment.service";
import { NotificationType } from "../notification/dto/notification.dto";
import { i18nMessage } from "../i18n";
import { type RefundFaultPartyV2 } from "./helpers/refund-financial-policy-v2";
import { RefundNotificationService } from "./refund-notification.service";
import { RefundFinancialService } from "./refund-financial.service";
import { RefundShipmentService } from "./refund-shipment.service";

/**
 * Admin'in bir iade talebi hakkındaki KARARI — RefundService'ten birebir
 * taşındı: onay (parayı hareket ettirir ya da fiziksel dönüşü başlatır), ret,
 * takılı talebin kapatılması ve ihtilaflı işaretleme.
 *
 * Karar anında para hesabı yeniden yapılmaz; RefundFinancialService'in
 * önizlemede ürettiği token'a bağlanır — admin ekranında gösterilen tutarla
 * yazılan tutarın aynı olmasının garantisi budur.
 */
@Injectable()
export class RefundDecisionService {
  private readonly logger = new Logger(RefundDecisionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentService: PaymentService,
    private readonly notifications: RefundNotificationService,
    private readonly financials: RefundFinancialService,
    private readonly shipments: RefundShipmentService,
  ) {}

  /**
   * Recalculates a reviewed v2 decision from immutable order data and the
   * currently active return tariff. The token binds approval to this exact
   * calculation; no financial rows are written by preview.
   */
  async adminApproveRefundRequest(
    refundRequestId: string,
    adminId: string,
    note?: string,
    decision?: {
      resolvedReason: RefundReason;
      faultParty: RefundFaultPartyV2;
      calculationToken: string;
    },
  ) {
    let lifecyclePreservingFinancialReview = false;
    if (decision) {
      const decisionTarget = await this.prisma.refundRequest.findUnique({
        where: { id: refundRequestId },
        select: { status: true, financialReviewRequired: true },
      });
      if (!decisionTarget) {
        throw new NotFoundException(i18nMessage("server.refund.notFound"));
      }
      lifecyclePreservingFinancialReview =
        decisionTarget.financialReviewRequired &&
        decisionTarget.status !== RefundRequestStatus.pending_review;
      const finalized = await this.financials.finalizeV2RefundDecision(
        refundRequestId,
        adminId,
        decision,
        lifecyclePreservingFinancialReview
          ? { allowNonReview: true, requireFinancialReview: true }
          : {},
      );
      if (lifecyclePreservingFinancialReview) {
        // The parcel may already be with the carrier. Only the immutable money
        // decision is finalized; status, custody and hold timing stay intact.
        await this.notifications.appendHistory(refundRequestId, {
          action: "financial_review_finalized",
          by: adminId,
          details: { note: note?.trim() || null },
        });
        return finalized;
      }
    }
    const rr = await this.prisma.refundRequest.findUnique({
      where: { id: refundRequestId },
      include: {
        financialComponents: true,
        order: {
          select: {
            id: true,
            sellerId: true,
            status: true,
            quantity: true,
            // legacyBuyerFeeNetOf'un KDV fallback'i bu kolonu okur — select
            // edilmezse oran 0 sanılır ve deftere BRÜT ücret gider (K6'nın ta
            // kendisi, bu kez select eksiğinden).
            serviceVatRate: true,
          },
        },
      },
    });
    if (!rr) throw new NotFoundException(i18nMessage("server.refund.notFound"));
    if (rr.status !== RefundRequestStatus.pending_review) {
      throw new BadRequestException(
        i18nMessage("server.refund.approvePendingOnly"),
      );
    }
    if (rr.policyVersion >= 2 && !rr.policyFinalizedAt) {
      throw new BadRequestException(
        i18nMessage("server.refund.v2DecisionRequired"),
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
            ...this.financials.feeSettlementFromComponents(
              rr.financialComponents,
              {
                sellerFeeAmount: Number(rr.refundedSellerFeeAmount),
                // Defter NET tutar ister (K6): brüt kolon yerine snapshot'taki net.
                buyerFeeAmount: this.financials.legacyBuyerFeeNetOf(rr),
              },
            ),
            ...this.financials.shippingSettlement(rr.id, {
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
          providerRefundId: refundResult?.providerRefundId ?? null,
        },
      });
      await this.prisma.order.update({
        where: { id: rr.orderId },
        data: { cancellationType: "iptal" },
      });
      await this.notifications.appendHistory(rr.id, {
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
    await this.notifications.appendHistory(rr.id, {
      action: "approved_by_admin",
      by: adminId,
      details: { note: note?.trim() || null },
    });
    await this.notifications.safeNotify(
      rr.requesterId,
      NotificationType.REFUND_APPROVED,
      {
        refundNumber: rr.refundNumber,
        orderId: rr.orderId,
      },
    );

    if (
      rr.order.status === OrderStatus.delivered ||
      rr.order.status === OrderStatus.awaiting_buyer_confirmation ||
      rr.order.status === OrderStatus.completed
    ) {
      try {
        return await this.shipments.openReturnShipment(rr.id);
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
      throw new BadRequestException(
        i18nMessage("server.refund.rejectReasonRequired"),
      );
    }
    const rr = await this.prisma.refundRequest.findUnique({
      where: { id: refundRequestId },
      include: { order: { select: { id: true } } },
    });
    if (!rr) throw new NotFoundException(i18nMessage("server.refund.notFound"));
    if (rr.status !== RefundRequestStatus.pending_review) {
      throw new BadRequestException(
        i18nMessage("server.refund.rejectPendingOnly"),
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
    await this.financials.unfreezeHoldForRefund(rr.order.id);
    await this.notifications.appendHistory(rr.id, {
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
    await this.financials.unfreezeHoldForRefund(rr.order.id);
    await this.notifications.appendHistory(refundRequestId, {
      action: "closed_by_admin",
      by: adminId,
      details: { previousStatus: rr.status, reason: reason ?? null },
    });
    await this.notifications.safeNotify(
      rr.requesterId,
      NotificationType.REFUND_CANCELLED,
      {
        refundNumber: rr.refundNumber,
        orderId: rr.order.id,
        // Admin kapattı → talebin sahibi olan ALICIYA gider.
        audience: "buyer",
      },
    );
    return updated;
  }

  /**
   * O3: Admin, satıcı itirazı/şüphe hâlinde iadeyi `disputed`'a çeker —
   * return_delivered'daki 24 saatlik otomatik finalize penceresi durur
   * (finalize cron'u yalnız return_delivered tarar; aktif-statü kümesi
   * disputed'ı içerdiği için hold da donuk kalır). Çıkış yolları:
   * force-finalize (alıcıya iade) veya close (iadesiz kapatma, MONEY-H6).
   */
  async adminMarkRefundDisputed(
    refundRequestId: string,
    adminId: string,
    note: string,
  ) {
    if (!note?.trim() || note.trim().length < 10) {
      throw new BadRequestException(
        i18nMessage("server.refund.appealReasonTooShort"),
      );
    }
    const allowed: RefundRequestStatus[] = [
      RefundRequestStatus.return_in_transit,
      RefundRequestStatus.return_delivered,
    ];
    const rr = await this.prisma.refundRequest.findUnique({
      where: { id: refundRequestId },
      select: { id: true, status: true },
    });
    if (!rr) throw new NotFoundException(i18nMessage("server.refund.notFound"));
    if (!allowed.includes(rr.status)) {
      throw new BadRequestException(
        `Talep durumu '${rr.status}' itiraz işaretlemek için uygun değil. ` +
          `Beklenen: ${allowed.join(", ")}`,
      );
    }
    // CAS: finalize cron'u / Sürat sync ile yarışta yalnız biri kazanır.
    const claimed = await this.prisma.refundRequest.updateMany({
      where: { id: refundRequestId, status: { in: allowed } },
      data: { status: RefundRequestStatus.disputed },
    });
    if (claimed.count === 0) {
      throw new ConflictException(
        i18nMessage("server.refund.advancedElsewhere"),
      );
    }
    await this.notifications.appendHistory(refundRequestId, {
      action: "marked_disputed",
      by: adminId,
      details: { previousStatus: rr.status, note: note.trim() },
    });
    return this.prisma.refundRequest.findUnique({
      where: { id: refundRequestId },
    });
  }
}
