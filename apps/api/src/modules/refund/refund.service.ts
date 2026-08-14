import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import {
  OrderStatus,
  OrderCancellationReason,
  PaymentStatus,
  Prisma,
  RefundReason,
  RefundRequestStatus,
  ShipmentStatus,
} from "@prisma/client";
import { PrismaService } from "../../prisma";
import { DiscountService } from "../discount/discount.service";
import {
  PAYMENT_CONFIG_KEYS,
  envConfigNumber,
} from "../payment/payment.constants";
import { isShipmentHandedToCarrier } from "../shipping/shipment-handover";
import { ACTIVE_REFUND_REQUEST_STATUSES } from "./refund-active-statuses";
import { generateUniqueReference } from "../../common/helpers/generate-reference";
import { REFERENCE_PREFIX } from "../../common/helpers/code-prefixes";
import { PaymentService } from "../payment/payment.service";
import { RefundPendingReconciliationException } from "../payment-providers/refund-errors";
import {
  CARGO_PROVIDER,
  type CargoProvider,
} from "../surat-cargo/cargo-provider";
import { SuratTrackingService } from "../surat-cargo/surat-tracking.service";
import { canTransitionShipmentStatus } from "../shipping/shipment-state-machine";
import { CarrierCancellationService } from "../surat-cargo/carrier-cancellation.service";
import { CreateRefundRequestDto } from "./dto/create-refund-request.dto";
import { NotificationService } from "../notification/notification.service";
import { NotificationType } from "../notification/dto/notification.dto";
import { StorageService } from "../storage/storage.service";
import { i18nMessage } from "../i18n";
import { ShippingTariffService } from "../shipping/shipping-tariff.service";
import {
  resolveCancellationPolicy,
  resolveReturnPolicy,
} from "./refund-financial-policy";
import { type RefundFaultPartyV2 } from "./refund-financial-policy-v2";
import { PUBLIC_NAME_SELECT } from "../../common/helpers/public-identity";
import { platformWarehouseAddress } from "../../config/warehouse";
import { RefundNotificationService } from "./refund-notification.service";
import { RefundFinancialService } from "./refund-financial.service";

/**
 * Cayma (iade talep) penceresi — satıcı payout takvimiyle AYNI kaynaktan gelir
 * (PAYMENT_CONFIG_KEYS.RETURN_WINDOW_DAYS). Burada gömülü bir 14 tutmak,
 * env'den okunan payout penceresiyle sessizce kaymasına yol açıyordu.
 */
const coolingOffDays = () =>
  envConfigNumber(PAYMENT_CONFIG_KEYS.RETURN_WINDOW_DAYS);

@Injectable()
export class RefundService {
  private readonly logger = new Logger(RefundService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentService: PaymentService,
    @Inject(CARGO_PROVIDER) private readonly cargo: CargoProvider,
    private readonly carrierCancellations: CarrierCancellationService,
    private readonly suratTrackingService: SuratTrackingService,
    private readonly notificationService: NotificationService,
    private readonly storageService: StorageService,
    private readonly notifications: RefundNotificationService,
    private readonly financials: RefundFinancialService,
    @Optional()
    private readonly shippingTariffService?: ShippingTariffService,
    @Optional()
    private readonly discountService?: DiscountService,
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
    // Sanal siparişler (üyelik MEM-, öne çıkarma BST-) genel iade akışına
    // girmez: teslimatı olmayan dijital hizmetlerdir. BST- eskiden muaf
    // değildi — boost siparişi completed + teslimatsız olduğundan cayma
    // penceresinde sayılıp API'den iade talebi açılabiliyordu.
    if (
      order.orderNumber?.startsWith("MEM-") ||
      order.orderNumber?.startsWith("BST-")
    ) {
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
        i18nMessage("server.refund.evidenceRequired"),
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
        i18nMessage("server.refund.cancelPaidPreShipmentOnly"),
      );
    }
    // Devir tanımı TEK KAYNAK (shipment-handover): hareket eden durum VEYA
    // shippedAt. Yalnız statüye bakmak yetmiyordu — Sürat bilinmeyen bir durum
    // kodu döndürdüğünde poller statüyü değiştirmeden shippedAt yazıyor ve koli
    // fiilen yoldayken iptal kabul ediliyordu.
    if (isShipmentHandedToCarrier(order.shipment)) {
      throw new BadRequestException(
        i18nMessage("server.order.cancelAfterHandover"),
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
    const financial = await this.financials.buildFinancialPolicySnapshot(
      order,
      policy,
      reasonCode,
      order.quantity ?? 1,
      false,
    );
    const refundNumber = await this.generateRefundNumber();
    let created;
    try {
      /**
       * İptal talebi, sipariş satırı KİLİTLİYKEN ve uygunluk koşulları YENİDEN
       * doğrulanarak yazılır. Eskiden uygunluk düz bir okumayla (preflight)
       * kontrol ediliyor, talep ise kilitsiz yazılıyordu: satıcının "kargoya
       * verdim" isteği tam bu aralıkta commit olursa kargolanmış sipariş iptal
       * ediliyor ve parası iade ediliyordu.
       *
       * Karşı yön de kapalıdır: kargoya veriliş yolu da aynı satır kilidini
       * alır ve AKTİF iade talebi görürse reddeder (shipping.service). Yani iki
       * komuttan hangisi önce commit ederse diğeri temiz bir hatayla düşer.
       */
      created = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM orders WHERE id = ${order.id} FOR UPDATE`;
        const fresh = await tx.order.findUnique({
          where: { id: order.id },
          select: {
            status: true,
            shipment: { select: { status: true, shippedAt: true } },
          },
        });
        if (
          !fresh ||
          (fresh.status !== OrderStatus.paid &&
            fresh.status !== OrderStatus.preparing)
        ) {
          throw new BadRequestException(
            i18nMessage("server.refund.orderStatusChanged"),
          );
        }
        if (isShipmentHandedToCarrier(fresh.shipment)) {
          throw new BadRequestException(
            i18nMessage("server.order.cancelAfterHandover"),
          );
        }
        return tx.refundRequest.create({
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
            ...this.financials.refundFinancialData(policy, financial),
            ...(policy.requiresAdminReview &&
            this.financials.refundPolicyV2Enabled()
              ? {
                  policyVersion: 2,
                  financialReviewRequired: true,
                  financialPolicySnapshot: {
                    version: 2,
                    provisional: true,
                    claimReason: reasonCode,
                    legacyProvisionalCalculation: financial.snapshot,
                  } as unknown as Prisma.InputJsonValue,
                }
              : {}),
          },
        });
      });
    } catch (error) {
      if (this.isDuplicateActiveRefund(error)) {
        throw new BadRequestException(
          i18nMessage("server.refund.alreadyActive"),
        );
      }
      throw error;
    }
    if (
      !policy.requiresAdminReview &&
      this.financials.refundPolicyV2Enabled()
    ) {
      created = await this.financials.finalizeAutomaticV2RefundDecision(
        created.id,
        reasonCode === OrderCancellationReason.delivery_delayed
          ? RefundReason.delivery_delayed
          : RefundReason.changed_mind,
        reasonCode === OrderCancellationReason.delivery_delayed
          ? "seller"
          : "buyer",
      );
    }
    await this.financials.freezeHoldForRefund(order.id, created.id);
    await this.prisma.order.update({
      where: { id: order.id },
      data: {
        cancellationReasonCode: reasonCode,
        cancelReason: description?.trim() || reasonCode,
        cancellationPolicySnapshot: financial.snapshot,
      },
    });

    if (policy.requiresAdminReview) {
      await this.notifications.appendHistory(created.id, {
        action: "cancellation_pending_admin_review",
        by: requesterId,
        details: { reasonCode, policyCode: policy.policyCode },
      });
      await this.notifications.notifyRefundRequestOpened({
        refundRequestId: created.id,
        refundNumber,
        orderId: order.id,
        sellerId: order.sellerId,
        reason: reasonCode,
        requiresAdminReview: true,
      });
      return created;
    }

    // `processRefund` resolves to null when the attempt was already finalized —
    // an idempotent no-op, not a failure — so the variable has to be able to
    // hold that, and readers fall back the same way a missing provider id does.
    let refundResult: { providerRefundId?: string } | null;
    try {
      refundResult = await this.paymentService.processRefund(
        order.id,
        Number(created.amount),
        {
          skipRefundEvent: true,
          refundQuantity: order.quantity ?? 1,
          idempotencyKey: `refund-request:${created.id}`,
          settlement: {
            closeOrder: true,
            holdPortion: 1,
            ...this.financials.feeSettlementFromComponents(
              (created as any).financialComponents,
              {
                sellerFeeAmount: financial.financials.sellerFeeRefundAmount,
                // Defter NET tutar ister; brüt beslemek KDV kadar fazla ters
                // kayıt üretir (K6).
                buyerFeeAmount:
                  financial.financials.buyerProtectionNetRefundAmount,
              },
            ),
            ...this.financials.shippingSettlement(created.id, {
              sellerShippingCompensationAmount: Number(
                created.sellerShippingCompensationAmount,
              ),
              outboundShippingChargeToSeller: Number(
                created.outboundShippingChargeToSeller,
              ),
              returnShippingChargeToSeller: Number(
                created.returnShippingChargeToSeller,
              ),
            }),
          },
        },
      );
    } catch (error) {
      if (!(error instanceof RefundPendingReconciliationException)) {
        await this.prisma.refundRequest.update({
          where: { id: created.id },
          data: {
            status: RefundRequestStatus.pending_review,
            financialReviewRequired: true,
          },
        });
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
        providerRefundId: refundResult?.providerRefundId ?? null,
      },
    });
    await this.prisma.order.update({
      where: { id: order.id },
      data: { cancellationType: "iptal" },
    });
    await this.notifications.appendHistory(created.id, {
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
        i18nMessage("server.refund.shipmentApprovedOnly"),
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

    if (!this.cargo.isEnabled()) {
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
      await this.notifications.appendHistory(rr.id, {
        action: "return_opened",
        by: "system",
        details: { provider: "manual", trackingNumber: rr.refundNumber },
      });
      await this.notifications.safeNotify(
        rr.requesterId,
        NotificationType.REFUND_RETURN_OPENED,
        {
          refundNumber: rr.refundNumber,
          orderId: rr.orderId,
          trackingNumber: rr.refundNumber,
        },
      );
      await this.notifications.sendRefundEmail(
        rr.id,
        "buyer",
        "refund-return-label-buyer",
        {
          returnTrackingNumber: rr.refundNumber,
        },
      );
      return updated;
    }

    const result = await this.cargo.createShipment({
      idempotencyKey: `surat:refund-return:${rr.refundNumber}`,
      correlationId: `refund-${rr.id}`,
      reference: rr.refundNumber,
      recipient: {
        name: sellerAddr.fullName || rr.order.seller.displayName,
        address: sellerAddr.address,
        city: sellerAddr.city,
        district: sellerAddr.district,
        phone: sellerAddr.phone,
      },
      content: `İade: ${rr.order.orderNumber}`,
      isReturn: true,
      desi: rr.returnBillableDesi,
    });

    if (!result.ok) {
      const r = result as any;
      const errMsg = r.kind === "business" ? r.message : `technical: ${r.code}`;
      throw new BadRequestException(
        i18nMessage("server.refund.suratShipmentFailed", { reason: errMsg }),
      );
    }

    const updated = await this.prisma.refundRequest.update({
      where: { id: rr.id },
      data: {
        status: RefundRequestStatus.return_shipment_open,
        returnProvider: "surat",
        returnTrackingNumber: rr.refundNumber,
        // Gerçek Sürat kodu şube kabulünden önce null kalabilir; kullanıcı
        // paketi returnTrackingNumber (OzelKargoTakipNo) ile şubeye teslim eder.
        returnProviderTrackingId: result.trackingCode,
        returnLabelZpl: result.labelData,
        returnStatus: ShipmentStatus.label_created,
        returnCreatedAt: new Date(),
      },
    });
    await this.notifications.appendHistory(rr.id, {
      action: "return_opened",
      by: "system",
      details: { provider: "surat", trackingNumber: rr.refundNumber },
    });
    await this.notifications.safeNotify(
      rr.requesterId,
      NotificationType.REFUND_RETURN_OPENED,
      {
        refundNumber: rr.refundNumber,
        orderId: rr.orderId,
        trackingNumber: rr.refundNumber,
      },
    );
    await this.notifications.sendRefundEmail(
      rr.id,
      "buyer",
      "refund-return-label-buyer",
      {
        returnTrackingNumber: rr.refundNumber,
        cargoCompany: "Sürat Kargo",
      },
    );
    return updated;
  }

  async finalizeRefundForReturnedShipment(refundRequestId: string) {
    const rr = await this.prisma.refundRequest.findUnique({
      where: { id: refundRequestId },
      include: { order: true, financialComponents: true },
    });
    if (!rr) throw new NotFoundException(i18nMessage("server.refund.notFound"));
    if (rr.status === RefundRequestStatus.refunded) return rr;
    if (rr.financialReviewRequired && !rr.policyFinalizedAt) {
      throw new BadRequestException(
        i18nMessage("server.refund.financialReviewPending"),
      );
    }

    // MONEY-M1: Atomik CLAIM. Bu metod 3 yoldan EŞZAMANLI çağrılabilir
    // (finalizeReturnedShipments cron + Sürat sync + admin forceFinalize). Eski
    // `status===refunded` guard'ı TOCTOU'ya açıktı: ikisi de `return_delivered` okuyup
    // processRefund + finalize yan-etkilerini (order-update, history, ÇİFT bildirim/mail)
    // tekrarlardı. Yalnız BİR çağıran `return_delivered→refunded` geçişini kazanır;
    // count===0 → başka biri aldı → tekrarlama. (processRefund'ın kendi refundInProgress
    // marker'ı PayTR çift-çağrısını zaten engelliyor; bu CAS finalize yan-etkilerini tekilleştirir.)
    // Claim'in HANGİ durumdan alındığını bil: PSP hatasında geri alım aynı
    // duruma dönmeli. disputed'ı return_delivered'a ezmek hem itiraz kaydını
    // siliyor hem returnDeliveredAt=null satırı finalize cron'unun göremediği
    // sahte bir "teslim edildi" durumunda bırakıyordu.
    const claimedFromStatus =
      rr.status === RefundRequestStatus.disputed
        ? RefundRequestStatus.disputed
        : RefundRequestStatus.return_delivered;
    const claimed = await this.prisma.refundRequest.updateMany({
      where: {
        id: refundRequestId,
        // rr yukarıda okundu; CAS yalnız o durumdan claim eder — araya giren
        // bir durum değişikliği count=0 üretir ve tekrarlanmaz.
        status: claimedFromStatus,
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

    // `processRefund` resolves to null when the attempt was already finalized —
    // an idempotent no-op, not a failure — so the variable has to be able to
    // hold that, and readers fall back the same way a missing provider id does.
    let refundResult: { providerRefundId?: string } | null;
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
        }, // REFUND_COMPLETED'ı aşağıda kendimiz gönderiyoruz
      );
    } catch (err) {
      // processRefund BAŞARISIZ → claim'i GERİ AL: satır claim edildiği duruma
      // döner (return_delivered → cron retry eder; disputed → itiraz ekranda
      // kalır, admin yeniden dener). (Money iade edilmedi; yalnız claim
      // kilidini bıraktık.)
      await this.prisma.refundRequest
        .updateMany({
          where: {
            id: refundRequestId,
            status: RefundRequestStatus.refunded,
          },
          data: {
            status: claimedFromStatus,
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
        providerRefundId: refundResult?.providerRefundId ?? null,
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
    await this.notifications.appendHistory(rr.id, {
      action: "refund_completed",
      by: "system",
      details: { providerRefundId: refundResult?.providerRefundId ?? null },
    });
    await this.notifications.safeNotify(
      rr.requesterId,
      NotificationType.REFUND_COMPLETED,
      {
        refundNumber: rr.refundNumber,
        orderId: rr.orderId,
      },
    );
    // "Para iadeniz tamamlandı" maili eksikti (sadece zile düşüyordu) — eklendi.
    await this.notifications.sendRefundEmail(
      rr.id,
      "buyer",
      "refund-completed",
    );
    // Satıcı tarafı: iade tamamlandı bildirimi + mail.
    await this.notifications.safeNotify(
      rr.order.sellerId,
      NotificationType.REFUND_COMPLETED_SELLER,
      {
        refundNumber: rr.refundNumber,
        orderId: rr.orderId,
      },
    );
    await this.notifications.sendRefundEmail(
      rr.id,
      "seller",
      "refund-completed-seller",
    );
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
   * yerelde iptal eder: hold çözülür ve alıcıya bildirim gider. Resmi REST
   * sözleşmesinde uzak iptal olmadığı için fiziksel kayıt/kod operasyon ekibinin
   * Sürat paneli müdahalesini gerektirir.
   *
   * Güvenlik: iptal ETMEDEN önce Sürat'tan CANLI takip çekilir — pakette
   * hareket varsa (alıcı son anda götürdü, poll henüz görmedi) iptal atlanır ve
   * normal poll akışına bırakılır. Sorgu başarısızsa da (belirsizlik) iptal
   * edilmez, sonraki tick tekrar dener. Yalnız `surat` iadeler: manuel iade
   * poll'lanamadığından yanlış iptal riski var → ops takibi.
   */
  async expireStaleOpenReturns(): Promise<number> {
    const days = envConfigNumber(PAYMENT_CONFIG_KEYS.RETURN_DROPOFF_DAYS);
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

        const cancellationTask = await this.carrierCancellations.request({
          provider: "surat",
          reference: rr.refundNumber,
          entityType: "refund_return",
          entityId: rr.id,
          reason: "return_dropoff_expired",
          metadata: {
            orderId: rr.order.id,
            refundNumber: rr.refundNumber,
            dropoffDays: days,
          },
          updateLocal: async (tx) => {
            await tx.refundRequest.update({
              where: { id: rr.id },
              data: {
                status: RefundRequestStatus.cancelled,
                decidedAt: new Date(),
                decidedBy: "system",
              },
            });
          },
        });
        // Hold kilidini kaldır → normal escrow akışına dönsün.
        await this.financials.unfreezeHoldForRefund(rr.order.id);
        await this.notifications.appendHistory(rr.id, {
          action: "return_dropoff_expired",
          by: "system",
          details: { days, carrierCancellationRequired: true },
        });
        this.logger.warn(
          `Refund ${rr.refundNumber} locally expired; carrier cancellation task=${cancellationTask.id}`,
        );
        await this.notifications.safeNotify(
          rr.requesterId,
          NotificationType.REFUND_CANCELLED,
          {
            refundNumber: rr.refundNumber,
            orderId: rr.order.id,
            // Sistem süre aşımıyla kapattı → talebin sahibi olan ALICIYA gider.
            audience: "buyer",
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
        await this.financials.unfreezeHoldForRefund(rr.order.id);
        await this.notifications.appendHistory(rr.id, {
          action: "wait_for_delivery_expired",
          by: "system",
          details: { days },
        });
        await this.notifications.safeNotify(
          rr.requesterId,
          NotificationType.REFUND_CANCELLED,
          {
            refundNumber: rr.refundNumber,
            orderId: rr.order.id,
            // Sistem süre aşımıyla kapattı → talebin sahibi olan ALICIYA gider.
            audience: "buyer",
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
    const hours = envConfigNumber(PAYMENT_CONFIG_KEYS.RETURN_INSPECTION_HOURS);
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
      select: { returnStatus: true, returnShippedAt: true },
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
    const statusChanged = current?.returnStatus !== update.status;
    if (
      statusChanged &&
      (update.status === ShipmentStatus.in_transit ||
        update.status === ShipmentStatus.picked_up ||
        update.status === ShipmentStatus.return_in_progress)
    ) {
      await this.notifications.safeNotify(
        updated.requesterId,
        NotificationType.REFUND_RETURN_IN_TRANSIT,
        notifData,
      );
      await this.notifications.safeNotify(
        updated.order.sellerId,
        NotificationType.REFUND_RETURN_SHIPPED_SELLER,
        notifData,
      );
      // Satıcıya bir kez markalı mail: ürün kendisine geliyor.
      await this.notifications.sendRefundEmail(
        updated.id,
        "seller",
        "refund-return-incoming-seller",
        {
          returnTrackingNumber:
            updated.returnTrackingNumber ?? updated.refundNumber,
        },
      );
    } else if (
      statusChanged &&
      (update.status === ShipmentStatus.delivered ||
        update.status === ShipmentStatus.returned)
    ) {
      await this.notifications.safeNotify(
        updated.requesterId,
        NotificationType.REFUND_RETURN_DELIVERED_BUYER,
        notifData,
      );
      await this.notifications.safeNotify(
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
    shipment: {
      status: ShipmentStatus;
      deliveredAt: Date | null;
      shippedAt?: Date | null;
    } | null;
  }): "paid" | "preparing" | "in_cooling_off" | "past_cooling_off" | "unknown" {
    if (
      order.status === OrderStatus.paid ||
      order.status === OrderStatus.preparing
    ) {
      // Devir tanımı TEK KAYNAK (shipment-handover): hareket eden durum VEYA
      // shippedAt mührü. Yalnız statü listesine bakmak, Sürat bilinmeyen bir
      // durum kodu döndürüp poller shippedAt yazdığında koli fiilen yoldayken
      // "anında iade"yi (ürün + kargo dahil) kabul ettiriyordu — iptal
      // kapılarıyla aynı tanım kullanılır.
      const stillNotShipped = !isShipmentHandedToCarrier(order.shipment);
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
      return ageDays <= coolingOffDays()
        ? "in_cooling_off"
        : "past_cooling_off";
    }
    return "unknown";
  }

  private async createInstantRefund(
    order: {
      id: string;
      sellerId: string;
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
    const financial = await this.financials.buildFinancialPolicySnapshot(
      order,
      policy,
      dto.reason,
      refundQuantity,
      false,
    );
    const amount = financial.financials.buyerRefundAmount;

    let created;
    try {
      /**
       * İptal yoluyla (createCancellationRefund) AYNI yarış kilidi: talep,
       * sipariş satırı FOR UPDATE kilitliyken ve faz TX İÇİNDE yeniden
       * doğrulanarak yazılır. Eskiden uygunluk yalnız preflight'ta kontrol
       * ediliyor, talep kilitsiz yazılıyordu — satıcının "kargoya verdim"
       * isteği tam bu aralıkta commit olursa kargolanmış sipariş için ürün +
       * kargo dahil anında iade üretiliyordu ("hem iptal hem kargolandı"
       * invaryantının bu uçtaki karşılığı).
       */
      created = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM orders WHERE id = ${order.id} FOR UPDATE`;
        const fresh = await tx.order.findUnique({
          where: { id: order.id },
          select: {
            status: true,
            shipment: { select: { status: true, shippedAt: true } },
          },
        });
        if (
          !fresh ||
          (fresh.status !== OrderStatus.paid &&
            fresh.status !== OrderStatus.preparing)
        ) {
          throw new BadRequestException(
            i18nMessage("server.refund.orderStatusNotEligible"),
          );
        }
        if (isShipmentHandedToCarrier(fresh.shipment)) {
          throw new BadRequestException(
            i18nMessage("server.refund.instantAfterHandover"),
          );
        }
        return tx.refundRequest.create({
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
            ...this.financials.refundFinancialData(policy, financial),
            ...(policy.requiresAdminReview &&
            this.financials.refundPolicyV2Enabled()
              ? {
                  policyVersion: 2,
                  financialReviewRequired: true,
                  financialPolicySnapshot: {
                    version: 2,
                    provisional: true,
                    claimReason: dto.reason,
                    legacyProvisionalCalculation: financial.snapshot,
                  } as unknown as Prisma.InputJsonValue,
                }
              : {}),
          },
        });
      });
    } catch (error) {
      if (this.isDuplicateActiveRefund(error)) {
        throw new BadRequestException(
          i18nMessage("server.refund.alreadyActive"),
        );
      }
      throw error;
    }

    if (
      !policy.requiresAdminReview &&
      this.financials.refundPolicyV2Enabled()
    ) {
      created = await this.financials.finalizeAutomaticV2RefundDecision(
        created.id,
        dto.reason,
        dto.reason === RefundReason.changed_mind ? "buyer" : "seller",
      );
    }

    if (policy.requiresAdminReview) {
      await this.financials.freezeHoldForRefund(order.id, created.id);
      await this.notifications.appendHistory(created.id, {
        action: "pending_admin_review",
        by: requesterId,
        details: { policyCode: policy.policyCode },
      });
      await this.notifications.notifyRefundRequestOpened({
        refundRequestId: created.id,
        refundNumber,
        orderId: order.id,
        sellerId: order.sellerId,
        reason: dto.reason,
        requiresAdminReview: true,
      });
      return created;
    }

    // O9: hold'u PSP çağrısından ÖNCE dondur (createCancellationRefund ile aynı
    // desen). Eskiden mutlu yol dondurmadan PayTR'ye gidiyordu — iade sürerken
    // escrow release cron'u holdu satıcıya bırakabilirdi.
    await this.financials.freezeHoldForRefund(order.id, created.id);

    // `processRefund` resolves to null when the attempt was already finalized —
    // an idempotent no-op, not a failure — so the variable has to be able to
    // hold that, and readers fall back the same way a missing provider id does.
    let refundResult: { providerRefundId?: string } | null;
    try {
      refundResult = await this.paymentService.processRefund(
        order.id,
        Number(created.amount),
        {
          skipRefundEvent: true, // REFUND_COMPLETED'ı aşağıda kendimiz gönderiyoruz
          refundQuantity,
          idempotencyKey: `refund-request:${created.id}`,
          settlement: {
            closeOrder: refundQuantity >= (order.quantity ?? 1),
            holdPortion: Math.min(
              refundQuantity / Math.max(order.quantity ?? 1, 1),
              1,
            ),
            ...this.financials.feeSettlementFromComponents(
              (created as any).financialComponents,
              {
                sellerFeeAmount: financial.financials.sellerFeeRefundAmount,
                // Defter NET tutar ister; brüt beslemek KDV kadar fazla ters
                // kayıt üretir (K6).
                buyerFeeAmount:
                  financial.financials.buyerProtectionNetRefundAmount,
              },
            ),
            ...this.financials.shippingSettlement(created.id, {
              sellerShippingCompensationAmount: Number(
                created.sellerShippingCompensationAmount,
              ),
              outboundShippingChargeToSeller: Number(
                created.outboundShippingChargeToSeller,
              ),
              returnShippingChargeToSeller: Number(
                created.returnShippingChargeToSeller,
              ),
            }),
          },
        },
      );
    } catch (err) {
      // A definite provider rejection can be retried as a new request. An
      // unknown provider outcome must remain visible and blocked until the
      // durable refund attempt is reconciled.
      if (!(err instanceof RefundPendingReconciliationException)) {
        await this.prisma.refundRequest.update({
          where: { id: created.id },
          data: {
            status: RefundRequestStatus.pending_review,
            financialReviewRequired: true,
          },
        });
        await this.financials.freezeHoldForRefund(order.id, created.id);
      }
      this.logger.warn(
        `Instant refund failed for order ${order.orderNumber}, RefundRequest ${created.refundNumber} ` +
          `${err instanceof RefundPendingReconciliationException ? "retained for reconciliation" : "moved to financial review"}: ${(err as Error).message}`,
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
        providerRefundId: refundResult?.providerRefundId ?? null,
      },
    });

    // Anında iade önceden TAMAMEN sessizdi — alıcı para iadesini hiç öğrenmiyordu.
    // in_app + push (safeNotify) + markalı mail.
    await this.notifications.safeNotify(
      requesterId,
      NotificationType.REFUND_COMPLETED,
      {
        refundNumber,
        orderId: order.id,
      },
    );
    await this.notifications.sendRefundEmail(
      created.id,
      "buyer",
      "refund-completed",
    );
    // Satıcı tarafı: iade tamamlandı bildirimi + mail.
    const sellerRow = await this.prisma.order.findUnique({
      where: { id: order.id },
      select: { sellerId: true },
    });
    if (sellerRow?.sellerId) {
      await this.notifications.safeNotify(
        sellerRow.sellerId,
        NotificationType.REFUND_COMPLETED_SELLER,
        {
          refundNumber,
          orderId: order.id,
        },
      );
    }
    await this.notifications.sendRefundEmail(
      created.id,
      "seller",
      "refund-completed-seller",
    );

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
      sellerId: string;
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
    const financial = await this.financials.buildFinancialPolicySnapshot(
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
          ...this.financials.refundFinancialData(policy, financial),
          ...(requiresReview && this.financials.refundPolicyV2Enabled()
            ? {
                policyVersion: 2,
                financialReviewRequired: true,
                financialPolicySnapshot: {
                  version: 2,
                  provisional: true,
                  claimReason: dto.reason,
                  legacyProvisionalCalculation: financial.snapshot,
                } as unknown as Prisma.InputJsonValue,
              }
            : {}),
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

    if (!requiresReview && this.financials.refundPolicyV2Enabled()) {
      created = await this.financials.finalizeAutomaticV2RefundDecision(
        created.id,
        dto.reason,
        dto.reason === RefundReason.changed_mind ? "buyer" : "seller",
      );
    }

    // İade açıldı → satıcı hold'unu kilitle (payout bu iade kapanana kadar bloke).
    await this.financials.freezeHoldForRefund(order.id, created.id);
    await this.notifications.notifyRefundRequestOpened({
      refundRequestId: created.id,
      refundNumber,
      orderId: order.id,
      sellerId: order.sellerId,
      reason: dto.reason,
      requiresAdminReview: requiresReview,
    });

    if (requiresReview) {
      await this.notifications.appendHistory(created.id, {
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
    await this.notifications.safeNotify(
      requesterId,
      NotificationType.REFUND_APPROVED,
      {
        refundNumber,
        orderId: order.id,
      },
    );
    await this.notifications.sendRefundEmail(
      created.id,
      "buyer",
      "refund-approved-buyer",
    );

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
   * adresi — takas akışıyla TEK kaynaktan (config/warehouse) gelir; env yoksa
   * mantıklı varsayılanlara düşer (asla null dönmez) → adressiz satıcı iadeyi bloke etmez.
   */
  private warehouseReturnAddress() {
    return platformWarehouseAddress();
  }

  // NOT (M4): iade barkodu için ayrı bir retry yüzeyi YOK — bilinçli.
  // openReturnShipment BLOCKING'tir: Sürat başarısızsa throw eder ve hiçbir şey
  // yazmaz (returnProvider="surat" + kodsuz durum oluşamaz). Kurtarma yolu
  // refund-scheduler'dır: kayıt wait_for_delivery'de kalır ve
  // openReturnShipmentsForDeliveredOrders (10 dk) tam açılışı yeniden dener.

  // NOT: overrideRefundPolicy / setReturnShippingPayer / computePartialRefundAmount
  // KALDIRILDI. `policyCode === "legacy"` şartına bağlıydılar; refundFinancialData
  // her kayda gerçek policy kodu yazdığı için hiçbir üretim kaydında çalışamıyorlardı
  // ve computePartialRefundAmount vergileri tamamen yok sayan ÜÇÜNCÜ bir tutar
  // formülüydü. Karar akışı tek kaynaktan yürür: previewRefundDecision +
  // finalizeV2RefundDecision (bileşen bazlı politika).
}
