import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { AdminAuditService } from './admin-audit.service';
import {
  fulltextUserSearch,
  fulltextPaymentSearch,
  fulltextOrderSearch,
} from '../../common/helpers/fulltext-search';
import {
  AdminPaymentQueryDto,
  PaymentStatisticsQueryDto,
} from './dto';
import { Prisma, PaymentStatus } from '@prisma/client';
import { PaymentService } from '../payment/payment.service';

/**
 * Ödeme yönetimi (liste, detay, istatistik, manuel iade, zorla iptal) —
 * AdminService'in PAYMENT MANAGEMENT bölümünden birebir taşındı.
 * AdminService aynı imzalarla buraya delege eder.
 */
@Injectable()
export class AdminPaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
    private readonly paymentService: PaymentService,
  ) {}

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
      const [paymentIds, orderIds] = await Promise.all([
        fulltextPaymentSearch(this.prisma, query.search),
        fulltextOrderSearch(this.prisma, query.search),
      ]);
      const conditions: Prisma.PaymentWhereInput[] = [];
      if (paymentIds.length > 0) conditions.push({ id: { in: paymentIds } });
      if (orderIds.length > 0) conditions.push({ orderId: { in: orderIds } });
      if (conditions.length === 0) {
        return { data: [], total: 0, page, limit, totalPages: 0 };
      }
      where.OR = conditions;
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
      // Payment.order nullable: checkoutGroup / tradeCashPayment tipindeki
      // ödemelerde order=null olabilir. Null-safe erişim — aksi halde TÜM liste
      // TypeError ile 500 döner.
      data: payments.map((p) => ({
        id: p.id,
        orderId: p.orderId,
        orderNumber: p.order?.orderNumber ?? null,
        amount: Number(p.amount),
        currency: p.currency,
        provider: p.provider,
        status: p.status,
        failureReason: p.failureReason,
        providerPaymentId: p.providerPaymentId,
        providerConversationId: p.providerConversationId,
        buyer: p.order?.buyer ?? null,
        seller: p.order?.seller ?? null,
        product: p.order?.product ?? null,
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
        paymentHolds: true,
      },
    });

    if (!payment) {
      throw new NotFoundException('Ödeme bulunamadı');
    }

    // Payment.order nullable: checkoutGroup / tradeCashPayment tipindeki
    // ödemelerde order=null olabilir. Null-safe erişim — aksi halde 500.
    return {
      id: payment.id,
      orderId: payment.orderId,
      orderNumber: payment.order?.orderNumber ?? null,
      amount: Number(payment.amount),
      currency: payment.currency,
      provider: payment.provider,
      status: payment.status,
      failureReason: payment.failureReason,
      providerPaymentId: payment.providerPaymentId,
      providerConversationId: payment.providerConversationId,
      metadata: payment.metadata,
      order: payment.order
        ? {
            id: payment.order.id,
            orderNumber: payment.order.orderNumber,
            status: payment.order.status,
            totalAmount: Number(payment.order.totalAmount),
            commissionAmount: Number(payment.order.commissionAmount),
            buyer: payment.order.buyer,
            seller: payment.order.seller,
            product: payment.order.product,
            shippingAddress: payment.order.shippingAddress,
          }
        : null,
      paymentHold: payment.paymentHolds[0] ? {
        id: payment.paymentHolds[0].id,
        amount: Number(payment.paymentHolds[0].amount),
        status: payment.paymentHolds[0].status,
        releaseAt: payment.paymentHolds[0].releaseAt,
        releasedAt: payment.paymentHolds[0].releasedAt,
      } : null,
      paymentHolds: payment.paymentHolds.map((hold) => ({
        id: hold.id,
        orderId: hold.orderId,
        sellerId: hold.sellerId,
        amount: Number(hold.amount),
        status: hold.status,
        releaseAt: hold.releaseAt,
        releasedAt: hold.releasedAt,
      })),
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
      const [paymentIds, orderIds] = await Promise.all([
        fulltextPaymentSearch(this.prisma, query.search),
        fulltextOrderSearch(this.prisma, query.search),
      ]);
      const conditions: Prisma.PaymentWhereInput[] = [];
      if (paymentIds.length > 0) conditions.push({ id: { in: paymentIds } });
      if (orderIds.length > 0) conditions.push({ orderId: { in: orderIds } });
      if (conditions.length === 0) {
        return { data: [], total: 0, page, limit, totalPages: 0 };
      }
      where.OR = conditions;
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
    await this.audit.createAuditLog(
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
   * Get refund history (refunded payments with pagination)
   */
  async getRefundHistory(query: {
    search?: string;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
  }) {
    const { search, startDate, endDate, page = 1, limit = 20 } = query;

    const where: Prisma.PaymentWhereInput = {
      status: PaymentStatus.refunded,
    };

    if (search) {
      const userIds = await fulltextUserSearch(this.prisma, search);
      const conditions: Prisma.PaymentWhereInput[] = [];
      if (userIds.length > 0) conditions.push({ order: { buyerId: { in: userIds } } });
      if (search.length >= 3) conditions.push({ id: { startsWith: search } });
      if (conditions.length === 0) {
        return { data: [], total: 0, page, limit, totalPages: 0 };
      }
      where.OR = conditions;
    }

    if (startDate || endDate) {
      where.updatedAt = {};
      if (startDate) where.updatedAt.gte = startDate;
      if (endDate) where.updatedAt.lte = endDate;
    }

    const [total, payments] = await Promise.all([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({
        where,
        include: {
          order: {
            include: {
              buyer: { select: { id: true, displayName: true, email: true } },
              seller: { select: { id: true, displayName: true, email: true } },
              product: { select: { id: true, title: true } },
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: payments.map(p => ({
        id: p.id,
        amount: Number(p.amount),
        status: p.status,
        refundedAt: p.updatedAt,
        order: p.order ? {

          id: p.order.id,
          buyer: p.order.buyer,
          seller: p.order.seller,
          product: p.order.product,
        } : null,
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
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
    await this.audit.createAuditLog(
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
}
