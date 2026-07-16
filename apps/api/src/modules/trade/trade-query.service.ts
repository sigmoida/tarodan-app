import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { TradeStatus, Prisma } from '@prisma/client';
import { TradeCommonService } from './trade-common.service';
import { i18nMessage } from '../i18n';
import {
  TradeQueryDto,
  TradeResponseDto,
  TradeListResponseDto,
} from './dto';

// Depo-escrow akışındaki "Kargoda" statüleri — trades 'shipping' liste filtresi ve
// status-counts.shipping tek kaynaktan bunu kullanır (mobil SHIPPING_STATUSES ile birebir).
const SHIPPING_TRADE_STATUSES: TradeStatus[] = [
  TradeStatus.shipping_to_warehouse,
  TradeStatus.at_warehouse,
  TradeStatus.admin_reviewing,
  TradeStatus.shipping_to_recipients,
];

/**
 * Takas sorgu/listeleme metodları — TradeService'ten birebir taşındı
 * (facade-delege deseni; order split'teki OrderQueryService ile aynı düzen).
 */
@Injectable()
export class TradeQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tradeCommon: TradeCommonService,
  ) {}

  // ==========================================================================
  // GET TRADE BY ID
  // ==========================================================================
  async getTradeById(tradeId: string, userId: string): Promise<TradeResponseDto> {
    const trade = await this.prisma.trade.findUnique({
      where: { id: tradeId },
      include: {
        initiator: { select: { id: true, displayName: true } },
        receiver: { select: { id: true, displayName: true } },
        items: {
          include: {
            product: {
              select: { id: true, title: true, images: { orderBy: { sortOrder: 'asc' }, take: 1 } },
            },
          },
        },
        shipments: true,
        cashPayment: true,
        dispute: true,
      },
    });

    if (!trade) {
      throw new NotFoundException(i18nMessage('server.trade.notFound'));
    }

    // Only participants can view trade details
    if (trade.initiatorId !== userId && trade.receiverId !== userId) {
      throw new ForbiddenException(i18nMessage('server.trade.notAuthorizedToView'));
    }

    return await this.tradeCommon.mapToResponseDto(trade, userId);
  }

  // ==========================================================================
  // PENDING COUNT FOR BADGE
  // ==========================================================================
  async getPendingCount(userId: string) {
    const [received, sent] = await Promise.all([
      this.prisma.trade.count({
        where: {
          receiverId: userId,
          status: TradeStatus.pending,
        },
      }),
      this.prisma.trade.count({
        where: {
          initiatorId: userId,
          status: TradeStatus.pending,
        },
      }),
    ]);

    return {
      received,
      sent,
      total: received + sent,
    };
  }

  // ==========================================================================
  // LIST USER TRADES
  // ==========================================================================
  async listUserTrades(
    userId: string,
    query: TradeQueryDto,
  ): Promise<TradeListResponseDto> {
    const { status, statusGroup, role, page = 1, pageSize = 20, sortBy = 'createdAt', sortOrder = 'desc' } = query;

    const where: Prisma.TradeWhereInput = {};

    // Filter by role
    if (role === 'initiator') {
      where.initiatorId = userId;
    } else if (role === 'receiver') {
      where.receiverId = userId;
    } else {
      where.OR = [{ initiatorId: userId }, { receiverId: userId }];
    }

    // Filter by status. statusGroup ('shipping') çoklu-statü → tek enum'dan önceliklidir.
    // Sunucu tarafı filtre: 'Kargoda' artık 20'lik sayfaya takılmadan tüm eşleşenleri döndürür.
    if (statusGroup === 'shipping') {
      where.status = { in: SHIPPING_TRADE_STATUSES };
    } else if (status) {
      where.status = status;
    }

    const [trades, total] = await Promise.all([
      this.prisma.trade.findMany({
        where,
        include: {
          initiator: { select: { id: true, displayName: true } },
          receiver: { select: { id: true, displayName: true } },
        items: {
          include: {
            product: {
              select: { id: true, title: true, images: { orderBy: { sortOrder: 'asc' }, take: 1 } },
            },
          },
        },
        shipments: true,
        cashPayment: true,
        dispute: true,
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.trade.count({ where }),
    ]);

    return {
      trades: await Promise.all(trades.map((t) => this.tradeCommon.mapToResponseDto(t, userId))),
      total,
      page,
      pageSize,
    };
  }

  /**
   * Trades sekmesi sayaçları — filtreden ve sayfalamadan bağımsız tek groupBy.
   * all = profil "Takaslar" tile'ı ile birebir (OR initiator/receiver, statü filtresiz).
   */
  async getTradeStatusCounts(
    userId: string,
  ): Promise<{ all: number; pending: number; shipping: number; completed: number }> {
    const rows = await this.prisma.trade.groupBy({
      by: ['status'],
      where: { OR: [{ initiatorId: userId }, { receiverId: userId }] },
      _count: { _all: true },
    });
    const by = new Map<TradeStatus, number>(
      rows.map((r) => [r.status, r._count._all]),
    );
    const all = rows.reduce((n, r) => n + r._count._all, 0);
    const shipping = SHIPPING_TRADE_STATUSES.reduce((n, s) => n + (by.get(s) ?? 0), 0);
    return {
      all,
      pending: by.get(TradeStatus.pending) ?? 0,
      shipping,
      completed: by.get(TradeStatus.completed) ?? 0,
    };
  }
}
