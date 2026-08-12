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
import { createHash } from "node:crypto";
import {
  AdminRole,
  ElogoInvoiceType,
  OrderStatus,
  OrderCancellationReason,
  PaymentHoldStatus,
  PaymentStatus,
  Prisma,
  RefundReason,
  RefundRequestStatus,
  SellerAdjustmentType,
  SellerType,
  ShipmentStatus,
  RefundFaultParty,
  ShippingPackageTierCode,
} from "@prisma/client";
import { PrismaService } from "../../prisma";
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
import { shippingAmountForDesi } from "../shipping/shipping-tariff.helper";
import { resolvePackageTier } from "../shipping/shipping-tariff.helper";
import { storedProductBaseOf } from "../order/order-charged-base.helper";
import { readInvoiceLineItems } from "../elogo/invoice-lines";
import {
  calculateRefundFinancials,
  RefundFinancialResult,
  RefundPolicyDecision,
  resolveCancellationPolicy,
  resolveReturnPolicy,
} from "./refund-financial-policy";
import {
  calculateRefundFinancialsV2,
  type RefundFinancialComponentV2,
  type RefundFinancialResultV2,
  type RefundFaultPartyV2,
} from "./refund-financial-policy-v2";
import {
  PUBLIC_NAME_SELECT,
  publicName,
  toPublicIdentity,
} from "../../common/helpers/public-identity";

/**
 * Cayma (iade talep) penceresi — satıcı payout takvimiyle AYNI kaynaktan gelir
 * (PAYMENT_CONFIG_KEYS.RETURN_WINDOW_DAYS). Burada gömülü bir 14 tutmak,
 * env'den okunan payout penceresiyle sessizce kaymasına yol açıyordu.
 */
const coolingOffDays = () =>
  envConfigNumber(PAYMENT_CONFIG_KEYS.RETURN_WINDOW_DAYS);

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
    @Inject(CARGO_PROVIDER) private readonly cargo: CargoProvider,
    private readonly carrierCancellations: CarrierCancellationService,
    private readonly suratTrackingService: SuratTrackingService,
    private readonly notificationService: NotificationService,
    private readonly storageService: StorageService,
    @Optional()
    private readonly shippingTariffService?: ShippingTariffService,
  ) {}

  /** Production rollout is opt-in; tests/development exercise v2 by default. */
  private refundPolicyV2Enabled(): boolean {
    const configured =
      process.env.REFUND_POLICY_V2_ENABLED?.trim().toLowerCase();
    if (configured != null && configured !== "") {
      return configured === "true" || configured === "1";
    }
    return process.env.NODE_ENV !== "production";
  }

  /**
   * Product prices on platform-owned sales are VAT-inclusive. Order.taxAmount
   * intentionally remains zero because the marketplace does not add product
   * VAT at checkout; the platform-sale eLogo invoice is the authoritative
   * disclosure snapshot. A refund component therefore has to reconstruct the
   * included tax from that original product line, not from Order.taxAmount.
   *
   * The product line is first by the documented buildPlatformSaleLines
   * contract. For a delivered platform sale, missing/invalid invoice lines are
   * a financial-review error: silently emitting 0% would create a return
   * invoice incompatible with the original document. Before shipment there is
   * no issued sale document to reverse, so the order split remains sufficient.
   */
  private async productTaxAmountForV2Refund(order: {
    id: string;
    status: OrderStatus;
    taxAmount: Prisma.Decimal;
    productGrossAmount: number;
    sellerType: SellerType;
  }): Promise<number> {
    if (order.sellerType !== SellerType.platform) {
      return Number(order.taxAmount ?? 0);
    }

    const invoice = await this.prisma.elogoInvoice.findUnique({
      where: {
        type_sourceId: {
          type: ElogoInvoiceType.platform_sale,
          sourceId: order.id,
        },
      },
      select: { lineItems: true },
    });
    const productLine = readInvoiceLineItems(invoice?.lineItems)[0];
    if (productLine) {
      const rate = Math.max(0, productLine.vatRate);
      if (rate === 0) return 0;
      return (
        Math.round(
          (order.productGrossAmount -
            order.productGrossAmount / (1 + rate / 100) +
            Number.EPSILON) *
            100,
        ) / 100
      );
    }

    const invoicedStatuses: OrderStatus[] = [
      OrderStatus.delivered,
      OrderStatus.awaiting_buyer_confirmation,
      OrderStatus.completed,
    ];
    const documentShouldExist = invoicedStatuses.includes(order.status);
    if (documentShouldExist) {
      throw new BadRequestException(
        "Platform satış faturasının ürün KDV snapshot'ı bulunamadı; finansal inceleme gerekli",
      );
    }
    return Number(order.taxAmount ?? 0);
  }

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

  /**
   * İade yanıtı iki tarafa da açıktır (alıcı ↔ satıcı): kullanıcı satırları
   * herkese açık kimliğe indirgenir, ürün görselleri public URL'e çevrilir.
   */
  private withResolvedImages<T extends Record<string, any>>(rr: T): T {
    const product = rr?.order?.product;
    if (product?.images) {
      product.images = this.toProductImageUrls(product.images);
    }
    if (rr?.order?.buyer) rr.order.buyer = toPublicIdentity(rr.order.buyer);
    if (rr?.order?.seller) rr.order.seller = toPublicIdentity(rr.order.seller);
    if (rr?.requester) (rr as any).requester = toPublicIdentity(rr.requester);
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
   * Yeni ve kalıcı bir iade talebini satıcıya bildirir. Yönetici incelemesi
   * gerekiyorsa yalnız iade kararı verebilen aktif admin/super-admin hesaplarına
   * ayrıca operasyon uyarısı gönderir. Bildirim arızaları ticaret akışını bozmaz.
   */
  private async notifyRefundRequestOpened(input: {
    refundRequestId: string;
    refundNumber: string;
    orderId: string;
    sellerId: string;
    reason: string;
    requiresAdminReview: boolean;
  }): Promise<void> {
    await this.safeNotify(
      input.sellerId,
      NotificationType.REFUND_REQUEST_RECEIVED_SELLER,
      {
        refundNumber: input.refundNumber,
        orderId: input.orderId,
      },
    );
    await this.sendRefundEmail(
      input.refundRequestId,
      "seller",
      "refund-requested-seller",
      { refundNumber: input.refundNumber, refundReason: input.reason },
    );

    if (!input.requiresAdminReview) return;

    try {
      const admins = await this.prisma.adminUser.findMany({
        where: {
          isActive: true,
          role: { in: [AdminRole.super_admin, AdminRole.admin] },
        },
        select: { userId: true },
      });
      const adminBaseUrl =
        process.env.ADMIN_URL?.replace(/\/$/, "") ||
        (process.env.NODE_ENV === "production"
          ? "https://admin.tarodan.com.tr"
          : "http://localhost:3002");
      const adminLink = `${adminBaseUrl}/operations/refund-requests/${encodeURIComponent(input.refundRequestId)}`;

      for (const admin of admins) {
        await this.safeNotify(
          admin.userId,
          NotificationType.REFUND_REVIEW_REQUIRED_ADMIN,
          {
            refundRequestId: input.refundRequestId,
            refundNumber: input.refundNumber,
            orderId: input.orderId,
            adminLink,
          },
        );
      }
    } catch (error: any) {
      this.logger.error(
        `Refund review admin notifications failed for ${input.refundNumber}: ${error?.message}`,
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
              buyer: { select: PUBLIC_NAME_SELECT },
              seller: { select: PUBLIC_NAME_SELECT },
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
          buyerName: publicName(rr.order?.buyer),
          sellerName: publicName(rr.order?.seller),
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
    // Devir tanımı TEK KAYNAK (shipment-handover): hareket eden durum VEYA
    // shippedAt. Yalnız statüye bakmak yetmiyordu — Sürat bilinmeyen bir durum
    // kodu döndürdüğünde poller statüyü değiştirmeden shippedAt yazıyor ve koli
    // fiilen yoldayken iptal kabul ediliyordu.
    if (isShipmentHandedToCarrier(order.shipment)) {
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
            "Sipariş durumu az önce değişti; iptal edilemedi",
          );
        }
        if (isShipmentHandedToCarrier(fresh.shipment)) {
          throw new BadRequestException(
            "Kargoya teslim edilmiş sipariş iptal edilemez; iade talebi oluşturun",
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
            ...this.refundFinancialData(policy, financial),
            ...(policy.requiresAdminReview && this.refundPolicyV2Enabled()
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
    if (!policy.requiresAdminReview && this.refundPolicyV2Enabled()) {
      created = await this.finalizeAutomaticV2RefundDecision(
        created.id,
        reasonCode === OrderCancellationReason.delivery_delayed
          ? RefundReason.delivery_delayed
          : RefundReason.changed_mind,
        reasonCode === OrderCancellationReason.delivery_delayed
          ? "seller"
          : "buyer",
      );
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
      await this.notifyRefundRequestOpened({
        refundRequestId: created.id,
        refundNumber,
        orderId: order.id,
        sellerId: order.sellerId,
        reason: reasonCode,
        requiresAdminReview: true,
      });
      return created;
    }

    let refundResult: { providerRefundId?: string };
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
            ...this.feeSettlementFromComponents(
              (created as any).financialComponents,
              {
                sellerFeeAmount: financial.financials.sellerFeeRefundAmount,
                // Defter NET tutar ister; brüt beslemek KDV kadar fazla ters
                // kayıt üretir (K6).
                buyerFeeAmount:
                  financial.financials.buyerProtectionNetRefundAmount,
              },
            ),
            ...this.shippingSettlement(created.id, {
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

  /**
   * Recalculates a reviewed v2 decision from immutable order data and the
   * currently active return tariff. The token binds approval to this exact
   * calculation; no financial rows are written by preview.
   */
  async previewRefundDecision(
    refundRequestId: string,
    resolvedReason: RefundReason,
    faultParty: RefundFaultPartyV2,
    allowNonReview = false,
  ): Promise<{
    calculationToken: string;
    resolvedReason: RefundReason;
    faultParty: RefundFaultPartyV2;
    outboundPackageTier: ShippingPackageTierCode;
    outboundFullShippingAmount: number;
    serviceVatRate: number;
    returnTariff: {
      id: string;
      version: number;
      tier: ShippingPackageTierCode;
      amount: number;
    } | null;
    financials: RefundFinancialResultV2;
  }> {
    const rr = await this.prisma.refundRequest.findUnique({
      where: { id: refundRequestId },
      include: {
        order: {
          include: {
            shipment: true,
            product: {
              select: {
                shippingPackageTier: true,
                shippingDesi: true,
              },
            },
            seller: { select: { sellerType: true } },
            package: true,
          },
        },
      },
    });
    if (!rr) throw new NotFoundException(i18nMessage("server.refund.notFound"));
    if (
      !allowNonReview &&
      rr.status !== RefundRequestStatus.pending_review &&
      !rr.financialReviewRequired
    ) {
      throw new BadRequestException(
        "Yalnız inceleme veya finansal mutabakat bekleyen iadeler için karar önizlenebilir",
      );
    }
    if (rr.policyFinalizedAt) {
      throw new ConflictException("İade finansal politikası zaten kesinleşmiş");
    }
    if (!this.shippingTariffService) {
      throw new BadRequestException(
        "İade kargo tarifesi servisi kullanılamıyor",
      );
    }

    const order = rr.order;
    const originalTariff = order.package?.shippingTariffId
      ? await this.shippingTariffService.getById(order.package.shippingTariffId)
      : null;
    const outboundTier = originalTariff
      ? resolvePackageTier(
          originalTariff,
          order.package?.billableDesi ?? order.product.shippingDesi ?? 1,
        ).code
      : order.product.shippingPackageTier;

    // Kargo hizmeti fiilen tüketildi mi — iptal kapılarıyla AYNI tanım.
    const hasShipped = isShipmentHandedToCarrier(order.shipment);
    const activeReturnTariff = hasShipped
      ? await this.shippingTariffService.getActiveOutboundTariff("surat")
      : null;
    // O5: dönüş fiyatı TEK kaynaktan — fiziksel dönüş kolisinin desisi aktif
    // tarifede hangi kademeye düşüyorsa o. Sürat dönüş etiketi de aynı desiyle
    // kesilir (openReturnShipment → returnBillableDesi), böylece faturalanan
    // kademe ile taşınan koli ayrışamaz. (Eskiden orijinal GİDİŞ kolisinin
    // kademesi kullanılıyordu — kısmi iadede küçük koliye büyük koli fiyatı
    // yazılıyordu.)
    const returnBillableDesi = Math.max(
      1,
      (order.product.shippingDesi ?? 1) * rr.refundQuantity,
    );
    const returnTier = activeReturnTariff
      ? resolvePackageTier(activeReturnTariff, returnBillableDesi)
      : null;

    const outboundAlreadySettled = order.packageId
      ? Boolean(
          await this.prisma.packageShippingSettlement.findFirst({
            where: { packageId: order.packageId, leg: "outbound" },
            select: { id: true },
          }),
        )
      : false;
    const productGrossAmount = storedProductBaseOf(order);
    /**
     * Shipping settlement is package-scoped, so its money source must be the
     * package snapshot too. Group checkout writes order-level shares only on
     * the seller's first Order, while OrderPackage holds the canonical totals;
     * sibling Order rows may therefore contain zero. Reading an arbitrary order
     * here could consume the one-shot settlement with zero amounts and
     * permanently prevent the actual shares from being settled later.
     */
    const buyerShippingAmount = Number(
      order.package?.buyerShippingAmount ??
        order.buyerShippingAmount ??
        order.shippingCost ??
        0,
    );
    const sellerShippingAmount = Number(
      order.package?.sellerShippingAmount ?? order.sellerShippingAmount ?? 0,
    );
    const outboundFullShippingAmount = Number(
      order.package?.fullShippingAmount ??
        buyerShippingAmount + sellerShippingAmount,
    );
    const productTaxAmount = await this.productTaxAmountForV2Refund({
      id: order.id,
      status: order.status,
      taxAmount: order.taxAmount,
      productGrossAmount,
      sellerType: order.seller.sellerType,
    });
    // K7: gidiş kargosu yalnız satırı TAMAMLAYAN iadede işlenir. Art arda
    // kısmi iadelerde (1/3 sonra 2/3) son talep tek başına "tam" olmadığı için
    // önceki iade edilmiş adetler de sayılır — aksi halde her şeyini iki
    // adımda iade eden alıcı kargo iadesini sonsuza dek kaybederdi.
    const priorRefundedRows = await this.prisma.refundRequest.findMany({
      where: {
        orderId: order.id,
        id: { not: rr.id },
        status: RefundRequestStatus.refunded,
      },
      select: { refundQuantity: true },
    });
    const priorRefundedQuantity = priorRefundedRows.reduce(
      (sum, row) => sum + (row.refundQuantity ?? 0),
      0,
    );
    const completesLine =
      priorRefundedQuantity + rr.refundQuantity >= (order.quantity ?? 1);
    /**
     * Kargo bedeli PAKET başınadır (escrow hold'u da tam kargoyu paketten bir
     * kez düşer), bu yüzden satırın tamamlanması tek başına yetmez: koli hâlâ
     * kardeş satırlar için yola çıkacaksa kargo iade EDİLMEZ. Aksi halde aynı
     * satıcıdan iki satırlık sepette her satır iptalinde aynı koli bedeli
     * yeniden iade ediliyordu (grup iptali satır satır döndüğü için birebir
     * bu senaryo). Paketi KAPATAN son iade kargoyu bir kez iade eder.
     */
    const packageStillShipping = order.packageId
      ? (await this.prisma.order.count({
          where: {
            packageId: order.packageId,
            id: { not: order.id },
            status: {
              notIn: [OrderStatus.cancelled, OrderStatus.refunded],
            },
          },
        })) > 0
      : false;
    const closesPackageShipping = completesLine && !packageStillShipping;
    const financials = calculateRefundFinancialsV2({
      productGrossAmount,
      productTaxAmount,
      buyerShippingAmount,
      sellerShippingAmount,
      outboundFullShippingAmount,
      buyerCommissionAmount: Number(order.buyerCommissionAmount ?? 0),
      buyerPlatformFeeAmount: Number(order.buyerServiceFeeAmount ?? 0),
      sellerCommissionAmount: Number(order.sellerCommissionAmount ?? 0),
      sellerPlatformFeeAmount: Number(order.sellerPlatformFeeAmount ?? 0),
      serviceVatRate: Number(order.serviceVatRate ?? 0),
      returnShippingAmount: Number(returnTier?.amount ?? 0),
      orderQuantity: order.quantity ?? 1,
      refundQuantity: rr.refundQuantity,
      faultParty,
      hasShipped,
      outboundAlreadySettled,
      completesLine,
      closesPackageShipping,
    });
    const returnTariff = activeReturnTariff
      ? {
          id: activeReturnTariff.id,
          version: activeReturnTariff.version,
          tier: returnTier!.code,
          desi: returnBillableDesi,
          amount: Number(returnTier!.amount),
        }
      : null;
    const tokenPayload = {
      refundRequestId: rr.id,
      refundUpdatedAt: rr.updatedAt.toISOString(),
      orderId: order.id,
      orderVersion: order.version,
      resolvedReason,
      faultParty,
      outboundTier,
      outboundFullShippingAmount,
      serviceVatRate: Number(order.serviceVatRate ?? 0),
      outboundAlreadySettled,
      completesLine,
      closesPackageShipping,
      returnTariff,
      financials,
    };
    const calculationToken = createHash("sha256")
      .update(JSON.stringify(tokenPayload))
      .digest("hex");

    return {
      calculationToken,
      resolvedReason,
      faultParty,
      outboundPackageTier: outboundTier,
      outboundFullShippingAmount,
      serviceVatRate: Number(order.serviceVatRate ?? 0),
      returnTariff,
      financials,
    };
  }

  private componentTotal(
    components: RefundFinancialComponentV2[],
    code: RefundFinancialComponentV2["componentCode"],
    treatment: RefundFinancialComponentV2["treatment"],
    field: "netAmount" | "grossAmount" = "grossAmount",
  ): number {
    return components
      .filter(
        (component) =>
          component.componentCode === code && component.treatment === treatment,
      )
      .reduce((sum, component) => sum + component[field], 0);
  }

  /**
   * v1 (bileşensiz) satırlarda defter ters kaydı için NET alıcı ücreti.
   * `refundedBuyerProtectionAmount` BRÜT saklanır; CommissionLedger.buyerFee
   * ise NET'tir — brütü beslemek kısmi iadede KDV kadar fazla ters kayıt
   * üretir. Önce snapshot'taki kesin net alan okunur; bu alandan önce yazılmış
   * eski kayıtlar için brütten KDV arındırılmış yaklaşık değer kullanılır
   * (ledger zaten orijinale clamp'ler).
   */
  private legacyBuyerFeeNetOf(rr: {
    refundedBuyerProtectionAmount: Prisma.Decimal | number;
    financialPolicySnapshot?: Prisma.JsonValue;
    order?: Record<string, unknown> | null;
  }): number {
    const snap = rr.financialPolicySnapshot as any;
    const fromSnapshot =
      snap?.financials?.buyerProtectionNetRefundAmount ??
      snap?.legacyProvisionalCalculation?.financials
        ?.buyerProtectionNetRefundAmount;
    if (typeof fromSnapshot === "number") return fromSnapshot;
    const gross = Number(rr.refundedBuyerProtectionAmount);
    const rate = Number((rr.order as any)?.serviceVatRate ?? 0);
    return rate > 0
      ? Math.round((gross / (1 + rate / 100)) * 100) / 100
      : gross;
  }

  private feeSettlementFromComponents(
    components:
      | Array<{
          componentCode: string;
          treatment: string;
          netAmount: Prisma.Decimal | number;
        }>
      | null
      | undefined,
    legacy: { sellerFeeAmount: number; buyerFeeAmount: number },
  ) {
    if (!components?.length) {
      return {
        sellerFeeRefundAmount: legacy.sellerFeeAmount,
        buyerFeeRefundAmount: legacy.buyerFeeAmount,
      };
    }
    const amount = (code: string, treatment: string) =>
      components
        .filter(
          (component) =>
            component.componentCode === code &&
            component.treatment === treatment,
        )
        .reduce((sum, component) => sum + Number(component.netAmount), 0);
    const buyerCommissionRefundAmount = amount(
      "buyer_commission",
      "buyer_refund",
    );
    const buyerPlatformFeeRefundAmount = amount(
      "buyer_platform_fee",
      "buyer_refund",
    );
    const sellerCommissionRefundAmount = amount(
      "seller_commission",
      "seller_refund",
    );
    const sellerPlatformFeeRefundAmount = amount(
      "seller_platform_fee",
      "seller_refund",
    );
    return {
      buyerCommissionRefundAmount,
      buyerPlatformFeeRefundAmount,
      sellerCommissionRefundAmount,
      sellerPlatformFeeRefundAmount,
      buyerFeeRefundAmount:
        buyerCommissionRefundAmount + buyerPlatformFeeRefundAmount,
      sellerFeeRefundAmount:
        sellerCommissionRefundAmount + sellerPlatformFeeRefundAmount,
    };
  }

  private async finalizeV2RefundDecision(
    refundRequestId: string,
    adminId: string,
    decision: {
      resolvedReason: RefundReason;
      faultParty: RefundFaultPartyV2;
      calculationToken: string;
    },
    options: {
      allowNonReview?: boolean;
      /**
       * An already-open physical return keeps its lifecycle status while the
       * admin finalizes only the financial snapshot. Requiring the quarantine
       * marker prevents this escape hatch from being used on ordinary records.
       */
      requireFinancialReview?: boolean;
    } = {},
  ) {
    const preview = await this.previewRefundDecision(
      refundRequestId,
      decision.resolvedReason,
      decision.faultParty,
      options.allowNonReview === true,
    );
    if (preview.calculationToken !== decision.calculationToken) {
      throw new ConflictException(
        "İade hesabı veya tarife değişti; yeni karar önizlemesi alın",
      );
    }
    const finalizedAt = new Date();
    const components = preview.financials.components;

    return this.prisma.$transaction(async (tx) => {
      const current = await tx.refundRequest.findUnique({
        where: { id: refundRequestId },
        select: {
          id: true,
          status: true,
          policyFinalizedAt: true,
          policyCode: true,
          financialPolicySnapshot: true,
          financialReviewRequired: true,
          orderId: true,
          order: { select: { packageId: true } },
        },
      });
      if (!current) {
        throw new NotFoundException(i18nMessage("server.refund.notFound"));
      }
      if (
        (!options.allowNonReview &&
          current.status !== RefundRequestStatus.pending_review) ||
        current.policyFinalizedAt ||
        (options.requireFinancialReview && !current.financialReviewRequired)
      ) {
        throw new ConflictException(
          "İade kararı başka bir işlem tarafından kesinleştirildi",
        );
      }

      const claimed = await tx.refundRequest.updateMany({
        where: {
          id: current.id,
          policyFinalizedAt: null,
          ...(!options.allowNonReview
            ? { status: RefundRequestStatus.pending_review }
            : {}),
          ...(options.requireFinancialReview
            ? { financialReviewRequired: true }
            : {}),
        },
        data: {
          policyFinalizedBy: adminId,
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException(
          "İade kararı başka bir işlem tarafından kesinleştirildi",
        );
      }

      await tx.refundFinancialComponent.createMany({
        data: components.map((component) => ({
          refundRequestId: current.id,
          componentCode: component.componentCode,
          treatment: component.treatment,
          netAmount: component.netAmount,
          taxAmount: component.taxAmount,
          grossAmount: component.grossAmount,
          sourceAmount: component.sourceAmount,
          quantityPortion: component.quantityPortion,
          metadata: component.metadata as Prisma.InputJsonValue | undefined,
        })),
      });

      if (
        preview.financials.outboundSettlementRequired &&
        current.order.packageId
      ) {
        const outboundNet = preview.outboundFullShippingAmount;
        const outboundTax =
          Math.round(
            outboundNet * (Math.max(0, preview.serviceVatRate) / 100) * 100,
          ) / 100;
        await tx.packageShippingSettlement.create({
          data: {
            packageId: current.order.packageId,
            refundRequestId: current.id,
            leg: "outbound",
            payer: decision.faultParty as RefundFaultParty,
            netAmount: outboundNet,
            taxAmount: outboundTax,
            grossAmount: outboundNet + outboundTax,
            sourceKey: `package-outbound:${current.order.packageId}`,
          },
        });
      }
      const returnSettlement = components.find(
        (component) => component.componentCode === "return_shipping",
      );
      if (returnSettlement) {
        await tx.packageShippingSettlement.create({
          data: {
            packageId: current.order.packageId,
            refundRequestId: current.id,
            leg: "return",
            payer: decision.faultParty as RefundFaultParty,
            netAmount: returnSettlement.netAmount,
            taxAmount: returnSettlement.taxAmount,
            grossAmount: returnSettlement.grossAmount,
            sourceKey: `refund-return:${current.id}`,
          },
        });
      }

      const sellerFeeRefund =
        this.componentTotal(
          components,
          "seller_commission",
          "seller_refund",
          "netAmount",
        ) +
        this.componentTotal(
          components,
          "seller_platform_fee",
          "seller_refund",
          "netAmount",
        );
      const buyerFeeRefund =
        this.componentTotal(
          components,
          "buyer_commission",
          "buyer_refund",
          "grossAmount",
        ) +
        this.componentTotal(
          components,
          "buyer_platform_fee",
          "buyer_refund",
          "grossAmount",
        );
      const retainedSellerPlatformFee = this.componentTotal(
        components,
        "seller_platform_fee",
        "platform_retain",
        "netAmount",
      );
      const oldSnapshot = current.financialPolicySnapshot;
      const snapshot = {
        version: 2,
        resolvedReason: decision.resolvedReason,
        faultParty: decision.faultParty,
        calculationToken: preview.calculationToken,
        finalizedAt: finalizedAt.toISOString(),
        finalizedBy: adminId,
        outboundPackageTier: preview.outboundPackageTier,
        outboundFullShippingAmount: preview.outboundFullShippingAmount,
        returnTariff: preview.returnTariff,
        financials: preview.financials,
        ...(oldSnapshot ? { legacySnapshot: oldSnapshot } : {}),
      } as unknown as Prisma.InputJsonValue;
      const suffix = current.policyCode.endsWith("_cancellation")
        ? "cancellation"
        : "return";

      return tx.refundRequest.update({
        where: { id: current.id },
        data: {
          resolvedReason: decision.resolvedReason,
          faultParty: decision.faultParty as RefundFaultParty,
          policyVersion: 2,
          policyFinalizedAt: finalizedAt,
          policyFinalizedBy: adminId,
          policyCode: `v2_${decision.faultParty}_${suffix}`,
          financialReviewRequired: false,
          financialPolicySnapshot: snapshot,
          amount: preview.financials.buyerRefundAmount,
          outboundPackageTier: preview.outboundPackageTier,
          outboundFullShippingAmount: preview.outboundFullShippingAmount,
          returnShippingAmount: preview.returnTariff?.amount ?? 0,
          refundedProductAmount: this.componentTotal(
            components,
            "product",
            "buyer_refund",
          ),
          refundedOutboundShippingAmount: this.componentTotal(
            components,
            "outbound_shipping",
            "buyer_refund",
          ),
          refundedBuyerProtectionAmount: buyerFeeRefund,
          refundedSellerFeeAmount: sellerFeeRefund,
          retainedSellerPlatformFeeAmount: retainedSellerPlatformFee,
          refundedBuyerServiceTaxAmount:
            preview.financials.refundedBuyerServiceTaxAmount,
          refundedSellerServiceTaxAmount:
            preview.financials.refundedSellerServiceTaxAmount,
          retainedBuyerServiceTaxAmount:
            preview.financials.retainedBuyerServiceTaxAmount,
          retainedSellerServiceTaxAmount:
            preview.financials.retainedSellerServiceTaxAmount,
          returnShippingChargeToBuyer: this.componentTotal(
            components,
            "return_shipping",
            "buyer_charge",
          ),
          returnShippingChargeToSeller: this.componentTotal(
            components,
            "return_shipping",
            "seller_charge",
          ),
          sellerShippingCompensationAmount: this.componentTotal(
            components,
            "outbound_shipping",
            "seller_refund",
          ),
          outboundShippingChargeToSeller: this.componentTotal(
            components,
            "outbound_shipping",
            "seller_charge",
          ),
          carrierClaimRequired: preview.financials.carrierClaimRequired,
          returnShippingPayer:
            decision.faultParty === "buyer"
              ? "buyer"
              : decision.faultParty === "seller"
                ? "seller"
                : "platform",
          refundShippingFee:
            this.componentTotal(
              components,
              "outbound_shipping",
              "buyer_refund",
            ) > 0,
          refundBuyerFee: buyerFeeRefund > 0,
          refundSellerCommission: sellerFeeRefund > 0,
        },
        include: { financialComponents: true },
      });
    });
  }

  private async finalizeAutomaticV2RefundDecision(
    refundRequestId: string,
    resolvedReason: RefundReason,
    faultParty: RefundFaultPartyV2,
  ) {
    const preview = await this.previewRefundDecision(
      refundRequestId,
      resolvedReason,
      faultParty,
      true,
    );
    return this.finalizeV2RefundDecision(
      refundRequestId,
      "system",
      {
        resolvedReason,
        faultParty,
        calculationToken: preview.calculationToken,
      },
      { allowNonReview: true },
    );
  }

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
      const finalized = await this.finalizeV2RefundDecision(
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
        await this.appendHistory(refundRequestId, {
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
        "Yalnız inceleme bekleyen iade talepleri onaylanabilir",
      );
    }
    if (rr.policyVersion >= 2 && !rr.policyFinalizedAt) {
      throw new BadRequestException(
        "V2 iade finansal kararı kesinleşmeden onaylanamaz",
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
            ...this.feeSettlementFromComponents(rr.financialComponents, {
              sellerFeeAmount: Number(rr.refundedSellerFeeAmount),
              // Defter NET tutar ister (K6): brüt kolon yerine snapshot'taki net.
              buyerFeeAmount: this.legacyBuyerFeeNetOf(rr),
            }),
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
        "İtiraz işareti için en az 10 karakterlik gerekçe zorunludur",
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
        "İade bu sırada başka bir akış tarafından ilerletildi; sayfayı yenileyin",
      );
    }
    await this.appendHistory(refundRequestId, {
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
        requester: { select: { id: true, ...PUBLIC_NAME_SELECT } },
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
      throw new BadRequestException(`Sürat iade kargosu açılamadı: ${errMsg}`);
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
      include: { order: true, financialComponents: true },
    });
    if (!rr) throw new NotFoundException(i18nMessage("server.refund.notFound"));
    if (rr.status === RefundRequestStatus.refunded) return rr;
    if (rr.financialReviewRequired && !rr.policyFinalizedAt) {
      throw new BadRequestException(
        "Finansal inceleme tamamlanmadan para iadesi kesinleştirilemez",
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
            ...this.feeSettlementFromComponents(rr.financialComponents, {
              sellerFeeAmount: Number(rr.refundedSellerFeeAmount),
              // Defter NET tutar ister (K6): brüt kolon yerine snapshot'taki net.
              buyerFeeAmount: this.legacyBuyerFeeNetOf(rr),
            }),
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
        await this.unfreezeHoldForRefund(rr.order.id);
        await this.appendHistory(rr.id, {
          action: "return_dropoff_expired",
          by: "system",
          details: { days, carrierCancellationRequired: true },
        });
        this.logger.warn(
          `Refund ${rr.refundNumber} locally expired; carrier cancellation task=${cancellationTask.id}`,
        );
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
      statusChanged &&
      (update.status === ShipmentStatus.delivered ||
        update.status === ShipmentStatus.returned)
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
        order.shipment.status === ShipmentStatus.label_created ||
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
      return ageDays <= coolingOffDays()
        ? "in_cooling_off"
        : "past_cooling_off";
    }
    return "unknown";
  }

  private async buildFinancialPolicySnapshot(
    order: {
      totalAmount: Prisma.Decimal;
      quantity?: number;
      shippingCost?: Prisma.Decimal;
      buyerShippingAmount?: Prisma.Decimal;
      buyerFeeAmount?: Prisma.Decimal;
      buyerServiceFeeAmount?: Prisma.Decimal;
      buyerServiceTaxAmount?: Prisma.Decimal;
      serviceVatRate?: Prisma.Decimal;
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
      buyerServiceTaxAmount: Number(order.buyerServiceTaxAmount ?? 0),
      serviceVatRate: Number(order.serviceVatRate ?? 0),
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
          ...(policy.requiresAdminReview && this.refundPolicyV2Enabled()
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

    if (!policy.requiresAdminReview && this.refundPolicyV2Enabled()) {
      created = await this.finalizeAutomaticV2RefundDecision(
        created.id,
        dto.reason,
        dto.reason === RefundReason.changed_mind ? "buyer" : "seller",
      );
    }

    if (policy.requiresAdminReview) {
      await this.freezeHoldForRefund(order.id, created.id);
      await this.appendHistory(created.id, {
        action: "pending_admin_review",
        by: requesterId,
        details: { policyCode: policy.policyCode },
      });
      await this.notifyRefundRequestOpened({
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
    await this.freezeHoldForRefund(order.id, created.id);

    let refundResult: { providerRefundId: string };
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
            ...this.feeSettlementFromComponents(
              (created as any).financialComponents,
              {
                sellerFeeAmount: financial.financials.sellerFeeRefundAmount,
                // Defter NET tutar ister; brüt beslemek KDV kadar fazla ters
                // kayıt üretir (K6).
                buyerFeeAmount:
                  financial.financials.buyerProtectionNetRefundAmount,
              },
            ),
            ...this.shippingSettlement(created.id, {
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
        await this.freezeHoldForRefund(order.id, created.id);
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
          ...(requiresReview && this.refundPolicyV2Enabled()
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

    if (!requiresReview && this.refundPolicyV2Enabled()) {
      created = await this.finalizeAutomaticV2RefundDecision(
        created.id,
        dto.reason,
        dto.reason === RefundReason.changed_mind ? "buyer" : "seller",
      );
    }

    // İade açıldı → satıcı hold'unu kilitle (payout bu iade kapanana kadar bloke).
    await this.freezeHoldForRefund(order.id, created.id);
    await this.notifyRefundRequestOpened({
      refundRequestId: created.id,
      refundNumber,
      orderId: order.id,
      sellerId: order.sellerId,
      reason: dto.reason,
      requiresAdminReview: requiresReview,
    });

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

  // NOT: overrideRefundPolicy / setReturnShippingPayer / computePartialRefundAmount
  // KALDIRILDI. `policyCode === "legacy"` şartına bağlıydılar; refundFinancialData
  // her kayda gerçek policy kodu yazdığı için hiçbir üretim kaydında çalışamıyorlardı
  // ve computePartialRefundAmount vergileri tamamen yok sayan ÜÇÜNCÜ bir tutar
  // formülüydü. Karar akışı tek kaynaktan yürür: previewRefundDecision +
  // finalizeV2RefundDecision (bileşen bazlı politika).
}
