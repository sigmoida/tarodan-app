import {
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { StorageService } from '../storage/storage.service';
import { AdminAuditService } from './admin-audit.service';
import { AdminOrderQueryDto, ResolveDisputeDto } from './dto';
import { OrderStatus, Prisma } from '@prisma/client';

/**
 * Sipariş yönetimi (liste, ihtilaflar, ihtilaf çözümü) — AdminService'in
 * ORDER MANAGEMENT bölümünden birebir taşındı. AdminService aynı imzalarla
 * buraya delege eder.
 */
@Injectable()
export class AdminOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
    @Optional()
    private readonly storageService: StorageService,
  ) {}

  // AdminService'teki leaf yardımcı ile birebir aynı (bilinçli kopya; facade'da
  // başka bölümler de kullandığı için oradan kaldırılamadı).
  private resolveProductImageUrl(imageKeyOrUrl: string | null | undefined): string | null {
    if (!imageKeyOrUrl) return null;
    // Strip expired presigned S3 query params to get the clean public URL
    if ((imageKeyOrUrl.startsWith('http://') || imageKeyOrUrl.startsWith('https://')) && imageKeyOrUrl.includes('X-Amz-Signature')) {
      try {
        const parsed = new URL(imageKeyOrUrl);
        parsed.search = '';
        return parsed.toString();
      } catch {
        // fall through
      }
    }
    if (imageKeyOrUrl.startsWith('http://') || imageKeyOrUrl.startsWith('https://') || imageKeyOrUrl.startsWith('/')) return imageKeyOrUrl;
    // Try to resolve any non-URL string as an S3 key (covers dev/, prod/, and other prefixes)
    if (this.storageService) {
      return this.storageService.getPublicAssetUrl(imageKeyOrUrl) ?? null;
    }
    return null;
  }

  // ==================== ORDER MANAGEMENT ====================

  /**
   * Get orders with filters
   */
  async getOrders(query: AdminOrderQueryDto) {
    const { search, status, fromDate, toDate, userId, userRole, productId, page = 1, limit = 20 } = query;

    const where: Prisma.OrderWhereInput = {};

    if (search) {
      where.OR = [
        { orderNumber: { contains: search, mode: 'insensitive' } },
        { buyer: { displayName: { contains: search, mode: 'insensitive' } } },
        { seller: { displayName: { contains: search, mode: 'insensitive' } } },
        { product: { title: { contains: search, mode: 'insensitive' } } },
      ];
    }

    if (status) {
      where.status = status;
    }

    if (userId) {
      if (userRole === 'buyer') {
        where.buyerId = userId;
      } else if (userRole === 'seller') {
        where.sellerId = userId;
      } else {
        where.OR = [
          { buyerId: userId },
          { sellerId: userId },
        ];
      }
    }

    if (productId) {
      where.productId = productId;
    }

    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) {
        where.createdAt.gte = new Date(fromDate);
      }
      if (toDate) {
        where.createdAt.lte = new Date(toDate);
      }
    }

    const [total, orders] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        include: {
          buyer: { select: { id: true, displayName: true, email: true } },
          seller: { select: { id: true, displayName: true, email: true } },
          product: {
            select: {
              id: true,
              title: true,
              images: {
                take: 1,
                orderBy: { sortOrder: 'asc' },
                select: { cardKey: true },
              },
            },
          },
          checkoutGroup: { select: { groupNumber: true } },
          // Açık (aktif) iade talebi — admin listede "İade Sürecinde" rozeti için.
          refundRequests: {
            where: {
              status: { notIn: ['refunded', 'rejected', 'cancelled'] as any },
            },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { id: true, status: true, refundNumber: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    // Çoklu-ürün sepetlerini admin listede gruplu gösterebilmek için her siparişin
    // ait olduğu CheckoutGroup'taki TOPLAM sipariş adedini ekle (grubun gerçek
    // boyutu). groupItemCount>1 → "çoklu sipariş" rozeti + görsel gruplama.
    const groupIds = [
      ...new Set(orders.map((o) => o.checkoutGroupId).filter((x): x is string => !!x)),
    ];
    const groupCounts = groupIds.length
      ? await this.prisma.order.groupBy({
          by: ['checkoutGroupId'],
          where: { checkoutGroupId: { in: groupIds } },
          _count: { _all: true },
        })
      : [];
    const groupCountMap = new Map(
      groupCounts.map((g) => [g.checkoutGroupId, g._count._all]),
    );

    return {
      data: orders.map((o) => ({
        ...o,
        // Misafir siparişlerinde alıcı, ortak sistem kullanıcısı (GUEST_SYSTEM /
        // guest@tarodan.system). Admin listede placeholder yerine gerçek misafir
        // ad/e-postasını shippingAddress'ten göster.
        buyer: this.resolveGuestBuyerForAdmin(o.buyer, o.shippingAddress),
        amount: Number(o.totalAmount),
        commissionAmount: Number(o.commissionAmount),
        groupNumber: o.checkoutGroup?.groupNumber ?? null,
        groupItemCount: o.checkoutGroupId
          ? groupCountMap.get(o.checkoutGroupId) ?? 1
          : 1,
        productImageUrl: this.resolveProductImageUrl(
          (o.product as any)?.images?.[0]?.cardKey,
        ),
        activeRefundRequest: (o as any).refundRequests?.[0]
          ? {
              id: (o as any).refundRequests[0].id,
              status: (o as any).refundRequests[0].status,
              refundNumber: (o as any).refundRequests[0].refundNumber,
            }
          : null,
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Misafir siparişinde admin'e gösterilecek alıcıyı çöz: sistem misafir
   * kullanıcısı (guest@tarodan.system / displayName GUEST_SYSTEM) ise gerçek
   * misafir ad/e-postasını shippingAddress'ten al. Değilse alıcıyı aynen döndür.
   */
  private resolveGuestBuyerForAdmin(
    buyer: { id: string; displayName: string | null; email: string | null } | null,
    shippingAddress: unknown,
  ): { id: string; displayName: string | null; email: string | null } | null {
    if (!buyer) return buyer;
    const sa = (shippingAddress as any) || {};
    const isGuest =
      buyer.email === 'guest@tarodan.system' ||
      buyer.displayName === 'GUEST_SYSTEM' ||
      sa?.isGuestOrder === true;
    if (!isGuest) return buyer;
    const guestEmail = sa?.guestEmail || sa?.email || null;
    const guestName = sa?.guestName || sa?.fullName || null;
    return {
      id: buyer.id,
      displayName: guestName || guestEmail || 'Misafir',
      email: guestEmail || buyer.email,
    };
  }

  /**
   * Get disputed orders
   * Requirement: GET /admin/orders/disputes (project.txt)
   */
  async getDisputedOrders(query: AdminOrderQueryDto) {
    const { fromDate, toDate, page = 1, limit = 20 } = query;

    const where: Prisma.OrderWhereInput = {
      status: { in: [OrderStatus.refund_requested, OrderStatus.cancelled] },
    };

    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) {
        where.createdAt.gte = new Date(fromDate);
      }
      if (toDate) {
        where.createdAt.lte = new Date(toDate);
      }
    }

    const [total, orders] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        include: {
          buyer: { select: { id: true, displayName: true, email: true } },
          seller: { select: { id: true, displayName: true, email: true } },
          product: { select: { id: true, title: true } },
          payment: { select: { id: true, status: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: orders.map((o) => ({
        ...o,
        buyer: this.resolveGuestBuyerForAdmin(o.buyer, o.shippingAddress),
        amount: Number(o.totalAmount),
        commissionAmount: Number(o.commissionAmount),
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Resolve order dispute
   */
  async resolveDispute(adminId: string, orderId: string, dto: ResolveDisputeDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException('Sipariş bulunamadı');
    }

    // Handle resolution based on type
    let newStatus: OrderStatus;
    switch (dto.resolution) {
      case 'buyer_refund':
        newStatus = OrderStatus.refunded;
        break;
      case 'seller_favor':
        newStatus = OrderStatus.completed;
        break;
      case 'partial_refund':
        newStatus = OrderStatus.refunded;
        break;
      case 'dismissed':
        newStatus = order.status; // Keep current status
        break;
      default:
        newStatus = order.status;
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: newStatus },
    });

    await this.audit.createAuditLog(adminId, 'dispute_resolve', 'Order', orderId, order, {
      ...updated,
      resolution: dto.resolution,
      note: dto.note,
    });

    return { success: true, orderId, resolution: dto.resolution, newStatus };
  }
}
