import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { AdminAuditService } from './admin-audit.service';
import { getProductStatusFromQuantity } from '../product/helpers/product-status.helper';
import { UpdateOrderStatusDto } from './dto';
import { OrderStatus, ProductStatus, ShipmentStatus } from '@prisma/client';
import { SearchService } from '../search/search.service';
import { CacheService } from '../cache/cache.service';
import { AdminAnalyticsCommonService } from './admin-analytics-common.service';

/**
 * Admin sipariş işlemleri (+ unbanUser kullanıcı moderasyonu) — AdminAnalyticsService'ten
 * birebir taşındı: getOrderById, updateOrderStatus, addOrderTracking, sendOrderNotification,
 * generateOrderInvoice, unbanUser. AdminAnalyticsService ince alt-facade olarak buraya delege
 * eder. Ürün görsel URL çözümü (resolveProductImageUrl) gruplar-arası paylaşıldığı için
 * AdminAnalyticsCommonService'te. Inject: prisma, audit, search, cache, common.
 */
@Injectable()
export class AdminAnalyticsOrderService {
  private readonly logger = new Logger(AdminAnalyticsOrderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
    private readonly searchService: SearchService,
    private readonly cache: CacheService,
    private readonly common: AdminAnalyticsCommonService,
  ) {}

  /**
   * Get single order by ID
   * Requirement: GET /admin/orders/:id (7.2)
   */
  async getOrderById(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        buyer: {
          select: {
            id: true,
            displayName: true,
            email: true,
            phone: true,
            isVerified: true,
          }
        },
        seller: {
          select: {
            id: true,
            displayName: true,
            email: true,
            phone: true,
            isVerified: true,
            sellerType: true,
          }
        },
        product: {
          include: {
            images: { orderBy: { sortOrder: 'asc' } },
            category: { select: { id: true, name: true } },
          }
        },
        offer: true,
        payment: true,
        // Ödeme tek üründe bile checkout group üzerinden bağlanır (order.payment genelde
        // null) → group payment'ı da yükle, yoksa admin'de ödeme kartı hiç görünmez.
        checkoutGroup: { include: { payment: true } },
        shipment: {
          include: {
            events: { orderBy: { occurredAt: 'desc' } },
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Sipariş bulunamadı');
    }

    const totalAmount = Number(order.totalAmount);
    const shippingCost = Number(order.shippingCost);
    const commissionAmount = Number(order.commissionAmount);
    const buyerFeeAmount = Number(order.buyerFeeAmount ?? 0);
    const sellerFeeAmount = Number(order.sellerFeeAmount ?? 0);
    const subtotal = order.subtotal != null ? Number(order.subtotal) : totalAmount - shippingCost - buyerFeeAmount;
    const sellerNetAmount = subtotal - sellerFeeAmount;

    // Misafir siparişinde alıcıyı gerçek misafir ad/e-postasıyla göster
    // (placeholder GUEST_SYSTEM yerine), diğer alıcı alanlarını koru.
    const sa = (order.shippingAddress as any) || {};
    const isGuestOrder =
      order.buyer?.email === 'guest@tarodan.system' ||
      order.buyer?.displayName === 'GUEST_SYSTEM' ||
      sa?.isGuestOrder === true;
    const displayBuyer = order.buyer
      ? isGuestOrder
        ? {
            ...order.buyer,
            displayName: sa?.guestName || sa?.fullName || sa?.guestEmail || sa?.email || 'Misafir',
            email: sa?.guestEmail || sa?.email || order.buyer.email,
          }
        : order.buyer
      : order.buyer;

    return {
      ...order,
      buyer: displayBuyer,
      totalAmount,
      commissionAmount,
      shippingCost,
      buyerFeeAmount,
      sellerFeeAmount,
      subtotal,
      sellerNetAmount,
      pricing: {
        subtotal,
        shippingAmount: shippingCost,
        buyerFeeAmount,
        sellerFeeAmount,
        commissionAmount,
        totalAmount,
        sellerNetAmount,
      },
      product: {
        ...order.product,
        price: Number(order.product.price),
        images: (order.product.images || []).map((img: any) => ({
          ...img,
          url: this.common.resolveProductImageUrl(img.cardKey) || this.common.resolveProductImageUrl(img.url) || img.url,
        })),
      },
      offer: order.offer ? {
        ...order.offer,
        amount: Number(order.offer.amount),
      } : null,
      payment: (() => {
        const p = order.payment ?? (order as any).checkoutGroup?.payment;
        return p ? { ...p, amount: Number(p.amount) } : null;
      })(),
      shipment: order.shipment ? {
        ...order.shipment,
        carrier: order.shipment.provider,
      } : null,
    };
  }

  /**
   * Update order status
   * Requirement: PATCH /admin/orders/:id (7.2)
   */
  async updateOrderStatus(adminId: string, orderId: string, dto: UpdateOrderStatusDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        product: true,
        shipment: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Sipariş bulunamadı');
    }

    // Validate status transition
    const validStatuses = Object.values(OrderStatus);
    if (!validStatuses.includes(dto.status as OrderStatus)) {
      throw new BadRequestException('Geçersiz sipariş durumu');
    }

    // Sipariş durumu elle ilerletildiğinde kargo (shipment) durumunu da senkronize et.
    // Aksi halde web tarafında kargo kartı shipment.status'e bakıp "Satıcı hazırlıyor"
    // gibi yanıltıcı bilgi göstermeye devam ediyor (kaynak: tutarsız shipment.status).
    if (order.shipment) {
      const current = order.shipment.status;
      const isReturnFlow =
        current === ShipmentStatus.return_in_progress ||
        current === ShipmentStatus.returned;
      let targetShipmentStatus: ShipmentStatus | null = null;

      switch (dto.status as OrderStatus) {
        case OrderStatus.shipped:
          if (
            current === ShipmentStatus.pending ||
            current === ShipmentStatus.label_created
          ) {
            targetShipmentStatus = ShipmentStatus.in_transit;
          }
          break;
        case OrderStatus.delivered:
        case OrderStatus.awaiting_buyer_confirmation:
        case OrderStatus.completed:
          if (current !== ShipmentStatus.delivered && !isReturnFlow) {
            targetShipmentStatus = ShipmentStatus.delivered;
          }
          break;
        case OrderStatus.cancelled:
          if (current === ShipmentStatus.pending) {
            targetShipmentStatus = ShipmentStatus.cancelled;
          }
          break;
        default:
          break;
      }

      if (targetShipmentStatus && targetShipmentStatus !== current) {
        await this.prisma.shipment.update({
          where: { id: order.shipment.id },
          data: { status: targetShipmentStatus },
        });
      }
    }

    // If order is being marked as completed, update product status based on remaining quantity
    if (dto.status === OrderStatus.completed && order.productId) {
      const product = await this.prisma.product.findUnique({
        where: { id: order.productId },
      });

      if (product) {
        const newStatus = getProductStatusFromQuantity(product.quantity);
        await this.prisma.product.update({
          where: { id: order.productId },
          data: { status: newStatus },
        });

        // Invalidate cache
        await this.cache.del(`products:detail:${order.productId}`);
        await this.cache.delPattern('products:list:*');
      }
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: dto.status as OrderStatus,
        version: { increment: 1 },
      },
    });

    await this.audit.createAuditLog(adminId, 'order_status_update', 'Order', orderId, order, {
      ...updated,
      notes: dto.notes,
    });

    return {
      success: true,
      orderId,
      previousStatus: order.status,
      newStatus: dto.status,
      notes: dto.notes,
    };
  }

  /**
   * Add tracking information to order
   */
  async addOrderTracking(
    adminId: string,
    orderId: string,
    dto: { trackingNumber: string; carrier: string; trackingUrl?: string },
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { shipment: true },
    });

    if (!order) {
      throw new NotFoundException('Sipariş bulunamadı');
    }

    // Update or create shipment
    let shipment;
    if (order.shipment) {
      shipment = await this.prisma.shipment.update({
        where: { id: order.shipment.id },
        data: {
          trackingNumber: dto.trackingNumber,
          provider: dto.carrier,
          trackingUrl: dto.trackingUrl,
          status: 'in_transit',
        },
      });
    } else {
      shipment = await this.prisma.shipment.create({
        data: {
          orderId,
          trackingNumber: dto.trackingNumber,
          provider: dto.carrier,
          trackingUrl: dto.trackingUrl,
          status: 'in_transit',
        },
      });
    }

    // Update order status to shipped
    await this.prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.shipped },
    });

    await this.audit.createAuditLog(adminId, 'order_tracking_added', 'Order', orderId, order, {
      trackingNumber: dto.trackingNumber,
      carrier: dto.carrier,
    });

    return { success: true, shipment };
  }

  /**
   * Send notification about order to buyer/seller
   */
  async sendOrderNotification(
    adminId: string,
    orderId: string,
    dto: { type: 'status_update' | 'shipped' | 'delivered' | 'custom'; message?: string },
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        buyer: { select: { id: true, email: true, displayName: true } },
        seller: { select: { id: true, email: true, displayName: true } },
        product: { select: { title: true } },
      },
    });

    if (!order) {
      throw new NotFoundException('Sipariş bulunamadı');
    }

    const statusLabels: Record<string, string> = {
      pending_payment: 'Ödeme Bekleniyor',
      paid: 'Ödendi',
      preparing: 'Hazırlanıyor',
      shipped: 'Kargoya Verildi',
      delivered: 'Teslim Edildi',
      completed: 'Tamamlandı',
      cancelled: 'İptal Edildi',
    };

    let title = '';
    let body = '';

    switch (dto.type) {
      case 'status_update':
        title = 'Sipariş Durumu Güncellendi';
        body = `#${order.orderNumber} numaralı siparişinizin durumu "${statusLabels[order.status] || order.status}" olarak güncellendi.`;
        break;
      case 'shipped':
        title = 'Siparişiniz Kargoda';
        body = `#${order.orderNumber} numaralı siparişiniz kargoya verildi.`;
        break;
      case 'delivered':
        title = 'Siparişiniz Teslim Edildi';
        body = `#${order.orderNumber} numaralı siparişiniz teslim edildi.`;
        break;
      case 'custom':
        title = 'Sipariş Bildirimi';
        body = dto.message || 'Siparişinizle ilgili bir güncelleme var.';
        break;
    }

    // Create notification for buyer
    await this.prisma.notificationLog.create({
      data: {
        userId: order.buyerId,
        channel: 'system',
        type: 'order',
        title,
        body: body,
        data: { orderId, orderNumber: order.orderNumber },
        status: 'sent',
      },
    });

    await this.audit.createAuditLog(adminId, 'order_notification_sent', 'Order', orderId, null, {
      type: dto.type,
      buyerId: order.buyerId,
    });

    return { success: true, message: 'Bildirim gönderildi' };
  }

  /**
   * Generate invoice data for order
   */
  async generateOrderInvoice(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        buyer: { select: { id: true, email: true, displayName: true, phone: true } },
        seller: { select: { id: true, email: true, displayName: true } },
        product: { select: { id: true, title: true, price: true } },
        payment: true,
        checkoutGroup: { include: { payment: true } },
        shipment: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Sipariş bulunamadı');
    }

    const shippingAddress = order.shippingAddress as any;

    return {
      invoiceNumber: `INV-${order.orderNumber}`,
      orderNumber: order.orderNumber,
      orderDate: order.createdAt,
      status: order.status,
      buyer: {
        name: shippingAddress?.fullName || order.buyer.displayName,
        email: order.buyer.email,
        phone: shippingAddress?.phone || order.buyer.phone,
        address: shippingAddress ? `${shippingAddress.address}, ${shippingAddress.district}, ${shippingAddress.city} ${shippingAddress.postalCode || ''}` : null,
      },
      seller: {
        name: order.seller.displayName,
        email: order.seller.email,
      },
      items: [{
        title: order.product.title,
        quantity: 1,
        unitPrice: Number(order.product.price),
        total: Number(order.product.price),
      }],
      subtotal: Number(order.product.price),
      discountAmount: Number(order.discountAmount ?? 0),
      discountCode: order.discountCode ?? null,
      shippingCost: Number(order.shippingCost || 0),
      total: Number(order.totalAmount),
      payment: (() => {
        const p = order.payment ?? (order as any).checkoutGroup?.payment;
        return p ? { status: p.status, provider: p.provider } : null;
      })(),
      shipment: order.shipment ? {
        trackingNumber: order.shipment.trackingNumber,
        carrier: order.shipment.provider,
      } : null,
    };
  }

  /**
   * Unban user
   * Requirement: POST /admin/users/:id/unban (7.2)
   * - Sets isBanned = false
   * - Clears bannedAt, bannedReason, bannedBy
   * - Does NOT automatically reactivate products (manual approval required)
   */
  async unbanUser(adminId: string, userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('Kullanıcı bulunamadı');
    }

    if (!(user as any).isBanned) {
      throw new BadRequestException('Kullanıcı zaten banlı değil');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. User'ı unban yap
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: {
          isBanned: false,
          bannedAt: null,
          bannedReason: null,
          bannedBy: null,
        } as any,
      });

      // 2. Ban ile askıya alınan (suspended) ilanları otomatik active'e döndür.
      //    Bunlar ban öncesi zaten yayındaydı → yeniden admin onayına GİRMEZ.
      //    Kullanıcının kendi pasife aldığı (inactive) ilanlara dokunulmaz.
      const toRestore = await tx.product.findMany({
        where: { sellerId: userId, status: ProductStatus.suspended },
        select: { id: true },
      });
      await tx.product.updateMany({
        where: { sellerId: userId, status: ProductStatus.suspended },
        data: { status: ProductStatus.active },
      });

      // 3. Audit log oluştur
      await this.audit.createAuditLog(adminId, 'user_unban', 'User', userId, user, updatedUser);

      this.logger.log(`User ${userId} unbanned by admin ${adminId}`);

      return { success: true, userId, restoredIds: toRestore.map((p) => p.id) };
    });

    // Geri açılan ilanları arama/listeye yeniden ekle.
    if (result.restoredIds.length > 0) {
      await this.cache.delPattern('products:list:*');
      await Promise.all(
        result.restoredIds.map((id) =>
          this.cache.del(`product:${id}`).catch(() => {}),
        ),
      );
      for (const id of result.restoredIds) {
        this.searchService
          .syncProduct(id)
          .catch((err) => this.logger.warn(`ES sync (unban) failed for ${id}: ${err?.message}`));
      }
    }

    return { success: true, userId };
  }
}
