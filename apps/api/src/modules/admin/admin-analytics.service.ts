import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Optional,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { StorageService } from '../storage/storage.service';
import { AdminAuditService } from './admin-audit.service';
import { getProductStatusFromQuantity } from '../product/helpers/product-status.helper';
import {
  AnalyticsQueryDto,
  AnalyticsGroupBy,
  UpdateOrderStatusDto,
  ReportQueryDto,
} from './dto';
import { OrderStatus, ProductStatus, ShipmentStatus, TradeStatus } from '@prisma/client';
import { SearchService } from '../search/search.service';
import { CacheService } from '../cache/cache.service';

/**
 * Analitik & raporlar (+ banner aralığındaki sipariş detay/işlem yardımcıları
 * ve unbanUser) — AdminService'in ANALYTICS & REPORTS bölümünden birebir
 * taşındı. AdminService aynı imzalarla buraya delege eder.
 */
@Injectable()
export class AdminAnalyticsService {
  private readonly logger = new Logger(AdminAnalyticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
    private readonly searchService: SearchService,
    private readonly cache: CacheService,
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

  // ==================== ANALYTICS & REPORTS ====================

  /**
   * Get dashboard statistics
   * Requirement: Reporting dashboards (project.md)
   */
  async getDashboardStats() {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      newUsers7d,
      totalProducts,
      activeProducts,
      pendingProducts,
      totalOrders,
      orders7d,
      completedOrders,
      totalRevenue,
      revenue7d,
      byCategory,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      this.prisma.product.count(),
      this.prisma.product.count({ where: { status: ProductStatus.active } }),
      this.prisma.product.count({ where: { status: ProductStatus.pending } }),
      this.prisma.order.count(),
      this.prisma.order.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      this.prisma.order.count({ where: { status: OrderStatus.completed } }),
      this.prisma.order.aggregate({
        _sum: { commissionAmount: true },
        where: { status: { in: [OrderStatus.completed, OrderStatus.delivered] } },
      }),
      this.prisma.order.aggregate({
        _sum: { commissionAmount: true },
        where: {
          createdAt: { gte: sevenDaysAgo },
          status: { in: [OrderStatus.completed, OrderStatus.delivered] },
        },
      }),
      this.prisma.product.groupBy({
        by: ['categoryId'],
        _count: { id: true },
      }),
    ]);

    const categoryIds = [...new Set(byCategory.map((c) => c.categoryId).filter(Boolean))] as string[];
    const categories = categoryIds.length > 0
      ? await this.prisma.category.findMany({
        where: { id: { in: categoryIds } },
        select: { id: true, name: true },
      })
      : [];
    const categoryMap = new Map(categories.map((c) => [c.id, c.name]));
    const categoryDistribution = byCategory
      .map((c) => ({
        name: c.categoryId ? (categoryMap.get(c.categoryId) || 'Kategorisiz') : 'Kategorisiz',
        count: c._count.id,
      }))
      .sort((a, b) => b.count - a.count);

    return {
      users: {
        total: totalUsers,
        new7d: newUsers7d,
      },
      products: {
        total: totalProducts,
        active: activeProducts,
        pending: pendingProducts,
      },
      orders: {
        total: totalOrders,
        last7d: orders7d,
        completed: completedOrders,
      },
      revenue: {
        total: Number(totalRevenue._sum.commissionAmount || 0),
        last7d: Number(revenue7d._sum.commissionAmount || 0),
      },
      categoryDistribution,
    };
  }

  /**
   * Save analytics snapshot
   */
  async saveAnalyticsSnapshot() {
    const stats = await this.getDashboardStats();

    const snapshot = await this.prisma.analyticsSnapshot.create({
      data: {
        snapshotType: 'daily',
        snapshotDate: new Date(),
        totalUsers: stats.users.total,
        totalProducts: stats.products.total,
        totalOrders: stats.orders.total,
        totalRevenue: stats.revenue.total,
        newUsers: stats.users.new7d,
        newOrders: stats.orders.last7d,
        data: stats as any,
      },
    });

    return snapshot;
  }

  /**
   * Get sales analytics with date range
   * Requirement: GET /admin/analytics/sales (7.2)
   */
  async getSalesAnalytics(query: AnalyticsQueryDto) {
    const endDateRaw = query.endDate ? new Date(query.endDate) : new Date();
    const endDate = new Date(endDateRaw);
    endDate.setHours(23, 59, 59, 999);
    const startDate = query.startDate
      ? new Date(query.startDate)
      : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    startDate.setHours(0, 0, 0, 0);

    const completedStatuses = [OrderStatus.completed, OrderStatus.delivered, OrderStatus.paid] as const;
    const [orders, ordersByStatus] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          createdAt: { gte: startDate, lte: endDate },
          status: { in: [...completedStatuses] },
        },
        select: {
          createdAt: true,
          totalAmount: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.order.groupBy({
        by: ['status'],
        where: { createdAt: { gte: startDate, lte: endDate } },
        _count: { id: true },
      }),
    ]);

    const ordersByStatusMap: Record<string, number> = {};
    ordersByStatus.forEach((row) => {
      ordersByStatusMap[row.status] = row._count.id;
    });

    // Group by date (period data for charts and summary)
    const groupedData = new Map<string, { totalSales: number; orderCount: number }>();
    orders.forEach((order) => {
      const dateKey = this.getDateKey(order.createdAt, query.groupBy);
      const existing = groupedData.get(dateKey) || { totalSales: 0, orderCount: 0 };
      groupedData.set(dateKey, {
        totalSales: existing.totalSales + Number(order.totalAmount),
        orderCount: existing.orderCount + 1,
      });
    });

    const result = Array.from(groupedData.entries()).map(([date, data]) => ({
      date,
      totalSales: Math.round(data.totalSales * 100) / 100,
      orderCount: data.orderCount,
      averageOrderValue: data.orderCount > 0
        ? Math.round((data.totalSales / data.orderCount) * 100) / 100
        : 0,
    }));

    const periodTotalSales = result.reduce((sum, r) => sum + r.totalSales, 0);
    const periodTotalOrders = result.reduce((sum, r) => sum + r.orderCount, 0);
    const periodAvgOrderValue = periodTotalOrders > 0
      ? Math.round((periodTotalSales / periodTotalOrders) * 100) / 100
      : 0;

    return {
      data: result,
      summary: {
        totalSales: periodTotalSales,
        totalOrders: periodTotalOrders,
        averageOrderValue: periodAvgOrderValue,
        ordersByStatus: ordersByStatusMap,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
    };
  }

  /**
   * Get revenue analytics with date range
   * Requirement: GET /admin/analytics/revenue (7.2)
   */
  async getRevenueAnalytics(query: AnalyticsQueryDto) {
    const endDateRaw = query.endDate ? new Date(query.endDate) : new Date();
    const endDate = new Date(endDateRaw);
    endDate.setHours(23, 59, 59, 999);
    const startDate = query.startDate
      ? new Date(query.startDate)
      : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    startDate.setHours(0, 0, 0, 0);

    const completedStatuses: OrderStatus[] = [OrderStatus.completed, OrderStatus.delivered, OrderStatus.paid];
    const orders = await this.prisma.order.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
      },
      select: {
        createdAt: true,
        totalAmount: true,
        commissionAmount: true,
        status: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Group by date
    const groupedData = new Map<string, { gross: number; commission: number; refunded: number }>();
    orders.forEach((order) => {
      const dateKey = this.getDateKey(order.createdAt, query.groupBy);
      const existing = groupedData.get(dateKey) || { gross: 0, commission: 0, refunded: 0 };
      const isRefunded = order.status === OrderStatus.refunded;
      const isCompleted = completedStatuses.includes(order.status);
      groupedData.set(dateKey, {
        gross: existing.gross + (isCompleted ? Number(order.totalAmount) : 0),
        commission: existing.commission + (isCompleted ? Number(order.commissionAmount) : 0),
        refunded: existing.refunded + (isRefunded ? Number(order.totalAmount) : 0),
      });
    });

    const result = Array.from(groupedData.entries()).map(([date, data]) => ({
      date,
      grossRevenue: Math.round(data.gross * 100) / 100,
      commissionRevenue: Math.round(data.commission * 100) / 100,
      netRevenue: Math.round((data.gross - data.refunded) * 100) / 100,
    }));

    const periodCommission = result.reduce((sum, r) => sum + r.commissionRevenue, 0);

    return {
      data: result,
      summary: {
        totalGrossRevenue: result.reduce((sum, r) => sum + r.grossRevenue, 0),
        totalCommission: periodCommission,
        totalNetRevenue: result.reduce((sum, r) => sum + r.netRevenue, 0),
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
    };
  }

  /**
   * Get user analytics with date range
   * Requirement: GET /admin/analytics/users (7.2)
   */
  async getUserAnalytics(query: AnalyticsQueryDto) {
    const endDateRaw = query.endDate ? new Date(query.endDate) : new Date();
    const endDate = new Date(endDateRaw);
    endDate.setHours(23, 59, 59, 999);
    const startDate = query.startDate
      ? new Date(query.startDate)
      : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    startDate.setHours(0, 0, 0, 0);

    const [users, totalUsers, totalSellers] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          createdAt: { gte: startDate, lte: endDate },
        },
        select: {
          createdAt: true,
          isSeller: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isSeller: true } }),
    ]);

    // Get active users (those who placed orders or listed products in the period)
    const [activeOrderUsers, activeSellerUsers] = await Promise.all([
      this.prisma.order.findMany({
        where: { createdAt: { gte: startDate, lte: endDate } },
        select: { buyerId: true, createdAt: true },
        distinct: ['buyerId'],
      }),
      this.prisma.product.findMany({
        where: { createdAt: { gte: startDate, lte: endDate } },
        select: { sellerId: true, createdAt: true },
        distinct: ['sellerId'],
      }),
    ]);

    // Group new users by date
    const groupedData = new Map<string, { newUsers: number; newSellers: number; activeUsers: Set<string> }>();

    users.forEach((user) => {
      const dateKey = this.getDateKey(user.createdAt, query.groupBy);
      const existing = groupedData.get(dateKey) || { newUsers: 0, newSellers: 0, activeUsers: new Set() };
      groupedData.set(dateKey, {
        newUsers: existing.newUsers + 1,
        newSellers: existing.newSellers + (user.isSeller ? 1 : 0),
        activeUsers: existing.activeUsers,
      });
    });

    // Add active users to their respective date groups
    [...activeOrderUsers, ...activeSellerUsers].forEach((item) => {
      const dateKey = this.getDateKey(item.createdAt, query.groupBy);
      const existing = groupedData.get(dateKey);
      if (existing) {
        const userId = 'buyerId' in item ? item.buyerId : item.sellerId;
        existing.activeUsers.add(userId);
      }
    });

    const result = Array.from(groupedData.entries()).map(([date, data]) => ({
      date,
      newUsers: data.newUsers,
      activeUsers: data.activeUsers.size,
      newSellers: data.newSellers,
    }));

    return {
      data: result,
      summary: {
        totalUsers,
        totalNewUsers: result.reduce((sum, r) => sum + r.newUsers, 0),
        totalNewSellers: result.reduce((sum, r) => sum + r.newSellers, 0),
        totalSellers,
        averageDailyActiveUsers: result.length > 0
          ? Math.round(result.reduce((sum, r) => sum + r.activeUsers, 0) / result.length)
          : 0,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
    };
  }

  /**
   * Helper to get date key based on grouping
   */
  private getDateKey(date: Date, groupBy?: AnalyticsGroupBy): string {
    const d = new Date(date);
    switch (groupBy) {
      case AnalyticsGroupBy.week:
        // Get Monday of the week
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(d.setDate(diff));
        return monday.toISOString().split('T')[0];
      case AnalyticsGroupBy.month:
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      case AnalyticsGroupBy.day:
      default:
        return d.toISOString().split('T')[0];
    }
  }

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
          url: this.resolveProductImageUrl(img.cardKey) || this.resolveProductImageUrl(img.url) || img.url,
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

  /**
   * Get recent orders for dashboard
   * Requirement: Recent Orders Panel (7.1)
   */
  async getRecentOrders(limit: number = 10) {
    const orders = await this.prisma.order.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        buyer: { select: { id: true, displayName: true } },
        product: { select: { id: true, title: true } },
      },
    });

    return orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      buyerName: o.buyer.displayName,
      productTitle: o.product.title,
      amount: Number(o.totalAmount),
      status: o.status,
      createdAt: o.createdAt,
    }));
  }

  /**
   * Get pending actions for dashboard
   * Requirement: Pending Actions Panel (7.1)
   */
  async getPendingActions() {
    const [
      pendingProducts,
      refundRequests,
      pendingMessages,
    ] = await Promise.all([
      this.prisma.product.count({ where: { status: ProductStatus.pending } }),
      this.prisma.order.count({ where: { status: OrderStatus.refund_requested } }),
      this.prisma.message.count({ where: { status: 'pending_approval' } }),
    ]);

    return {
      pendingProducts,
      refundRequests,
      pendingMessages,
      totalPending: pendingProducts + refundRequests + pendingMessages,
    };
  }

  /**
   * Generate sales report
   * Requirement: GET /admin/reports/sales (7.2)
   */
  async generateSalesReport(query: ReportQueryDto) {
    const endDate = query.endDate ? new Date(query.endDate) : new Date();
    const startDate = query.startDate
      ? new Date(query.startDate)
      : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

    const orders = await this.prisma.order.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        status: { in: [OrderStatus.completed, OrderStatus.delivered, OrderStatus.paid] },
      },
      include: {
        buyer: { select: { displayName: true, email: true } },
        seller: { select: { displayName: true, email: true } },
        product: {
          select: {
            title: true,
            category: { select: { name: true } }
          }
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const reportData = orders.map((o) => ({
      orderNumber: o.orderNumber,
      date: o.createdAt.toISOString().split('T')[0],
      buyer: o.buyer.displayName,
      buyerEmail: o.buyer.email,
      seller: o.seller.displayName,
      sellerEmail: o.seller.email,
      product: o.product.title,
      category: o.product.category?.name || 'N/A',
      amount: Number(o.totalAmount),
      commission: Number(o.commissionAmount),
      status: o.status,
    }));

    const summary = {
      totalOrders: reportData.length,
      totalSales: reportData.reduce((sum, r) => sum + r.amount, 0),
      totalCommission: reportData.reduce((sum, r) => sum + r.commission, 0),
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      generatedAt: new Date().toISOString(),
    };

    // For CSV format
    if (query.format === 'csv') {
      const headers = 'Order Number,Date,Buyer,Buyer Email,Seller,Seller Email,Product,Category,Amount,Commission,Status\n';
      const rows = reportData.map((r) =>
        `${r.orderNumber},${r.date},${r.buyer},${r.buyerEmail},${r.seller},${r.sellerEmail},"${r.product}",${r.category},${r.amount},${r.commission},${r.status}`
      ).join('\n');
      return { format: 'csv', content: headers + rows, summary };
    }

    // For PDF, return structured data (actual PDF generation would require a library like pdfkit)
    if (query.format === 'pdf') {
      return {
        format: 'pdf',
        data: reportData,
        summary,
        message: 'PDF generation requires frontend implementation with the provided data',
      };
    }

    // Default JSON format
    return { format: 'json', data: reportData, summary };
  }

  /**
   * Generate users report (CSV/PDF/JSON)
   * GET /admin/reports/users
   */
  async generateUsersReport(query: ReportQueryDto) {
    const endDate = query.endDate ? new Date(query.endDate) : new Date();
    const startDate = query.startDate
      ? new Date(query.startDate)
      : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

    const users = await this.prisma.user.findMany({
      where: { createdAt: { gte: startDate, lte: endDate } },
      select: {
        id: true,
        email: true,
        displayName: true,
        phone: true,
        isSeller: true,
        sellerType: true,
        isVerified: true,
        isBanned: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const reportData = users.map((u) => ({
      id: u.id,
      email: u.email,
      displayName: u.displayName ?? '',
      phone: u.phone ?? '',
      isSeller: u.isSeller,
      sellerType: u.sellerType ?? '',
      isVerified: u.isVerified,
      isBanned: (u as any).isBanned ?? false,
      createdAt: u.createdAt.toISOString().split('T')[0],
    }));

    const [totalUsers, newInPeriod] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { createdAt: { gte: startDate, lte: endDate } } }),
    ]);

    const summary = {
      totalUsers,
      newInPeriod: reportData.length,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      generatedAt: new Date().toISOString(),
    };

    if (query.format === 'csv') {
      const headers = 'Id,Email,Display Name,Phone,Is Seller,Seller Type,Verified,Banned,Created At\n';
      const rows = reportData
        .map(
          (r) =>
            `${r.id},${r.email},"${(r.displayName || '').replace(/"/g, '""')}",${r.phone || ''},${r.isSeller},${r.sellerType},${r.isVerified},${r.isBanned},${r.createdAt}`,
        )
        .join('\n');
      return { format: 'csv', content: headers + rows, summary };
    }

    if (query.format === 'pdf') {
      return {
        format: 'pdf',
        data: reportData,
        summary,
        message: 'PDF generation requires frontend implementation with the provided data',
      };
    }

    return { format: 'json', data: reportData, summary };
  }

  /**
   * Generate products report (CSV/PDF/JSON)
   * GET /admin/reports/products - also used by analytics dashboard (summary + categoryDistribution)
   */
  async generateProductsReport(query: ReportQueryDto) {
    const endDate = query.endDate ? new Date(query.endDate) : new Date();
    const startDate = query.startDate
      ? new Date(query.startDate)
      : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [products, total, active, pending, byCategory, avgPrice] = await Promise.all([
      this.prisma.product.findMany({
        where: { createdAt: { gte: startDate, lte: endDate } },
        include: {
          seller: { select: { id: true, displayName: true, email: true } },
          category: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.product.count(),
      this.prisma.product.count({ where: { status: ProductStatus.active } }),
      this.prisma.product.count({ where: { status: ProductStatus.pending } }),
      this.prisma.product.groupBy({
        by: ['categoryId'],
        where: { createdAt: { gte: startDate, lte: endDate } },
        _count: { id: true },
      }),
      this.prisma.product.aggregate({
        where: { createdAt: { gte: startDate, lte: endDate }, status: ProductStatus.active },
        _avg: { price: true },
      }),
    ]);

    const categoryIds = [...new Set(byCategory.map((c) => c.categoryId).filter(Boolean))] as string[];
    const categories = await this.prisma.category.findMany({
      where: { id: { in: categoryIds } },
      select: { id: true, name: true },
    });
    const categoryMap = new Map(categories.map((c) => [c.id, c.name]));
    const totalInPeriod = byCategory.reduce((sum, c) => sum + c._count.id, 0);
    const categoryDistribution = byCategory
      .map((c) => {
        const name = c.categoryId ? categoryMap.get(c.categoryId) || 'Kategorisiz' : 'Kategorisiz';
        const count = c._count.id;
        const percentage = totalInPeriod > 0 ? Math.round((count / totalInPeriod) * 1000) / 10 : 0;
        return { name, count, percentage };
      })
      .sort((a, b) => b.count - a.count);

    const reportData = products.map((p) => ({
      id: p.id,
      title: p.title,
      price: Number(p.price),
      status: p.status,
      category: p.category?.name ?? 'N/A',
      sellerName: p.seller?.displayName ?? '',
      sellerEmail: p.seller?.email ?? '',
      createdAt: p.createdAt.toISOString().split('T')[0],
    }));

    const summary = {
      totalProducts: total,
      activeProducts: active,
      pendingProducts: pending,
      averagePrice: Number(avgPrice._avg.price || 0),
      categoryDistribution,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      generatedAt: new Date().toISOString(),
    };

    if (query.format === 'csv') {
      const headers = 'Id,Title,Price,Status,Category,Seller Name,Seller Email,Created At\n';
      const rows = reportData
        .map(
          (r) =>
            `${r.id},"${(r.title || '').replace(/"/g, '""')}",${r.price},${r.status},${r.category},"${(r.sellerName || '').replace(/"/g, '""')}",${r.sellerEmail},${r.createdAt}`,
        )
        .join('\n');
      return { format: 'csv', content: headers + rows, summary };
    }

    if (query.format === 'pdf') {
      return {
        format: 'pdf',
        data: reportData,
        summary,
        message: 'PDF generation requires frontend implementation with the provided data',
      };
    }

    // JSON: top-level summary fields for analytics dashboard + data for export
    return {
      format: 'json',
      data: reportData,
      summary,
      totalProducts: total,
      activeProducts: active,
      pendingProducts: pending,
      averagePrice: Number(avgPrice._avg.price || 0),
      categoryDistribution,
    };
  }

  /**
   * Generate trades report (CSV/PDF/JSON)
   * GET /admin/reports/trades - also used by analytics dashboard
   */
  async generateTradesReport(query: ReportQueryDto) {
    const endDate = query.endDate ? new Date(query.endDate) : new Date();
    const startDate = query.startDate
      ? new Date(query.startDate)
      : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

    const trades = await this.prisma.trade.findMany({
      where: { createdAt: { gte: startDate, lte: endDate } },
      include: {
        initiator: { select: { id: true, displayName: true, email: true } },
        receiver: { select: { id: true, displayName: true, email: true } },
        items: { include: { product: { select: { title: true, price: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const [totalTrades, completedTrades, pendingTrades, disputedTrades] = await Promise.all([
      this.prisma.trade.count(),
      this.prisma.trade.count({ where: { status: TradeStatus.completed } }),
      this.prisma.trade.count({
        where: { status: { in: [TradeStatus.pending, TradeStatus.accepted] } },
      }),
      this.prisma.trade.count({
        where: { dispute: { isNot: null } },
      }),
    ]);

    const reportData = trades.map((t) => ({
      id: t.id,
      status: t.status,
      initiatorName: t.initiator?.displayName ?? '',
      initiatorEmail: t.initiator?.email ?? '',
      receiverName: t.receiver?.displayName ?? '',
      receiverEmail: t.receiver?.email ?? '',
      createdAt: t.createdAt.toISOString().split('T')[0],
      completedAt: t.completedAt?.toISOString().split('T')[0] ?? '',
    }));

    const summary = {
      totalTrades,
      completedTrades,
      pendingTrades,
      disputedTrades,
      averageTradeValue: 0,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      generatedAt: new Date().toISOString(),
    };

    if (query.format === 'csv') {
      const headers = 'Id,Status,Initiator Name,Initiator Email,Receiver Name,Receiver Email,Created At,Completed At\n';
      const rows = reportData
        .map(
          (r) =>
            `${r.id},${r.status},${r.initiatorName},${r.initiatorEmail},${r.receiverName},${r.receiverEmail},${r.createdAt},${r.completedAt}`,
        )
        .join('\n');
      return { format: 'csv', content: headers + rows, summary };
    }

    if (query.format === 'pdf') {
      return {
        format: 'pdf',
        data: reportData,
        summary,
        message: 'PDF generation requires frontend implementation with the provided data',
      };
    }

    // JSON: top-level summary fields for analytics dashboard + data for export
    return {
      format: 'json',
      data: reportData,
      summary,
      totalTrades: summary.totalTrades,
      completedTrades: summary.completedTrades,
      pendingTrades: summary.pendingTrades,
      disputedTrades: summary.disputedTrades,
      averageTradeValue: summary.averageTradeValue,
    };
  }

  /**
   * Get commission report
   * Requirement: GET /admin/reports/commission (7.2)
   */
  async getCommissionReport(query: ReportQueryDto) {
    const endDate = query.endDate ? new Date(query.endDate) : new Date();
    const startDate = query.startDate
      ? new Date(query.startDate)
      : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get orders with commission
    const orders = await this.prisma.order.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        status: { in: [OrderStatus.completed, OrderStatus.delivered] },
      },
      include: {
        seller: {
          select: {
            id: true,
            displayName: true,
            sellerType: true,
          }
        },
        product: {
          select: {
            category: { select: { id: true, name: true } }
          }
        },
      },
    });

    // Group by seller
    const sellerCommissions = new Map<string, {
      sellerId: string;
      sellerName: string;
      sellerType: string | null;
      orderCount: number;
      totalSales: number;
      totalCommission: number;
    }>();

    orders.forEach((order) => {
      const key = order.sellerId;
      const existing = sellerCommissions.get(key) || {
        sellerId: order.sellerId,
        sellerName: order.seller.displayName,
        sellerType: order.seller.sellerType,
        orderCount: 0,
        totalSales: 0,
        totalCommission: 0,
      };
      sellerCommissions.set(key, {
        ...existing,
        orderCount: existing.orderCount + 1,
        totalSales: existing.totalSales + Number(order.totalAmount),
        totalCommission: existing.totalCommission + Number(order.commissionAmount),
      });
    });

    // Group by category
    const categoryCommissions = new Map<string, {
      categoryId: string;
      categoryName: string;
      orderCount: number;
      totalSales: number;
      totalCommission: number;
    }>();

    orders.forEach((order) => {
      const categoryId = order.product.category?.id || 'uncategorized';
      const categoryName = order.product.category?.name || 'Kategorisiz';
      const existing = categoryCommissions.get(categoryId) || {
        categoryId,
        categoryName,
        orderCount: 0,
        totalSales: 0,
        totalCommission: 0,
      };
      categoryCommissions.set(categoryId, {
        ...existing,
        orderCount: existing.orderCount + 1,
        totalSales: existing.totalSales + Number(order.totalAmount),
        totalCommission: existing.totalCommission + Number(order.commissionAmount),
      });
    });

    const summary = {
      totalOrders: orders.length,
      totalSales: orders.reduce((sum, o) => sum + Number(o.totalAmount), 0),
      totalCommission: orders.reduce((sum, o) => sum + Number(o.commissionAmount), 0),
      averageCommissionRate: orders.length > 0
        ? Math.round((orders.reduce((sum, o) => sum + Number(o.commissionAmount), 0) /
          orders.reduce((sum, o) => sum + Number(o.totalAmount), 0)) * 10000) / 100
        : 0,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    };

    return {
      bySeller: Array.from(sellerCommissions.values())
        .sort((a, b) => b.totalCommission - a.totalCommission),
      byCategory: Array.from(categoryCommissions.values())
        .sort((a, b) => b.totalCommission - a.totalCommission),
      summary,
    };
  }

  /**
   * Get commission revenue summary
   * Requirement: GET /admin/commission/revenue (project.txt)
   */
  async getCommissionRevenue(query: AnalyticsQueryDto) {
    const endDate = query.endDate ? new Date(query.endDate) : new Date();
    const startDate = query.startDate
      ? new Date(query.startDate)
      : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [totalCommission, totalFees, commissionByMonth, commissionByCategory] = await Promise.all([
      // Total commission in period
      this.prisma.order.aggregate({
        _sum: { commissionAmount: true },
        where: {
          createdAt: { gte: startDate, lte: endDate },
          status: { in: [OrderStatus.completed, OrderStatus.delivered] },
        },
      }),
      // Buyer/seller fee breakdown
      this.prisma.order.aggregate({
        _sum: { buyerFeeAmount: true, sellerFeeAmount: true },
        where: {
          createdAt: { gte: startDate, lte: endDate },
          status: { in: [OrderStatus.completed, OrderStatus.delivered] },
        },
      }),
      // Commission grouped by month
      this.prisma.$queryRaw`
        SELECT 
          DATE_TRUNC('month', created_at) as month,
          SUM(commission_amount) as total
        FROM orders
        WHERE created_at >= ${startDate} 
          AND created_at <= ${endDate}
          AND status IN ('completed', 'delivered')
        GROUP BY DATE_TRUNC('month', created_at)
        ORDER BY month DESC
      ` as Promise<Array<{ month: Date; total: number }>>,
      // Commission by category
      this.prisma.order.findMany({
        where: {
          createdAt: { gte: startDate, lte: endDate },
          status: { in: [OrderStatus.completed, OrderStatus.delivered] },
        },
        include: {
          product: {
            select: {
              category: { select: { id: true, name: true } },
            },
          },
        },
      }),
    ]);

    // Group commission by category
    const categoryMap = new Map<string, { name: string; commission: number; count: number }>();
    commissionByCategory.forEach((order) => {
      const catId = order.product.category?.id || 'uncategorized';
      const catName = order.product.category?.name || 'Kategorisiz';
      const existing = categoryMap.get(catId) || { name: catName, commission: 0, count: 0 };
      categoryMap.set(catId, {
        name: catName,
        commission: existing.commission + Number(order.commissionAmount),
        count: existing.count + 1,
      });
    });

    return {
      totalCommission: Number(totalCommission._sum.commissionAmount || 0),
      totalBuyerFee: Number(totalFees._sum.buyerFeeAmount || 0),
      totalSellerFee: Number(totalFees._sum.sellerFeeAmount || 0),
      byMonth: commissionByMonth.map((m) => ({
        month: m.month,
        total: Number(m.total || 0),
      })),
      byCategory: Array.from(categoryMap.entries()).map(([id, data]) => ({
        categoryId: id,
        categoryName: data.name,
        commission: Math.round(data.commission * 100) / 100,
        orderCount: data.count,
      })).sort((a, b) => b.commission - a.commission),
      period: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
    };
  }

  /**
   * Generate custom report with flexible parameters
   * Requirement: GET /admin/reports/custom (project.txt)
   */
  async generateCustomReport(query: ReportQueryDto) {
    const endDate = query.endDate ? new Date(query.endDate) : new Date();
    const startDate = query.startDate
      ? new Date(query.startDate)
      : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get comprehensive stats for the period
    const [
      orderStats,
      userStats,
      productStats,
      topSellers,
      topCategories,
    ] = await Promise.all([
      // Order statistics
      this.prisma.order.aggregate({
        _count: true,
        _sum: { totalAmount: true, commissionAmount: true },
        where: {
          createdAt: { gte: startDate, lte: endDate },
          status: { in: [OrderStatus.completed, OrderStatus.delivered, OrderStatus.paid] },
        },
      }),
      // User statistics
      this.prisma.user.aggregate({
        _count: true,
        where: { createdAt: { gte: startDate, lte: endDate } },
      }),
      // Product statistics
      this.prisma.product.aggregate({
        _count: true,
        where: { createdAt: { gte: startDate, lte: endDate } },
      }),
      // Top sellers by revenue
      this.prisma.order.groupBy({
        by: ['sellerId'],
        _sum: { totalAmount: true },
        _count: true,
        where: {
          createdAt: { gte: startDate, lte: endDate },
          status: { in: [OrderStatus.completed, OrderStatus.delivered] },
        },
        orderBy: { _sum: { totalAmount: 'desc' } },
        take: 10,
      }),
      // Top categories
      this.prisma.order.findMany({
        where: {
          createdAt: { gte: startDate, lte: endDate },
          status: { in: [OrderStatus.completed, OrderStatus.delivered] },
        },
        include: {
          product: {
            select: { category: { select: { id: true, name: true } } },
          },
        },
      }),
    ]);

    // Process top sellers to get names
    const sellerIds = topSellers.map((s) => s.sellerId);
    const sellers = await this.prisma.user.findMany({
      where: { id: { in: sellerIds } },
      select: { id: true, displayName: true },
    });
    const sellerMap = new Map(sellers.map((s) => [s.id, s.displayName]));

    // Group by category
    const categoryRevenue = new Map<string, { name: string; revenue: number; count: number }>();
    topCategories.forEach((order) => {
      const catId = order.product.category?.id || 'uncategorized';
      const catName = order.product.category?.name || 'Kategorisiz';
      const existing = categoryRevenue.get(catId) || { name: catName, revenue: 0, count: 0 };
      categoryRevenue.set(catId, {
        name: catName,
        revenue: existing.revenue + Number(order.totalAmount),
        count: existing.count + 1,
      });
    });

    return {
      period: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
      summary: {
        totalOrders: orderStats._count,
        totalRevenue: Number(orderStats._sum.totalAmount || 0),
        totalCommission: Number(orderStats._sum.commissionAmount || 0),
        newUsers: userStats._count,
        newProducts: productStats._count,
      },
      topSellers: topSellers.map((s) => ({
        sellerId: s.sellerId,
        sellerName: sellerMap.get(s.sellerId) || 'Unknown',
        revenue: Number(s._sum.totalAmount || 0),
        orderCount: s._count,
      })),
      topCategories: Array.from(categoryRevenue.entries())
        .map(([id, data]) => ({
          categoryId: id,
          categoryName: data.name,
          revenue: Math.round(data.revenue * 100) / 100,
          orderCount: data.count,
        }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10),
      generatedAt: new Date().toISOString(),
    };
  }
}
