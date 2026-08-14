import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
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
import { PaymentService } from "../payment/payment.service";
import { RefundPendingReconciliationException } from "../payment-providers/refund-errors";
import {
  PAYMENT_CONFIG_KEYS,
  envConfigNumber,
} from "../payment/payment.constants";
import { isShipmentHandedToCarrier } from "../shipping/shipment-handover";
import { ACTIVE_REFUND_REQUEST_STATUSES } from "./refund-active-statuses";
import { generateUniqueReference } from "../../common/helpers/generate-reference";
import { REFERENCE_PREFIX } from "../../common/helpers/code-prefixes";
import { CreateRefundRequestDto } from "./dto/create-refund-request.dto";
import { NotificationType } from "../notification/dto/notification.dto";
import { i18nMessage } from "../i18n";
import {
  resolveCancellationPolicy,
  resolveReturnPolicy,
} from "./refund-financial-policy";
import { RefundNotificationService } from "./refund-notification.service";
import { RefundFinancialService } from "./refund-financial.service";
import { RefundShipmentService } from "./refund-shipment.service";

/**
 * Cayma (iade talep) penceresi — satıcı payout takvimiyle AYNI kaynaktan gelir
 * (PAYMENT_CONFIG_KEYS.RETURN_WINDOW_DAYS). Burada gömülü bir 14 tutmak,
 * env'den okunan payout penceresiyle sessizce kaymasına yol açıyordu.
 */
const coolingOffDays = () =>
  envConfigNumber(PAYMENT_CONFIG_KEYS.RETURN_WINDOW_DAYS);

/**
 * İade talebinin DOĞUŞU — RefundService'ten birebir taşındı. Bir talebin hangi
 * yoldan açılacağına siparişin fazı karar verir (classifyOrderPhase): henüz
 * yola çıkmamış sipariş anında iade edilir, cayma penceresindeki sipariş fiziksel
 * dönüş bekler, penceresi geçmiş sipariş admin incelemesine düşer.
 *
 * Üç yol da AYNI finansal servisten hesap alır; buradaki fark yalnız hangi
 * durumla başlanacağı ve iade kargosunun ne zaman açılacağıdır.
 */
@Injectable()
export class RefundCreationService {
  private readonly logger = new Logger(RefundCreationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentService: PaymentService,
    private readonly notifications: RefundNotificationService,
    private readonly financials: RefundFinancialService,
    private readonly shipments: RefundShipmentService,
  ) {}

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
        await this.shipments.openReturnShipment(created.id);
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
}
