import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import {
  OrderStatus,
  PaymentStatus,
  Prisma,
  RefundReason,
  RefundRequestStatus,
  ShipmentStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma';
import { generateUniqueReference } from '../../common/helpers/generate-reference';
import { PaymentService } from '../payment/payment.service';
import { SuratCargoService } from '../surat-cargo/surat-cargo.service';
import { normalizeSuratPhone, normalizeSuratLocation } from '../surat-cargo/surat-address.util';
import {
  SuratGonderiSekli,
  SuratKargoTuru,
  SuratOdemeTipi,
  SuratTasimaSekli,
  SuratTeslimSekli,
} from '../surat-cargo/surat-cargo.types';
import { CreateRefundRequestDto } from './dto/create-refund-request.dto';
import { RejectRefundRequestDto } from './dto/reject-refund-request.dto';
import { NotificationService } from '../notification/notification.service';
import { NotificationType, NotificationChannel } from '../notification/dto/notification.dto';
import { StorageService } from '../storage/storage.service';

const COOLING_OFF_DAYS = 14;
const SELLER_RESPONSE_DEADLINE_HOURS = 48;

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
    @Inject(forwardRef(() => PaymentService)) private readonly paymentService: PaymentService,
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
        img?.cardKey ? this.storageService.getPublicAssetUrl(img.cardKey) : '',
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
   * in_app (+ canlı websocket) için createInAppNotification; aynı anda PUSH
   * kanalını da gönderir (data'da orderId olduğundan mobil deep-link /orders'a
   * gider). Email ayrı: markalı şablonlar için sendRefundEmail kullanılır.
   */
  private async safeNotify(
    userId: string,
    type: NotificationType,
    data?: Record<string, any>,
  ): Promise<void> {
    try {
      await this.notificationService.createInAppNotification(userId, type, data);
    } catch (err: any) {
      this.logger.error(
        `In-app notification ${type} → ${userId} failed: ${err?.message}`,
      );
    }
    // Push'u ayrı try/catch'te gönder ki in_app başarısız olsa bile denensin
    // (ve tersi). send([PUSH]) in_app yazmaz → mükerrer zil olmaz.
    try {
      await this.notificationService.send({
        userId,
        type,
        channels: [NotificationChannel.PUSH],
        data,
      });
    } catch (err: any) {
      this.logger.error(
        `Push notification ${type} → ${userId} failed: ${err?.message}`,
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
    recipient: 'buyer' | 'seller',
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
      const recipientId = recipient === 'buyer' ? rr.requesterId : rr.order?.sellerId;
      if (!recipientId) return;
      await this.notificationService.sendTemplateEmailToUser(recipientId, templateKey, {
        buyerName: rr.order?.buyer?.displayName ?? '',
        sellerName: rr.order?.seller?.displayName ?? '',
        orderNumber: rr.order?.orderNumber,
        orderId: rr.orderId,
        productTitle: rr.order?.product?.title ?? '',
        refundAmount: Number(rr.amount),
        ...extra,
      });
    } catch (err: any) {
      this.logger.error(
        `Refund email ${templateKey} failed for ${refundRequestId}: ${err?.message}`,
      );
    }
  }

  async createRefundRequest(orderId: string, requesterId: string, dto: CreateRefundRequestDto) {
    // Senaryo D kaldırıldı (Faz 5 sonrası karar): keyfi vazgeçme talebi
    // kabul edilmiyor. Alıcı sadece somut bir sorun bildirebilir (hasar,
    // yanlış ürün, eksik, sahte, kargoda kaybolma vb.). Cayma hakkı 14 günlük
    // pencere içinde "not_as_described" veya "other" + açıklama ile değerlendirilir.
    if ((dto.reason as any) === 'changed_mind') {
      throw new BadRequestException(
        'Keyfi vazgeçme iade gerekçesi olarak kabul edilmiyor. Ürünle ilgili somut bir sorun varsa lütfen uygun bir sebep seçin.',
      );
    }

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
      throw new NotFoundException('Sipariş bulunamadı');
    }
    // Üyelik/dijital siparişler (sanal ürün + platform satıcısı) genel iade akışına girmez;
    // üyeliğin kendi iptal akışı vardır.
    if (order.orderNumber?.startsWith('MEM-')) {
      throw new BadRequestException(
        'Üyelik siparişleri için iade talebi oluşturulamaz; üyeliğinizi üyelik ayarlarından iptal edebilirsiniz.',
      );
    }
    if (order.buyerId !== requesterId) {
      throw new ForbiddenException('Sadece alıcı iade talebi oluşturabilir');
    }

    if (order.status === OrderStatus.pending_payment) {
      throw new BadRequestException(
        'Bu sipariş henüz ödenmemiş, iade yerine siparişi iptal etmelisiniz',
      );
    }
    if (order.status === OrderStatus.cancelled || order.status === OrderStatus.refunded) {
      throw new BadRequestException('Bu sipariş zaten iptal/iade edilmiş');
    }
    const payment = order.payment ?? (order as any).checkoutGroup?.payment ?? null;
    if (!payment || payment.status !== PaymentStatus.completed) {
      throw new BadRequestException('Tamamlanmış ödeme bulunamadı');
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
    const hasActive = order.refundRequests.some((r) => activeStatuses.includes(r.status));
    if (hasActive) {
      throw new BadRequestException('Bu sipariş için zaten aktif bir iade talebi var');
    }

    const phase = this.classifyOrderPhase(order);

    if (phase === 'preparing' || phase === 'paid') {
      return this.createInstantRefund(order, requesterId, dto);
    }

    if (phase === 'in_cooling_off') {
      const evidenceMissing =
        REASONS_REQUIRING_EVIDENCE.includes(dto.reason) &&
        (!dto.evidencePhotoUrls || dto.evidencePhotoUrls.length === 0);
      if (evidenceMissing) {
        throw new BadRequestException(
          'Hasarlı / yanlış ürün talebi için en az bir kanıt fotoğrafı gereklidir',
        );
      }
      return this.createCoolingOffRefund(order, requesterId, dto);
    }

    if (phase === 'past_cooling_off') {
      if (!dto.description || dto.description.trim().length < 20) {
        throw new BadRequestException(
          '14 günlük cayma süresi dolmuştur. Açıklama (en az 20 karakter) zorunludur',
        );
      }
      if (
        REASONS_REQUIRING_EVIDENCE.includes(dto.reason) &&
        (!dto.evidencePhotoUrls || dto.evidencePhotoUrls.length === 0)
      ) {
        throw new BadRequestException('Hasar/yanlış ürün talebi için kanıt fotoğrafı gereklidir');
      }
      return this.createDisputedRefund(order, requesterId, dto);
    }

    throw new BadRequestException('Bu sipariş durumunda iade talebi oluşturulamaz');
  }

  async cancelRefundRequest(refundRequestId: string, requesterId: string) {
    const rr = await this.prisma.refundRequest.findUnique({
      where: { id: refundRequestId },
      include: { order: { select: { id: true, sellerId: true } } },
    });
    if (!rr) throw new NotFoundException('İade talebi bulunamadı');
    if (rr.requesterId !== requesterId) {
      throw new ForbiddenException('Bu talebi iptal edemezsiniz');
    }
    if (
      rr.status !== RefundRequestStatus.pending_review &&
      rr.status !== RefundRequestStatus.wait_for_delivery
    ) {
      throw new BadRequestException(
        'Bu talep artık iptal edilemez (iade kargosu açılmış veya karara bağlanmış)',
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
    await this.appendHistory(refundRequestId, {
      action: 'cancelled_by_buyer',
      by: requesterId,
      details: { previousStatus: rr.status },
    });
    await this.safeNotify(rr.order.sellerId, NotificationType.REFUND_CANCELLED, {
      refundNumber: rr.refundNumber,
      orderId: rr.order.id,
    });
    return updated;
  }

  async sellerAccept(refundRequestId: string, sellerId: string) {
    const rr = await this.prisma.refundRequest.findUnique({
      where: { id: refundRequestId },
      include: { order: { include: { shipment: true } } },
    });
    if (!rr) throw new NotFoundException('İade talebi bulunamadı');
    if (rr.order.sellerId !== sellerId) {
      throw new ForbiddenException('Bu talebi sadece satıcı kabul edebilir');
    }
    if (rr.status !== RefundRequestStatus.pending_review) {
      throw new BadRequestException('Bu talep zaten karara bağlanmış');
    }

    if (rr.order.status === OrderStatus.delivered) {
      // openReturnShipment notification'ı kendisi gönderir; ayrıca buyer'a
      // genel "onaylandı" mesajını burada vermek istemiyoruz çünkü return
      // opened mesajı zaten daha bilgilendirici.
      await this.openReturnShipment(rr.id);
      await this.appendHistory(rr.id, {
        action: 'accepted_by_seller',
        by: sellerId,
        details: { autoOpenedReturn: true },
      });
      return this.prisma.refundRequest.findUnique({ where: { id: rr.id } });
    }

    const updated = await this.prisma.refundRequest.update({
      where: { id: rr.id },
      data: {
        status: RefundRequestStatus.wait_for_delivery,
        decidedBy: sellerId,
        decidedAt: new Date(),
      },
    });
    await this.appendHistory(rr.id, {
      action: 'accepted_by_seller',
      by: sellerId,
      details: { newStatus: 'wait_for_delivery' },
    });
    await this.safeNotify(rr.requesterId, NotificationType.REFUND_APPROVED, {
      refundNumber: rr.refundNumber,
      orderId: rr.orderId,
    });
    await this.sendRefundEmail(rr.id, 'buyer', 'refund-approved-buyer');
    return updated;
  }

  async sellerReject(refundRequestId: string, sellerId: string, dto: RejectRefundRequestDto) {
    const rr = await this.prisma.refundRequest.findUnique({
      where: { id: refundRequestId },
      include: { order: true },
    });
    if (!rr) throw new NotFoundException('İade talebi bulunamadı');
    if (rr.order.sellerId !== sellerId) {
      throw new ForbiddenException('Bu talebi sadece satıcı reddedebilir');
    }
    if (rr.status !== RefundRequestStatus.pending_review) {
      throw new BadRequestException('Bu talep zaten karara bağlanmış');
    }

    const updated = await this.prisma.refundRequest.update({
      where: { id: rr.id },
      data: {
        status: RefundRequestStatus.disputed,
        sellerResponse: dto.response,
        decidedBy: sellerId,
        decidedAt: new Date(),
      },
    });
    await this.appendHistory(rr.id, {
      action: 'rejected_by_seller',
      by: sellerId,
      details: { response: dto.response },
    });
    // Buyer'a reddedildi haberi
    await this.safeNotify(rr.requesterId, NotificationType.REFUND_REJECTED, {
      refundNumber: rr.refundNumber,
      orderId: rr.orderId,
      reason: dto.response,
    });
    await this.sendRefundEmail(rr.id, 'buyer', 'refund-rejected-buyer', {
      reason: dto.response,
    });
    // Admin role'üne dispute incelemesi sinyali — basit fan-out: aktif admin
    // kullanıcılarını tarayıp tek tek bildir. Admin sayısı düşük olduğu için
    // toplu sorgu yeterli.
    try {
      const admins = await this.prisma.adminUser.findMany({
        where: { isActive: true },
        select: { userId: true },
      });
      for (const a of admins) {
        await this.safeNotify(a.userId, NotificationType.REFUND_DISPUTED, {
          refundNumber: rr.refundNumber,
          refundRequestId: rr.id,
        });
      }
    } catch (err: any) {
      this.logger.error(
        `REFUND_DISPUTED admin fan-out failed for ${rr.id}: ${err?.message}`,
      );
    }
    return updated;
  }

  async getById(refundRequestId: string, userId: string, isAdmin = false) {
    const rr = await this.prisma.refundRequest.findUnique({
      where: { id: refundRequestId },
      include: {
        order: {
          include: {
            buyer: { select: { id: true, displayName: true, avatarUrl: true } },
            seller: { select: { id: true, displayName: true, avatarUrl: true } },
            product: { select: { id: true, title: true, images: true } },
            shipment: true,
            payment: { select: { amount: true, currency: true, paidAt: true } },
          },
        },
        requester: { select: { id: true, displayName: true } },
      },
    });
    if (!rr) throw new NotFoundException('İade talebi bulunamadı');

    if (!isAdmin && rr.requesterId !== userId && rr.order.sellerId !== userId) {
      throw new ForbiddenException('Bu talebi görüntüleme yetkiniz yok');
    }
    return this.withResolvedImages(rr);
  }

  async listForBuyer(userId: string) {
    const rows = await this.prisma.refundRequest.findMany({
      where: { requesterId: userId },
      orderBy: { createdAt: 'desc' },
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
      orderBy: { createdAt: 'desc' },
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
            buyer: { include: { addresses: { where: { isDefault: true }, take: 1 } } },
            seller: { include: { addresses: { where: { isDefault: true }, take: 1 } } },
          },
        },
      },
    });
    if (!rr) throw new NotFoundException('İade talebi bulunamadı');
    if (rr.returnTrackingNumber) {
      this.logger.log(`Return shipment already exists for ${rr.refundNumber}`);
      return rr;
    }

    const buyerAddr =
      rr.order.buyer.addresses[0] ?? this.fallbackAddressFromOrderJson(rr.order.shippingAddress);
    const sellerAddr = rr.order.seller.addresses[0];

    if (!buyerAddr || !sellerAddr) {
      throw new BadRequestException(
        'Alıcı veya satıcı adresi bulunamadı, iade kargosu oluşturulamaz',
      );
    }

    if (!this.suratCargoService.isIntegrationEnabled()) {
      this.logger.warn(`Surat integration disabled, marking ${rr.refundNumber} as return_shipment_open without provider call`);
      const updated = await this.prisma.refundRequest.update({
        where: { id: rr.id },
        data: {
          status: RefundRequestStatus.return_shipment_open,
          returnProvider: 'manual',
          returnTrackingNumber: rr.refundNumber,
          returnCreatedAt: new Date(),
        },
      });
      await this.appendHistory(rr.id, {
        action: 'return_opened',
        by: 'system',
        details: { provider: 'manual', trackingNumber: rr.refundNumber },
      });
      await this.safeNotify(rr.requesterId, NotificationType.REFUND_RETURN_OPENED, {
        refundNumber: rr.refundNumber,
        orderId: rr.orderId,
        trackingNumber: rr.refundNumber,
      });
      await this.sendRefundEmail(rr.id, 'buyer', 'refund-return-label-buyer', {
        returnTrackingNumber: rr.refundNumber,
      });
      return updated;
    }

    const result = await this.suratCargoService.submitShipmentWithRetry({
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
      const errMsg = r.kind === 'business' ? r.suratMessage : `technical: ${r.code}`;
      throw new BadRequestException(`Sürat iade kargosu açılamadı: ${errMsg}`);
    }

    const updated = await this.prisma.refundRequest.update({
      where: { id: rr.id },
      data: {
        status: RefundRequestStatus.return_shipment_open,
        returnProvider: 'surat',
        returnTrackingNumber: rr.refundNumber,
        returnStatus: ShipmentStatus.label_created,
        returnCreatedAt: new Date(),
      },
    });
    await this.appendHistory(rr.id, {
      action: 'return_opened',
      by: 'system',
      details: { provider: 'surat', trackingNumber: rr.refundNumber },
    });
    await this.safeNotify(rr.requesterId, NotificationType.REFUND_RETURN_OPENED, {
      refundNumber: rr.refundNumber,
      orderId: rr.orderId,
      trackingNumber: rr.refundNumber,
    });
    await this.sendRefundEmail(rr.id, 'buyer', 'refund-return-label-buyer', {
      returnTrackingNumber: rr.refundNumber,
      cargoCompany: 'Sürat Kargo',
    });
    return updated;
  }

  async finalizeRefundForReturnedShipment(refundRequestId: string) {
    const rr = await this.prisma.refundRequest.findUnique({
      where: { id: refundRequestId },
      include: { order: true },
    });
    if (!rr) throw new NotFoundException('İade talebi bulunamadı');
    if (rr.status === RefundRequestStatus.refunded) return rr;

    const refundResult = await this.paymentService.processRefund(
      rr.orderId,
      Number(rr.amount),
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
    await this.appendHistory(rr.id, {
      action: 'refund_completed',
      by: 'system',
      details: { providerRefundId: refundResult.providerRefundId },
    });
    await this.safeNotify(rr.requesterId, NotificationType.REFUND_COMPLETED, {
      refundNumber: rr.refundNumber,
      orderId: rr.orderId,
    });
    // "Para iadeniz tamamlandı" maili eksikti (sadece zile düşüyordu) — eklendi.
    await this.sendRefundEmail(rr.id, 'buyer', 'refund-completed');
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

  async findOverdueSellerResponses(): Promise<string[]> {
    const cutoff = new Date(Date.now() - SELLER_RESPONSE_DEADLINE_HOURS * 3600 * 1000);
    const overdue = await this.prisma.refundRequest.findMany({
      where: {
        status: RefundRequestStatus.pending_review,
        createdAt: { lt: cutoff },
      },
      select: { id: true },
    });
    return overdue.map((c) => c.id);
  }

  async autoAcceptOverdue(refundRequestId: string) {
    const rr = await this.prisma.refundRequest.findUnique({
      where: { id: refundRequestId },
      include: { order: true },
    });
    if (!rr) return;
    if (rr.status !== RefundRequestStatus.pending_review) return;

    if (rr.order.status === OrderStatus.delivered) {
      await this.prisma.refundRequest.update({
        where: { id: rr.id },
        data: {
          decidedBy: 'system',
          decidedAt: new Date(),
          metadata: { ...(rr.metadata as any), autoAccepted: true, autoAcceptedAt: new Date() },
        },
      });
      await this.openReturnShipment(rr.id);
    } else {
      await this.prisma.refundRequest.update({
        where: { id: rr.id },
        data: {
          status: RefundRequestStatus.wait_for_delivery,
          decidedBy: 'system',
          decidedAt: new Date(),
          metadata: { ...(rr.metadata as any), autoAccepted: true, autoAcceptedAt: new Date() },
        },
      });
    }
  }

  async applyReturnTrackingUpdate(
    refundRequestId: string,
    update: { status: ShipmentStatus; deliveredAt?: Date; shippedAt?: Date },
  ) {
    return this.prisma.refundRequest.update({
      where: { id: refundRequestId },
      data: {
        returnStatus: update.status,
        returnShippedAt: update.shippedAt ?? undefined,
        returnDeliveredAt: update.deliveredAt ?? undefined,
        status:
          update.status === ShipmentStatus.delivered
            ? RefundRequestStatus.return_delivered
            : update.status === ShipmentStatus.in_transit ||
                update.status === ShipmentStatus.picked_up
              ? RefundRequestStatus.return_in_transit
              : undefined,
      },
    });
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
      'RFD',
      async (code) =>
        (await this.prisma.refundRequest.count({ where: { refundNumber: code } })) > 0,
    );
  }

  private classifyOrderPhase(order: {
    status: OrderStatus;
    deliveredAt?: Date | null;
    shipment: { status: ShipmentStatus; deliveredAt: Date | null } | null;
  }): 'paid' | 'preparing' | 'in_cooling_off' | 'past_cooling_off' | 'unknown' {
    if (order.status === OrderStatus.paid || order.status === OrderStatus.preparing) {
      // Sürat hasn't actually picked up if shipment is still pending, or if a
      // previous attempt was cancelled / failed. In those cases we can still
      // do an instant refund (no in-flight cargo to chase).
      const stillNotShipped =
        !order.shipment ||
        order.shipment.status === ShipmentStatus.pending ||
        order.shipment.status === ShipmentStatus.cancelled ||
        order.shipment.status === ShipmentStatus.failed;
      return stillNotShipped ? 'preparing' : 'in_cooling_off';
    }
    if (order.status === OrderStatus.shipped) {
      return 'in_cooling_off';
    }
    if (
      order.status === OrderStatus.delivered ||
      order.status === OrderStatus.awaiting_buyer_confirmation ||
      order.status === OrderStatus.completed
    ) {
      // Teslim tarihi order.deliveredAt'e yazılır (shipping.worker). Track
      // güncellemesinde shipment.deliveredAt set edilmediği için order alanı
      // birincil kaynaktır; shipment yalnızca yedek.
      const deliveredAt = order.deliveredAt ?? order.shipment?.deliveredAt ?? null;
      if (!deliveredAt) return 'in_cooling_off';
      const ageDays = (Date.now() - deliveredAt.getTime()) / (1000 * 3600 * 24);
      return ageDays <= COOLING_OFF_DAYS ? 'in_cooling_off' : 'past_cooling_off';
    }
    return 'unknown';
  }

  private async createInstantRefund(
    order: { id: string; totalAmount: Prisma.Decimal; orderNumber: string },
    requesterId: string,
    dto: CreateRefundRequestDto,
  ) {
    const refundNumber = await this.generateRefundNumber();
    const amount = Number(order.totalAmount);

    const created = await this.prisma.refundRequest.create({
      data: {
        refundNumber,
        orderId: order.id,
        requesterId,
        reason: dto.reason,
        description: dto.description ?? null,
        evidencePhotoUrls: dto.evidencePhotoUrls ?? [],
        amount,
        status: RefundRequestStatus.approved,
      },
    });

    let refundResult: { providerRefundId: string };
    try {
      refundResult = await this.paymentService.processRefund(order.id, amount);
    } catch (err) {
      // Roll back the RefundRequest so the buyer can retry without hitting
      // the "active duplicate" guard. Sürat cancel is idempotent on retry.
      await this.prisma.refundRequest.delete({ where: { id: created.id } });
      this.logger.warn(
        `Instant refund failed for order ${order.orderNumber}, rolled back RefundRequest ${created.refundNumber}: ${(err as Error).message}`,
      );
      throw err;
    }

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
    await this.sendRefundEmail(created.id, 'buyer', 'refund-completed');

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
    },
    requesterId: string,
    dto: CreateRefundRequestDto,
  ) {
    const refundNumber = await this.generateRefundNumber();
    const amount = Number(order.totalAmount);

    const created = await this.prisma.refundRequest.create({
      data: {
        refundNumber,
        orderId: order.id,
        requesterId,
        reason: dto.reason,
        description: dto.description ?? null,
        evidencePhotoUrls: dto.evidencePhotoUrls ?? [],
        amount,
        status: RefundRequestStatus.wait_for_delivery,
        decidedBy: 'system',
        decidedAt: new Date(),
      },
    });

    // 14 gün cayma hakkı → otomatik onay. Alıcıya talebinin onaylandığını bildir
    // (önceden talep anında hiç bildirim yoktu). in_app + push + mail.
    await this.safeNotify(requesterId, NotificationType.REFUND_APPROVED, {
      refundNumber,
      orderId: order.id,
    });
    await this.sendRefundEmail(created.id, 'buyer', 'refund-approved-buyer');

    // Ürün alıcıya ulaşmışsa (delivered/awaiting_buyer_confirmation/completed)
    // iade kargosunu hemen aç; aksi hâlde cron teslimatta açar.
    if (
      order.status === OrderStatus.delivered ||
      order.status === OrderStatus.awaiting_buyer_confirmation ||
      order.status === OrderStatus.completed
    ) {
      await this.openReturnShipment(created.id);
      return this.prisma.refundRequest.findUnique({ where: { id: created.id } });
    }

    return created;
  }

  private async createDisputedRefund(
    order: { id: string; totalAmount: Prisma.Decimal },
    requesterId: string,
    dto: CreateRefundRequestDto,
  ) {
    const refundNumber = await this.generateRefundNumber();
    const amount = Number(order.totalAmount);

    const created = await this.prisma.refundRequest.create({
      data: {
        refundNumber,
        orderId: order.id,
        requesterId,
        reason: dto.reason,
        description: dto.description ?? null,
        evidencePhotoUrls: dto.evidencePhotoUrls ?? [],
        amount,
        status: RefundRequestStatus.pending_review,
      },
    });
    // Satıcıya "iade talebi alındı, incele" e-postası (pending_review →
    // satıcı kararı bekleniyor). In-app eşdeğeri henüz yok; mail bilgilendirir.
    await this.sendRefundEmail(created.id, 'seller', 'refund-requested-seller', {
      refundReason: dto.description ?? undefined,
    });
    return created;
  }

  private fallbackAddressFromOrderJson(json: Prisma.JsonValue | null) {
    if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
    const j = json as Record<string, any>;
    if (!j.fullName || !j.address || !j.city || !j.district || !j.phone) return null;
    return {
      fullName: String(j.fullName),
      address: String(j.address),
      city: String(j.city),
      district: String(j.district),
      phone: String(j.phone),
    };
  }

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
      throw new NotFoundException('İade talebi bulunamadı');
    }

    // Yeni policy değerleri (mevcut + payload merge)
    const policy = {
      refundProductAmount:
        payload.refundProductAmount ?? before.refundProductAmount,
      refundShippingFee:
        payload.refundShippingFee ?? before.refundShippingFee,
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
      action: 'policy_overridden',
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
      amount = amount.add(productAmount.isNegative() ? new D(0) : productAmount);
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
    payer: 'buyer' | 'seller' | 'platform',
  ) {
    const before = await this.prisma.refundRequest.findUnique({
      where: { id: refundRequestId },
      select: { id: true, returnShippingPayer: true },
    });
    if (!before) {
      throw new NotFoundException('İade talebi bulunamadı');
    }

    const updated = await this.prisma.refundRequest.update({
      where: { id: refundRequestId },
      data: { returnShippingPayer: payer as any },
    });

    await this.appendHistory(refundRequestId, {
      action: 'return_shipping_payer_changed',
      by: adminId,
      details: { before: before.returnShippingPayer, after: payer },
    });

    this.logger.log(
      `RefundRequest ${refundRequestId} returnShippingPayer set to ${payer} by admin ${adminId}`,
    );
    return updated;
  }
}
