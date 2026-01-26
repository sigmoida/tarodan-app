import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { MembershipService } from '../membership/membership.service';
import {
  TradeStatus,
  ProductStatus,
  ShipmentStatus,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly membershipService: MembershipService,
  ) {}

  // ==========================================================================
  // TRADE STATE MACHINE
  // Valid transitions as per SYSTEM_OPERATIONS_GUIDE.md
  // ==========================================================================
  private readonly validTransitions: Record<TradeStatus, TradeStatus[]> = {
    [TradeStatus.pending]: [
      TradeStatus.accepted,
      TradeStatus.rejected,
      TradeStatus.cancelled,
    ],
    [TradeStatus.accepted]: [
      TradeStatus.initiator_shipped,
      TradeStatus.receiver_shipped,
      TradeStatus.cancelled,
    ],
    [TradeStatus.rejected]: [], // Terminal state
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

    // Validate initiator membership - must be premium to create trade
    const initiatorCanTrade = await this.membershipService.canCreateTrade(initiatorId);
    if (!initiatorCanTrade.allowed) {
      console.error(`[Trade] Initiator ${initiatorId} cannot trade:`, initiatorCanTrade.reason);
      const initiatorMembership = await this.membershipService.getUserMembership(initiatorId);
      console.error(`[Trade] Initiator membership:`, {
        tier: initiatorMembership.tier.type,
        tierName: initiatorMembership.tier.name,
        canTrade: initiatorMembership.tier.canTrade,
      });
      throw new BadRequestException(initiatorCanTrade.reason);
    }

    // Validate receiver membership - must have trade capability to receive trade
    const receiverCanTrade = await this.membershipService.canCreateTrade(dto.receiverId);
    if (!receiverCanTrade.allowed) {
      console.error(`[Trade] Receiver ${dto.receiverId} cannot trade:`, receiverCanTrade.reason);
      const receiverMembership = await this.membershipService.getUserMembership(dto.receiverId);
      console.error(`[Trade] Receiver membership:`, {
        tier: receiverMembership.tier.type,
        tierName: receiverMembership.tier.name,
        canTrade: receiverMembership.tier.canTrade,
      });
      throw new BadRequestException(
        receiverCanTrade.reason || 'Takas teklifi gönderilemiyor. Alıcı kullanıcı takas özelliğine sahip değil.',
      );
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
      // Reserve products
      await tx.product.updateMany({
        where: { id: { in: dto.initiatorItems.map((i) => i.productId) } },
        data: { status: ProductStatus.reserved },
      });

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
        initiatorItems: {
          include: {
            product: {
              select: { id: true, title: true, images: { take: 1 } },
            },
          },
        },
        receiverItems: {
          include: {
            product: {
              select: { id: true, title: true, images: { take: 1 } },
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

    return this.mapToResponseDto(trade);
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
          initiatorItems: {
            include: {
              product: {
                select: { id: true, title: true, images: { take: 1 } },
              },
            },
          },
          receiverItems: {
            include: {
              product: {
                select: { id: true, title: true, images: { take: 1 } },
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
      trades: trades.map((t) => this.mapToResponseDto(t)),
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
    const trade = await this.getTradeWithLock(tradeId);

    // Only receiver can accept
    if (trade.receiverId !== userId) {
      throw new ForbiddenException('Sadece takas alıcısı kabul edebilir');
    }

    // Validate receiver membership - must still be premium (subscription might have expired)
    const receiverCanTrade = await this.membershipService.canCreateTrade(userId);
    if (!receiverCanTrade.allowed) {
      throw new BadRequestException(
        'Üyeliğinizin süresi dolmuş görünüyor. Trade kabul etmek için Premium üyeliğinizi yenileyin.',
      );
    }

    // Check valid transition
    if (!this.canTransition(trade.status, TradeStatus.accepted)) {
      throw new BadRequestException(
        `Takas durumu '${trade.status}' kabul edilemez`,
      );
    }

    // Check deadline
    if (new Date() > trade.responseDeadline) {
      throw new BadRequestException('Yanıt süresi dolmuş');
    }

    // Get deadline settings
    const paymentHoursSetting = await this.prisma.platformSetting.findUnique({
      where: { settingKey: 'trade_payment_deadline_hours' },
    });
    const shippingDaysSetting = await this.prisma.platformSetting.findUnique({
      where: { settingKey: 'trade_shipping_deadline_days' },
    });

    const paymentHours = parseInt(paymentHoursSetting?.settingValue ?? '48');
    const shippingDays = parseInt(shippingDaysSetting?.settingValue ?? '7');

    const now = new Date();
    const paymentDeadline = new Date(now);
    paymentDeadline.setHours(paymentDeadline.getHours() + paymentHours);

    const shippingDeadline = new Date(now);
    shippingDeadline.setDate(shippingDeadline.getDate() + shippingDays);

    await this.prisma.$transaction(async (tx) => {
      // Reserve receiver's products too
      const receiverItems = await tx.tradeItem.findMany({
        where: { tradeId, side: 'receiver' },
      });

      await tx.product.updateMany({
        where: { id: { in: receiverItems.map((i) => i.productId) } },
        data: { status: ProductStatus.reserved },
      });

      // Update trade
      await tx.trade.update({
        where: { id: tradeId, version: trade.version },
        data: {
          status: TradeStatus.accepted,
          receiverMessage: dto.message,
          acceptedAt: now,
          paymentDeadline: trade.cashPayerId ? paymentDeadline : null,
          shippingDeadline,
          version: { increment: 1 },
        },
      });

      // Create cash payment record if applicable
      if (trade.cashAmount && trade.cashPayerId) {
        const commission = trade.cashAmount.toNumber() * 0.05; // 5% commission
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
    const trade = await this.getTradeWithLock(tradeId);

    // Only receiver can reject
    if (trade.receiverId !== userId) {
      throw new ForbiddenException('Sadece takas alıcısı reddedebilir');
    }

    // Check valid transition
    if (!this.canTransition(trade.status, TradeStatus.rejected)) {
      throw new BadRequestException(
        `Takas durumu '${trade.status}' reddedilemez`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      // Release initiator's products
      const initiatorItems = await tx.tradeItem.findMany({
        where: { tradeId, side: 'initiator' },
      });

      await tx.product.updateMany({
        where: { id: { in: initiatorItems.map((i) => i.productId) } },
        data: { status: ProductStatus.active },
      });

      // Update trade
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
        initiatorItems: true,
        receiverItems: true,
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
        'Karşı teklif göndermek için Premium üyelik gereklidir. Üyeliğinizi yenileyin.',
      );
    }

    // Get original initiator (who will become the receiver)
    const originalInitiatorId = trade.initiatorId;
    const originalReceiverId = trade.receiverId; // current user (counter-offerer)

    // Get current trade item IDs for comparison
    const currentInitiatorItemIds = trade.initiatorItems.map(item => item.productId).sort();
    const currentReceiverItemIds = trade.receiverItems.map(item => item.productId).sort();

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

    // Update trade in transaction
    await this.prisma.$transaction(async (tx) => {
      // Release old reserved products (both sides)
      const oldItems = await tx.tradeItem.findMany({
        where: { tradeId },
      });

      await tx.product.updateMany({
        where: { id: { in: oldItems.map((i) => i.productId) } },
        data: { status: ProductStatus.active },
      });

      // Delete old trade items
      await tx.tradeItem.deleteMany({
        where: { tradeId },
      });

      // Reserve new products (counter-offerer's products)
      await tx.product.updateMany({
        where: { id: { in: dto.initiatorItems.map((i) => i.productId) } },
        data: { status: ProductStatus.reserved },
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
    const trade = await this.getTradeWithLock(tradeId);

    // Only participants can cancel
    if (trade.initiatorId !== userId && trade.receiverId !== userId) {
      throw new ForbiddenException('Bu takası iptal etme yetkiniz yok');
    }

    // Check valid transition
    if (!this.canTransition(trade.status, TradeStatus.cancelled)) {
      throw new BadRequestException(
        `Takas durumu '${trade.status}' iptal edilemez`,
      );
    }

    // Cannot cancel after both shipped
    if (
      trade.status === TradeStatus.both_shipped ||
      trade.status === TradeStatus.initiator_received ||
      trade.status === TradeStatus.receiver_received
    ) {
      throw new BadRequestException(
        'Her iki taraf da gönderdikten sonra iptal edilemez',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      // Release all products
      const allItems = await tx.tradeItem.findMany({ where: { tradeId } });

      await tx.product.updateMany({
        where: { id: { in: allItems.map((i) => i.productId) } },
        data: { status: ProductStatus.active },
      });

      // Refund cash payment if any
      const cashPayment = await tx.tradeCashPayment.findUnique({
        where: { tradeId },
      });

      if (cashPayment && cashPayment.status === PaymentStatus.completed) {
        await tx.tradeCashPayment.update({
          where: { tradeId },
          data: { status: PaymentStatus.refunded, refundedAt: new Date() },
        });
      }

      // Update trade
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
    const trade = await this.getTradeWithLock(tradeId);

    // Validate participant
    const isInitiator = trade.initiatorId === userId;
    const isReceiver = trade.receiverId === userId;

    if (!isInitiator && !isReceiver) {
      throw new ForbiddenException('Bu takas işlemi için yetkiniz yok');
    }

    // Validate user membership - must be premium to ship trade
    const userCanTrade = await this.membershipService.canCreateTrade(userId);
    if (!userCanTrade.allowed) {
      throw new BadRequestException(
        'Trade işlemlerini yapmak için Premium üyelik gereklidir. Üyeliğinizi yenileyin.',
      );
    }

    // Check trade can be shipped
    const canShipStatuses = [
      TradeStatus.accepted,
      TradeStatus.initiator_shipped,
      TradeStatus.receiver_shipped,
    ];

    if (!(canShipStatuses as TradeStatus[]).includes(trade.status)) {
      throw new BadRequestException(
        `Takas durumu '${trade.status}' gönderim yapılamaz`,
      );
    }

    // Check if user already shipped
    const existingShipment = await this.prisma.tradeShipment.findFirst({
      where: { tradeId, shipperId: userId },
    });

    if (existingShipment) {
      throw new BadRequestException('Zaten gönderim yaptınız');
    }

    // Validate address
    const address = await this.prisma.address.findFirst({
      where: { id: dto.fromAddressId, userId },
    });

    if (!address) {
      throw new NotFoundException('Adres bulunamadı');
    }

    // Determine new status
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

    // Generate tracking number (in real system, this would come from shipping provider)
    const trackingNumber = `TRK${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    await this.prisma.$transaction(async (tx) => {
      // Create shipment
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

      // Update trade status
      await tx.trade.update({
        where: { id: tradeId, version: trade.version },
        data: {
          status: newStatus,
          version: { increment: 1 },
        },
      });
    });

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
    const trade = await this.getTradeWithLock(tradeId);

    // Validate participant
    const isInitiator = trade.initiatorId === userId;
    const isReceiver = trade.receiverId === userId;

    if (!isInitiator && !isReceiver) {
      throw new ForbiddenException('Bu takas işlemi için yetkiniz yok');
    }

    // Check trade can confirm receipt
    const canConfirmStatuses = [
      TradeStatus.both_shipped,
      TradeStatus.initiator_received,
      TradeStatus.receiver_received,
    ];

    if (!(canConfirmStatuses as TradeStatus[]).includes(trade.status)) {
      throw new BadRequestException(
        `Takas durumu '${trade.status}' onay yapılamaz`,
      );
    }

    // Find the shipment the user needs to confirm (the one sent TO them)
    const otherPartyId = isInitiator ? trade.receiverId : trade.initiatorId;
    const shipment = await this.prisma.tradeShipment.findFirst({
      where: { tradeId, shipperId: otherPartyId },
    });

    if (!shipment) {
      throw new BadRequestException('Onaylanacak gönderim bulunamadı');
    }

    if (shipment.confirmedAt) {
      throw new BadRequestException('Bu gönderim zaten onaylandı');
    }

    // Determine new status
    let newStatus: TradeStatus;
    if (trade.status === TradeStatus.both_shipped) {
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

    await this.prisma.$transaction(async (tx) => {
      // Confirm shipment
      await tx.tradeShipment.update({
        where: { id: shipment.id },
        data: {
          status: ShipmentStatus.delivered,
          deliveredAt: new Date(),
          confirmedAt: new Date(),
        },
      });

      // Update trade status
      await tx.trade.update({
        where: { id: tradeId, version: trade.version },
        data: {
          status: newStatus,
          completedAt: newStatus === TradeStatus.completed ? new Date() : null,
          version: { increment: 1 },
        },
      });

      // If trade completed, mark products as sold
      if (newStatus === TradeStatus.completed) {
        const allItems = await tx.tradeItem.findMany({ where: { tradeId } });

        await tx.product.updateMany({
          where: { id: { in: allItems.map((i) => i.productId) } },
          data: { status: ProductStatus.sold },
        });

        // Release cash payment to recipient if any
        const cashPayment = await tx.tradeCashPayment.findUnique({
          where: { tradeId },
        });

        if (cashPayment && cashPayment.status === PaymentStatus.completed) {
          await tx.tradeCashPayment.update({
            where: { tradeId },
            data: { releasedAt: new Date() },
          });
        }
      }
    });

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
    const trade = await this.getTradeWithLock(tradeId);

    // Validate participant
    if (trade.initiatorId !== userId && trade.receiverId !== userId) {
      throw new ForbiddenException('Bu takas işlemi için yetkiniz yok');
    }

    // Check if dispute already exists
    const existingDispute = await this.prisma.tradeDispute.findUnique({
      where: { tradeId },
    });

    if (existingDispute) {
      throw new BadRequestException('Bu takas için zaten itiraz açılmış');
    }

    // Check valid states for dispute
    const canDisputeStatuses = [
      TradeStatus.both_shipped,
      TradeStatus.initiator_received,
      TradeStatus.receiver_received,
    ];

    if (!(canDisputeStatuses as TradeStatus[]).includes(trade.status)) {
      throw new BadRequestException(
        `Takas durumu '${trade.status}' itiraz açılamaz`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      // Create dispute
      await tx.tradeDispute.create({
        data: {
          tradeId,
          raisedById: userId,
          reason: dto.reason,
          description: dto.description,
          evidence: dto.evidenceUrls || [],
        },
      });

      // Update trade status
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
    const trade = await this.getTradeWithLock(tradeId);

    if (trade.status !== TradeStatus.disputed) {
      throw new BadRequestException('Takas itiraz durumunda değil');
    }

    const dispute = await this.prisma.tradeDispute.findUnique({
      where: { tradeId },
    });

    if (!dispute) {
      throw new NotFoundException('İtiraz bulunamadı');
    }

    let newStatus: TradeStatus;
    if (dto.resolution === 'complete_trade') {
      newStatus = TradeStatus.completed;
    } else if (dto.resolution === 'cancel_trade') {
      newStatus = TradeStatus.cancelled;
    } else {
      // Partial refund - still complete the trade
      newStatus = TradeStatus.completed;
    }

    await this.prisma.$transaction(async (tx) => {
      // Update dispute
      await tx.tradeDispute.update({
        where: { tradeId },
        data: {
          resolution: dto.resolution,
          resolvedById: adminId,
          resolvedAt: new Date(),
          resolutionNotes: dto.notes,
        },
      });

      // Update trade
      await tx.trade.update({
        where: { id: tradeId, version: trade.version },
        data: {
          status: newStatus,
          completedAt:
            newStatus === TradeStatus.completed ? new Date() : null,
          cancelledAt:
            newStatus === TradeStatus.cancelled ? new Date() : null,
          cancelReason:
            newStatus === TradeStatus.cancelled
              ? `İtiraz çözümü: ${dto.resolution}`
              : null,
          version: { increment: 1 },
        },
      });

      // Handle products based on resolution
      const allItems = await tx.tradeItem.findMany({ where: { tradeId } });

      if (newStatus === TradeStatus.completed) {
        await tx.product.updateMany({
          where: { id: { in: allItems.map((i) => i.productId) } },
          data: { status: ProductStatus.sold },
        });
      } else if (newStatus === TradeStatus.cancelled) {
        await tx.product.updateMany({
          where: { id: { in: allItems.map((i) => i.productId) } },
          data: { status: ProductStatus.active },
        });

        // Refund cash payment if any
        const cashPayment = await tx.tradeCashPayment.findUnique({
          where: { tradeId },
        });

        if (cashPayment && cashPayment.status === PaymentStatus.completed) {
          await tx.tradeCashPayment.update({
            where: { tradeId },
            data: { status: PaymentStatus.refunded, refundedAt: new Date() },
          });
        }
      }
    });

    return this.getTradeById(
      tradeId,
      trade.initiatorId, // Admin can use any participant ID for viewing
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

    let cancelledCount = 0;

    for (const trade of [...expiredPendingTrades, ...expiredAcceptedTrades]) {
      try {
        await this.prisma.$transaction(async (tx) => {
          // Release products
          const allItems = await tx.tradeItem.findMany({
            where: { tradeId: trade.id },
          });

          await tx.product.updateMany({
            where: { id: { in: allItems.map((i) => i.productId) } },
            data: { status: ProductStatus.active },
          });

          // Cancel trade
          await tx.trade.update({
            where: { id: trade.id },
            data: {
              status: TradeStatus.cancelled,
              cancelReason: 'Süre dolumu nedeniyle otomatik iptal',
              cancelledAt: now,
            },
          });
        });
        cancelledCount++;
      } catch (error) {
        console.error(`Failed to auto-cancel trade ${trade.id}:`, error);
      }
    }

    return cancelledCount;
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================
  private async getTradeWithLock(tradeId: string) {
    const trade = await this.prisma.trade.findUnique({
      where: { id: tradeId },
    });

    if (!trade) {
      throw new NotFoundException('Takas bulunamadı');
    }

    return trade;
  }

  private mapToResponseDto(trade: any): TradeResponseDto {
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
      initiatorItems: (trade.initiatorItems || [])
        .filter((item: any) => item.side === 'initiator')
        .map((item: any) => ({
          id: item.id,
          productId: item.productId,
          productTitle: item.product?.title || '',
          productImage: item.product?.images?.[0]?.url,
          side: item.side,
          quantity: item.quantity,
          valueAtTrade: parseFloat(item.valueAtTrade),
        })),
      receiverItems: (trade.receiverItems || [])
        .filter((item: any) => item.side === 'receiver')
        .map((item: any) => ({
          id: item.id,
          productId: item.productId,
          productTitle: item.product?.title || '',
          productImage: item.product?.images?.[0]?.url,
          side: item.side,
          quantity: item.quantity,
          valueAtTrade: parseFloat(item.valueAtTrade),
        })),
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
