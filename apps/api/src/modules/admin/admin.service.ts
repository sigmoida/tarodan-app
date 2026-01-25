import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma';
import {
  CreateCommissionRuleDto,
  UpdateCommissionRuleDto,
  UpdatePlatformSettingDto,
  AdminUserQueryDto,
  AdminProductQueryDto,
  AdminOrderQueryDto,
  AuditLogQueryDto,
  ApproveProductDto,
  RejectProductDto,
  BanUserDto,
  ResolveDisputeDto,
  AnalyticsQueryDto,
  AnalyticsGroupBy,
  UpdateOrderStatusDto,
  ReportQueryDto,
  AdminPaymentQueryDto,
  PaymentStatisticsQueryDto,
} from './dto';
import { ProductStatus, OrderStatus, Prisma, PaymentStatus, OfferStatus, TradeStatus, MessageStatus, TicketStatus, TicketPriority, TicketCategory } from '@prisma/client';
import { PaymentService } from '../payment/payment.service';
import { MessagingService } from '../messaging/messaging.service';
import { SupportService } from '../support/support.service';
import { SearchService } from '../search/search.service';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentService: PaymentService,
    private readonly messagingService: MessagingService,
    private readonly supportService: SupportService,
    private readonly searchService: SearchService,
  ) {}

  // ==================== COMMISSION RULES ====================

  /**
   * Get all commission rules
   */
  async getCommissionRules() {
    const rules = await this.prisma.commissionRule.findMany({
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    });

    return rules.map((r) => ({
      id: r.id,
      name: r.name,
      percentage: Number(r.percentage),
      type: r.ruleType,
      sellerType: r.sellerType,
      minAmount: r.minAmount ? Number(r.minAmount) : null,
      isActive: r.isActive,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  /**
   * Create commission rule
   * Requirement: Commission configuration via admin (project.md)
   */
  async createCommissionRule(adminId: string, dto: CreateCommissionRuleDto) {
    const rule = await this.prisma.commissionRule.create({
      data: {
        name: dto.name,
        percentage: dto.percentage,
        ruleType: dto.type,
        sellerType: dto.sellerType,
        minAmount: dto.minAmount,
        isActive: dto.isActive ?? true,
      },
    });

    // Log action
    await this.createAuditLog(adminId, 'commission_rule_create', 'CommissionRule', rule.id, null, rule);

    return {
      id: rule.id,
      name: rule.name,
      percentage: Number(rule.percentage),
      type: rule.ruleType,
      sellerType: rule.sellerType,
      minAmount: rule.minAmount ? Number(rule.minAmount) : null,
      isActive: rule.isActive,
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt,
    };
  }

  /**
   * Update commission rule
   */
  async updateCommissionRule(adminId: string, ruleId: string, dto: UpdateCommissionRuleDto) {
    const existing = await this.prisma.commissionRule.findUnique({
      where: { id: ruleId },
    });

    if (!existing) {
      throw new NotFoundException('Komisyon kuralı bulunamadı');
    }

    const rule = await this.prisma.commissionRule.update({
      where: { id: ruleId },
      data: {
        name: dto.name,
        percentage: dto.percentage,
        ruleType: dto.type,
        sellerType: dto.sellerType,
        minAmount: dto.minAmount,
        isActive: dto.isActive,
      },
    });

    await this.createAuditLog(adminId, 'commission_rule_update', 'CommissionRule', rule.id, existing, rule);

    return {
      id: rule.id,
      name: rule.name,
      percentage: Number(rule.percentage),
      type: rule.ruleType,
      sellerType: rule.sellerType,
      minAmount: rule.minAmount ? Number(rule.minAmount) : null,
      isActive: rule.isActive,
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt,
    };
  }

  /**
   * Delete commission rule
   */
  async deleteCommissionRule(adminId: string, ruleId: string) {
    const existing = await this.prisma.commissionRule.findUnique({
      where: { id: ruleId },
    });

    if (!existing) {
      throw new NotFoundException('Komisyon kuralı bulunamadı');
    }

    await this.prisma.commissionRule.delete({
      where: { id: ruleId },
    });

    await this.createAuditLog(adminId, 'commission_rule_delete', 'CommissionRule', ruleId, existing, null);

    return { success: true };
  }

  // ==================== PLATFORM SETTINGS ====================

  /**
   * Get all platform settings
   */
  async getPlatformSettings() {
    return this.prisma.platformSetting.findMany({
      orderBy: { settingKey: 'asc' },
    });
  }

  /**
   * Update platform setting
   */
  async updatePlatformSetting(adminId: string, dto: UpdatePlatformSettingDto) {
    const existing = await this.prisma.platformSetting.findUnique({
      where: { settingKey: dto.key },
    });

    const setting = await this.prisma.platformSetting.upsert({
      where: { settingKey: dto.key },
      update: {
        settingValue: dto.value,
        description: dto.description,
      },
      create: {
        settingKey: dto.key,
        settingValue: dto.value,
        settingType: dto.type || 'string',
        description: dto.description,
      },
    });

    await this.createAuditLog(adminId, 'setting_update', 'PlatformSetting', setting.id, existing, setting);

    return setting;
  }

  // ==================== USER MANAGEMENT ====================

  /**
   * Get users with filters
   */
  async getUsers(query: AdminUserQueryDto) {
    const { search, isSeller, isVerified, page = 1, limit = 20 } = query;

    const where: Prisma.UserWhereInput = {};

    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { displayName: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (isSeller !== undefined) {
      where.isSeller = isSeller;
    }

    if (isVerified !== undefined) {
      where.isVerified = isVerified;
    }

    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          displayName: true,
          phone: true,
          isSeller: true,
          sellerType: true,
          isVerified: true,
          createdAt: true,
          _count: {
            select: {
              products: true,
              buyerOrders: true,
              sellerOrders: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: users,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Get user by ID with full details
   * Requirement: GET /admin/users/:id (project.txt)
   */
  async getUserById(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        addresses: true,
        products: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            title: true,
            price: true,
            status: true,
            createdAt: true,
          },
        },
        buyerOrders: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            orderNumber: true,
            totalAmount: true,
            status: true,
            createdAt: true,
          },
        },
        sellerOrders: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            orderNumber: true,
            totalAmount: true,
            status: true,
            createdAt: true,
          },
        },
        givenRatings: {
          take: 5,
          orderBy: { createdAt: 'desc' },
        },
        receivedRatings: {
          take: 5,
          orderBy: { createdAt: 'desc' },
        },
        membership: {
          include: {
            tier: true,
          },
        },
        _count: {
          select: {
            products: true,
            buyerOrders: true,
            sellerOrders: true,
            givenRatings: true,
            receivedRatings: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('Kullanıcı bulunamadı');
    }

    // Calculate average rating received
    const avgRating = user.receivedRatings.length > 0
      ? user.receivedRatings.reduce((sum, r) => sum + r.score, 0) / user.receivedRatings.length
      : null;

    return {
      ...user,
      averageRating: avgRating ? Math.round(avgRating * 10) / 10 : null,
      products: user.products.map((p) => ({
        ...p,
        price: Number(p.price),
      })),
      buyerOrders: user.buyerOrders.map((o) => ({
        ...o,
        totalAmount: Number(o.totalAmount),
      })),
      sellerOrders: user.sellerOrders.map((o) => ({
        ...o,
        totalAmount: Number(o.totalAmount),
      })),
    };
  }

  /**
   * Ban user
   * - Sets isBanned = true
   * - Sets bannedAt, bannedReason, bannedBy
   * - Sets active products to inactive
   * - Sets pending products to rejected
   * - Cancels active offers
   * - All in a transaction (all or nothing)
   */
  async banUser(adminId: string, userId: string, dto: BanUserDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('Kullanıcı bulunamadı');
    }

    if ((user as any).isBanned) {
      throw new BadRequestException('Kullanıcı zaten banlı');
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. User'ı banla
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: {
          isBanned: true,
          bannedAt: new Date(),
          bannedReason: dto.reason,
          bannedBy: adminId,
        } as any,
      });

      // 2. Aktif ürünleri inactive yap
      await tx.product.updateMany({
        where: {
          sellerId: userId,
          status: ProductStatus.active,
        },
        data: {
          status: ProductStatus.inactive,
        },
      });

      // 3. Bekleyen ürünleri rejected yap
      await tx.product.updateMany({
        where: {
          sellerId: userId,
          status: ProductStatus.pending,
        },
        data: {
          status: ProductStatus.rejected,
        },
      });

      // 4. Aktif teklifleri cancelled yap (buyer olarak)
      await tx.offer.updateMany({
        where: {
          buyerId: userId,
          status: OfferStatus.pending,
        },
        data: {
          status: OfferStatus.cancelled,
        },
      });

      // 5. Audit log oluştur
      await this.createAuditLog(adminId, 'user_ban', 'User', userId, user, updatedUser);

      this.logger.warn(`User ${userId} banned by admin ${adminId}: ${dto.reason}`);

      return { success: true, userId, reason: dto.reason };
    });
  }

  // ==================== PRODUCT MANAGEMENT ====================

  /**
   * Get products with filters
   */
  async getProducts(query: AdminProductQueryDto) {
    const { search, status, categoryId, page = 1, limit = 20 } = query;

    const where: Prisma.ProductWhereInput = {};

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (status) {
      where.status = status;
    }

    if (categoryId) {
      where.categoryId = categoryId;
    }

    const [total, products] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        include: {
          seller: { select: { id: true, displayName: true, email: true } },
          category: { select: { id: true, name: true } },
          images: { take: 1, orderBy: { sortOrder: 'asc' } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: products.map((p) => ({
        ...p,
        price: Number(p.price),
        imageUrl: p.images[0]?.url,
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Approve product
   * Requirement: Listing approval (project.md)
   */
  async approveProduct(adminId: string, productId: string, dto: ApproveProductDto) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException('Ürün bulunamadı');
    }

    if (product.status !== ProductStatus.pending) {
      throw new BadRequestException('Sadece bekleyen ürünler onaylanabilir');
    }

    const updated = await this.prisma.product.update({
      where: { id: productId },
      data: { status: ProductStatus.active },
    });

    await this.createAuditLog(adminId, 'product_approve', 'Product', productId, product, updated);

    // Index to Elasticsearch when product is approved
    try {
      await this.searchService.indexProduct(productId);
    } catch (error) {
      this.logger.error(`Failed to index product ${productId} to Elasticsearch:`, error);
      // Don't fail the request if indexing fails
    }

    return { success: true, productId, status: 'active' };
  }

  /**
   * Reject product
   */
  async rejectProduct(adminId: string, productId: string, dto: RejectProductDto) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException('Ürün bulunamadı');
    }

    const updated = await this.prisma.product.update({
      where: { id: productId },
      data: { status: ProductStatus.rejected },
    });

    await this.createAuditLog(adminId, 'product_reject', 'Product', productId, product, { ...updated, reason: dto.reason });

    return { success: true, productId, status: 'rejected', reason: dto.reason };
  }

  // ==================== ORDER MANAGEMENT ====================

  /**
   * Get orders with filters
   */
  async getOrders(query: AdminOrderQueryDto) {
    const { status, fromDate, toDate, page = 1, limit = 20 } = query;

    const where: Prisma.OrderWhereInput = {};

    if (status) {
      where.status = status;
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
          product: { select: { id: true, title: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: orders.map((o) => ({
        ...o,
        amount: Number(o.totalAmount),
        commissionAmount: Number(o.commissionAmount),
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
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

    await this.createAuditLog(adminId, 'dispute_resolve', 'Order', orderId, order, {
      ...updated,
      resolution: dto.resolution,
      note: dto.note,
    });

    return { success: true, orderId, resolution: dto.resolution, newStatus };
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
    ]);

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
    const endDate = query.endDate ? new Date(query.endDate) : new Date();
    const startDate = query.startDate 
      ? new Date(query.startDate) 
      : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

    const orders = await this.prisma.order.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        status: { in: [OrderStatus.completed, OrderStatus.delivered, OrderStatus.paid] },
      },
      select: {
        createdAt: true,
        totalAmount: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Group by date
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

    return {
      data: result,
      summary: {
        totalSales: result.reduce((sum, r) => sum + r.totalSales, 0),
        totalOrders: result.reduce((sum, r) => sum + r.orderCount, 0),
        averageOrderValue: result.length > 0
          ? Math.round((result.reduce((sum, r) => sum + r.totalSales, 0) / 
              result.reduce((sum, r) => sum + r.orderCount, 0)) * 100) / 100
          : 0,
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
    const endDate = query.endDate ? new Date(query.endDate) : new Date();
    const startDate = query.startDate 
      ? new Date(query.startDate) 
      : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

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
      const completedStatuses: OrderStatus[] = [OrderStatus.completed, OrderStatus.delivered, OrderStatus.paid];
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

    return {
      data: result,
      summary: {
        totalGrossRevenue: result.reduce((sum, r) => sum + r.grossRevenue, 0),
        totalCommission: result.reduce((sum, r) => sum + r.commissionRevenue, 0),
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
    const endDate = query.endDate ? new Date(query.endDate) : new Date();
    const startDate = query.startDate 
      ? new Date(query.startDate) 
      : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

    const users = await this.prisma.user.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
      },
      select: {
        createdAt: true,
        isSeller: true,
      },
      orderBy: { createdAt: 'asc' },
    });

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
        totalNewUsers: result.reduce((sum, r) => sum + r.newUsers, 0),
        totalNewSellers: result.reduce((sum, r) => sum + r.newSellers, 0),
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

    return {
      ...order,
      totalAmount: Number(order.totalAmount),
      commissionAmount: Number(order.commissionAmount),
      shippingCost: Number(order.shippingCost),
      product: {
        ...order.product,
        price: Number(order.product.price),
      },
      offer: order.offer ? {
        ...order.offer,
        amount: Number(order.offer.amount),
      } : null,
      payment: order.payment ? {
        ...order.payment,
        amount: Number(order.payment.amount),
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
    });

    if (!order) {
      throw new NotFoundException('Sipariş bulunamadı');
    }

    // Validate status transition
    const validStatuses = Object.values(OrderStatus);
    if (!validStatuses.includes(dto.status as OrderStatus)) {
      throw new BadRequestException('Geçersiz sipariş durumu');
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { 
        status: dto.status as OrderStatus,
        version: { increment: 1 },
      },
    });

    await this.createAuditLog(adminId, 'order_status_update', 'Order', orderId, order, {
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

    return this.prisma.$transaction(async (tx) => {
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

      // 2. Audit log oluştur
      await this.createAuditLog(adminId, 'user_unban', 'User', userId, user, updatedUser);

      this.logger.log(`User ${userId} unbanned by admin ${adminId}`);

      return { success: true, userId };
    });
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

    const [totalCommission, commissionByMonth, commissionByCategory] = await Promise.all([
      // Total commission in period
      this.prisma.order.aggregate({
        _sum: { commissionAmount: true },
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

  // ==================== AUDIT LOGS ====================

  /**
   * Get audit logs
   */
  async getAuditLogs(query: AuditLogQueryDto) {
    const { action, adminId, fromDate, toDate, page = 1, limit = 50 } = query;

    const where: Prisma.AuditLogWhereInput = {};

    if (action) {
      where.action = action;
    }

    if (adminId) {
      where.adminUserId = adminId;
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

    const [total, logs] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        include: {
          adminUser: { select: { id: true, user: { select: { email: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: logs.map((log) => ({
        ...log,
        admin: log.adminUser
          ? { id: log.adminUser.id, email: log.adminUser.user.email }
          : null,
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Create audit log entry
   */
  private async createAuditLog(
    adminUserId: string,
    action: string,
    entityType: string,
    entityId: string,
    oldValue: any,
    newValue: any,
  ) {
    try {
      // Serialize values to ensure they can be stored as JSON
      const serializeValue = (value: any) => {
        if (value === null || value === undefined) {
          return null;
        }
        try {
          // Use JSON.parse/stringify to handle Date, Decimal, etc.
          return JSON.parse(JSON.stringify(value, (key, val) => {
            // Convert Date to ISO string
            if (val instanceof Date) {
              return val.toISOString();
            }
            // Convert Decimal to number (Prisma Decimal has toNumber method)
            if (val && typeof val === 'object' && typeof val.toNumber === 'function') {
              return val.toNumber();
            }
            return val;
          }));
        } catch (e) {
          // Fallback: convert to string if serialization fails
          this.logger.warn(`Failed to serialize audit log value for ${entityType}:${entityId}`, e);
          return String(value);
        }
      };

      return await this.prisma.auditLog.create({
        data: {
          adminUserId,
          action,
          entityType,
          entityId,
          oldValue: serializeValue(oldValue),
          newValue: serializeValue(newValue),
        },
      });
    } catch (error) {
      // Log error but don't fail the main operation
      this.logger.error(`Failed to create audit log for ${entityType}:${entityId}`, error);
      // Return a promise that resolves to avoid breaking the caller
      return Promise.resolve();
    }
  }

  // ==================== MODERATION QUEUE ====================

  /**
   * Get moderation queue items
   * Requirement: Content moderation (project.md)
   */
  async getModerationQueue(options: {
    type?: string;
    page: number;
    pageSize: number;
  }) {
    const { type, page, pageSize } = options;
    const skip = (page - 1) * pageSize;

    const items: any[] = [];
    let totalCount = 0;

    // Get pending products if type is 'product' or all
    if (!type || type === 'product') {
      const [products, productCount] = await Promise.all([
        this.prisma.product.findMany({
          where: { status: ProductStatus.pending },
          include: {
            seller: { select: { id: true, displayName: true, email: true } },
            category: { select: { id: true, name: true } },
            images: { take: 1, orderBy: { sortOrder: 'asc' } },
          },
          orderBy: { createdAt: 'asc' },
          skip: type === 'product' ? skip : 0,
          take: type === 'product' ? pageSize : 10,
        }),
        this.prisma.product.count({ where: { status: ProductStatus.pending } }),
      ]);

      items.push(
        ...products.map((p) => ({
          id: p.id,
          type: 'product',
          title: p.title,
          description: p.description?.substring(0, 200) || '',
          imageUrl: p.images[0]?.url || null,
          price: Number(p.price),
          seller: p.seller,
          category: p.category?.name || 'Kategorisiz',
          createdAt: p.createdAt,
          status: 'pending',
        })),
      );
      totalCount += productCount;
    }

    // Get pending approval messages if type is 'message' or all
    if (!type || type === 'message') {
      const [messages, messageCount] = await Promise.all([
        this.prisma.message.findMany({
          where: { status: 'pending_approval' },
          include: {
            sender: { select: { id: true, displayName: true, email: true } },
            thread: { select: { id: true } },
          },
          orderBy: { createdAt: 'asc' },
          skip: type === 'message' ? skip : 0,
          take: type === 'message' ? pageSize : 10,
        }),
        this.prisma.message.count({ where: { status: 'pending_approval' } }),
      ]);

      items.push(
        ...messages.map((m) => ({
          id: m.id,
          type: 'message',
          title: `Mesaj #${m.id.substring(0, 8)}`,
          description: m.content?.substring(0, 200) || '',
          sender: m.sender,
          threadId: m.threadId,
          createdAt: m.createdAt,
          status: 'pending_approval',
        })),
      );
      totalCount += messageCount;
    }

    // Get reviews with comments if type is 'review' or all
    if (!type || type === 'review') {
      const [reviews, reviewCount] = await Promise.all([
        this.prisma.rating.findMany({
          where: { 
            comment: { not: null },
          },
          include: {
            giver: { select: { id: true, displayName: true, email: true } },
            receiver: { select: { id: true, displayName: true, email: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip: type === 'review' ? skip : 0,
          take: type === 'review' ? pageSize : 10,
        }),
        this.prisma.rating.count({
          where: { 
            comment: { not: null },
          },
        }),
      ]);

      items.push(
        ...reviews.map((r) => ({
          id: r.id,
          type: 'review',
          title: `Değerlendirme: ${r.score}/5`,
          description: r.comment?.substring(0, 200) || 'Yorum yok',
          score: r.score,
          reviewer: r.giver,
          reviewed: r.receiver,
          createdAt: r.createdAt,
          status: 'active',
        })),
      );
      // Don't add to totalCount if already filtered
    }

    // Sort by createdAt
    items.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    return {
      data: type ? items : items.slice(0, pageSize),
      meta: {
        total: totalCount,
        page,
        pageSize,
        totalPages: Math.ceil(totalCount / pageSize),
      },
    };
  }

  /**
   * Get moderation statistics
   */
  async getModerationStats() {
    const [
      pendingProducts,
      pendingMessages,
      recentReviews,
      flaggedUsers,
    ] = await Promise.all([
      this.prisma.product.count({ where: { status: ProductStatus.pending } }),
      this.prisma.message.count({ where: { status: 'pending_approval' } }),
      this.prisma.rating.count({
        where: {
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
      // Count users with warnings (using audit log for ban actions)
      this.prisma.auditLog.count({
        where: {
          action: { in: ['user_warn', 'user_flag'] },
          createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    return {
      pendingProducts,
      reportedMessages: pendingMessages,
      recentReviews,
      flaggedUsers,
      totalPending: pendingProducts + pendingMessages,
    };
  }

  /**
   * Approve moderation item
   */
  async approveModerationItem(
    adminId: string,
    type: string,
    itemId: string,
    notes?: string,
  ) {
    switch (type) {
      case 'product':
        const product = await this.prisma.product.findUnique({
          where: { id: itemId },
        });
        if (!product) throw new NotFoundException('Ürün bulunamadı');

        await this.prisma.product.update({
          where: { id: itemId },
          data: { status: ProductStatus.active },
        });

        await this.createAuditLog(adminId, 'moderation_approve', 'Product', itemId, product, {
          status: 'active',
          notes,
        });
        break;

      case 'message':
        const message = await this.prisma.message.findUnique({
          where: { id: itemId },
        });
        if (!message) throw new NotFoundException('Mesaj bulunamadı');

        await this.prisma.message.update({
          where: { id: itemId },
          data: { 
            status: 'approved',
            reviewedById: adminId,
            reviewedAt: new Date(),
          },
        });

        await this.createAuditLog(adminId, 'moderation_approve', 'Message', itemId, message, {
          status: 'approved',
          notes,
        });
        break;

      case 'review':
        // Reviews are approved by default, this marks them as "verified"
        await this.createAuditLog(adminId, 'moderation_approve', 'Rating', itemId, null, {
          verified: true,
          notes,
        });
        break;

      default:
        throw new BadRequestException('Geçersiz moderasyon türü');
    }

    return { success: true, type, id: itemId, action: 'approved' };
  }

  /**
   * Reject moderation item
   */
  async rejectModerationItem(
    adminId: string,
    type: string,
    itemId: string,
    reason: string,
    notes?: string,
  ) {
    switch (type) {
      case 'product':
        const product = await this.prisma.product.findUnique({
          where: { id: itemId },
        });
        if (!product) throw new NotFoundException('Ürün bulunamadı');

        await this.prisma.product.update({
          where: { id: itemId },
          data: { status: ProductStatus.rejected },
        });

        await this.createAuditLog(adminId, 'moderation_reject', 'Product', itemId, product, {
          status: 'rejected',
          reason,
          notes,
        });
        break;

      case 'message':
        const messageToReject = await this.prisma.message.findUnique({
          where: { id: itemId },
        });
        if (!messageToReject) throw new NotFoundException('Mesaj bulunamadı');

        // Mark as rejected and hide content
        await this.prisma.message.update({
          where: { id: itemId },
          data: { 
            status: 'rejected',
            filteredContent: '[Bu mesaj moderatör tarafından kaldırıldı]',
            flaggedReason: reason,
            reviewedById: adminId,
            reviewedAt: new Date(),
          },
        });

        await this.createAuditLog(adminId, 'moderation_reject', 'Message', itemId, messageToReject, {
          status: 'rejected',
          reason,
          notes,
        });
        break;

      case 'review':
        const review = await this.prisma.rating.findUnique({
          where: { id: itemId },
        });
        if (!review) throw new NotFoundException('Değerlendirme bulunamadı');

        // Delete the review
        await this.prisma.rating.delete({
          where: { id: itemId },
        });

        await this.createAuditLog(adminId, 'moderation_reject', 'Rating', itemId, review, {
          deleted: true,
          reason,
          notes,
        });
        break;

      default:
        throw new BadRequestException('Geçersiz moderasyon türü');
    }

    return { success: true, type, id: itemId, action: 'rejected', reason };
  }

  /**
   * Flag moderation item for priority review
   */
  async flagModerationItem(
    adminId: string,
    type: string,
    itemId: string,
    reason: string,
    priority?: string,
  ) {
    await this.createAuditLog(adminId, 'moderation_flag', type, itemId, null, {
      flagged: true,
      reason,
      priority: priority || 'normal',
    });

    return { success: true, type, id: itemId, action: 'flagged', reason, priority };
  }

  // ==================== PAYMENT MANAGEMENT ====================

  /**
   * Get all payments with filters
   */
  async getPayments(query: AdminPaymentQueryDto) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.PaymentWhereInput = {};

    if (query.status) {
      where.status = query.status as PaymentStatus;
    }

    if (query.provider) {
      where.provider = query.provider;
    }

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) {
        where.createdAt.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        where.createdAt.lte = new Date(query.endDate);
      }
    }

    if (query.search) {
      where.OR = [
        { providerPaymentId: { contains: query.search, mode: 'insensitive' } },
        { providerConversationId: { contains: query.search, mode: 'insensitive' } },
        { order: { orderNumber: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const [payments, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          order: {
            include: {
              buyer: { select: { id: true, displayName: true, email: true } },
              seller: { select: { id: true, displayName: true, email: true } },
              product: { select: { id: true, title: true } },
            },
          },
        },
      }),
      this.prisma.payment.count({ where }),
    ]);

    return {
      data: payments.map((p) => ({
        id: p.id,
        orderId: p.orderId,
        orderNumber: p.order.orderNumber,
        amount: Number(p.amount),
        currency: p.currency,
        provider: p.provider,
        status: p.status,
        failureReason: p.failureReason,
        providerPaymentId: p.providerPaymentId,
        providerConversationId: p.providerConversationId,
        buyer: p.order.buyer,
        seller: p.order.seller,
        product: p.order.product,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        paidAt: p.paidAt,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get payment by ID with full details
   */
  async getPaymentById(id: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        order: {
          include: {
            buyer: true,
            seller: true,
            product: true,
          },
        },
        paymentHold: true,
      },
    });

    if (!payment) {
      throw new NotFoundException('Ödeme bulunamadı');
    }

    return {
      id: payment.id,
      orderId: payment.orderId,
      orderNumber: payment.order.orderNumber,
      amount: Number(payment.amount),
      currency: payment.currency,
      provider: payment.provider,
      status: payment.status,
      failureReason: payment.failureReason,
      providerPaymentId: payment.providerPaymentId,
      providerConversationId: payment.providerConversationId,
      metadata: payment.metadata,
      order: {
        id: payment.order.id,
        orderNumber: payment.order.orderNumber,
        status: payment.order.status,
        totalAmount: Number(payment.order.totalAmount),
        commissionAmount: Number(payment.order.commissionAmount),
        buyer: payment.order.buyer,
        seller: payment.order.seller,
        product: payment.order.product,
        shippingAddress: payment.order.shippingAddress,
      },
      paymentHold: payment.paymentHold ? {
        id: payment.paymentHold.id,
        amount: Number(payment.paymentHold.amount),
        status: payment.paymentHold.status,
        releaseAt: payment.paymentHold.releaseAt,
        releasedAt: payment.paymentHold.releasedAt,
      } : null,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
      paidAt: payment.paidAt,
    };
  }

  /**
   * Get payment statistics
   */
  async getPaymentStatistics(query: PaymentStatisticsQueryDto) {
    const startDate = query.startDate ? new Date(query.startDate) : new Date();
    const endDate = query.endDate ? new Date(query.endDate) : new Date();

    // Adjust start date based on period
    if (query.period === 'daily') {
      startDate.setDate(startDate.getDate() - 30);
    } else if (query.period === 'weekly') {
      startDate.setDate(startDate.getDate() - 90);
    } else if (query.period === 'monthly') {
      startDate.setMonth(startDate.getMonth() - 12);
    }

    const where: Prisma.PaymentWhereInput = {
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    };

    const [
      totalPayments,
      completedPayments,
      failedPayments,
      totalRevenue,
      paymentsByProvider,
      paymentsByStatus,
      averageAmount,
    ] = await Promise.all([
      this.prisma.payment.count({ where }),
      this.prisma.payment.count({
        where: { ...where, status: PaymentStatus.completed },
      }),
      this.prisma.payment.count({
        where: { ...where, status: PaymentStatus.failed },
      }),
      this.prisma.payment.aggregate({
        where: { ...where, status: PaymentStatus.completed },
        _sum: { amount: true },
      }),
      this.prisma.payment.groupBy({
        by: ['provider'],
        where,
        _count: { id: true },
        _sum: { amount: true },
      }),
      this.prisma.payment.groupBy({
        by: ['status'],
        where,
        _count: { id: true },
      }),
      this.prisma.payment.aggregate({
        where: { ...where, status: PaymentStatus.completed },
        _avg: { amount: true },
      }),
    ]);

    const successRate =
      totalPayments > 0 ? (completedPayments / totalPayments) * 100 : 0;

    return {
      period: query.period || 'monthly',
      startDate,
      endDate,
      summary: {
        totalPayments,
        completedPayments,
        failedPayments,
        pendingPayments: totalPayments - completedPayments - failedPayments,
        totalRevenue: Number(totalRevenue._sum.amount || 0),
        averageAmount: Number(averageAmount._avg.amount || 0),
        successRate: Number(successRate.toFixed(2)),
      },
      byProvider: paymentsByProvider.map((p) => ({
        provider: p.provider,
        count: p._count.id,
        totalAmount: Number(p._sum.amount || 0),
        percentage: totalPayments > 0 ? (p._count.id / totalPayments) * 100 : 0,
      })),
      byStatus: paymentsByStatus.map((p) => ({
        status: p.status,
        count: p._count.id,
        percentage: totalPayments > 0 ? (p._count.id / totalPayments) * 100 : 0,
      })),
    };
  }

  /**
   * Get failed payments
   */
  async getFailedPayments(query: AdminPaymentQueryDto) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.PaymentWhereInput = {
      status: PaymentStatus.failed,
    };

    if (query.provider) {
      where.provider = query.provider;
    }

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) {
        where.createdAt.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        where.createdAt.lte = new Date(query.endDate);
      }
    }

    if (query.search) {
      where.OR = [
        { providerPaymentId: { contains: query.search, mode: 'insensitive' } },
        { failureReason: { contains: query.search, mode: 'insensitive' } },
        { order: { orderNumber: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const [payments, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          order: {
            include: {
              buyer: { select: { id: true, displayName: true, email: true } },
              product: { select: { id: true, title: true } },
            },
          },
        },
      }),
      this.prisma.payment.count({ where }),
    ]);

    return {
      data: payments.map((p) => ({
        id: p.id,
        orderId: p.orderId,
        orderNumber: p.order.orderNumber,
        amount: Number(p.amount),
        provider: p.provider,
        failureReason: p.failureReason,
        buyer: p.order.buyer,
        product: p.order.product,
        createdAt: p.createdAt,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Manual refund by admin
   */
  async manualRefund(
    adminId: string,
    paymentId: string,
    amount?: number,
    reason?: string,
  ) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { order: true },
    });

    if (!payment) {
      throw new NotFoundException('Ödeme bulunamadı');
    }

    if (payment.status !== PaymentStatus.completed) {
      throw new BadRequestException('Sadece tamamlanmış ödemeler iade edilebilir');
    }

    const refundAmount = amount || Number(payment.amount);

    // Process refund via PaymentService
    const refundResult = await this.paymentService.processRefund(
      payment.orderId,
      refundAmount,
    );

    // Log admin action
    await this.createAuditLog(
      adminId,
      'payment_manual_refund',
      'Payment',
      paymentId,
      { status: payment.status, amount: Number(payment.amount) },
      {
        status: PaymentStatus.refunded,
        refundAmount,
        reason: reason || 'Admin tarafından manuel iade',
      },
    );

    return {
      ...refundResult,
      reason: reason || 'Admin tarafından manuel iade',
    };
  }

  /**
   * Force cancel payment by admin
   */
  async forceCancelPayment(adminId: string, paymentId: string, reason: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { order: true },
    });

    if (!payment) {
      throw new NotFoundException('Ödeme bulunamadı');
    }

    if (payment.status === PaymentStatus.completed) {
      throw new BadRequestException('Tamamlanmış ödemeler iptal edilemez, iade yapın');
    }

    const oldStatus = payment.status;

    // Update payment status
    await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: PaymentStatus.failed,
        failureReason: `Admin tarafından zorla iptal edildi: ${reason}`,
      },
    });

    // Log admin action
    await this.createAuditLog(
      adminId,
      'payment_force_cancel',
      'Payment',
      paymentId,
      { status: oldStatus },
      {
        status: PaymentStatus.failed,
        reason: `Admin tarafından zorla iptal edildi: ${reason}`,
      },
    );

    return {
      success: true,
      paymentId,
      message: 'Ödeme zorla iptal edildi',
      reason,
    };
  }

  // ==================== TRADE MANAGEMENT ====================

  /**
   * Get trades with filters for admin
   */
  async getTrades(query: {
    status?: TradeStatus;
    initiatorId?: string;
    receiverId?: string;
    fromDate?: string;
    toDate?: string;
    page?: number;
    limit?: number;
  }) {
    const { status, initiatorId, receiverId, fromDate, toDate, page = 1, limit = 20 } = query;

    const where: Prisma.TradeWhereInput = {};

    if (status) {
      where.status = status;
    }

    if (initiatorId) {
      where.initiatorId = initiatorId;
    }

    if (receiverId) {
      where.receiverId = receiverId;
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

    const [total, trades] = await Promise.all([
      this.prisma.trade.count({ where }),
      this.prisma.trade.findMany({
        where,
        include: {
          initiator: { select: { id: true, displayName: true, email: true } },
          receiver: { select: { id: true, displayName: true, email: true } },
          initiatorItems: {
            include: {
              product: {
                select: {
                  id: true,
                  title: true,
                  price: true,
                  images: { take: 1, orderBy: { sortOrder: 'asc' } },
                },
              },
            },
          },
          receiverItems: {
            include: {
              product: {
                select: {
                  id: true,
                  title: true,
                  price: true,
                  images: { take: 1, orderBy: { sortOrder: 'asc' } },
                },
              },
            },
          },
          shipments: true,
          cashPayment: true,
          dispute: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: trades,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Get trade by ID for admin
   */
  async getTradeById(tradeId: string) {
    const trade = await this.prisma.trade.findUnique({
      where: { id: tradeId },
      include: {
        initiator: {
          select: {
            id: true,
            displayName: true,
            email: true,
            phone: true,
            addresses: true,
          },
        },
        receiver: {
          select: {
            id: true,
            displayName: true,
            email: true,
            phone: true,
            addresses: true,
          },
        },
        initiatorItems: {
          include: {
            product: {
              include: {
                images: { orderBy: { sortOrder: 'asc' } },
                category: true,
                seller: { select: { id: true, displayName: true } },
              },
            },
          },
        },
        receiverItems: {
          include: {
            product: {
              include: {
                images: { orderBy: { sortOrder: 'asc' } },
                category: true,
                seller: { select: { id: true, displayName: true } },
              },
            },
          },
        },
        shipments: {
          include: {
            events: { orderBy: { eventTime: 'asc' } },
          },
        },
        cashPayment: true,
        dispute: true,
      },
    });

    if (!trade) {
      throw new NotFoundException('Takas bulunamadı');
    }

    return trade;
  }

  /**
   * Resolve trade dispute or cancel trade
   */
  async resolveTrade(adminId: string, tradeId: string, dto: { resolution: string; note?: string }) {
    const trade = await this.prisma.trade.findUnique({
      where: { id: tradeId },
      include: {
        initiatorItems: true,
        receiverItems: true,
        dispute: true,
      },
    });

    if (!trade) {
      throw new NotFoundException('Takas bulunamadı');
    }

    return this.prisma.$transaction(async (tx) => {
      // Get all trade items
      const allItems = await tx.tradeItem.findMany({
        where: { tradeId },
      });

      const productIds = allItems.map((item) => item.productId);

      let updatedTrade;
      let newStatus: TradeStatus;

      if (dto.resolution === 'cancel') {
        // Cancel trade - make products active again
        newStatus = TradeStatus.cancelled;

        await tx.product.updateMany({
          where: { id: { in: productIds } },
          data: { status: ProductStatus.active },
        });

        updatedTrade = await tx.trade.update({
          where: { id: tradeId },
          data: {
            status: newStatus,
            cancelledAt: new Date(),
            cancelReason: dto.note || 'Admin tarafından iptal edildi',
          },
        });
      } else if (dto.resolution === 'favor_initiator' || dto.resolution === 'complete_trade') {
        // Complete trade
        newStatus = TradeStatus.completed;

        await tx.product.updateMany({
          where: { id: { in: productIds } },
          data: { status: ProductStatus.sold },
        });

        updatedTrade = await tx.trade.update({
          where: { id: tradeId },
          data: {
            status: newStatus,
            completedAt: new Date(),
          },
        });

        // Update dispute if exists
        if (trade.dispute) {
          await tx.tradeDispute.update({
            where: { tradeId },
            data: {
              resolution: dto.resolution,
              resolvedById: adminId,
              resolvedAt: new Date(),
              resolutionNotes: dto.note,
            },
          });
        }
      } else if (dto.resolution === 'favor_receiver') {
        // Cancel and return products
        newStatus = TradeStatus.cancelled;

        await tx.product.updateMany({
          where: { id: { in: productIds } },
          data: { status: ProductStatus.active },
        });

        updatedTrade = await tx.trade.update({
          where: { id: tradeId },
          data: {
            status: newStatus,
            cancelledAt: new Date(),
            cancelReason: dto.note || 'Alıcı lehine iptal edildi',
          },
        });

        // Update dispute if exists
        if (trade.dispute) {
          await tx.tradeDispute.update({
            where: { tradeId },
            data: {
              resolution: dto.resolution,
              resolvedById: adminId,
              resolvedAt: new Date(),
              resolutionNotes: dto.note,
            },
          });
        }
      } else {
        throw new BadRequestException('Geçersiz çözüm tipi. Geçerli değerler: cancel, favor_initiator, favor_receiver, complete_trade');
      }

      // Create audit log
      await this.createAuditLog(adminId, 'trade_resolve', 'Trade', tradeId, trade, {
        ...updatedTrade,
        resolution: dto.resolution,
        note: dto.note,
      });

      return { success: true, tradeId, resolution: dto.resolution, status: newStatus };
    });
  }

  // ==================== MESSAGE MANAGEMENT ====================

  /**
   * Get messages for admin moderation
   */
  async getMessages(query: {
    status?: MessageStatus;
    fromDate?: string;
    toDate?: string;
    page?: number;
    limit?: number;
  }) {
    const { status, fromDate, toDate, page = 1, limit = 20 } = query;

    const where: Prisma.MessageWhereInput = {};

    if (status) {
      where.status = status;
    } else {
      // Default to pending_approval if no status specified
      where.status = MessageStatus.pending_approval;
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

    const [total, messages] = await Promise.all([
      this.prisma.message.count({ where }),
      this.prisma.message.findMany({
        where,
        include: {
          sender: { select: { id: true, displayName: true, email: true } },
          receiver: { select: { id: true, displayName: true, email: true } },
          thread: { select: { id: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: messages,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Get message by ID for admin
   */
  async getMessageById(messageId: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: {
        sender: {
          select: {
            id: true,
            displayName: true,
            email: true,
            phone: true,
          },
        },
        receiver: {
          select: {
            id: true,
            displayName: true,
            email: true,
            phone: true,
          },
        },
        thread: {
          include: {
            messages: {
              orderBy: { createdAt: 'asc' },
              take: 50, // Last 50 messages in thread
            },
          },
        },
      },
    });

    if (!message) {
      throw new NotFoundException('Mesaj bulunamadı');
    }

    return message;
  }

  /**
   * Approve message
   */
  async approveMessage(adminId: string, messageId: string, notes?: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw new NotFoundException('Mesaj bulunamadı');
    }

    // Use MessagingService to approve
    const result = await this.messagingService.moderateMessage(messageId, adminId, 'approve');

    // Create audit log
    await this.createAuditLog(adminId, 'message_approve', 'Message', messageId, message, {
      ...result,
      notes,
    });

    return { success: true, messageId, status: 'approved' };
  }

  /**
   * Reject message
   */
  async rejectMessage(adminId: string, messageId: string, reason: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw new NotFoundException('Mesaj bulunamadı');
    }

    // Use MessagingService to reject
    await this.messagingService.moderateMessage(messageId, adminId, 'reject');

    // Create audit log
    await this.createAuditLog(adminId, 'message_reject', 'Message', messageId, message, {
      reason,
    });

    return { success: true, messageId, status: 'rejected', reason };
  }

  // ==================== SUPPORT TICKET MANAGEMENT ====================

  /**
   * Get support tickets with filters for admin
   */
  async getSupportTickets(query: {
    status?: TicketStatus;
    priority?: TicketPriority;
    category?: TicketCategory;
    assigneeId?: string;
    creatorId?: string;
    fromDate?: string;
    toDate?: string;
    page?: number;
    limit?: number;
  }) {
    const { status, priority, category, assigneeId, creatorId, fromDate, toDate, page = 1, limit = 20 } = query;

    // Use SupportService's getAllTickets method
    const result = await this.supportService.getAllTickets(
      page,
      limit,
      status,
      priority,
      category,
      assigneeId,
    );

    // Filter by creatorId and date range if provided
    let filteredTickets = result.tickets;

    if (creatorId) {
      filteredTickets = filteredTickets.filter((t) => t.creatorId === creatorId);
    }

    if (fromDate || toDate) {
      const from = fromDate ? new Date(fromDate) : null;
      const to = toDate ? new Date(toDate) : null;
      filteredTickets = filteredTickets.filter((t) => {
        const createdAt = new Date(t.createdAt);
        if (from && createdAt < from) return false;
        if (to && createdAt > to) return false;
        return true;
      });
    }

    return {
      data: filteredTickets,
      meta: {
        total: filteredTickets.length,
        page,
        limit,
        totalPages: Math.ceil(filteredTickets.length / limit),
      },
    };
  }

  /**
   * Get support ticket by ID for admin
   */
  async getSupportTicketById(ticketId: string) {
    // Use SupportService's getTicketById with admin flag
    // Pass empty string for userId since admin can view any ticket
    return this.supportService.getTicketById(ticketId, '', true);
  }

  /**
   * Update support ticket
   */
  async updateSupportTicket(adminId: string, ticketId: string, dto: {
    status?: TicketStatus;
    priority?: TicketPriority;
    assigneeId?: string;
    note?: string;
  }) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException('Destek talebi bulunamadı');
    }

    const oldTicket = { ...ticket };

    // Update status if provided
    if (dto.status) {
      await this.supportService.updateTicketStatus(ticketId, adminId, {
        status: dto.status,
        note: dto.note,
      });
    }

    // Update priority if provided
    if (dto.priority) {
      await this.supportService.updatePriority(ticketId, dto.priority);
    }

    // Update assignee if provided
    if (dto.assigneeId !== undefined) {
      await this.supportService.assignTicket(ticketId, { assigneeId: dto.assigneeId });
    }

    const updatedTicket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
    });

    // Create audit log
    await this.createAuditLog(adminId, 'support_ticket_update', 'SupportTicket', ticketId, oldTicket, updatedTicket);

    return this.getSupportTicketById(ticketId);
  }

  /**
   * Reply to support ticket
   */
  async replyToSupportTicket(adminId: string, ticketId: string, message: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException('Destek talebi bulunamadı');
    }

    // Use SupportService's addMessage with admin flag
    await this.supportService.addMessage(ticketId, adminId, { content: message }, true);

    // Update status to in_progress if it was waiting_customer
    if (ticket.status === TicketStatus.waiting_customer) {
      await this.supportService.updateTicketStatus(ticketId, adminId, {
        status: TicketStatus.in_progress,
      });
    }

    // Create audit log
    await this.createAuditLog(adminId, 'support_ticket_reply', 'SupportTicket', ticketId, ticket, {
      ...ticket,
      message,
    });

    return this.getSupportTicketById(ticketId);
  }

  // ==================== CATEGORY MANAGEMENT ====================

  /**
   * Generate slug from name
   */
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /**
   * Get categories with tree structure
   */
  async getCategories() {
    const categories = await this.prisma.category.findMany({
      include: {
        parent: true,
        children: { orderBy: { sortOrder: 'asc' } },
        _count: {
          select: { products: true },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });

    return {
      data: categories.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        description: c.description,
        parentId: c.parentId,
        parent: c.parent ? { id: c.parent.id, name: c.parent.name } : null,
        children: c.children.map((child) => ({
          id: child.id,
          name: child.name,
          slug: child.slug,
        })),
        sortOrder: c.sortOrder,
        isActive: c.isActive,
        productCount: c._count.products,
        createdAt: c.createdAt,
      })),
    };
  }

  /**
   * Create category
   */
  async createCategory(adminId: string, dto: {
    name: string;
    description?: string;
    parentId?: string;
    sortOrder?: number;
    isActive?: boolean;
  }) {
    // Check if parent exists
    if (dto.parentId) {
      const parent = await this.prisma.category.findUnique({
        where: { id: dto.parentId },
      });

      if (!parent) {
        throw new NotFoundException('Üst kategori bulunamadı');
      }
    }

    // Generate slug
    let slug = this.generateSlug(dto.name);
    let slugExists = await this.prisma.category.findUnique({
      where: { slug },
    });

    // If slug exists, append number
    let counter = 1;
    while (slugExists) {
      slug = `${this.generateSlug(dto.name)}-${counter}`;
      slugExists = await this.prisma.category.findUnique({
        where: { slug },
      });
      counter++;
    }

    const category = await this.prisma.category.create({
      data: {
        name: dto.name,
        slug,
        description: dto.description,
        parentId: dto.parentId,
        sortOrder: dto.sortOrder || 0,
        isActive: dto.isActive !== undefined ? dto.isActive : true,
      },
    });

    // Create audit log
    await this.createAuditLog(adminId, 'category_create', 'Category', category.id, null, category);

    return category;
  }

  /**
   * Update category
   */
  async updateCategory(adminId: string, categoryId: string, dto: {
    name?: string;
    description?: string;
    parentId?: string;
    sortOrder?: number;
    isActive?: boolean;
  }) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      include: { children: true },
    });

    if (!category) {
      throw new NotFoundException('Kategori bulunamadı');
    }

    // Check circular reference if parentId is being changed
    if (dto.parentId && dto.parentId !== category.parentId) {
      // Check if new parent is a child of this category
      const isChild = category.children.some((child) => child.id === dto.parentId);
      if (isChild) {
        throw new BadRequestException('Kategori kendi alt kategorisini üst kategori olarak seçemez');
      }

      // Check if new parent exists
      const newParent = await this.prisma.category.findUnique({
        where: { id: dto.parentId },
      });

      if (!newParent) {
        throw new NotFoundException('Üst kategori bulunamadı');
      }
    }

    // Generate new slug if name changed
    let slug = category.slug;
    if (dto.name && dto.name !== category.name) {
      slug = this.generateSlug(dto.name);
      const slugExists = await this.prisma.category.findUnique({
        where: { slug },
      });

      if (slugExists && slugExists.id !== categoryId) {
        // Slug exists for another category, append number
        let counter = 1;
        while (slugExists) {
          slug = `${this.generateSlug(dto.name)}-${counter}`;
          const check = await this.prisma.category.findUnique({
            where: { slug },
          });
          if (!check || check.id === categoryId) break;
          counter++;
        }
      }
    }

    const oldCategory = { ...category };
    const updatedCategory = await this.prisma.category.update({
      where: { id: categoryId },
      data: {
        name: dto.name,
        slug,
        description: dto.description,
        parentId: dto.parentId,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
      },
    });

    // Create audit log
    await this.createAuditLog(adminId, 'category_update', 'Category', categoryId, oldCategory, updatedCategory);

    return updatedCategory;
  }

  /**
   * Delete category
   */
  async deleteCategory(adminId: string, categoryId: string) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      include: {
        children: true,
        _count: {
          select: { products: true },
        },
      },
    });

    if (!category) {
      throw new NotFoundException('Kategori bulunamadı');
    }

    // Check if category has products
    if (category._count.products > 0) {
      throw new BadRequestException('Bu kategoride ürünler bulunmaktadır. Önce ürünleri başka kategoriye taşıyın.');
    }

    // Check if category has children
    if (category.children.length > 0) {
      throw new BadRequestException('Bu kategorinin alt kategorileri bulunmaktadır. Önce alt kategorileri silin.');
    }

    await this.prisma.category.delete({
      where: { id: categoryId },
    });

    // Create audit log
    await this.createAuditLog(adminId, 'category_delete', 'Category', categoryId, category, null);

    return { success: true, categoryId };
  }

  // ==================== MEMBERSHIP TIER MANAGEMENT ====================

  /**
   * Get membership tiers
   */
  async getMembershipTiers() {
    const tiers = await this.prisma.membershipTier.findMany({
      include: {
        _count: {
          select: { userMemberships: true },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });

    return {
      data: tiers.map((t) => ({
        id: t.id,
        type: t.type,
        name: t.name,
        description: t.description,
        monthlyPrice: Number(t.monthlyPrice),
        yearlyPrice: Number(t.yearlyPrice),
        maxFreeListings: t.maxFreeListings,
        maxTotalListings: t.maxTotalListings,
        maxImagesPerListing: t.maxImagesPerListing,
        canCreateCollections: t.canCreateCollections,
        canTrade: t.canTrade,
        isAdFree: t.isAdFree,
        featuredListingSlots: t.featuredListingSlots,
        commissionDiscount: Number(t.commissionDiscount),
        isActive: t.isActive,
        sortOrder: t.sortOrder,
        userCount: t._count.userMemberships,
        createdAt: t.createdAt,
      })),
    };
  }

  /**
   * Update membership tier
   */
  async updateMembershipTier(adminId: string, tierId: string, dto: {
    name?: string;
    description?: string;
    monthlyPrice?: number;
    yearlyPrice?: number;
    maxFreeListings?: number;
    maxTotalListings?: number;
    maxImagesPerListing?: number;
    canCreateCollections?: boolean;
    canTrade?: boolean;
    isAdFree?: boolean;
    featuredListingSlots?: number;
    commissionDiscount?: number;
    isActive?: boolean;
    sortOrder?: number;
  }) {
    const tier = await this.prisma.membershipTier.findUnique({
      where: { id: tierId },
    });

    if (!tier) {
      throw new NotFoundException('Üyelik seviyesi bulunamadı');
    }

    const oldTier = { ...tier };

    const updatedTier = await this.prisma.membershipTier.update({
      where: { id: tierId },
      data: {
        name: dto.name,
        description: dto.description,
        monthlyPrice: dto.monthlyPrice !== undefined ? dto.monthlyPrice : undefined,
        yearlyPrice: dto.yearlyPrice !== undefined ? dto.yearlyPrice : undefined,
        maxFreeListings: dto.maxFreeListings,
        maxTotalListings: dto.maxTotalListings,
        maxImagesPerListing: dto.maxImagesPerListing,
        canCreateCollections: dto.canCreateCollections,
        canTrade: dto.canTrade,
        isAdFree: dto.isAdFree,
        featuredListingSlots: dto.featuredListingSlots,
        commissionDiscount: dto.commissionDiscount !== undefined ? dto.commissionDiscount : undefined,
        isActive: dto.isActive,
        sortOrder: dto.sortOrder,
      },
    });

    // Create audit log
    await this.createAuditLog(adminId, 'membership_tier_update', 'MembershipTier', tierId, oldTier, updatedTier);

    return updatedTier;
  }

  // ==================== PRODUCT DELETION (ADMIN) ====================

  /**
   * Delete product (admin only)
   * - Cannot delete sold products
   * - Cannot delete reserved products
   * - Cannot delete products with active orders
   * - Soft delete (inactive) or hard delete based on conditions
   */
  async deleteProduct(adminId: string, productId: string, hardDelete: boolean = false) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        orders: {
          where: {
            status: {
              in: [OrderStatus.pending_payment, OrderStatus.paid, OrderStatus.preparing, OrderStatus.shipped],
            },
          },
        },
        _count: {
          select: { offers: true, orders: true },
        },
      },
    });

    if (!product) {
      throw new NotFoundException('Ürün bulunamadı');
    }

    // Check if product is sold
    if (product.status === ProductStatus.sold) {
      throw new BadRequestException('Satılmış ürünler silinemez');
    }

    // Check if product is reserved
    if (product.status === ProductStatus.reserved) {
      throw new BadRequestException('Rezerve edilmiş ürünler silinemez');
    }

    // Check if product has active orders
    if (product.orders.length > 0) {
      throw new BadRequestException('Aktif siparişi olan ürünler silinemez');
    }

    const oldProduct = { ...product };

    if (hardDelete && product._count.offers === 0 && product._count.orders === 0) {
      // Hard delete - only if no offers and no orders
      await this.prisma.product.delete({
        where: { id: productId },
      });

      // Create audit log
      await this.createAuditLog(adminId, 'product_delete_hard', 'Product', productId, oldProduct, null);

      return { success: true, productId, deleted: true };
    } else {
      // Soft delete - set to inactive
      await this.prisma.product.update({
        where: { id: productId },
        data: { status: ProductStatus.inactive },
      });

      // Create audit log
      await this.createAuditLog(adminId, 'product_delete_soft', 'Product', productId, oldProduct, {
        ...oldProduct,
        status: ProductStatus.inactive,
      });

      return { success: true, productId, deleted: false, status: 'inactive' };
    }
  }
}
