import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  Optional,
  Inject,
  forwardRef,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { CacheService } from '../cache/cache.service';
import { MembershipService } from '../membership/membership.service';
import { StorageService } from '../storage/storage.service';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../notification/dto';
import { EventService } from '../events';
import {
  TradeStatus,
  ProductStatus,
  ShipmentStatus,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { getAvailableQuantity, safeDecrementReserved } from '../product/helpers/product-availability.helper';
import { getProductStatusFromQuantity } from '../product/helpers/product-status.helper';
import { PaymentService } from '../payment/payment.service';
import { ProductLockService } from '../product/product-lock.service';
import {
  CreateTradeDto,
  TradeQueryDto,
  AcceptTradeDto,
  RejectTradeDto,
  CounterTradeDto,
  CancelTradeDto,
  ShipTradeDto,
  ConfirmTradeReceiptDto,
  RaiseTradeDisputeDto,
  ResolveTradeDisputeDto,
  TradeResponseDto,
  TradeListResponseDto,
} from './dto';

@Injectable()
export class TradeService {
  private readonly logger = new Logger(TradeService.name);
  
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly membershipService: MembershipService,
    @Inject(forwardRef(() => NotificationService))
    private readonly notificationService: NotificationService,
    private readonly paymentService: PaymentService,
    private readonly productLockService: ProductLockService,
    @Optional()
    private readonly storageService: StorageService,
    @Optional()
    private readonly eventService: EventService,
  ) {}

  // ==========================================================================
  // TRADE STATE MACHINE
  // Valid transitions as per SYSTEM_OPERATIONS_GUIDE.md
  // ==========================================================================
  private readonly validTransitions: Record<TradeStatus, TradeStatus[]> = {
    [TradeStatus.pending]: [
      TradeStatus.accepted,
      TradeStatus.awaiting_payment,
      TradeStatus.shipping_to_warehouse,
      TradeStatus.rejected,
      TradeStatus.cancelled,
    ],
    // Legacy accepted state (peer-to-peer flow) — kept for backwards compat
    [TradeStatus.accepted]: [
      TradeStatus.initiator_shipped,
      TradeStatus.receiver_shipped,
      TradeStatus.awaiting_payment,
      TradeStatus.shipping_to_warehouse,
      TradeStatus.cancelled,
    ],
    [TradeStatus.rejected]: [], // Terminal state
    // Legacy peer-to-peer shipping states
    [TradeStatus.initiator_shipped]: [
      TradeStatus.both_shipped,
      TradeStatus.cancelled,
    ],
    [TradeStatus.receiver_shipped]: [
      TradeStatus.both_shipped,
      TradeStatus.cancelled,
    ],
    [TradeStatus.both_shipped]: [
      TradeStatus.initiator_received,
      TradeStatus.receiver_received,
      TradeStatus.disputed,
    ],
    [TradeStatus.initiator_received]: [
      TradeStatus.completed,
      TradeStatus.disputed,
    ],
    [TradeStatus.receiver_received]: [
      TradeStatus.completed,
      TradeStatus.disputed,
    ],
    // New escrow flow states
    [TradeStatus.awaiting_payment]: [
      TradeStatus.shipping_to_warehouse,
      TradeStatus.cancelled,
    ],
    [TradeStatus.shipping_to_warehouse]: [
      TradeStatus.at_warehouse,
      TradeStatus.cancelled,
      TradeStatus.returning,
    ],
    [TradeStatus.at_warehouse]: [
      TradeStatus.admin_reviewing,
      TradeStatus.shipping_to_recipients,
      TradeStatus.returning,
      TradeStatus.cancelled,
    ],
    [TradeStatus.admin_reviewing]: [
      TradeStatus.shipping_to_recipients,
      TradeStatus.returning,
    ],
    [TradeStatus.shipping_to_recipients]: [
      TradeStatus.completed,
      TradeStatus.disputed,
    ],
    [TradeStatus.returning]: [
      TradeStatus.cancelled,
    ],
    [TradeStatus.completed]: [], // Terminal state
    [TradeStatus.cancelled]: [], // Terminal state
    [TradeStatus.disputed]: [
      TradeStatus.completed,
      TradeStatus.cancelled,
    ],
  };

  private canTransition(from: TradeStatus, to: TradeStatus): boolean {
    return this.validTransitions[from]?.includes(to) ?? false;
  }

  // ==========================================================================
  // TRADE NUMBER GENERATION
  // ==========================================================================
  private generateTradeNumber(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `TRD-${timestamp}-${random}`;
  }

  // ==========================================================================
  // CREATE TRADE
  // ==========================================================================
  async createTrade(
    initiatorId: string,
    dto: CreateTradeDto,
  ): Promise<TradeResponseDto> {
    // Validate receiver exists and is not self
    if (initiatorId === dto.receiverId) {
      throw new BadRequestException('Kendinizle takas yapamazsınız');
    }

    const receiver = await this.prisma.user.findUnique({
      where: { id: dto.receiverId },
    });

    if (!receiver) {
      throw new NotFoundException('Alıcı kullanıcı bulunamadı');
    }

    const initiatorCanTrade = await this.membershipService.canCreateTrade(initiatorId);
    if (!initiatorCanTrade.allowed) {
      this.logger.warn('Trade create failed: initiator cannot trade');
      throw new BadRequestException(initiatorCanTrade.reason);
    }

    // Validate initiator owns the products (no isTradeEnabled check - user can offer any of their own items)
    const initiatorProducts = await this.prisma.product.findMany({
      where: {
        id: { in: dto.initiatorItems.map((i) => i.productId) },
        sellerId: initiatorId,
        status: ProductStatus.active,
      },
    });

    if (initiatorProducts.length !== dto.initiatorItems.length) {
      throw new BadRequestException(
        'Bazı ürünler size ait değil veya aktif değil',
      );
    }

    // Validate receiver's requested products
    const receiverProducts = await this.prisma.product.findMany({
      where: {
        id: { in: dto.receiverItems.map((i) => i.productId) },
        sellerId: dto.receiverId,
        status: ProductStatus.active,
        isTradeEnabled: true,
      },
    });

    if (receiverProducts.length !== dto.receiverItems.length) {
      throw new BadRequestException(
        'Talep edilen bazı ürünler takasa uygun değil',
      );
    }

    // Only check initiator's offered products — same product can't be offered in multiple active trades.
    // Receiver's product can be the target of multiple offers; the receiver chooses which to accept.
    const initiatorProductIds = dto.initiatorItems.map((i) => i.productId);
    const activeStatuses = [
      TradeStatus.pending,
      TradeStatus.accepted,
      TradeStatus.initiator_shipped,
      TradeStatus.receiver_shipped,
      TradeStatus.both_shipped,
      TradeStatus.initiator_received,
      TradeStatus.receiver_received,
    ];
    if (initiatorProductIds.length > 0) {
      const existingTradeItems = await this.prisma.tradeItem.findMany({
        where: {
          productId: { in: initiatorProductIds },
          side: 'initiator',
          trade: { status: { in: activeStatuses } },
        },
      });
      if (existingTradeItems.length > 0) {
        throw new BadRequestException(
          'Teklif ettiğiniz ürünlerden biri zaten aktif bir takas teklifinde. Önce mevcut takası iptal edin veya sonuçlanmasını bekleyin.',
        );
      }
    }

    // Validate stock: müsait adet (available) >= item.quantity
    const allProducts = [...initiatorProducts, ...receiverProducts];
    const allItems = [...dto.initiatorItems, ...dto.receiverItems];
    for (const item of allItems) {
      const product = allProducts.find((p) => p.id === item.productId);
      if (product) {
        const available = getAvailableQuantity(product);
        if (available !== null && available < item.quantity) {
          throw new BadRequestException(
            `"${product.title}" için yeterli müsait stok yok (müsait: ${available}, talep: ${item.quantity})`,
          );
        }
      }
    }

    // Get trade deadlines from platform settings
    const responseHoursSetting = await this.prisma.platformSetting.findUnique({
      where: { settingKey: 'trade_response_deadline_hours' },
    });
    const responseHours = parseInt(responseHoursSetting?.settingValue ?? '72');

    const responseDeadline = new Date();
    responseDeadline.setHours(responseDeadline.getHours() + responseHours);

    // Calculate cash payer if there's a cash component
    let cashPayerId: string | null = null;
    if (dto.cashAmount && dto.cashAmount !== 0) {
      // Positive = initiator pays, negative = receiver pays
      cashPayerId = dto.cashAmount > 0 ? initiatorId : dto.receiverId;
    }

    // Create trade in transaction
    const trade = await this.prisma.$transaction(async (tx) => {
      // CRITICAL: Don't reserve products when trade is pending
      // Products should remain active and available for purchase
      // Only reserve when trade is accepted
      // Products will be marked as inactive/sold when trade is completed or product is purchased

      // Create trade
      const newTrade = await tx.trade.create({
        data: {
          tradeNumber: this.generateTradeNumber(),
          initiatorId,
          receiverId: dto.receiverId,
          status: TradeStatus.pending,
          cashAmount: dto.cashAmount ? Math.abs(dto.cashAmount) : null,
          cashPayerId,
          initiatorMessage: dto.message,
          responseDeadline,
        },
        include: {
          initiator: { select: { id: true, displayName: true } },
          receiver: { select: { id: true, displayName: true } },
        },
      });

      // Create trade items for initiator
      await tx.tradeItem.createMany({
        data: dto.initiatorItems.map((item) => ({
          tradeId: newTrade.id,
          productId: item.productId,
          side: 'initiator',
          quantity: item.quantity,
          valueAtTrade:
            initiatorProducts.find((p) => p.id === item.productId)?.price ?? 0,
        })),
      });

      // Create trade items for receiver (what initiator wants)
      await tx.tradeItem.createMany({
        data: dto.receiverItems.map((item) => ({
          tradeId: newTrade.id,
          productId: item.productId,
          side: 'receiver',
          quantity: item.quantity,
          valueAtTrade:
            receiverProducts.find((p) => p.id === item.productId)?.price ?? 0,
        })),
      });

      return newTrade;
    });

    // Send notification to receiver about new trade offer
    try {
      const initiator = await this.prisma.user.findUnique({
        where: { id: initiatorId },
        select: { displayName: true },
      });
      
      await this.notificationService.createInAppNotification(
        dto.receiverId,
        NotificationType.TRADE_RECEIVED,
        {
          tradeId: trade.id,
          initiatorName: initiator?.displayName || 'Bir kullanıcı',
        },
      );
    } catch (error) {
      this.logger.warn('Failed to send trade notification');
    }

    return this.getTradeById(trade.id, initiatorId);
  }

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
      throw new NotFoundException('Takas bulunamadı');
    }

    // Only participants can view trade details
    if (trade.initiatorId !== userId && trade.receiverId !== userId) {
      throw new ForbiddenException('Bu takası görüntüleme yetkiniz yok');
    }

    return await this.mapToResponseDto(trade);
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
    const { status, role, page = 1, pageSize = 20, sortBy = 'createdAt', sortOrder = 'desc' } = query;

    const where: Prisma.TradeWhereInput = {};

    // Filter by role
    if (role === 'initiator') {
      where.initiatorId = userId;
    } else if (role === 'receiver') {
      where.receiverId = userId;
    } else {
      where.OR = [{ initiatorId: userId }, { receiverId: userId }];
    }

    // Filter by status
    if (status) {
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
      trades: await Promise.all(trades.map((t) => this.mapToResponseDto(t))),
      total,
      page,
      pageSize,
    };
  }

  // ==========================================================================
  // ACCEPT TRADE
  // ==========================================================================
  async acceptTrade(
    tradeId: string,
    userId: string,
    dto: AcceptTradeDto,
  ): Promise<TradeResponseDto> {
    // Validate receiver membership before opening the transaction
    const receiverCanTrade = await this.membershipService.canCreateTrade(userId);
    if (!receiverCanTrade.allowed) {
      throw new BadRequestException(
        'Üyeliğinizin süresi dolmuş görünüyor. Trade kabul etmek için Temel veya üstü üyeliğinizi yenileyin.',
      );
    }

    // Get deadline settings (read-only, safe outside tx)
    const paymentHoursSetting = await this.prisma.platformSetting.findUnique({
      where: { settingKey: 'trade_payment_deadline_hours' },
    });
    const shippingDaysSetting = await this.prisma.platformSetting.findUnique({
      where: { settingKey: 'trade_shipping_deadline_days' },
    });

    const paymentHours = parseInt(paymentHoursSetting?.settingValue ?? '48');
    const shippingDays = parseInt(shippingDaysSetting?.settingValue ?? '7');

    let tradeInitiatorId: string;

    await this.prisma.$transaction(async (tx) => {
      // Lock trade row first
      const trade = await this.getTradeWithLock(tradeId, tx);

      if (trade.receiverId !== userId) {
        throw new ForbiddenException('Sadece takas alıcısı kabul edebilir');
      }

      if (!this.canTransition(trade.status, TradeStatus.accepted)) {
        throw new BadRequestException(
          `Takas durumu '${trade.status}' kabul edilemez`,
        );
      }

      if (new Date() > trade.responseDeadline) {
        throw new BadRequestException('Yanıt süresi dolmuş');
      }

      tradeInitiatorId = trade.initiatorId;

      const now = new Date();
      const paymentDeadline = new Date(now);
      paymentDeadline.setHours(paymentDeadline.getHours() + paymentHours);
      const shippingDeadline = new Date(now);
      shippingDeadline.setDate(shippingDeadline.getDate() + shippingDays);

      const tradeItems = await tx.tradeItem.findMany({
        where: { tradeId },
      });

      // Lock every product row involved and verify availability
      const byProduct = new Map<string, number>();
      for (const item of tradeItems) {
        byProduct.set(item.productId, (byProduct.get(item.productId) ?? 0) + item.quantity);
      }

      // Takas kabul: her iki taraf için reservedQuantity++ (FOR UPDATE pessimistic lock)
      for (const [productId, qty] of byProduct) {
        await this.productLockService.checkAndReserve(tx, productId, qty);
      }

      // Safe-trade stock cascade: if this trade depleted the last available
      // unit, cancel OTHER pending offers, trades, and pending_payment orders.
      for (const productId of byProduct.keys()) {
        const product = await tx.product.findUnique({
          where: { id: productId },
          select: { quantity: true, reservedQuantity: true },
        });
        if (!product || product.quantity === null) continue;
        const available =
          (product.quantity ?? 0) - (product.reservedQuantity ?? 0);
        if (available <= 0) {
          const reason = 'Stok takas icin ayrildi';
          await this.productLockService.invalidateRelatedOffers(
            tx,
            productId,
          );
          await this.productLockService.invalidateRelatedTrades(
            tx,
            productId,
            tradeId, // exclude the current trade
          );
          await this.productLockService.invalidatePendingOrdersForProduct(
            tx,
            productId,
            reason,
          );
        }
      }

      // Safe-trade status routing:
      //   - cash trade  -> awaiting_payment (cash must be paid before shipping)
      //   - non-cash    -> shipping_to_warehouse (both ship to Tarodan warehouse)
      const nextStatus = trade.cashPayerId && trade.cashAmount
        ? TradeStatus.awaiting_payment
        : TradeStatus.shipping_to_warehouse;

      await tx.trade.update({
        where: { id: tradeId, version: trade.version },
        data: {
          status: nextStatus,
          receiverMessage: dto.message,
          acceptedAt: now,
          paymentDeadline: trade.cashPayerId ? paymentDeadline : null,
          // shippingDeadline only set when shipping begins (either immediately
          // for non-cash, or after successful payment for cash trades)
          shippingDeadline:
            nextStatus === TradeStatus.shipping_to_warehouse
              ? shippingDeadline
              : null,
          version: { increment: 1 },
        },
      });

      if (trade.cashAmount && trade.cashPayerId) {
        const commission = trade.cashAmount.toNumber() * 0.05;
        await tx.tradeCashPayment.create({
          data: {
            tradeId,
            payerId: trade.cashPayerId,
            recipientId:
              trade.cashPayerId === trade.initiatorId
                ? trade.receiverId
                : trade.initiatorId,
            amount: trade.cashAmount,
            commission,
            totalAmount: trade.cashAmount.toNumber() + commission,
            provider: 'pending',
            status: PaymentStatus.pending,
          },
        });
      }
    });

    await this.invalidateProductCachesForTrade(tradeId);

    try {
      await this.notificationService.createInAppNotification(
        tradeInitiatorId!,
        NotificationType.TRADE_ACCEPTED,
        { tradeId },
      );
    } catch (error) {
      this.logger.warn('Failed to send trade accepted notification');
    }

    return this.getTradeById(tradeId, userId);
  }

  // ==========================================================================
  // REJECT TRADE
  // ==========================================================================
  async rejectTrade(
    tradeId: string,
    userId: string,
    dto: RejectTradeDto,
  ): Promise<TradeResponseDto> {
    let tradeInitiatorId: string;

    await this.prisma.$transaction(async (tx) => {
      const trade = await this.getTradeWithLock(tradeId, tx);

      if (trade.receiverId !== userId) {
        throw new ForbiddenException('Sadece takas alıcısı reddedebilir');
      }

      if (!this.canTransition(trade.status, TradeStatus.rejected)) {
        throw new BadRequestException(
          `Takas durumu '${trade.status}' reddedilemez`,
        );
      }

      tradeInitiatorId = trade.initiatorId;

      // Restore stock only if trade was accepted (pending trades have none decremented)
      if (trade.status === TradeStatus.accepted) {
        const allItems = await tx.tradeItem.findMany({ where: { tradeId } });
        if (allItems.length > 0) {
          const byProduct = new Map<string, number>();
          for (const item of allItems) {
            byProduct.set(item.productId, (byProduct.get(item.productId) ?? 0) + item.quantity);
          }
          for (const [productId, qty] of byProduct) {
            const prod = await tx.product.findUnique({
              where: { id: productId },
              select: { reservedQuantity: true },
            });
            if (prod) {
              const newReserved = safeDecrementReserved(prod.reservedQuantity, qty);
              await tx.product.update({
                where: { id: productId },
                data: { reservedQuantity: newReserved, status: ProductStatus.active },
              });
            }
          }
        }
      }

      await tx.trade.update({
        where: { id: tradeId, version: trade.version },
        data: {
          status: TradeStatus.rejected,
          cancelReason: dto.reason,
          cancelledAt: new Date(),
          version: { increment: 1 },
        },
      });
    });

    await this.invalidateProductCachesForTrade(tradeId);

    try {
      await this.notificationService.createInAppNotification(
        tradeInitiatorId!,
        NotificationType.TRADE_REJECTED,
        { tradeId },
      );
    } catch (error) {
      this.logger.warn('Failed to send trade rejected notification');
    }

    return this.getTradeById(tradeId, userId);
  }

  // ==========================================================================
  // COUNTER TRADE OFFER
  // ==========================================================================
  async counterTrade(
    tradeId: string,
    userId: string,
    dto: CounterTradeDto,
  ): Promise<TradeResponseDto> {
    const trade = await this.prisma.trade.findUnique({
      where: { id: tradeId },
      include: {
        items: true,
      },
    });

    if (!trade) {
      throw new NotFoundException('Takas bulunamadı');
    }

    // Store version for optimistic locking
    const tradeVersion = trade.version;

    if (!trade) {
      throw new NotFoundException('Takas bulunamadı');
    }

    // Only receiver can send counter-offer
    if (trade.receiverId !== userId) {
      throw new ForbiddenException('Sadece takas alıcısı karşı teklif gönderebilir');
    }

    // Trade must be in pending status
    if (trade.status !== TradeStatus.pending) {
      throw new BadRequestException(
        `Takas durumu '${trade.status}' karşı teklif gönderilemez`,
      );
    }

    // Check response deadline hasn't expired
    if (new Date() > trade.responseDeadline) {
      throw new BadRequestException('Yanıt süresi dolmuş');
    }

    // Validate user has premium membership
    const userCanTrade = await this.membershipService.canCreateTrade(userId);
    if (!userCanTrade.allowed) {
      throw new BadRequestException(
        'Karşı teklif göndermek için Temel veya üstü üyelik gereklidir. Üyeliğinizi yenileyin.',
      );
    }

    // Get original initiator (who will become the receiver)
    const originalInitiatorId = trade.initiatorId;
    const originalReceiverId = trade.receiverId; // current user (counter-offerer)

    // Get current trade item IDs for comparison
    const currentInitiatorItemIds = (trade.items || []).filter((i: { side: string }) => i.side === 'initiator').map((item: { productId: string }) => item.productId).sort();
    const currentReceiverItemIds = (trade.items || []).filter((i: { side: string }) => i.side === 'receiver').map((item: { productId: string }) => item.productId).sort();

    // Check for identical counter-offer
    const newInitiatorItemIds = dto.initiatorItems.map(i => i.productId).sort();
    const newReceiverItemIds = dto.receiverItems.map(i => i.productId).sort();
    const newCashAmount = Math.abs(dto.cashAmount || 0);
    const currentCashAmount = Math.abs(trade.cashAmount?.toNumber() || 0);

    const isIdentical = 
      JSON.stringify(newInitiatorItemIds) === JSON.stringify(currentReceiverItemIds) &&
      JSON.stringify(newReceiverItemIds) === JSON.stringify(currentInitiatorItemIds) &&
      newCashAmount === currentCashAmount;

    if (isIdentical) {
      throw new BadRequestException('Önceki teklif ile aynı. Lütfen değişiklik yapın.');
    }

    // Validate counter-offerer owns the products they're offering
    // Allow active OR reserved (if in current trade)
    const counterOffererProducts = await this.prisma.product.findMany({
      where: {
        id: { in: dto.initiatorItems.map((i) => i.productId) },
        sellerId: originalReceiverId, // current receiver is offering these
        OR: [
          { status: ProductStatus.active },
          { 
            status: ProductStatus.reserved,
            id: { in: currentReceiverItemIds } // Only allow if in current trade
          }
        ],
      },
    });

    if (counterOffererProducts.length !== dto.initiatorItems.length) {
      throw new BadRequestException(
        'Bazı ürünler size ait değil veya aktif değil',
      );
    }

    // Validate original initiator's products (what counter-offerer wants)
    // Allow active AND trade-enabled OR reserved (if in current trade)
    const originalInitiatorProducts = await this.prisma.product.findMany({
      where: {
        id: { in: dto.receiverItems.map((i) => i.productId) },
        sellerId: originalInitiatorId, // original initiator owns these
        OR: [
          { 
            status: ProductStatus.active,
            isTradeEnabled: true 
          },
          { 
            status: ProductStatus.reserved,
            id: { in: currentInitiatorItemIds } // Only allow if in current trade
          }
        ],
      },
    });

    if (originalInitiatorProducts.length !== dto.receiverItems.length) {
      throw new BadRequestException(
        'Talep edilen bazı ürünler takasa uygun değil',
      );
    }

    // Adet bazlı: karşı teklifteki ürünlerde yeterli müsait adet olmalı
    for (const item of dto.initiatorItems) {
      const product = counterOffererProducts.find((p) => p.id === item.productId);
      if (product) {
        const available = getAvailableQuantity(product);
        if (available !== null && available < item.quantity) {
          throw new BadRequestException(
            `"${product.title}" için yeterli müsait stok yok (müsait: ${available}, talep: ${item.quantity})`,
          );
        }
      }
    }

    // Get trade deadlines from platform settings
    const responseHoursSetting = await this.prisma.platformSetting.findUnique({
      where: { settingKey: 'trade_response_deadline_hours' },
    });
    const responseHours = parseInt(responseHoursSetting?.settingValue ?? '72');

    const responseDeadline = new Date();
    responseDeadline.setHours(responseDeadline.getHours() + responseHours);

    // Calculate cash payer if there's a cash component
    // After swap: originalReceiverId becomes initiator, originalInitiatorId becomes receiver
    let cashPayerId: string | null = null;
    if (dto.cashAmount && dto.cashAmount !== 0) {
      // Positive = new initiator (originalReceiverId) pays, negative = new receiver (originalInitiatorId) pays
      cashPayerId = dto.cashAmount > 0 ? originalReceiverId : originalInitiatorId;
    }

    const oldItems = await this.prisma.tradeItem.findMany({ where: { tradeId } });
    const oldProductIds = [...new Set(oldItems.map((i) => i.productId))];

    // Update trade in transaction
    // Not: Counter offer sadece pending trade'de yapılır. Pending'de quantity
    // düşürülmemiştir, dolayısıyla burada stok manipülasyonu gerekmez.
    await this.prisma.$transaction(async (tx) => {
      await tx.tradeItem.deleteMany({
        where: { tradeId },
      });

      // Swap roles: originalReceiverId becomes initiator, originalInitiatorId becomes receiver
      // Update trade with swapped roles
      await tx.trade.update({
        where: { id: tradeId, version: tradeVersion },
        data: {
          initiatorId: originalReceiverId, // Swapped
          receiverId: originalInitiatorId, // Swapped
          cashAmount: dto.cashAmount ? Math.abs(dto.cashAmount) : null,
          cashPayerId,
          initiatorMessage: dto.message, // New initiator's message
          receiverMessage: null, // Clear old receiver message
          responseDeadline,
          version: { increment: 1 },
        },
      });

      // Create new trade items for new initiator (originalReceiverId)
      await tx.tradeItem.createMany({
        data: dto.initiatorItems.map((item) => ({
          tradeId,
          productId: item.productId,
          side: 'initiator',
          quantity: item.quantity,
          valueAtTrade:
            counterOffererProducts.find((p) => p.id === item.productId)?.price ?? 0,
        })),
      });

      // Create new trade items for new receiver (originalInitiatorId) - what counter-offerer wants
      await tx.tradeItem.createMany({
        data: dto.receiverItems.map((item) => ({
          tradeId,
          productId: item.productId,
          side: 'receiver',
          quantity: item.quantity,
          valueAtTrade:
            originalInitiatorProducts.find((p) => p.id === item.productId)?.price ?? 0,
        })),
      });
    });

    const newProductIds = [
      ...new Set([
        ...dto.initiatorItems.map((i) => i.productId),
        ...dto.receiverItems.map((i) => i.productId),
      ]),
    ];
    await this.invalidateProductCaches([...oldProductIds, ...newProductIds]);

    // Send notification to original initiator about counter offer
    try {
      const counterOfferer = await this.prisma.user.findUnique({
        where: { id: originalReceiverId },
        select: { displayName: true },
      });
      
      await this.notificationService.createInAppNotification(
        originalInitiatorId, // Original initiator receives the counter offer notification
        NotificationType.TRADE_COUNTER,
        {
          tradeId,
          counterOffererName: counterOfferer?.displayName || 'Bir kullanıcı',
        },
      );
    } catch (error) {
      this.logger.error(`Failed to send counter trade notification: ${error}`);
    }

    return this.getTradeById(tradeId, userId);
  }

  // ==========================================================================
  // CANCEL TRADE
  // ==========================================================================
  async cancelTrade(
    tradeId: string,
    userId: string,
    dto: CancelTradeDto,
  ): Promise<TradeResponseDto> {
    await this.prisma.$transaction(async (tx) => {
      const trade = await this.getTradeWithLock(tradeId, tx);

      if (trade.initiatorId !== userId && trade.receiverId !== userId) {
        throw new ForbiddenException('Bu takası iptal etme yetkiniz yok');
      }

      if (!this.canTransition(trade.status, TradeStatus.cancelled)) {
        throw new BadRequestException(
          `Takas durumu '${trade.status}' iptal edilemez`,
        );
      }

      // Legacy flow: after both shipped can't cancel
      if (
        trade.status === TradeStatus.both_shipped ||
        trade.status === TradeStatus.initiator_received ||
        trade.status === TradeStatus.receiver_received
      ) {
        throw new BadRequestException(
          'Her iki taraf da gönderdikten sonra iptal edilemez',
        );
      }

      // Safe-trade flow: once items reach warehouse, only admin can intervene
      if (
        trade.status === TradeStatus.at_warehouse ||
        trade.status === TradeStatus.admin_reviewing ||
        trade.status === TradeStatus.shipping_to_recipients ||
        trade.status === TradeStatus.returning
      ) {
        throw new BadRequestException(
          'Ürünler depoya ulaştıktan sonra sadece admin iptal edebilir',
        );
      }

      // Restore stock only for accepted+ trades (pending have nothing decremented)
      const hasReservation = trade.status !== TradeStatus.pending;
      if (hasReservation) {
        const allItems = await tx.tradeItem.findMany({ where: { tradeId } });
        const byProduct = new Map<string, number>();
        for (const item of allItems) {
          byProduct.set(item.productId, (byProduct.get(item.productId) ?? 0) + item.quantity);
        }
        for (const [productId, qty] of byProduct) {
          const prod = await tx.product.findUnique({
            where: { id: productId },
            select: { reservedQuantity: true },
          });
          if (prod) {
            const newReserved = safeDecrementReserved(prod.reservedQuantity, qty);
            await tx.product.update({
              where: { id: productId },
              data: { reservedQuantity: newReserved, status: ProductStatus.active },
            });
          }
        }
      }

      await tx.trade.update({
        where: { id: tradeId, version: trade.version },
        data: {
          status: TradeStatus.cancelled,
          cancelReason: dto.reason,
          cancelledAt: new Date(),
          version: { increment: 1 },
        },
      });
    });

    await this.paymentService.refundTradeCashPaymentIfCompleted(tradeId);

    await this.invalidateProductCachesForTrade(tradeId);

    return this.getTradeById(tradeId, userId);
  }

  // ==========================================================================
  // SHIP TRADE (One party ships their items)
  // ==========================================================================
  async shipTrade(
    tradeId: string,
    userId: string,
    dto: ShipTradeDto,
  ): Promise<TradeResponseDto> {
    const userCanTrade = await this.membershipService.canCreateTrade(userId);
    if (!userCanTrade.allowed) {
      throw new BadRequestException(
        'Trade işlemlerini yapmak için Temel veya üstü üyelik gereklidir. Üyeliğinizi yenileyin.',
      );
    }

    const address = await this.prisma.address.findFirst({
      where: { id: dto.fromAddressId, userId },
    });
    if (!address) {
      throw new NotFoundException('Adres bulunamadı');
    }

    await this.prisma.$transaction(async (tx) => {
      const trade = await this.getTradeWithLock(tradeId, tx);

      const isInitiator = trade.initiatorId === userId;
      const isReceiver = trade.receiverId === userId;

      if (!isInitiator && !isReceiver) {
        throw new ForbiddenException('Bu takas işlemi için yetkiniz yok');
      }

      const canShipStatuses: TradeStatus[] = [
        TradeStatus.accepted,
        TradeStatus.initiator_shipped,
        TradeStatus.receiver_shipped,
      ];

      if (!canShipStatuses.includes(trade.status)) {
        throw new BadRequestException(
          `Takas durumu '${trade.status}' gönderim yapılamaz`,
        );
      }

      const existingShipment = await tx.tradeShipment.findFirst({
        where: { tradeId, shipperId: userId },
      });
      if (existingShipment) {
        throw new BadRequestException('Zaten gönderim yaptınız');
      }

      let newStatus: TradeStatus;
      if (trade.status === TradeStatus.accepted) {
        newStatus = isInitiator
          ? TradeStatus.initiator_shipped
          : TradeStatus.receiver_shipped;
      } else if (
        (trade.status === TradeStatus.initiator_shipped && isReceiver) ||
        (trade.status === TradeStatus.receiver_shipped && isInitiator)
      ) {
        newStatus = TradeStatus.both_shipped;
      } else {
        throw new BadRequestException('Geçersiz gönderim durumu');
      }

      const trackingNumber = `TRK${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

      let confirmationDeadline: Date | null = null;
      if (newStatus === TradeStatus.both_shipped) {
        const confirmationDaysSetting = await tx.platformSetting.findUnique({
          where: { settingKey: 'trade_confirmation_deadline_days' },
        });
        const confirmationDays = parseInt(confirmationDaysSetting?.settingValue ?? '3');
        const now = new Date();
        confirmationDeadline = new Date(now);
        confirmationDeadline.setDate(confirmationDeadline.getDate() + confirmationDays);
      }

      await tx.tradeShipment.create({
        data: {
          tradeId,
          shipperId: userId,
          fromAddressId: dto.fromAddressId,
          carrier: dto.carrier,
          trackingNumber,
          status: ShipmentStatus.label_created,
          shippedAt: new Date(),
        },
      });

      await tx.trade.update({
        where: { id: tradeId, version: trade.version },
        data: {
          status: newStatus,
          confirmationDeadline,
          version: { increment: 1 },
        },
      });
    });

    return this.getTradeById(tradeId, userId);
  }

  // ==========================================================================
  // SHIP TO WAREHOUSE (Safe-trade: each party sends items to Tarodan warehouse)
  // ==========================================================================
  async shipToWarehouse(
    tradeId: string,
    userId: string,
    dto: ShipTradeDto,
  ): Promise<TradeResponseDto> {
    const userCanTrade = await this.membershipService.canCreateTrade(userId);
    if (!userCanTrade.allowed) {
      throw new BadRequestException(
        'Trade işlemlerini yapmak için Temel veya üstü üyelik gereklidir.',
      );
    }

    const address = await this.prisma.address.findFirst({
      where: { id: dto.fromAddressId, userId },
    });
    if (!address) {
      throw new NotFoundException('Adres bulunamadı');
    }

    await this.prisma.$transaction(async (tx) => {
      const trade = await this.getTradeWithLock(tradeId, tx);

      const isInitiator = trade.initiatorId === userId;
      const isReceiver = trade.receiverId === userId;

      if (!isInitiator && !isReceiver) {
        throw new ForbiddenException('Bu takas işlemi için yetkiniz yok');
      }

      if (trade.status !== TradeStatus.shipping_to_warehouse) {
        throw new BadRequestException(
          `Takas durumu '${trade.status}' depoya gönderim yapılamaz. Önce takas kabul edilmeli ve varsa ödeme tamamlanmalı.`,
        );
      }

      // User can only ship once for the to_warehouse leg
      const existingShipment = await tx.tradeShipment.findFirst({
        where: { tradeId, shipperId: userId, leg: 'to_warehouse' },
      });
      if (existingShipment) {
        throw new BadRequestException('Depoya zaten gönderim yaptınız');
      }

      const trackingNumber = dto.trackingNumber ||
        `TRK${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

      await tx.tradeShipment.create({
        data: {
          tradeId,
          shipperId: userId,
          fromAddressId: dto.fromAddressId,
          carrier: dto.carrier,
          trackingNumber,
          status: ShipmentStatus.label_created,
          shippedAt: new Date(),
          leg: 'to_warehouse',
          recipientType: 'warehouse',
          recipientUserId: null,
        },
      });

      // Trade status stays as shipping_to_warehouse until admin marks both
      // shipments as delivered, which transitions the trade to at_warehouse.
      await tx.trade.update({
        where: { id: tradeId, version: trade.version },
        data: {
          version: { increment: 1 },
          updatedAt: new Date(),
        },
      });
    });

    await this.invalidateProductCachesForTrade(tradeId);

    return this.getTradeById(tradeId, userId);
  }

  // ==========================================================================
  // CONFIRM RECEIPT
  // ==========================================================================
  async confirmReceipt(
    tradeId: string,
    userId: string,
    dto: ConfirmTradeReceiptDto,
  ): Promise<TradeResponseDto> {
    await this.prisma.$transaction(async (tx) => {
      const trade = await this.getTradeWithLock(tradeId, tx);

      const isInitiator = trade.initiatorId === userId;
      const isReceiver = trade.receiverId === userId;

      if (!isInitiator && !isReceiver) {
        throw new ForbiddenException('Bu takas işlemi için yetkiniz yok');
      }

      const canConfirmStatuses: TradeStatus[] = [
        // Legacy peer-to-peer flow
        TradeStatus.both_shipped,
        TradeStatus.initiator_received,
        TradeStatus.receiver_received,
        // Safe-trade flow: user confirms the from_warehouse shipment to them
        TradeStatus.shipping_to_recipients,
      ];

      if (!canConfirmStatuses.includes(trade.status)) {
        throw new BadRequestException(
          `Takas durumu '${trade.status}' onay yapılamaz`,
        );
      }

      // Locate the shipment to confirm
      let shipment;
      if (trade.status === TradeStatus.shipping_to_recipients) {
        // Safe-trade: find the from_warehouse shipment addressed to this user
        shipment = await tx.tradeShipment.findFirst({
          where: {
            tradeId,
            leg: 'from_warehouse',
            recipientUserId: userId,
          },
        });
      } else {
        // Legacy: find the shipment from the other party
        const otherPartyId = isInitiator ? trade.receiverId : trade.initiatorId;
        shipment = await tx.tradeShipment.findFirst({
          where: { tradeId, shipperId: otherPartyId },
        });
      }

      if (!shipment) {
        throw new BadRequestException('Onaylanacak gönderim bulunamadı');
      }
      if (shipment.confirmedAt) {
        throw new BadRequestException('Bu gönderim zaten onaylandı');
      }

      if (trade.confirmationDeadline && new Date() > trade.confirmationDeadline) {
        throw new BadRequestException('Onay süresi dolmuş');
      }

      let newStatus: TradeStatus;
      if (trade.status === TradeStatus.shipping_to_recipients) {
        // Safe-trade: if the OTHER from_warehouse shipment is also confirmed,
        // trade is completed. Otherwise stay in shipping_to_recipients.
        const otherShipment = await tx.tradeShipment.findFirst({
          where: {
            tradeId,
            leg: 'from_warehouse',
            NOT: { id: shipment.id },
          },
        });
        newStatus = otherShipment && otherShipment.confirmedAt
          ? TradeStatus.completed
          : TradeStatus.shipping_to_recipients;
      } else if (trade.status === TradeStatus.both_shipped) {
        newStatus = isInitiator
          ? TradeStatus.initiator_received
          : TradeStatus.receiver_received;
      } else if (
        (trade.status === TradeStatus.initiator_received && isReceiver) ||
        (trade.status === TradeStatus.receiver_received && isInitiator)
      ) {
        newStatus = TradeStatus.completed;
      } else {
        throw new BadRequestException('Geçersiz onay durumu');
      }

      await tx.tradeShipment.update({
        where: { id: shipment.id },
        data: {
          status: ShipmentStatus.delivered,
          deliveredAt: new Date(),
          confirmedAt: new Date(),
        },
      });

      await tx.trade.update({
        where: { id: tradeId, version: trade.version },
        data: {
          status: newStatus,
          completedAt: newStatus === TradeStatus.completed ? new Date() : null,
          version: { increment: 1 },
        },
      });

      if (newStatus === TradeStatus.completed) {
        // Takas tamamlandı: quantity-- + reservedQuantity-- (her iki tarafın ürünü için)
        const allItems = await tx.tradeItem.findMany({ where: { tradeId } });
        const products = await tx.product.findMany({
          where: { id: { in: allItems.map((i) => i.productId) } },
        });

        const qtyByProduct = new Map<string, number>();
        for (const item of allItems) {
          qtyByProduct.set(item.productId, (qtyByProduct.get(item.productId) ?? 0) + item.quantity);
        }

        for (const product of products) {
          const tradedQty = qtyByProduct.get(product.id) ?? 1;
          let newQuantity: number | null;

          if (product.quantity !== null && product.quantity > 0) {
            newQuantity = Math.max(0, product.quantity - tradedQty);
          } else if (product.quantity === null) {
            newQuantity = null;
          } else {
            newQuantity = 0;
          }

          const updateData: any = {
            status: getProductStatusFromQuantity(newQuantity),
            reservedQuantity: safeDecrementReserved(product.reservedQuantity, tradedQty),
          };
          if (product.quantity !== null && product.quantity > 0) {
            updateData.quantity = newQuantity;
          }

          await tx.product.update({
            where: { id: product.id },
            data: updateData,
          });
        }

        const cashPayment = await tx.tradeCashPayment.findUnique({
          where: { tradeId },
        });
        if (cashPayment && cashPayment.status === PaymentStatus.completed) {
          // Safe-trade escrow: don't release immediately. Set hold for 7 days.
          const holdDaysSetting = await tx.platformSetting.findUnique({
            where: { settingKey: 'payment_hold_days' },
          });
          const holdDays = parseInt(holdDaysSetting?.settingValue ?? '7');
          const holdReleaseAt = new Date();
          holdReleaseAt.setDate(holdReleaseAt.getDate() + holdDays);

          await tx.tradeCashPayment.update({
            where: { tradeId },
            data: { holdReleaseAt },
          });
        }
      }
    });

    await this.invalidateProductCachesForTrade(tradeId);

    return this.getTradeById(tradeId, userId);
  }

  // ==========================================================================
  // RAISE DISPUTE
  // ==========================================================================
  async raiseDispute(
    tradeId: string,
    userId: string,
    dto: RaiseTradeDisputeDto,
  ): Promise<TradeResponseDto> {
    await this.prisma.$transaction(async (tx) => {
      const trade = await this.getTradeWithLock(tradeId, tx);

      if (trade.initiatorId !== userId && trade.receiverId !== userId) {
        throw new ForbiddenException('Bu takas işlemi için yetkiniz yok');
      }

      const existingDispute = await tx.tradeDispute.findUnique({
        where: { tradeId },
      });
      if (existingDispute) {
        throw new BadRequestException('Bu takas için zaten itiraz açılmış');
      }

      const canDisputeStatuses: TradeStatus[] = [
        TradeStatus.both_shipped,
        TradeStatus.initiator_received,
        TradeStatus.receiver_received,
      ];

      if (!canDisputeStatuses.includes(trade.status)) {
        throw new BadRequestException(
          `Takas durumu '${trade.status}' itiraz açılamaz`,
        );
      }

      await tx.tradeDispute.create({
        data: {
          tradeId,
          raisedById: userId,
          reason: dto.reason,
          description: dto.description,
          evidence: dto.evidenceUrls || [],
        },
      });

      await tx.trade.update({
        where: { id: tradeId, version: trade.version },
        data: {
          status: TradeStatus.disputed,
          version: { increment: 1 },
        },
      });
    });

    return this.getTradeById(tradeId, userId);
  }

  // ==========================================================================
  // RESOLVE DISPUTE (Admin only)
  // ==========================================================================
  async resolveDispute(
    tradeId: string,
    adminId: string,
    dto: ResolveTradeDisputeDto,
  ): Promise<TradeResponseDto> {
    let newStatus: TradeStatus;
    if (dto.resolution === 'complete_trade') {
      newStatus = TradeStatus.completed;
    } else if (dto.resolution === 'cancel_trade') {
      newStatus = TradeStatus.cancelled;
    } else {
      newStatus = TradeStatus.completed;
    }

    let resolvedTradeInitiatorId: string;

    if (newStatus === TradeStatus.cancelled) {
      await this.paymentService.refundTradeCashPaymentIfCompleted(tradeId);
    }

    await this.prisma.$transaction(async (tx) => {
      const trade = await this.getTradeWithLock(tradeId, tx);

      if (trade.status !== TradeStatus.disputed) {
        throw new BadRequestException('Takas itiraz durumunda değil');
      }

      const dispute = await tx.tradeDispute.findUnique({
        where: { tradeId },
      });
      if (!dispute) {
        throw new NotFoundException('İtiraz bulunamadı');
      }

      resolvedTradeInitiatorId = trade.initiatorId;

      await tx.tradeDispute.update({
        where: { tradeId },
        data: {
          resolution: dto.resolution,
          resolvedById: adminId,
          resolvedAt: new Date(),
          resolutionNotes: dto.notes,
        },
      });

      await tx.trade.update({
        where: { id: tradeId, version: trade.version },
        data: {
          status: newStatus,
          completedAt: newStatus === TradeStatus.completed ? new Date() : null,
          cancelledAt: newStatus === TradeStatus.cancelled ? new Date() : null,
          cancelReason:
            newStatus === TradeStatus.cancelled
              ? `İtiraz çözümü: ${dto.resolution}`
              : null,
          version: { increment: 1 },
        },
      });

      const allItems = await tx.tradeItem.findMany({ where: { tradeId } });
      const qtyByProduct = new Map<string, number>();
      for (const item of allItems) {
        qtyByProduct.set(item.productId, (qtyByProduct.get(item.productId) ?? 0) + item.quantity);
      }

      if (newStatus === TradeStatus.completed) {
        // Takas tamamlandı: quantity-- + reservedQuantity--
        const products = await tx.product.findMany({
          where: { id: { in: allItems.map((i) => i.productId) } },
        });
        for (const product of products) {
          const tradedQty = qtyByProduct.get(product.id) ?? 1;
          let newQuantity: number | null;
          if (product.quantity !== null && product.quantity > 0) {
            newQuantity = Math.max(0, product.quantity - tradedQty);
          } else if (product.quantity === null) {
            newQuantity = null;
          } else {
            newQuantity = 0;
          }
          const updateData: any = {
            status: getProductStatusFromQuantity(newQuantity),
            reservedQuantity: safeDecrementReserved(product.reservedQuantity, tradedQty),
          };
          if (product.quantity !== null && product.quantity > 0) {
            updateData.quantity = newQuantity;
          }
          await tx.product.update({
            where: { id: product.id },
            data: updateData,
          });
        }
      } else if (newStatus === TradeStatus.cancelled) {
        // İptal: kabul anında yapılan rezervasyonu geri al
        for (const [productId, qty] of qtyByProduct) {
          const prod = await tx.product.findUnique({
            where: { id: productId },
            select: { reservedQuantity: true },
          });
          if (prod) {
            const newReserved = safeDecrementReserved(prod.reservedQuantity, qty);
            await tx.product.update({
              where: { id: productId },
              data: { reservedQuantity: newReserved, status: ProductStatus.active },
            });
          }
        }
      }
    });

    await this.invalidateProductCachesForTrade(tradeId);

    return this.getTradeById(
      tradeId,
      resolvedTradeInitiatorId!,
    );
  }

  // ==========================================================================
  // AUTO-CANCEL EXPIRED TRADES (Scheduled job)
  // ==========================================================================
  async autoCancelExpiredTrades(): Promise<number> {
    const now = new Date();

    // Find trades that have passed their deadlines
    const expiredPendingTrades = await this.prisma.trade.findMany({
      where: {
        status: TradeStatus.pending,
        responseDeadline: { lt: now },
      },
    });

    const expiredAcceptedTrades = await this.prisma.trade.findMany({
      where: {
        status: TradeStatus.accepted,
        shippingDeadline: { lt: now },
      },
    });

    // Safe-trade: cash payment timeout
    const expiredPaymentTrades = await this.prisma.trade.findMany({
      where: {
        status: TradeStatus.awaiting_payment,
        paymentDeadline: { lt: now },
      },
    });

    // Safe-trade: shipping-to-warehouse timeout
    const expiredShippingTrades = await this.prisma.trade.findMany({
      where: {
        status: TradeStatus.shipping_to_warehouse,
        shippingDeadline: { lt: now },
      },
    });

    let cancelledCount = 0;

    for (const trade of [
      ...expiredPendingTrades,
      ...expiredAcceptedTrades,
      ...expiredPaymentTrades,
      ...expiredShippingTrades,
    ]) {
      try {
        try {
          await this.paymentService.refundTradeCashPaymentIfCompleted(trade.id);
        } catch (refundErr: any) {
          this.logger.error(
            `autoCancelExpiredTrades: PayTR nakit iade başarısız trade=${trade.id} — iptal atlandı: ${refundErr?.message}`,
          );
          continue;
        }

        await this.prisma.$transaction(async (tx) => {
          // FOR UPDATE: trade satırını kilitle; başka bir işlem (örn. acceptTrade)
          // bu trade'i aynı anda değiştirmeye çalışırsa bekler.
          await tx.$queryRaw`SELECT id FROM trades WHERE id = ${trade.id} FOR UPDATE`;

          // Kilitleme sonrası en güncel statüyü oku
          const freshTrade = await tx.trade.findUnique({
            where: { id: trade.id },
            select: { status: true },
          });
          // Başka bir akış zaten işleme almışsa bu trade'i atla
          if (!freshTrade || freshTrade.status !== trade.status) {
            return;
          }

          const allItems = await tx.tradeItem.findMany({
            where: { tradeId: trade.id },
          });

          // Release reservations for any non-pending trade being auto-cancelled
          const statusesWithReservation: TradeStatus[] = [
            TradeStatus.accepted,
            TradeStatus.awaiting_payment,
            TradeStatus.shipping_to_warehouse,
          ];
          if (statusesWithReservation.includes(trade.status) && allItems.length > 0) {
            const byProduct = new Map<string, number>();
            for (const item of allItems) {
              byProduct.set(item.productId, (byProduct.get(item.productId) ?? 0) + item.quantity);
            }
            // Auto-cancel: kabul anında yapılan rezervasyonu geri al
            for (const [productId, qty] of byProduct) {
              await tx.$queryRaw`SELECT id FROM products WHERE id = ${productId} FOR UPDATE`;
              const prod = await tx.product.findUnique({
                where: { id: productId },
                select: { reservedQuantity: true },
              });
              if (prod) {
                const newReserved = safeDecrementReserved(prod.reservedQuantity, qty);
                await tx.product.update({
                  where: { id: productId },
                  data: {
                    reservedQuantity: newReserved,
                    status: newReserved > 0 ? ProductStatus.reserved : ProductStatus.active,
                  },
                });
              }
            }
          }

          await tx.trade.update({
            where: { id: trade.id },
            data: {
              status: TradeStatus.cancelled,
              cancelReason: 'Süre dolumu nedeniyle otomatik iptal',
              cancelledAt: now,
            },
          });
        });
        await this.invalidateProductCachesForTrade(trade.id);
        cancelledCount++;

        // Transaction commit sonrası: iptal edilen takas katılımcılarına bildirim
        if (this.eventService) {
          try {
            await this.eventService.emitTradeAutoCancelled({
              tradeId: trade.id,
              initiatorId: trade.initiatorId,
              receiverId: trade.receiverId,
              reason: 'Takas süresi dolduğu için otomatik iptal edildi',
            });
          } catch (err) {
            this.logger.error(`Failed to emit trade.auto-cancelled for trade ${trade.id}: ${err}`);
          }
        }
      } catch (error) {
        this.logger.error('Failed to auto-cancel trade');
      }
    }

    return cancelledCount;
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================

  /** Invalidate product detail cache for given product IDs. */
  private async invalidateProductCaches(productIds: string[]): Promise<void> {
    for (const productId of [...new Set(productIds)]) {
      await this.cache.del(`products:detail:${productId}`);
    }
  }

  /** Invalidate product detail cache for all products in a trade (after reserved/quantity changes). */
  private async invalidateProductCachesForTrade(tradeId: string): Promise<void> {
    const items = await this.prisma.tradeItem.findMany({
      where: { tradeId },
      select: { productId: true },
    });
    await this.invalidateProductCaches(items.map((i) => i.productId));
  }

  /**
   * Acquire FOR UPDATE lock on the trade row.
   * When called with a Prisma transaction client the lock is held until
   * the transaction commits/rolls-back, providing real pessimistic locking.
   * Falls back to the root PrismaService when no tx is supplied (legacy callers).
   */
  private async getTradeWithLock(tradeId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;

    await client.$queryRaw`
      SELECT id FROM trades WHERE id = ${tradeId} FOR UPDATE
    `;

    const trade = await client.trade.findUnique({
      where: { id: tradeId },
    });

    if (!trade) {
      throw new NotFoundException('Takas bulunamadı');
    }

    return trade;
  }

  /**
   * Resolve product image URL (S3 key -> public URL). Any non-URL key is treated as S3 key.
   */
  private resolveProductImageUrl(imageKeyOrUrl: string | null | undefined): string | null {
    if (!imageKeyOrUrl) return null;
    if (imageKeyOrUrl.startsWith('http://') || imageKeyOrUrl.startsWith('https://') || imageKeyOrUrl.startsWith('/')) return imageKeyOrUrl;
    return this.storageService?.getPublicAssetUrl(imageKeyOrUrl) ?? null;
  }

  private mapTradeItemToDto(item: any): {
    id: string;
    productId: string;
    productTitle: string;
    productImage?: string;
    productImages?: { cardUrl: string; detailUrl?: string }[];
    side: string;
    quantity: number;
    valueAtTrade: number;
  } {
    const firstImg = item.product?.images?.[0];
    const cardUrl = firstImg?.cardKey ? this.storageService.getPublicAssetUrl(firstImg.cardKey) : undefined;
    const detailUrl = firstImg?.detailKey ? this.storageService.getPublicAssetUrl(firstImg.detailKey) : undefined;
    const productImage = this.resolveProductImageUrl(firstImg?.cardKey);
    const productImages =
      cardUrl || detailUrl ? [{ cardUrl: cardUrl ?? '', detailUrl }] : undefined;
    return {
      id: item.id,
      productId: item.productId,
      productTitle: item.product?.title || '',
      productImage: productImage ?? undefined,
      productImages,
      side: item.side,
      quantity: item.quantity,
      valueAtTrade: parseFloat(item.valueAtTrade),
    };
  }

  private async mapToResponseDto(trade: any): Promise<TradeResponseDto> {
    const initiatorShipment = trade.shipments?.find(
      (s: any) => s.shipperId === trade.initiatorId,
    );
    const receiverShipment = trade.shipments?.find(
      (s: any) => s.shipperId === trade.receiverId,
    );

    return {
      id: trade.id,
      tradeNumber: trade.tradeNumber,
      initiatorId: trade.initiatorId,
      initiatorName: trade.initiator?.displayName || '',
      receiverId: trade.receiverId,
      receiverName: trade.receiver?.displayName || '',
      status: trade.status,
      initiatorItems: (trade.items || [])
        .filter((item: any) => item.side === 'initiator')
        .map((item: any) => this.mapTradeItemToDto(item)),
      receiverItems: (trade.items || [])
        .filter((item: any) => item.side === 'receiver')
        .map((item: any) => this.mapTradeItemToDto(item)),
      cashAmount: trade.cashAmount ? parseFloat(trade.cashAmount) : undefined,
      cashPayerId: trade.cashPayerId || undefined,
      cashCommission: trade.cashCommission
        ? parseFloat(trade.cashCommission)
        : undefined,
      initiatorMessage: trade.initiatorMessage || undefined,
      receiverMessage: trade.receiverMessage || undefined,
      responseDeadline: trade.responseDeadline,
      paymentDeadline: trade.paymentDeadline || undefined,
      shippingDeadline: trade.shippingDeadline || undefined,
      confirmationDeadline: trade.confirmationDeadline || undefined,
      initiatorShipment: initiatorShipment
        ? {
            id: initiatorShipment.id,
            shipperId: initiatorShipment.shipperId,
            shipperName: trade.initiator?.displayName || '',
            carrier: initiatorShipment.carrier,
            trackingNumber: initiatorShipment.trackingNumber,
            status: initiatorShipment.status,
            shippedAt: initiatorShipment.shippedAt,
            deliveredAt: initiatorShipment.deliveredAt,
            confirmedAt: initiatorShipment.confirmedAt,
          }
        : undefined,
      receiverShipment: receiverShipment
        ? {
            id: receiverShipment.id,
            shipperId: receiverShipment.shipperId,
            shipperName: trade.receiver?.displayName || '',
            carrier: receiverShipment.carrier,
            trackingNumber: receiverShipment.trackingNumber,
            status: receiverShipment.status,
            shippedAt: receiverShipment.shippedAt,
            deliveredAt: receiverShipment.deliveredAt,
            confirmedAt: receiverShipment.confirmedAt,
          }
        : undefined,
      cashPayment: trade.cashPayment
        ? {
            id: trade.cashPayment.id,
            payerId: trade.cashPayment.payerId,
            recipientId: trade.cashPayment.recipientId,
            amount: parseFloat(trade.cashPayment.amount),
            commission: parseFloat(trade.cashPayment.commission),
            totalAmount: parseFloat(trade.cashPayment.totalAmount),
            status: trade.cashPayment.status,
            paidAt: trade.cashPayment.paidAt,
          }
        : undefined,
      dispute: trade.dispute
        ? {
            id: trade.dispute.id,
            raisedById: trade.dispute.raisedById,
            reason: trade.dispute.reason,
            description: trade.dispute.description,
            resolution: trade.dispute.resolution,
            resolvedAt: trade.dispute.resolvedAt,
          }
        : undefined,
      acceptedAt: trade.acceptedAt || undefined,
      completedAt: trade.completedAt || undefined,
      cancelledAt: trade.cancelledAt || undefined,
      cancelReason: trade.cancelReason || undefined,
      version: trade.version || undefined,
      createdAt: trade.createdAt,
      updatedAt: trade.updatedAt,
    };
  }
}
