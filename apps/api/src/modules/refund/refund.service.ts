import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  OrderStatus,
  PaymentHoldStatus,
  PaymentStatus,
  Prisma,
  RefundReason,
  RefundRequestStatus,
  ShipmentStatus,
} from "@prisma/client";
import { PrismaService } from "../../prisma";
import { generateUniqueReference } from "../../common/helpers/generate-reference";
import { PaymentService } from "../payment/payment.service";
import { SuratCargoService } from "../surat-cargo/surat-cargo.service";
import { canTransitionShipmentStatus } from "../shipping/shipment-state-machine";
import {
  normalizeSuratPhone,
  normalizeSuratLocation,
} from "../surat-cargo/surat-address.util";
import {
  SuratGonderiSekli,
  SuratKargoTuru,
  SuratOdemeTipi,
  SuratTasimaSekli,
  SuratTeslimSekli,
} from "../surat-cargo/surat-cargo.types";
import { CreateRefundRequestDto } from "./dto/create-refund-request.dto";
import { NotificationService } from "../notification/notification.service";
import { NotificationType } from "../notification/dto/notification.dto";
import { StorageService } from "../storage/storage.service";
import { i18nMessage } from "../i18n";

const COOLING_OFF_DAYS = 14;

const REASONS_REQUIRING_EVIDENCE: RefundReason[] = [
  RefundReason.damaged,
  RefundReason.wrong_item,
  RefundReason.not_as_described,
  RefundReason.missing_parts,
];

@Injectable()
export class RefundService {
  private readonly logger = new Logger(RefundService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentService: PaymentService,
    private readonly suratCargoService: SuratCargoService,
    private readonly notificationService: NotificationService,
    private readonly storageService: StorageService,
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

    const activeStatuses: RefundRequestStatus[] = [
      RefundRequestStatus.pending_review,
      RefundRequestStatus.approved,
      RefundRequestStatus.wait_for_delivery,
      RefundRequestStatus.return_shipment_open,
      RefundRequestStatus.return_in_transit,
      RefundRequestStatus.return_delivered,
      RefundRequestStatus.disputed,
    ];
    const hasActive = order.refundRequests.some((r) =>
      activeStatuses.includes(r.status),
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

    if (phase === "preparing" || phase === "paid") {
      return this.createInstantRefund(order, requesterId, dto, reqQty);
    }

    if (phase === "in_cooling_off") {
      // KOŞULSUZ: 14 gün içinde kanıt fotoğrafı ZORUNLU DEĞİL (cayma hakkı).
      // İsteyen yine de foto/açıklama ekleyebilir; otomatik onaylanır.
      return this.createCoolingOffRefund(order, requesterId, dto, reqQty);
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
          },
        },
      },
    });
    if (!rr) throw new NotFoundException(i18nMessage("server.refund.notFound"));
    if (rr.returnTrackingNumber) {
      this.logger.log(`Return shipment already exists for ${rr.refundNumber}`);
      return rr;
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
      payload: {
        KisiKurum: sellerAddr.fullName || rr.order.seller.displayName,
        SahisBirim: `İade: ${rr.order.orderNumber}`,
        AliciAdresi: sellerAddr.address,
        Il: normalizeSuratLocation(sellerAddr.city),
        Ilce: normalizeSuratLocation(sellerAddr.district),
        TelefonCep: normalizeSuratPhone(sellerAddr.phone),
        KargoTuru: SuratKargoTuru.Koli,
        OdemeTipi: SuratOdemeTipi.Pesin,
        OzelKargoTakipNo: rr.refundNumber,
        Adet: 1,
        BirimDesi: 1,
        BirimKg: 1,
        KapidanOdemeTahsilatTipi: 1,
        TasimaSekli: SuratTasimaSekli.KaraYolu,
        TeslimSekli: SuratTeslimSekli.AdreseTeslim,
        GonderiSekli: SuratGonderiSekli.Standart,
        Pazaryerimi: 0,
        Iademi: true,
      },
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

    const refundResult = await this.paymentService.processRefund(
      rr.orderId,
      Number(rr.amount),
      { skipRefundEvent: true, refundQuantity: rr.refundQuantity }, // REFUND_COMPLETED'ı aşağıda kendimiz gönderiyoruz
    );

    const updated = await this.prisma.refundRequest.update({
      where: { id: rr.id },
      data: {
        status: RefundRequestStatus.refunded,
        refundedAt: new Date(),
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

  // return_delivered'dan 30 dk sonra Sürat takibi hâlâ refund başlatmadıysa
  // (entegrasyon kapalı veya callback eksik) cron fallback olarak işler.
  async findReturnDeliveredPendingFinalize(): Promise<string[]> {
    const cutoff = new Date(Date.now() - 30 * 60 * 1000);
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
  private async generateRefundNumber(): Promise<string> {
    return generateUniqueReference(
      "RFD",
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
    },
    requesterId: string,
    dto: CreateRefundRequestDto,
    refundQuantity = 1,
  ) {
    const refundNumber = await this.generateRefundNumber();
    const amount = this.computeRefundAmount(order, refundQuantity);

    const created = await this.prisma.refundRequest.create({
      data: {
        refundNumber,
        orderId: order.id,
        requesterId,
        reason: dto.reason,
        description: dto.description ?? null,
        evidencePhotoUrls: dto.evidencePhotoUrls ?? [],
        amount,
        refundQuantity,
        status: RefundRequestStatus.approved,
      },
    });

    let refundResult: { providerRefundId: string };
    try {
      refundResult = await this.paymentService.processRefund(order.id, amount, {
        skipRefundEvent: true, // REFUND_COMPLETED'ı aşağıda kendimiz gönderiyoruz
        refundQuantity,
      });
    } catch (err) {
      // Roll back the RefundRequest so the buyer can retry without hitting
      // the "active duplicate" guard. Sürat cancel is idempotent on retry.
      await this.prisma.refundRequest.delete({ where: { id: created.id } });
      this.logger.warn(
        `Instant refund failed for order ${order.orderNumber}, rolled back RefundRequest ${created.refundNumber}: ${(err as Error).message}`,
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
    },
    requesterId: string,
    dto: CreateRefundRequestDto,
    refundQuantity = 1,
  ) {
    const refundNumber = await this.generateRefundNumber();
    const amount = this.computeRefundAmount(order, refundQuantity);

    const created = await this.prisma.refundRequest.create({
      data: {
        refundNumber,
        orderId: order.id,
        requesterId,
        reason: dto.reason,
        description: dto.description ?? null,
        evidencePhotoUrls: dto.evidencePhotoUrls ?? [],
        amount,
        refundQuantity,
        status: RefundRequestStatus.wait_for_delivery,
        decidedBy: "system",
        decidedAt: new Date(),
      },
    });

    // İade açıldı → satıcı hold'unu kilitle (payout bu iade kapanana kadar bloke).
    await this.freezeHoldForRefund(order.id, created.id);

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
      select: { id: true, returnShippingPayer: true },
    });
    if (!before) {
      throw new NotFoundException(i18nMessage("server.refund.notFound"));
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
