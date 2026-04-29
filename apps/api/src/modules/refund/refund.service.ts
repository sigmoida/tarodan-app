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
import { randomInt } from 'crypto';
import { PrismaService } from '../../prisma';
import { PaymentService } from '../payment/payment.service';
import { SuratCargoService } from '../surat-cargo/surat-cargo.service';
import {
  SuratGonderiSekli,
  SuratKargoTuru,
  SuratOdemeTipi,
  SuratTasimaSekli,
  SuratTeslimSekli,
} from '../surat-cargo/surat-cargo.types';
import { CreateRefundRequestDto } from './dto/create-refund-request.dto';
import { RejectRefundRequestDto } from './dto/reject-refund-request.dto';

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
  ) {}

  async createRefundRequest(orderId: string, requesterId: string, dto: CreateRefundRequestDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { payment: true, shipment: true, refundRequests: true },
    });
    if (!order) {
      throw new NotFoundException('Sipariş bulunamadı');
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
    if (!order.payment || order.payment.status !== PaymentStatus.completed) {
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
    const rr = await this.prisma.refundRequest.findUnique({ where: { id: refundRequestId } });
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
    return this.prisma.refundRequest.update({
      where: { id: refundRequestId },
      data: { status: RefundRequestStatus.cancelled, decidedAt: new Date() },
    });
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
      await this.openReturnShipment(rr.id);
      return this.prisma.refundRequest.findUnique({ where: { id: rr.id } });
    }

    return this.prisma.refundRequest.update({
      where: { id: rr.id },
      data: {
        status: RefundRequestStatus.wait_for_delivery,
        decidedBy: sellerId,
        decidedAt: new Date(),
      },
    });
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

    return this.prisma.refundRequest.update({
      where: { id: rr.id },
      data: {
        status: RefundRequestStatus.disputed,
        sellerResponse: dto.response,
        decidedBy: sellerId,
        decidedAt: new Date(),
      },
    });
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
    return rr;
  }

  async listForBuyer(userId: string) {
    return this.prisma.refundRequest.findMany({
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
  }

  async listForSeller(userId: string) {
    return this.prisma.refundRequest.findMany({
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
      return this.prisma.refundRequest.update({
        where: { id: rr.id },
        data: {
          status: RefundRequestStatus.return_shipment_open,
          returnProvider: 'manual',
          returnTrackingNumber: rr.refundNumber,
          returnCreatedAt: new Date(),
        },
      });
    }

    const result = await this.suratCargoService.submitShipmentWithRetry({
      idempotencyKey: `surat:refund-return:${rr.refundNumber}`,
      correlationId: `refund-${rr.id}`,
      payload: {
        KisiKurum: sellerAddr.fullName || rr.order.seller.displayName,
        SahisBirim: `İade: ${rr.order.orderNumber}`,
        AliciAdresi: sellerAddr.address,
        Il: sellerAddr.city,
        Ilce: sellerAddr.district,
        TelefonCep: sellerAddr.phone,
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

    return this.prisma.refundRequest.update({
      where: { id: rr.id },
      data: {
        status: RefundRequestStatus.return_shipment_open,
        returnProvider: 'surat',
        returnTrackingNumber: rr.refundNumber,
        returnStatus: ShipmentStatus.label_created,
        returnCreatedAt: new Date(),
      },
    });
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

    return this.prisma.refundRequest.update({
      where: { id: rr.id },
      data: {
        status: RefundRequestStatus.refunded,
        refundedAt: new Date(),
        providerRefundId: refundResult.providerRefundId,
        returnDeliveredAt: rr.returnDeliveredAt ?? new Date(),
      },
    });
  }

  async findPendingDeliveryToOpenReturn(): Promise<string[]> {
    const candidates = await this.prisma.refundRequest.findMany({
      where: {
        status: RefundRequestStatus.wait_for_delivery,
        order: {
          status: OrderStatus.delivered,
          shipment: { deliveredAt: { not: null } },
        },
      },
      select: { id: true },
    });
    return candidates.map((c) => c.id);
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

  private async generateRefundNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `RFD-${year}-`;
    try {
      const result = await this.prisma.$queryRaw<{ next_val: bigint }[]>`
        SELECT nextval('refund_request_number_seq') AS next_val
      `;
      return `${prefix}${String(result[0].next_val).padStart(6, '0')}`;
    } catch {
      const ts = Date.now().toString(36).toUpperCase();
      const rand = randomInt(0, 9999).toString().padStart(4, '0');
      return `${prefix}${ts}${rand}`;
    }
  }

  private classifyOrderPhase(order: {
    status: OrderStatus;
    shipment: { status: ShipmentStatus; deliveredAt: Date | null } | null;
  }): 'paid' | 'preparing' | 'in_cooling_off' | 'past_cooling_off' | 'unknown' {
    if (order.status === OrderStatus.paid || order.status === OrderStatus.preparing) {
      const shipped = order.shipment && order.shipment.status !== ShipmentStatus.pending;
      return shipped ? 'in_cooling_off' : 'preparing';
    }
    if (order.status === OrderStatus.shipped) {
      return 'in_cooling_off';
    }
    if (order.status === OrderStatus.delivered || order.status === OrderStatus.completed) {
      const deliveredAt = order.shipment?.deliveredAt;
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

    const refundResult = await this.paymentService.processRefund(order.id, amount);

    return this.prisma.refundRequest.update({
      where: { id: created.id },
      data: {
        status: RefundRequestStatus.refunded,
        refundedAt: new Date(),
        providerRefundId: refundResult.providerRefundId,
      },
    });
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

    if (order.status === OrderStatus.delivered) {
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

    return this.prisma.refundRequest.create({
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
}
