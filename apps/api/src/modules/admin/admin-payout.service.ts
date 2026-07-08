import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { AdminAuditService } from './admin-audit.service';
import {
  PayoutTransactionsQueryDto,
  PayoutExportQueryDto,
} from './dto';
import { Prisma, PaymentHoldStatus } from '@prisma/client';
import { PaymentService } from '../payment/payment.service';

/**
 * Satıcı ödemeleri (escrow özet/işlem/plan/CSV, manuel release, transfer retry) —
 * AdminService'in SELLER PAYOUTS bölümünden birebir taşındı.
 * AdminService aynı imzalarla buraya delege eder.
 */
@Injectable()
export class AdminPayoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
    private readonly paymentService: PaymentService,
  ) {}

  // ==================== SELLER PAYOUTS ====================

  /**
   * Payout summary: total pending (held), total released, counts, next release dates
   */
  async getPayoutsSummary() {
    const [heldAgg, releasedAgg, heldCount, releasedCount, nextReleases] = await Promise.all([
      this.prisma.paymentHold.aggregate({
        where: { status: PaymentHoldStatus.held },
        _sum: { amount: true },
      }),
      this.prisma.paymentHold.aggregate({
        where: { status: PaymentHoldStatus.released },
        _sum: { amount: true },
      }),
      this.prisma.paymentHold.count({ where: { status: PaymentHoldStatus.held } }),
      this.prisma.paymentHold.count({ where: { status: PaymentHoldStatus.released } }),
      this.prisma.paymentHold.findMany({
        where: { status: PaymentHoldStatus.held, releaseAt: { not: null } },
        orderBy: { releaseAt: 'asc' },
        take: 5,
        select: { id: true, orderId: true, amount: true, releaseAt: true, sellerId: true },
      }),
    ]);

    const totalPending = Number(heldAgg._sum.amount ?? 0);
    const totalReleased = Number(releasedAgg._sum.amount ?? 0);

    return {
      totalPending: Math.round(totalPending * 100) / 100,
      totalReleased: Math.round(totalReleased * 100) / 100,
      countHeld: heldCount,
      countReleased: releasedCount,
      nextReleases: nextReleases.map((r) => ({
        id: r.id,
        orderId: r.orderId,
        amount: Number(r.amount),
        releaseAt: r.releaseAt,
        sellerId: r.sellerId,
      })),
    };
  }

  /**
   * Payout transaction history (payment holds with order/seller info)
   */
  async getPayoutsTransactions(query: PayoutTransactionsQueryDto) {
    const { search, sellerId, status, dateFrom, dateTo, page = 1, limit = 20 } = query;
    const where: Prisma.PaymentHoldWhereInput = {};
    if (sellerId) where.sellerId = sellerId;
    if (status) where.status = status as PaymentHoldStatus;
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }
    if (search) {
      const searchOr: Prisma.PaymentHoldWhereInput[] = [
        {
          seller: {
            OR: [
              { displayName: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          },
        },
      ];
      const matchingOrders = await this.prisma.order.findMany({
        where: { orderNumber: { contains: search, mode: 'insensitive' } },
        select: { id: true },
      });
      if (matchingOrders.length > 0) {
        searchOr.push({ orderId: { in: matchingOrders.map((o) => o.id) } });
      }
      where.OR = searchOr;
    }

    const [total, holds] = await Promise.all([
      this.prisma.paymentHold.count({ where }),
      this.prisma.paymentHold.findMany({
        where,
        include: {
          payment: { select: { id: true, paidAt: true } },
          seller: { select: { id: true, displayName: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const orders = await this.prisma.order.findMany({
      where: { id: { in: holds.map((h) => h.orderId) } },
      select: { id: true, orderNumber: true },
    });
    const orderMap = new Map(orders.map((o) => [o.id, o]));

    return {
      data: holds.map((h) => ({
        id: h.id,
        orderId: h.orderId,
        orderNumber: orderMap.get(h.orderId)?.orderNumber ?? '-',
        sellerId: h.sellerId,
        sellerName: h.seller.displayName ?? h.seller.email,
        sellerEmail: h.seller.email,
        amount: Number(h.amount),
        status: h.status,
        releaseAt: h.releaseAt,
        releasedAt: h.releasedAt,
        paidAt: h.payment?.paidAt,
        createdAt: h.createdAt,
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
   * Payout schedule: holds with status=held, ordered by releaseAt (upcoming releases)
   */
  async getPayoutsSchedule(query: { sellerId?: string; limit?: number }) {
    const { sellerId, limit = 50 } = query;
    const where: Prisma.PaymentHoldWhereInput = { status: PaymentHoldStatus.held };
    if (sellerId) where.sellerId = sellerId;

    const holds = await this.prisma.paymentHold.findMany({
      where,
      include: {
        seller: { select: { id: true, displayName: true, email: true } },
      },
      orderBy: { releaseAt: 'asc' },
      take: limit,
    });

    const orders = await this.prisma.order.findMany({
      where: { id: { in: holds.map((h) => h.orderId) } },
      select: { id: true, orderNumber: true },
    });
    const orderMap = new Map(orders.map((o) => [o.id, o]));

    return {
      data: holds.map((h) => ({
        id: h.id,
        orderId: h.orderId,
        orderNumber: orderMap.get(h.orderId)?.orderNumber ?? '-',
        sellerId: h.sellerId,
        sellerName: h.seller.displayName ?? h.seller.email,
        amount: Number(h.amount),
        releaseAt: h.releaseAt,
        createdAt: h.createdAt,
      })),
    };
  }

  /**
   * Export payout transactions as CSV
   */
  async getPayoutsExport(query: PayoutExportQueryDto) {
    const { sellerId, status, dateFrom, dateTo } = query;
    const where: Prisma.PaymentHoldWhereInput = {};
    if (sellerId) where.sellerId = sellerId;
    if (status) where.status = status as PaymentHoldStatus;
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }

    const holds = await this.prisma.paymentHold.findMany({
      where,
      include: {
        seller: { select: { displayName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });

    const orders = await this.prisma.order.findMany({
      where: { id: { in: holds.map((h) => h.orderId) } },
      select: { id: true, orderNumber: true },
    });
    const orderMap = new Map(orders.map((o) => [o.id, o]));

    const headers = ['id', 'orderId', 'orderNumber', 'sellerId', 'sellerName', 'sellerEmail', 'amount', 'status', 'releaseAt', 'releasedAt', 'createdAt'];
    const rows = holds.map((h) =>
      [
        h.id,
        h.orderId,
        orderMap.get(h.orderId)?.orderNumber ?? '',
        h.sellerId,
        h.seller.displayName ?? h.seller.email ?? '',
        h.seller.email ?? '',
        Number(h.amount),
        h.status,
        h.releaseAt ? new Date(h.releaseAt).toISOString() : '',
        h.releasedAt ? new Date(h.releasedAt).toISOString() : '',
        new Date(h.createdAt).toISOString(),
      ].map((c) => (typeof c === 'string' && c.includes(',') ? `"${c.replace(/"/g, '""')}"` : c)).join(','),
    );
    const csv = [headers.join(','), ...rows].join('\n');
    return { csv, filename: `payouts-${new Date().toISOString().slice(0, 10)}.csv` };
  }

  /**
   * Release payment hold to seller (admin manual release)
   */
  async releasePayout(adminId: string, orderId: string, reason?: string) {
    // Y13: Escrow→satıcı release'i geri DÖNÜLEMEZ. Sebep zorunlu kılınarak kazara/
    // gerekçesiz tetikleme engellenir ve audit izine sebep yazılır.
    if (!reason || !reason.trim()) {
      throw new BadRequestException('Escrow serbest bırakma için sebep (reason) zorunludur');
    }
    await this.paymentService.releasePayment(orderId);
    await this.audit.createAuditLog(adminId, 'payout_release', 'PaymentHold', orderId, { action: 'release', reason: reason.trim() }, { releasedAt: new Date() });
    return { success: true, orderId, message: 'Ödeme satıcıya serbest bırakıldı' };
  }

  /**
   * Release trade cash payment hold (admin manual release for trade escrow)
   */
  async releaseTradePaymentHold(adminId: string, tradeId: string) {
    const tcp = await this.prisma.tradeCashPayment.findUnique({ where: { tradeId } });
    if (!tcp) throw new NotFoundException('Trade cash payment bulunamadı');
    if (tcp.releasedAt) return { success: true, message: 'Zaten serbest bırakılmış' };
    if (tcp.refundedAt) throw new BadRequestException('İade edilmiş ödeme serbest bırakılamaz');

    await this.prisma.tradeCashPayment.update({
      where: { tradeId },
      data: { releasedAt: new Date() },
    });
    await this.audit.createAuditLog(adminId, 'trade_cash_hold_release', 'TradeCashPayment', tcp.id, { action: 'manual_release' }, { releasedAt: new Date() });
    return { success: true, tradeId, message: 'Takas nakit ödemesi serbest bırakıldı' };
  }

  /**
   * Retry a failed payout transfer
   */
  async retryPayoutTransfer(adminId: string, transferId: string) {
    const transfer = await this.prisma.payoutTransfer.findUnique({ where: { id: transferId } });
    if (!transfer) throw new NotFoundException('Payout transfer bulunamadı');
    if (!['failed', 'returned'].includes(transfer.status)) {
      throw new BadRequestException(`Transfer durumu '${transfer.status}' tekrar denenebilir değil`);
    }

    // Y10: 'returned' transfer ZATEN PayTR'de işlenip geri döndü → aynı transId ile yeniden
    // göndermek PayTR idempotency'sine takılabilir. Bu yüzden returned retry'da YENİ transId
    // üret (taze transfer). 'failed' (hiç işlenmedi) ise mevcut transId korunur. Geri dönüş
    // çoğunlukla IBAN sorunundandır; satıcı IBAN'ı düzeltince cron işleme anında GÜNCEL
    // IBAN'ı okur (Y5) ve doğru hesaba gönderir.
    const isReturned = transfer.status === 'returned';
    const newTransId = isReturned
      ? `ORD${transfer.id.replace(/-/g, '').slice(0, 16)}R${Date.now()}`
      : undefined;
    await this.prisma.payoutTransfer.update({
      where: { id: transferId },
      data: {
        status: 'pending',
        failureReason: null,
        retryCount: 0,
        nextRetryAt: null,
        ...(newTransId ? { transId: newTransId } : {}),
      },
    });
    await this.audit.createAuditLog(adminId, 'payout_retry', 'PayoutTransfer', transferId, { action: 'admin_retry', wasReturned: isReturned }, { status: 'pending' });
    return { success: true, transferId, message: 'Transfer tekrar denenmek üzere sıraya alındı' };
  }

  /**
   * Get failed/returned payout transfers
   */
  async getFailedPayouts(page = 1, limit = 20) {
    const where = { status: { in: ['failed' as const, 'returned' as const] } };
    const [items, total] = await Promise.all([
      this.prisma.payoutTransfer.findMany({
        where,
        include: { seller: { select: { id: true, displayName: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.payoutTransfer.count({ where }),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}
