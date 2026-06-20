import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma';
import { CacheService } from '../cache/cache.service';
import { InitiatePaymentDto, PaymentProvider, PayTRCallbackDto } from './dto';
import { PaymentStatus, PaymentHoldStatus, OrderStatus, ProductStatus, SubscriptionStatus, TradeStatus, OfferStatus, RefundRequestStatus } from '@prisma/client';
import { getProductStatusFromQuantity } from '../product/helpers/product-status.helper';
import { safeDecrementReserved } from '../product/helpers/product-availability.helper';
import { computeRelevanceScore, RELEVANCE_PREMIUM_BONUS } from '../product/helpers/relevance-score';
import { PayTRService } from '../payment-providers/paytr.service';
import { EventService } from '../events';
import { InvoiceService } from '../invoice/invoice.service';
import { ProductLockService } from '../product/product-lock.service';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../notification/dto/notification.dto';
import { SuratCargoService } from '../surat-cargo/surat-cargo.service';
import { CommissionLedgerService } from '../commission/commission-ledger.service';
import { StorageService } from '../storage/storage.service';
import { Request } from 'express';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly holdDays: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly configService: ConfigService,
    private readonly paytrService: PayTRService,
    private readonly eventService: EventService,
    private readonly invoiceService: InvoiceService,
    private readonly productLockService: ProductLockService,
    private readonly notificationService: NotificationService,
    private readonly suratCargoService: SuratCargoService,
    private readonly commissionLedger: CommissionLedgerService,
    private readonly storageService: StorageService,
    private readonly moduleRef: ModuleRef,
  ) {
    this.holdDays = parseInt(this.configService.get('PAYMENT_HOLD_DAYS') || '7', 10);
  }

  /**
   * Cancel any active Surat shipment for an order. Best-effort: errors are logged
   * but don't block the calling flow. Used when an order is cancelled or refunded.
   */
  private async cancelSuratShipmentIfExists(orderId: string, orderNumber: string): Promise<void> {
    try {
      const shipment = await this.prisma.shipment.findFirst({
        where: { orderId, provider: 'surat' },
      });
      if (!shipment) return;

      // Skip if shipment is already in a terminal state
      const terminalStatuses = ['delivered', 'returned', 'cancelled', 'failed'];
      if (terminalStatuses.includes(shipment.status)) {
        this.logger.log(
          `Skip Surat cancel: shipment ${shipment.id} already ${shipment.status}`,
        );
        return;
      }

      const result = await this.suratCargoService.cancelShipmentByOrderNumber(orderNumber);
      if (result.ok) {
        await this.prisma.shipment.update({
          where: { id: shipment.id },
          data: { status: 'cancelled' as any },
        });
        this.logger.log(`Surat shipment cancelled for order ${orderNumber}`);
      } else {
        this.logger.warn(
          `Surat cancel returned non-OK for order ${orderNumber}: ${result.suratMessage}`,
        );
      }
    } catch (error: any) {
      this.logger.error(
        `Surat cancel failed for order ${orderNumber}: ${error.message}. Continuing anyway.`,
      );
    }
  }

  /**
   * Get client IP address from request
   */
  private getClientIp(req?: Request): string {
    if (!req) {
      return '127.0.0.1';
    }

    // Check for forwarded IP (behind proxy/load balancer)
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded;
      return ips.split(',')[0].trim();
    }

    // Check for real IP header
    const realIp = req.headers['x-real-ip'];
    if (realIp) {
      return Array.isArray(realIp) ? realIp[0] : realIp;
    }

    // Fallback to connection remote address
    return req.ip || req.socket?.remoteAddress || '127.0.0.1';
  }

  /**
   * Unified payment initiation for both authenticated and guest users
   * POST /payments/initiate
   */
  async initiatePaymentUnified(userId: string | null, dto: InitiatePaymentDto, req?: Request) {
    // Grup ödemesi: tek ödeme checkout grubundaki tüm siparişleri kapsar
    if (dto.checkoutGroupId) {
      return this.initiateGroupPayment(userId, dto, req);
    }

    // Verify order exists
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      include: {
        buyer: true,
        seller: true,
        product: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Sipariş bulunamadı');
    }

    // Check if this is a guest order
    const shippingAddress = order.shippingAddress as any;
    const isGuestOrder = shippingAddress?.isGuestOrder === true;

    // Validate access
    if (userId) {
      // Authenticated user - must be the buyer
      if (order.buyerId !== userId) {
        throw new ForbiddenException('Bu sipariş için ödeme yapamazsınız');
      }
    } else {
      // Guest user - order must be a guest order
      if (!isGuestOrder) {
        throw new ForbiddenException('Bu sipariş için giriş yapmanız gerekiyor');
      }
    }

    if (order.status !== OrderStatus.pending_payment) {
      throw new BadRequestException('Bu sipariş için ödeme beklenmiyor');
    }

    // 24h kill-switch: defense in depth in case the cron hasn't run yet.
    if (order.paymentExpiresAt && order.paymentExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException(
        'Ödeme süresi doldu. Lütfen yeni bir sipariş oluşturun.',
      );
    }

    return this.processPaymentInitiation(order, dto, req);
  }

  /**
   * Grup ödemesi başlatma: checkout grubundaki TÜM siparişler tek ödemeyle ödenir.
   * Tüm siparişler pending_payment olmalı; biri iptal olduysa grup ödenemez
   * (tutar grubun tamamı olduğundan kısmi tahsilat yapılamaz).
   */
  private async initiateGroupPayment(userId: string | null, dto: InitiatePaymentDto, req?: Request) {
    const group = await this.prisma.checkoutGroup.findUnique({
      where: { id: dto.checkoutGroupId },
      include: {
        orders: {
          include: { buyer: true, seller: true, product: true },
        },
      },
    });

    if (!group || group.orders.length === 0) {
      throw new NotFoundException('Sipariş grubu bulunamadı');
    }

    // Erişim kontrolü
    if (userId) {
      if (group.buyerId !== userId) {
        throw new ForbiddenException('Bu sipariş grubu için ödeme yapamazsınız');
      }
    } else if (!group.isGuest) {
      throw new ForbiddenException('Bu sipariş için giriş yapmanız gerekiyor');
    }

    const now = Date.now();
    for (const order of group.orders) {
      if (order.status !== OrderStatus.pending_payment) {
        throw new BadRequestException(
          `Gruptaki "${order.product?.title ?? order.orderNumber}" siparişi ödeme beklemiyor. Lütfen sepeti yeniden oluşturun.`,
        );
      }
      if (order.paymentExpiresAt && order.paymentExpiresAt.getTime() < now) {
        throw new BadRequestException('Ödeme süresi doldu. Lütfen yeni bir sipariş oluşturun.');
      }
    }

    return this.processGroupPaymentInitiation(group, dto, req);
  }

  /**
   * Grup ödemesi ortak başlatma mantığı (processPaymentInitiation'ın grup karşılığı).
   * Tek Payment satırı checkoutGroupId üzerinden yeniden kullanılır; PayTR'ye
   * groupNumber merchant_oid + sipariş başına basket item ile gidilir.
   */
  private async processGroupPaymentInitiation(group: any, dto: InitiatePaymentDto, req?: Request) {
    const bypassEnabled = this.configService.get('PAYMENT_BYPASS') === 'true';
    const totalAmount = Number(group.totalAmount);

    // 30-dk cron rezervasyonları bıraktıysa sipariş başına CAS ile yeniden al
    for (const order of group.orders) {
      if (order.reservationReleasedAt) {
        await this.prisma.$transaction(async (tx) => {
          const claimed = await tx.order.updateMany({
            where: { id: order.id, reservationReleasedAt: { not: null } },
            data: { reservationReleasedAt: null },
          });
          if (claimed.count === 0) return; // eşzamanlı retry kazandı
          await this.productLockService.checkAndReserve(tx, order.productId, 1);
        });
        this.logger.log(`Re-reserved 1 unit for group order ${order.id} after release (retry)`);
      }
    }

    // checkout_group_id UNIQUE: grup için tek Payment. Var olanı yeniden kullan
    // (PayTR iframe token'ları tek kullanımlık → her denemede sıfırla).
    const existingPayment = await this.prisma.payment.findUnique({
      where: { checkoutGroupId: group.id },
    });

    let payment;
    if (existingPayment) {
      if (existingPayment.status === PaymentStatus.completed) {
        throw new BadRequestException('Bu sipariş grubu zaten ödendi');
      }
      payment = await this.prisma.payment.update({
        where: { id: existingPayment.id },
        data: {
          status: PaymentStatus.pending,
          failureReason: null,
          providerPaymentId: null,
          amount: totalAmount,
          provider: PaymentProvider.paytr,
        },
      });
    } else {
      payment = await this.prisma.payment.create({
        data: {
          checkoutGroupId: group.id,
          amount: totalAmount,
          currency: 'TRY',
          provider: PaymentProvider.paytr,
          status: PaymentStatus.pending,
        },
      });
    }

    await this.logPaymentAction('created', payment.id, undefined, undefined, undefined, PaymentStatus.pending, {
      amount: totalAmount,
      provider: PaymentProvider.paytr,
      checkoutGroupId: group.id,
      groupNumber: group.groupNumber,
      orderIds: group.orders.map((o: any) => o.id),
      buyerId: group.buyerId,
    });

    if (bypassEnabled) {
      this.logger.warn(`PAYMENT_BYPASS active: group payment ${payment.id} ready for bypass completion`);
      return {
        paymentId: payment.id,
        checkoutGroupId: group.id,
        orderId: group.orders[0]?.id,
        amount: totalAmount,
        provider: PaymentProvider.paytr,
        expiresIn: 300,
        useBypass: true,
      };
    }

    // PayTR'ye grup için sanal sipariş (trade-cash precedenti): merchant_oid = groupNumber tabanlı
    const firstOrder = group.orders[0];
    const virtualOrder = {
      id: group.id,
      orderNumber: group.groupNumber,
      totalAmount,
      buyer: firstOrder.buyer,
      product: {
        id: group.id,
        title: `Sipariş ${group.groupNumber}`,
      },
      productId: firstOrder.productId,
      shippingAddress: firstOrder.shippingAddress,
    };
    const basketItems = group.orders.map((order: any) => ({
      id: order.product.id,
      name: order.product.title,
      category: 'Koleksiyon',
      price: Number(order.totalAmount),
      quantity: 1,
    }));

    const result = await this.initializePayTRPayment(
      payment,
      virtualOrder,
      this.getClientIp(req),
      basketItems,
    );
    return {
      paymentId: payment.id,
      checkoutGroupId: group.id,
      paymentUrl: result.paymentUrl,
      paymentHtml: result.paymentHtml,
      provider: PaymentProvider.paytr,
      expiresIn: 300,
    };
  }

  /**
   * Initiate payment for an order (legacy - for backward compatibility)
   */
  async initiatePayment(buyerId: string, dto: InitiatePaymentDto, req?: Request) {
    return this.initiatePaymentUnified(buyerId, dto, req);
  }

  /**
   * Initiate payment for a guest order (legacy - for backward compatibility)
   */
  async initiateGuestPayment(dto: InitiatePaymentDto, req?: Request) {
    return this.initiatePaymentUnified(null, dto, req);
  }

  /**
   * Initiate payment for a trade's cash amount (extra money on top of items).
   * Called from TradeController POST /trades/:id/cash-payment/initiate.
   */
  async initiateTradeCashPayment(tradeId: string, userId: string, req?: Request) {
    const trade = await this.prisma.trade.findUnique({
      where: { id: tradeId },
      include: {
        cashPayment: true,
        initiator: { select: { id: true, displayName: true, email: true, phone: true } },
        receiver: { select: { id: true, displayName: true, email: true, phone: true } },
      },
    });

    if (!trade) throw new NotFoundException('Takas bulunamadı');
    // Safe-trade akışı: cash trade kabul edildiğinde status 'awaiting_payment' olur.
    // Legacy akış için 'accepted' da destekleniyor.
    const payableStatuses: TradeStatus[] = [
      TradeStatus.accepted,
      TradeStatus.awaiting_payment,
    ];
    if (!payableStatuses.includes(trade.status)) {
      throw new BadRequestException('Takas henüz kabul edilmedi veya uygun durumda değil');
    }
    if (!trade.cashAmount || Number(trade.cashAmount) <= 0) {
      throw new BadRequestException('Bu takasta ekstra ödeme bulunmuyor');
    }
    if (trade.cashPayerId !== userId) {
      throw new ForbiddenException('Bu ödemeyi sadece belirlenmiş ödeyen taraf başlatabilir');
    }

    const cashPayment = trade.cashPayment;
    if (!cashPayment) {
      throw new BadRequestException('Nakit ödeme kaydı bulunamadı');
    }
    if (cashPayment.status === PaymentStatus.completed) {
      throw new BadRequestException('Bu takas ödemesi zaten tamamlandı');
    }

    const bypassEnabled = this.configService.get('PAYMENT_BYPASS') === 'true';

    // trade_cash_payment_id is unique: only one Payment per TradeCashPayment. Reuse existing if any.
    const existingPayment = await this.prisma.payment.findUnique({
      where: { tradeCashPaymentId: cashPayment.id },
    });

    const provider = PaymentProvider.paytr;
    const totalAmount = Number(cashPayment.totalAmount);

    // Build a virtual order-like object for PayTR initialization (shared between fresh/retry paths).
    const payer = trade.cashPayerId === trade.initiatorId ? trade.initiator : trade.receiver;
    const virtualOrder = {
      id: tradeId,
      orderNumber: `TRADE-${trade.tradeNumber}`,
      totalAmount,
      buyer: payer,
      product: {
        id: `trade-cash-${tradeId}`,
        title: `Takas #${trade.tradeNumber} Ekstra Ödeme`,
      },
      productId: `trade-cash-${tradeId}`,
      shippingAddress: null,
    };

    // PAYMENT_BYPASS: dev/test — PayTR token üretmeden; istemci bypass-complete çağırır.
    if (existingPayment) {
      if (existingPayment.status === PaymentStatus.completed) {
        throw new BadRequestException('Bu takas ödemesi zaten tamamlandı');
      }
      if (bypassEnabled) {
        await this.prisma.payment.update({
          where: { id: existingPayment.id },
          data: {
            status: PaymentStatus.pending,
            failureReason: null,
            providerPaymentId: null,
          },
        });
        this.logger.warn(`PAYMENT_BYPASS: trade cash payment ${existingPayment.id} ready for bypass completion`);
        return {
          paymentId: existingPayment.id,
          tradeId,
          amount: totalAmount,
          provider: existingPayment.provider,
          expiresIn: 300,
          useBypass: true,
        };
      }
    }

    // Retry path: reuse existing Payment row but generate a fresh PayTR iframe token,
    // because PayTR iframe tokens are single-use. Returning the old providerPaymentId
    // leads to "Bu ödeme sayfası artık geçersiz" on the PayTR iframe.
    if (existingPayment) {
      await this.prisma.payment.update({
        where: { id: existingPayment.id },
        data: {
          status: PaymentStatus.pending,
          failureReason: null,
          providerPaymentId: null,
        },
      });

      try {
        const result = await this.initializePayTRPayment(
          { ...existingPayment, providerPaymentId: null },
          virtualOrder,
          this.getClientIp(req),
        );
        return {
          paymentId: existingPayment.id,
          paymentUrl: result.paymentUrl,
          paymentHtml: result.paymentHtml,
          provider: existingPayment.provider,
          expiresIn: 300,
          tradeId,
          amount: totalAmount,
        };
      } catch (error: any) {
        await this.prisma.payment.update({
          where: { id: existingPayment.id },
          data: {
            status: PaymentStatus.failed,
            failureReason: error.message || 'PayTR ödeme başlatılamadı',
          },
        });
        throw new BadRequestException(error.message || 'PayTR ödeme başlatılamadı');
      }
    }

    const payment = await this.prisma.payment.create({
      data: {
        tradeCashPaymentId: cashPayment.id,
        amount: totalAmount,
        currency: 'TRY',
        provider,
        status: PaymentStatus.pending,
      },
    });

    await this.logPaymentAction('created', payment.id, undefined, undefined, undefined, PaymentStatus.pending, {
      amount: totalAmount,
      provider,
      tradeId,
      tradeCashPaymentId: cashPayment.id,
      payerId: userId,
    });

    if (bypassEnabled) {
      this.logger.warn(`PAYMENT_BYPASS: trade cash payment ${payment.id} ready for bypass completion`);
      return {
        paymentId: payment.id,
        tradeId,
        amount: totalAmount,
        provider,
        expiresIn: 300,
        useBypass: true,
      };
    }

    try {
      const result = await this.initializePayTRPayment(payment, virtualOrder, this.getClientIp(req));
      return {
        paymentId: payment.id,
        paymentUrl: result.paymentUrl,
        paymentHtml: result.paymentHtml,
        provider,
        expiresIn: 300,
        tradeId,
        amount: totalAmount,
      };
    } catch (error: any) {
      // Mark payment as failed but don't release products (trade products are managed separately)
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.failed, failureReason: error.message || 'PayTR ödeme başlatılamadı' },
      });
      throw new BadRequestException(error.message || 'PayTR ödeme başlatılamadı');
    }
  }

  /**
   * Common payment initiation logic for both authenticated and guest users
   */
  private async processPaymentInitiation(order: any, dto: InitiatePaymentDto, req?: Request) {
    // Check for existing pending payment
    const existingPayment = await this.prisma.payment.findFirst({
      where: {
        orderId: dto.orderId,
        status: PaymentStatus.pending,
      },
    });

    if (existingPayment) {
      const bypassEnabled = this.configService.get('PAYMENT_BYPASS') === 'true';

      // Reset row before reuse: PayTR iframe tokens are single-use, so we must
      // mint a fresh one on every retry (otherwise iframe shows
      // "Bu ödeme sayfası artık geçersiz").
      await this.prisma.payment.update({
        where: { id: existingPayment.id },
        data: {
          status: PaymentStatus.pending,
          failureReason: null,
          providerPaymentId: null,
        },
      });

      // 30-min cron released the reservation; re-acquire it before letting
      // the buyer retry. CAS-gate on reservationReleasedAt: only the request
      // that flips it null actually re-reserves, so concurrent double-clicks
      // can't both increment reservedQuantity.
      if (order.reservationReleasedAt) {
        await this.prisma.$transaction(async (tx) => {
          const claimed = await tx.order.updateMany({
            where: { id: order.id, reservationReleasedAt: { not: null } },
            data: { reservationReleasedAt: null },
          });
          if (claimed.count === 0) return; // another concurrent retry already won
          await this.productLockService.checkAndReserve(tx, order.productId, 1);
        });
        this.logger.log(
          `Re-reserved 1 unit for order ${order.id} after 30-min release (retry)`,
        );
      }

      if (bypassEnabled) {
        return {
          paymentId: existingPayment.id,
          orderId: order.id,
          amount: Number(order.totalAmount),
          provider: existingPayment.provider,
          expiresIn: 300,
          useBypass: true,
        };
      }

      try {
        const result = await this.initializePayTRPayment(
          { ...existingPayment, providerPaymentId: null },
          order,
          this.getClientIp(req),
        );
        return {
          paymentId: existingPayment.id,
          paymentUrl: result.paymentUrl,
          paymentHtml: result.paymentHtml,
          provider: existingPayment.provider,
          expiresIn: 300,
        };
      } catch (error: any) {
        throw new BadRequestException(error.message || 'PayTR ödeme başlatılamadı');
      }
    }

    // Offer-based order ise: ödeme başlatılırken stok rezerve et.
    // Direct buy'da reserve zaten createDirectBuyOrder'da yapıldı, AMA cron
    // 30-dk sonunda serbest bıraktıysa retry'da yeniden almak gerekir.
    if (order.offerId && !order.reservationReleasedAt) {
      // First-time payment for an offer-flow order — straightforward reserve.
      await this.prisma.$transaction(async (tx) => {
        await this.productLockService.checkAndReserve(tx, order.productId, 1);
      });
      this.logger.log(`Reserved 1 unit for offer-based order ${order.id} (product ${order.productId})`);
    } else if (order.reservationReleasedAt) {
      // Retry after 30-min release. CAS-gate on the flag so concurrent
      // initiate calls can't both increment reservedQuantity.
      await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.order.updateMany({
          where: { id: order.id, reservationReleasedAt: { not: null } },
          data: { reservationReleasedAt: null },
        });
        if (claimed.count === 0) return;
        await this.productLockService.checkAndReserve(tx, order.productId, 1);
      });
      this.logger.log(`Re-reserved 1 unit for order ${order.id} after release`);
    }

    // Create payment record.
    // order_id UNIQUE: bir sipariş için tek Payment. Önceki ödeme başarısız/iptal olduysa
    // (ödeme zaman aşımı → kullanıcı geri dönüp tekrar öder) var olanı YENİDEN KULLAN; aksi halde
    // yeni create 'Unique constraint failed (order_id)' ile 500 verir (re-ödeme akışı çöker).
    const existingOrderPayment = await this.prisma.payment.findUnique({
      where: { orderId: dto.orderId },
    });
    let payment;
    if (existingOrderPayment) {
      if (existingOrderPayment.status === PaymentStatus.completed) {
        throw new BadRequestException('Bu sipariş zaten ödendi');
      }
      payment = await this.prisma.payment.update({
        where: { id: existingOrderPayment.id },
        data: {
          status: PaymentStatus.pending,
          failureReason: null,
          providerPaymentId: null,
          amount: order.totalAmount,
          provider: PaymentProvider.paytr,
        },
      });
    } else {
      payment = await this.prisma.payment.create({
        data: {
          orderId: dto.orderId,
          amount: order.totalAmount,
          currency: 'TRY',
          provider: PaymentProvider.paytr,
          status: PaymentStatus.pending,
        },
      });
    }

    // Log payment creation
    await this.logPaymentAction('created', payment.id, dto.orderId, undefined, undefined, PaymentStatus.pending, {
      amount: Number(order.totalAmount),
      provider: PaymentProvider.paytr,
      buyerId: order.buyerId,
    });

    // PAYMENT_BYPASS: dev/test modunda PayTR'ye gitmeden ödemeyi tamamla
    const bypassEnabled = this.configService.get('PAYMENT_BYPASS') === 'true';
    if (bypassEnabled) {
      this.logger.warn(`PAYMENT_BYPASS active: payment ${payment.id} ready for bypass completion`);
      return {
        paymentId: payment.id,
        orderId: order.id,
        amount: Number(order.totalAmount),
        provider: PaymentProvider.paytr,
        expiresIn: 300,
        useBypass: true,
      };
    }

    // Generate payment URL based on provider
    const clientIp = this.getClientIp(req);

    const result = await this.initializePayTRPayment(payment, order, clientIp);
    return {
      paymentId: payment.id,
      paymentUrl: result.paymentUrl,
      paymentHtml: result.paymentHtml,
      provider: PaymentProvider.paytr,
      expiresIn: 300, // 5 minutes
    };
  }

  /**
   * Bypass payment completion (dev/test only)
   * Directly marks payment as successful without going through PayTR.
   */
  async bypassCompletePayment(paymentId: string): Promise<{ success: boolean }> {
    const bypassEnabled = this.configService.get('PAYMENT_BYPASS') === 'true';
    if (!bypassEnabled) {
      throw new BadRequestException('Payment bypass is not enabled');
    }

    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        order: {
          include: {
            buyer: true,
            seller: true,
            product: true,
          },
        },
        tradeCashPayment: true,
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    if (payment.status !== PaymentStatus.pending) {
      throw new BadRequestException(`Payment already ${payment.status}`);
    }

    const did = await this.processSuccessfulPayment(payment, `bypass:${paymentId}`);
    this.logger.warn(`PAYMENT_BYPASS: payment ${paymentId} completed (did=${did})`);

    return { success: did };
  }

  /**
   * Initialize PayTR payment
   * Uses PayTR iframe token API for secure payment
   */
  private async initializePayTRPayment(
    payment: any,
    order: any,
    clientIp: string,
    basketItemsOverride?: Array<{ id: string; name: string; category: string; price: number; quantity: number }>,
  ) {
    this.logger.log(`Initializing PayTR payment for order ${order.id}`);

    // PayTR merchant_oid sadece harf ve rakam kabul ediyor (tire vb. kabul etmiyor)
    // Test merchant ortamında geçmiş kullanımdan çakışmamak için 6 haneli timestamp suffix
    const baseOid = String(order.orderNumber || order.id).replace(/-/g, '');
    const merchantOid = `${baseOid}T${Date.now().toString().slice(-6)}`;

    try {
      // Get shipping address from order
      const shippingAddress = order.shippingAddress as any;

      // Prepare buyer info with actual shipping address
      const buyerName = order.buyer.displayName?.split(' ') || ['Müşteri', ''];
      const buyerFirstName = buyerName[0] || 'Müşteri';
      const buyerLastName = buyerName.slice(1).join(' ') || '';

      const buyer = {
        id: order.buyer.id,
        name: buyerFirstName,
        surname: buyerLastName,
        email: order.buyer.email,
        phone: shippingAddress?.phone || order.buyer.phone || '+905000000000',
        ip: clientIp,
        address: shippingAddress?.address || shippingAddress?.fullAddress || 'Türkiye',
        city: shippingAddress?.city || 'İstanbul',
      };

      // Prepare basket items (grup ödemesinde sipariş başına bir satır)
      const basketItems = basketItemsOverride ?? [{
        id: order.product.id,
        name: order.product.title,
        category: 'Koleksiyon',
        price: Number(order.totalAmount),
        quantity: 1,
      }];

      // Membership ödemelerinde başarı sayfası /membership/success olsun (PayTR yönlendirmesi)
      const isMembershipOrder = order.productId?.startsWith?.('membership-');
      // PayTR success URL'ine paymentId ekle: success sayfası verify endpoint'ini bu ID ile çağırır.
      const successQueryParams = isMembershipOrder
        ? `paymentId=${payment.id}&type=membership`
        : `paymentId=${payment.id}`;
      const result = await this.paytrService.processOrderPayment(
        merchantOid,
        Number(order.totalAmount),
        buyer,
        basketItems,
        1, // installment count
        successQueryParams,
      );

      // Y8: Her (re-)init yeni merchant_oid üretir (PayTR aynı oid'i ikinci kez kabul
      // etmez). providerConversationId'yi ezmeden ÖNCE eski oid'i merchantOidHistory'e
      // ekle ki kullanıcı ESKİ token'la öderse gelen callback (eski oid'li) yine eşleşsin
      // — aksi halde ödeme sessizce kaybolurdu.
      const current = await this.prisma.payment.findUnique({
        where: { id: payment.id },
        select: { providerConversationId: true, metadata: true },
      });
      const prevMeta = (current?.metadata as any) || {};
      const oidHistory: string[] = Array.isArray(prevMeta.merchantOidHistory)
        ? prevMeta.merchantOidHistory
        : [];
      const prevOid = current?.providerConversationId;
      if (prevOid && prevOid !== merchantOid && !oidHistory.includes(prevOid)) {
        oidHistory.push(prevOid);
      }
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          providerPaymentId: result.token,
          providerConversationId: merchantOid,
          metadata: { ...prevMeta, merchantOidHistory: oidHistory },
        },
      });

      // Return iframe URL and HTML for embedding
      return {
        paymentUrl: result.iframeUrl,
        paymentHtml: `<iframe src="${result.iframeUrl}" frameborder="0" style="width:100%;height:600px;border:none;"></iframe>`,
      };
    } catch (error: any) {
      this.logger.error(`PayTR initialization error: ${error.message}`, error.stack);

      // Ödeme hiç başlamadı ama sipariş oluştuğu için ürün rezerve kaldı – hemen serbest bırak (stoktan düşmesin)
      try {
        await this.processFailedPayment(payment, error?.message || 'PayTR ödeme başlatılamadı');
      } catch (releaseErr: any) {
        this.logger.warn(`Release product after PayTR init error failed: ${releaseErr?.message}`);
      }

      throw new BadRequestException(
        error.message || 'PayTR ödeme başlatılamadı',
      );
    }
  }

  /**
   * Resolve payment row for PayTR callback (merchant_oid matches providerConversationId, orderId, or token substring).
   */
  private async findPaymentForPaytrCallback(merchantOid: string) {
    const callbackInclude = {
      order: {
        include: {
          buyer: true,
          seller: true,
          product: true,
        },
      },
      checkoutGroup: {
        include: {
          orders: {
            include: { buyer: true, seller: true, product: true },
          },
        },
      },
      tradeCashPayment: true,
    } as const;

    let payment = await this.prisma.payment.findFirst({
      where: {
        OR: [
          { providerConversationId: merchantOid },
          { orderId: merchantOid },
        ],
      },
      include: callbackInclude,
    });

    // Y8: Re-init'te providerConversationId yeni oid ile ezilir; kullanıcı eski token'la
    // ödemiş olabilir → eski oid'i metadata.merchantOidHistory'de arıyoruz. (O8: eski
    // `providerPaymentId contains merchantOid` fallback'i anlamsızdı — providerPaymentId
    // PayTR token'ıdır, merchant_oid içermez — kaldırıldı.)
    if (!payment) {
      payment = await this.prisma.payment.findFirst({
        where: {
          metadata: { path: ['merchantOidHistory'], array_contains: merchantOid },
        },
        include: callbackInclude,
      });
    }

    return payment;
  }

  /**
   * Hash mismatch: do not trust callback body; verify via PayTR durum-sorgu when a pending PayTR payment exists.
   * Returns OK so PayTR stops retrying; logs errors for ops.
   */
  private async handlePayTRCallbackHashMismatch(dto: PayTRCallbackDto): Promise<string> {
    const payment = await this.findPaymentForPaytrCallback(dto.merchant_oid);

    if (!payment) {
      this.logger.error(
        `PayTR callback invalid hash and no payment row: merchant_oid=${dto.merchant_oid} status=${dto.status}`,
      );
      throw new NotFoundException('Payment not found');
    }

    if (payment.provider !== PaymentProvider.paytr) {
      this.logger.error(
        `PayTR hash mismatch: payment=${payment.id} provider=${payment.provider} merchant_oid=${dto.merchant_oid}`,
      );
      return 'OK';
    }

    if (payment.status !== PaymentStatus.pending) {
      this.logger.error(
        `PayTR hash mismatch: payment=${payment.id} status=${payment.status} merchant_oid=${dto.merchant_oid}`,
      );
      return 'OK';
    }

    if (payment.orderId && payment.order && payment.order.status !== OrderStatus.pending_payment) {
      this.logger.error(
        `PayTR hash mismatch: payment=${payment.id} orderStatus=${payment.order.status} merchant_oid=${dto.merchant_oid}`,
      );
      return 'OK';
    }

    const tolerance = parseFloat(
      this.configService.get('PAYTR_RECONCILE_AMOUNT_TOLERANCE_TL') || '0.05',
    );
    const oid =
      (payment.providerConversationId || dto.merchant_oid || '').trim() || dto.merchant_oid.trim();

    let inquiry = await this.paytrService.queryPaymentStatus(oid);
    if (!inquiry.ok && oid.includes('-')) {
      inquiry = await this.paytrService.queryPaymentStatus(oid.replace(/-/g, ''));
    }

    if (!inquiry.ok) {
      const fail = inquiry as { ok: false; errNo?: string; errMsg?: string };
      this.logger.error(
        `PayTR hash mismatch: durum-sorgu failed payment=${payment.id} merchant_oid=${dto.merchant_oid} oid=${oid} err=${fail.errMsg ?? fail.errNo ?? 'unknown'} ourAmount=${Number(payment.amount)}`,
      );
      return 'OK';
    }

    const ourAmount = Number(payment.amount);
    if (Math.abs(inquiry.paymentTotalTl - ourAmount) > tolerance) {
      this.logger.error(
        `PayTR hash mismatch: amount mismatch payment=${payment.id} merchant_oid=${dto.merchant_oid} paytr=${inquiry.paymentTotalTl} ours=${ourAmount}`,
      );
      return 'OK';
    }

    const txnRef =
      inquiry.paymentDate != null && inquiry.paymentDate !== ''
        ? `paytr:${oid}:${inquiry.paymentDate}`
        : `paytr:${oid}`;

    const did = await this.processSuccessfulPayment(payment, txnRef);
    if (did) {
      this.logger.log(
        `PayTR hash mismatch recovered via durum-sorgu payment=${payment.id} merchant_oid=${dto.merchant_oid} dtoStatus=${dto.status}`,
      );
    }
    return 'OK';
  }

  /**
   * Handle PayTR callback
   * POST /payments/callback/paytr
   */
  async handlePayTRCallback(dto: PayTRCallbackDto) {
    this.logger.log('PayTR callback received');

    // PayTR keeps retrying unless we reply with literal "OK". Always return
    // "OK" — even on bad/missing payloads — and just log the issue.
    if (!dto.merchant_oid || !dto.status || !dto.total_amount || !dto.hash) {
      this.logger.warn(
        `PayTR callback missing required fields: merchant_oid=${dto.merchant_oid} status=${dto.status} total_amount=${dto.total_amount} hash=${dto.hash ? 'present' : 'missing'}`,
      );
      return 'OK';
    }

    const isValid = this.paytrService.verifyCallback({
      merchant_oid: dto.merchant_oid,
      status: dto.status as 'success' | 'failed',
      total_amount: dto.total_amount,
      hash: dto.hash,
      failed_reason_code: dto.failed_reason_code,
      failed_reason_msg: dto.failed_reason_msg,
    });

    if (!isValid) {
      return this.handlePayTRCallbackHashMismatch(dto);
    }

    const payment = await this.findPaymentForPaytrCallback(dto.merchant_oid);

    if (!payment) {
      this.logger.warn(`PayTR callback: payment not found for merchant_oid=${dto.merchant_oid}`);
      return 'OK';
    }

    if (dto.status === 'success') {
      // Y16: Hash geçerli (otantik PayTR) olsa bile tutarı doğrula. PayTR beklenenden
      // farklı bir tutar bildirirse (ör. kısmi capture veya gevşek eşleşme), siparişi
      // YANLIŞ tutarla completed yapmayalım. Tolerans dışıysa logla ve tamamlama —
      // para PayTR'da kalır, sipariş pending kalır ve reconcile/manuel inceleme ele alır.
      const toleranceTl = parseFloat(
        this.configService.get('PAYTR_RECONCILE_AMOUNT_TOLERANCE_TL') || '0.05',
      );
      const expectedKurus = Math.round(Number(payment.amount) * 100);
      const callbackKurus = parseInt(dto.total_amount, 10);
      if (Math.abs(callbackKurus - expectedKurus) / 100 > toleranceTl) {
        this.logger.error(
          `PayTR callback tutar uyuşmazlığı (merchant_oid=${dto.merchant_oid}): ` +
            `beklenen ${expectedKurus} kuruş, gelen ${callbackKurus} kuruş — ` +
            `ödeme TAMAMLANMADI, manuel inceleme gerekir`,
        );
        return 'OK';
      }
      await this.processSuccessfulPayment(payment, dto.merchant_oid);
    } else {
      await this.processFailedPayment(payment, dto.failed_reason_msg || 'PayTR payment failed');
    }

    return 'OK';
  }

  /**
   * Log payment action to audit log
   * Note: AuditLog requires adminUserId, so we only log admin actions
   * For user actions, we store in payment metadata
   */
  private async logPaymentAction(
    action: string,
    paymentId: string,
    orderId?: string,
    adminUserId?: string,
    oldStatus?: PaymentStatus,
    newStatus?: PaymentStatus,
    metadata?: any,
  ) {
    try {
      // Only log to AuditLog if adminUserId is provided (admin actions)
      if (adminUserId) {
        // Check if admin user exists
        const adminUser = await this.prisma.adminUser.findUnique({
          where: { id: adminUserId },
        });

        if (adminUser) {
          await this.prisma.auditLog.create({
            data: {
              adminUserId,
              action: `payment.${action}`,
              entityType: 'Payment',
              entityId: paymentId,
              oldValue: oldStatus
                ? {
                  status: oldStatus,
                  paymentId,
                  orderId,
                  ...metadata,
                }
                : null,
              newValue: newStatus
                ? {
                  status: newStatus,
                  paymentId,
                  orderId,
                  ...metadata,
                }
                : {
                  paymentId,
                  orderId,
                  ...metadata,
                },
            },
          });
        }
      }

      // For all actions (including user actions), store in payment metadata
      const payment = await this.prisma.payment.findUnique({
        where: { id: paymentId },
      });

      if (payment) {
        const auditHistory = (payment.metadata as any)?.auditHistory || [];
        auditHistory.push({
          action: `payment.${action}`,
          timestamp: new Date().toISOString(),
          adminUserId: adminUserId || null,
          oldStatus,
          newStatus,
          ...metadata,
        });

        await this.prisma.payment.update({
          where: { id: paymentId },
          data: {
            metadata: {
              ...(payment.metadata as any || {}),
              auditHistory,
            },
          },
        });
      }
    } catch (error) {
      // Log but don't fail payment operations
      this.logger.error(`Failed to log payment action ${action}: ${error}`);
    }
  }

  /**
   * Process successful payment
   * Requirement: Queue job publishing after payment (3.1)
   * @returns true if this invocation completed the payment; false if already completed (idempotent / race with callback).
   */
  private async processSuccessfulPayment(payment: any, transactionId?: string): Promise<boolean> {
    // Trade cash payment: different flow from order payments
    if (payment.tradeCashPaymentId && !payment.orderId) {
      return this.processSuccessfulTradeCashPayment(payment, transactionId);
    }

    // Grup ödemesi: tüm grup siparişleri tek transaction'da işlenir
    if (payment.checkoutGroupId && !payment.orderId) {
      return this.processSuccessfulGroupPayment(payment, transactionId);
    }

    const cancelledOrders: {
      buyerId: string;
      productId: string;
      productTitle: string;
      offerId: string | null;
      hadPayment: boolean;
    }[] = [];
    const cancelledOffers: { buyerId: string; productId: string; productTitle: string }[] = [];
    let stockoutCategoryId: string | null = null;

    const result = await this.prisma.$transaction(async (tx) => {
      const oldStatus = payment.status;

      const auditHistory = ((payment.metadata as any)?.auditHistory || []).concat({
        action: 'payment.completed',
        timestamp: new Date().toISOString(),
        oldStatus,
        newStatus: PaymentStatus.completed,
        transactionId: transactionId || payment.providerPaymentId,
      });

      const newMetadata = {
        ...(payment.metadata as any || {}),
        auditHistory,
      };

      const claimed = await tx.payment.updateMany({
        where: {
          id: payment.id,
          status: PaymentStatus.pending,
        },
        data: {
          status: PaymentStatus.completed,
          paidAt: new Date(),
          providerPaymentId: transactionId || payment.providerPaymentId,
          metadata: newMetadata as object,
        },
      });

      if (claimed.count === 0) {
        return null;
      }

      // Verify order is still pending_payment before promoting to preparing.
      // Race window: cron may have cancelled the order while PayTR callback was in flight.
      const currentOrder = await tx.order.findUnique({
        where: { id: payment.orderId },
        select: { status: true, orderNumber: true },
      });

      if (currentOrder?.status === OrderStatus.cancelled) {
        this.logger.warn(
          `Payment ${payment.id} succeeded but order ${payment.orderId} (${currentOrder.orderNumber}) already cancelled. Auto-refund required.`,
        );
        return { autoRefundRequired: true, orderId: payment.orderId, paymentId: payment.id };
      }

      // Update order status to PREPARING with shipping deadline for the seller
      const preparingDays = parseInt(
        this.configService.get('PREPARING_DEADLINE_DAYS') || '3',
        10,
      );
      const preparingDeadline = new Date();
      preparingDeadline.setDate(preparingDeadline.getDate() + preparingDays);

      await tx.order.update({
        where: { id: payment.orderId },
        data: {
          status: OrderStatus.preparing,
          preparingDeadline,
          version: { increment: 1 },
        },
      });

      // Check if this is a membership order (productId starts with "membership-")
      const isMembershipOrder = payment.order?.productId?.startsWith('membership-') ?? false;
      // Boost (öne çıkarma) siparişi mi? (productId "boost-" ile başlar)
      const isBoostOrder = payment.order?.productId?.startsWith('boost-') ?? false;
      const productIdsToInvalidate: string[] = [];

      if (isMembershipOrder) {
        // Activate membership for the buyer
        const membership = await tx.userMembership.findUnique({
          where: { userId: payment.order.buyerId },
          include: { tier: true },
        });

        if (membership) {
          await tx.userMembership.update({
            where: { userId: payment.order.buyerId },
            data: {
              status: SubscriptionStatus.active,
              cancelledAt: null,
            },
          });

          // Premium (free olmayan) üyelik aktifleşti: satıcının boost'suz aktif ilanlarını
          // premium kademesine (rankTier=1) yükselt. Boost'lu (2) ürünlere dokunma.
          if (membership.tier.type !== 'free') {
            await tx.product.updateMany({
              where: {
                sellerId: payment.order.buyerId,
                status: ProductStatus.active,
                rankTier: 0,
              },
              // rankTier 0→1; relevanceScore'a premium bonusu ekle (kademe 0→1 farkı)
              data: { rankTier: 1, relevanceScore: { increment: RELEVANCE_PREMIUM_BONUS } },
            });
          }

          // Update membership payment record
          await tx.membershipPayment.updateMany({
            where: {
              membershipId: membership.id,
              status: 'pending',
            },
            data: {
              status: 'completed',
              providerPaymentId: transactionId || payment.providerPaymentId,
            },
          });

          this.logger.log(`Membership activated for user ${payment.order.buyerId} after payment ${payment.id}`);
        }

        // Üyelik sanal hizmettir: kargo/teslimat akışına girmesin → terminal "completed".
        // (Paylaşılan kod yukarıda preparing yapmıştı; boost ile aynı override.)
        await tx.order.update({
          where: { id: payment.orderId },
          data: { status: OrderStatus.completed, preparingDeadline: null },
        });

        // Yetim sipariş temizliği: kullanıcı birden çok kez "Ödemeyi tamamla"ya
        // basıp yarım bıraktıysa, aynı sanal üründen başka pending_payment
        // siparişler kalmış olabilir. Üyelik artık aktif → onları iptal et ki
        // sarı "ödemeyi tamamla" uyarısı / yetim ödeme kayıtları kalmasın.
        const siblingPendings = await tx.order.findMany({
          where: {
            buyerId: payment.order.buyerId,
            productId: payment.order.productId,
            status: OrderStatus.pending_payment,
            id: { not: payment.orderId },
          },
          select: { id: true },
        });
        if (siblingPendings.length > 0) {
          const ids = siblingPendings.map((o) => o.id);
          await tx.order.updateMany({
            where: { id: { in: ids } },
            data: { status: OrderStatus.cancelled },
          });
          await tx.payment.updateMany({
            where: { orderId: { in: ids }, status: PaymentStatus.pending },
            data: { status: PaymentStatus.failed, failureReason: 'Üyelik başka ödeme ile tamamlandı' },
          });
          this.logger.log(`Cancelled ${ids.length} sibling pending membership orders for user ${payment.order.buyerId}`);
        }
      } else if (isBoostOrder) {
        // Boost siparişi: ilgili ProductBoost'u aktive et, ürünü sponsorlu kademesine (rankTier=2) al.
        // Stok/quantity'ye DOKUNULMAZ — boost sanal bir hizmet, fiziksel ürün değil.
        const boost = await tx.productBoost.findUnique({
          where: { orderId: payment.orderId },
        });
        if (boost) {
          const nowTs = new Date();
          // Stacking: ilanda hâlâ aktif bir boost varsa, yeni süre kalan sürenin ÜSTÜNE eklenir.
          // (örn. kalan 15 gün + yeni 30 gün = toplam 45 gün)
          const boostedProduct = await tx.product.findUnique({
            where: { id: boost.productId },
            select: { boostedUntil: true, qualityScore: true, popularityScore: true },
          });
          const base =
            boostedProduct?.boostedUntil && boostedProduct.boostedUntil > nowTs
              ? boostedProduct.boostedUntil
              : nowTs;
          const startsAt = nowTs;
          const endsAt = new Date(
            base.getTime() + boost.durationDays * 24 * 60 * 60 * 1000,
          );
          await tx.productBoost.update({
            where: { id: boost.id },
            data: { status: 'active', startsAt, endsAt },
          });
          await tx.product.update({
            where: { id: boost.productId },
            data: {
              boostedUntil: endsAt,
              rankTier: 2,
              relevanceScore: computeRelevanceScore({
                rankTier: 2,
                qualityScore: boostedProduct?.qualityScore ?? 0,
                popularityScore: boostedProduct?.popularityScore,
              }),
            },
          });
          // Boost sanal hizmettir: sipariş kargo/teslimat akışına girmesin → terminal "completed".
          // (Paylaşılan kod yukarıda preparing yapmıştı; burada override ediyoruz.)
          await tx.order.update({
            where: { id: payment.orderId },
            data: { status: OrderStatus.completed, preparingDeadline: null },
          });
          productIdsToInvalidate.push(boost.productId);
          this.logger.log(
            `Boost activated for product ${boost.productId} until ${endsAt.toISOString()} after payment ${payment.id}`,
          );
        } else {
          this.logger.warn(`Boost order ${payment.orderId} paid but no matching ProductBoost found`);
        }
      } else {
        // Regular product order: ödeme başarılı → quantity--, reservedQuantity--
        productIdsToInvalidate.push(payment.order.productId);
        const product = await tx.product.findUnique({
          where: { id: payment.order.productId },
        });

        if (!product) {
          throw new Error('Product not found');
        }

        const newQuantity =
          product.quantity !== null ? product.quantity - 1 : null;
        const updateData: any = {
          status: getProductStatusFromQuantity(newQuantity),
          reservedQuantity: safeDecrementReserved(product.reservedQuantity, 1),
        };
        if (product.quantity !== null) {
          updateData.quantity = { decrement: 1 };
        }

        await tx.product.update({
          where: { id: payment.order.productId },
          data: updateData,
        });

        // Stockout cascade: if this purchase drained the last available unit,
        // cancel other open offers/orders for the same product within the same
        // transaction so no other buyer can complete a payment that would push
        // stock negative. The order matters: invalidate pending orders FIRST
        // (so their linked offers chain-cancel atomically), then sweep any
        // remaining standalone offers. Both helpers are idempotent w.r.t.
        // already-terminal rows, and the order helper now safely clamps the
        // reservedQuantity decrement.
        const refreshed = await tx.product.findUnique({
          where: { id: payment.order.productId },
          select: { quantity: true, reservedQuantity: true, categoryId: true },
        });
        const available =
          (refreshed?.quantity ?? 0) - (refreshed?.reservedQuantity ?? 0);
        if (refreshed && refreshed.quantity !== null && available <= 0) {
          stockoutCategoryId = refreshed.categoryId ?? null;
          const orderResult = await this.productLockService.invalidatePendingOrdersForProduct(
            tx,
            payment.order.productId,
            'Stok tükendi',
          );
          const offerResult = await this.productLockService.invalidateRelatedOffers(
            tx,
            payment.order.productId,
          );
          cancelledOrders.push(
            ...orderResult.cancelledOrders.map((o) => ({
              buyerId: o.buyerId,
              productId: o.productId,
              productTitle: o.productTitle,
              offerId: o.offerId,
              hadPayment: o.hadPayment,
            })),
          );
          cancelledOffers.push(
            ...offerResult.rejectedOffers.map((o) => ({
              buyerId: o.buyerId,
              productId: o.productId,
              productTitle: o.productTitle,
            })),
          );
        }

        this.logger.log(
          `Product ${payment.order.productId} stock updated: quantity=${newQuantity}, reserved=${updateData.reservedQuantity}`,
        );
      }

      // Get full order details for event emission
      const order = await tx.order.findUnique({
        where: { id: payment.orderId },
        include: {
          buyer: true,
          seller: true,
          product: true,
        },
      });

      if (!order) {
        throw new Error('Order not found after payment');
      }

      // Only create payment hold for regular product orders (not membership/boost orders)
      if (!isMembershipOrder && !isBoostOrder) {
        // Calculate seller payout (amount - commission)
        const sellerAmount = Number(order.totalAmount) - Number(order.commissionAmount);

        // Create payment hold for seller (escrow)
        const releaseAt = new Date();
        releaseAt.setDate(releaseAt.getDate() + this.holdDays);

        await tx.paymentHold.create({
          data: {
            paymentId: payment.id,
            orderId: payment.orderId,
            sellerId: order.sellerId,
            amount: sellerAmount,
            status: PaymentHoldStatus.held,
            releaseAt,
          },
        });

        // CommissionLedger satırı — pending (Faz 3A.2). Spec Bölüm 5.1.
        await this.commissionLedger.upsertPending({
          orderId: payment.orderId,
          sellerCommission: order.commissionAmount,
          buyerFee: order.buyerFeeAmount,
          tx,
        });

        this.logger.log(`Payment ${payment.id} completed, hold created for seller ${order.sellerId}`);
      } else {
        this.logger.log(`Virtual order payment ${payment.id} (membership/boost) completed, no hold needed`);
      }

      return { order, productIdsToInvalidate };
    });

    if (!result) {
      this.logger.log(
        `processSuccessfulPayment: payment ${payment.id} already completed — skipping duplicate success handling`,
      );
      return false;
    }

    // Handle auto-refund: payment succeeded but order was already cancelled (race with cron)
    if ('autoRefundRequired' in result && result.autoRefundRequired) {
      const refundOrderId = (result as any).orderId;
      const refundPaymentId = (result as any).paymentId;
      this.logger.warn(`Auto-refunding payment ${refundPaymentId} — order ${refundOrderId} was already cancelled`);
      try {
        await this.processRefund(refundOrderId);
        this.logger.log(`Auto-refund completed for order ${refundOrderId}`);
      } catch (refundError: any) {
        this.logger.error(
          `AUTO-REFUND FAILED for order ${refundOrderId}: ${refundError.message}. MANUAL INTERVENTION REQUIRED.`,
        );
      }
      return true;
    }

    const resultOrder = result.order;
    for (const productId of result.productIdsToInvalidate) {
      await this.cache.del(`products:detail:${productId}`);
    }

    // Stockout cascade notifications: dispatch AFTER tx commits so failures
    // here don't roll back the payment. One notification per buyer.
    //
    // An accepted-but-unpaid offer creates a pending_payment Order with no
    // Payment row and no stock reservation (offer.service.ts acceptOffer). When
    // stock runs out that Order is cancelled — but since the buyer never paid,
    // it is really a cancelled OFFER, so we send "Teklifiniz iptal edildi"
    // rather than the misleading "Siparişiniz iptal edildi". Direct-buy orders
    // (no offer) and orders whose payment was already initiated keep the
    // order-cancelled message.
    const notifiedBuyers = new Set<string>();
    for (const o of cancelledOrders) {
      if (notifiedBuyers.has(o.buyerId)) continue;
      notifiedBuyers.add(o.buyerId);
      const isUnpaidOffer = o.offerId !== null && !o.hadPayment;
      const notify = isUnpaidOffer
        ? this.notificationService.notifyOfferCancelledOutOfStock(o.buyerId, o.productId, o.productTitle, stockoutCategoryId)
        : this.notificationService.notifyOrderCancelledOutOfStock(o.buyerId, o.productId, o.productTitle, stockoutCategoryId);
      await notify.catch((err) =>
        this.logger.warn(`stockout-notify (${isUnpaidOffer ? 'offer' : 'order'}) failed for ${o.buyerId}: ${err.message}`),
      );
    }
    for (const o of cancelledOffers) {
      if (notifiedBuyers.has(o.buyerId)) continue;
      notifiedBuyers.add(o.buyerId);
      await this.notificationService
        .notifyOfferCancelledOutOfStock(o.buyerId, o.productId, o.productTitle, stockoutCategoryId)
        .catch((err) =>
          this.logger.warn(`stockout-notify (offer) failed for ${o.buyerId}: ${err.message}`),
        );
    }

    // Emit order.paid event AFTER transaction commits (only for regular product orders, not membership/boost)
    // This publishes jobs to email, push, and shipping queues
    const isMembershipOrder = resultOrder.productId.startsWith('membership-');
    const isBoostOrder = resultOrder.productId.startsWith('boost-');

    // Ürün listesi cache'ini temizle:
    // - Boost: öne çıkarma sıralamayı etkiler.
    // - Normal ürün siparişi: stok düşer, tükenince status=inactive olur → ürün
    //   listelerde "stokta yok" olarak sona kayar; sıralama/görünürlük değişir.
    // Membership siparişleri ürün listelerini etkilemez.
    if (!isMembershipOrder) {
      await this.cache.delPattern('products:list:*').catch(() => {});
    }

    if (!isMembershipOrder && !isBoostOrder) {
      try {
        const shippingAddressData = resultOrder.shippingAddress as any;

        // Check if this is a guest order and get actual buyer info
        const isGuestOrder = resultOrder.buyer.email === 'guest@tarodan.system' || shippingAddressData?.isGuestOrder;
        const actualBuyerEmail = isGuestOrder
          ? (shippingAddressData?.guestEmail || shippingAddressData?.email || resultOrder.buyer.email)
          : resultOrder.buyer.email;
        const actualBuyerName = isGuestOrder
          ? (shippingAddressData?.guestName || shippingAddressData?.fullName || 'Misafir Müşteri')
          : (resultOrder.buyer.displayName || resultOrder.buyer.email);

        this.logger.log(`Emitting order.paid event - buyerEmail: ${actualBuyerEmail}, isGuest: ${isGuestOrder}`);

        await this.eventService.emitOrderPaid({
          orderId: resultOrder.id,
          orderNumber: resultOrder.orderNumber,
          buyerId: resultOrder.buyerId,
          sellerId: resultOrder.sellerId,
          productId: resultOrder.productId,
          productTitle: resultOrder.product.title,
          totalAmount: Number(resultOrder.totalAmount),
          commissionAmount: Number(resultOrder.commissionAmount),
          buyerEmail: actualBuyerEmail,
          buyerName: actualBuyerName,
          sellerEmail: resultOrder.seller.email,
          sellerName: resultOrder.seller.displayName || resultOrder.seller.email,
          paymentMethod: payment.provider,
          transactionId: transactionId || payment.providerPaymentId || payment.id,
          shippingAddress: {
            fullName: shippingAddressData?.fullName || '',
            phone: shippingAddressData?.phone || '',
            address: shippingAddressData?.address || '',
            city: shippingAddressData?.city || '',
            district: shippingAddressData?.district || '',
            zipCode: shippingAddressData?.zipCode || '',
          },
          isGuestOrder,
          buyerSystemEmail: resultOrder.buyer.email || '',
        });

        this.logger.log(`order.paid event emitted for order ${resultOrder.orderNumber}`);
      } catch (error) {
        // Log but don't fail - payment was already successful
        this.logger.error(`Failed to emit order.paid event: ${error}`);
      }
    }

    // Generate and send invoice to buyer (only for regular product orders, not membership/boost)
    if (!isMembershipOrder && !isBoostOrder) {
      try {
        await this.invoiceService.generateAndSendInvoice(resultOrder.id);
        this.logger.log(`Invoice generated and sent for order ${resultOrder.orderNumber}`);
      } catch (error) {
        // Log but don't fail - payment was already successful
        this.logger.error(`Failed to generate invoice for order ${resultOrder.orderNumber}: ${error}`);
      }
    }

    // Auto-create Shipment record (Sürat Kargo gönderi kaydı oluşturuldu at order creation)
    // Membership/boost sanal sipariştir → kargo kaydı oluşturma.
    if (!isMembershipOrder && !isBoostOrder) {
      try {
        const existingShipment = await this.prisma.shipment.findFirst({
          where: { orderId: resultOrder.id },
        });
        if (!existingShipment) {
          const estimatedDelivery = new Date();
          estimatedDelivery.setDate(estimatedDelivery.getDate() + 3);

          await this.prisma.shipment.create({
            data: {
              orderId: resultOrder.id,
              provider: 'surat',
              status: 'pending',
              // Sürat'a OzelKargoTakipNo olarak sipariş numarası gönderiliyor; aynısını
              // takip numarası olarak DB'ye de yazıyoruz ki UI'da gösterilsin.
              trackingNumber: resultOrder.orderNumber,
              cost: Number(resultOrder.shippingCost),
              estimatedDelivery,
            },
          });
          this.logger.log(`Auto-created shipment for order ${resultOrder.orderNumber} tracking=${resultOrder.orderNumber}`);
        }
      } catch (error) {
        this.logger.error(`Failed to auto-create shipment for order ${resultOrder.orderNumber}: ${error}`);
      }
    }

    return true;
  }

  /**
   * Grup ödemesi başarı işleme: gruptaki TÜM siparişler tek transaction'da
   * preparing'e çekilir, sonra ürün başına stok düşümü + stockout kaskadı yapılır.
   * Sıralama kritik: kaskad (invalidatePendingOrdersForProduct) yalnızca
   * pending_payment siparişleri iptal eder — kardeşler önce preparing yapılırsa
   * kaskad onlara dokunamaz.
   */
  private async processSuccessfulGroupPayment(payment: any, transactionId?: string): Promise<boolean> {
    const cancelledOrders: {
      buyerId: string;
      productId: string;
      productTitle: string;
      offerId: string | null;
      hadPayment: boolean;
    }[] = [];
    const cancelledOffers: { buyerId: string; productId: string; productTitle: string }[] = [];
    let stockoutCategoryId: string | null = null;

    const result = await this.prisma.$transaction(
      async (tx) => {
        const oldStatus = payment.status;
        const auditHistory = ((payment.metadata as any)?.auditHistory || []).concat({
          action: 'payment.completed',
          timestamp: new Date().toISOString(),
          oldStatus,
          newStatus: PaymentStatus.completed,
          transactionId: transactionId || payment.providerPaymentId,
        });

        const claimed = await tx.payment.updateMany({
          where: { id: payment.id, status: PaymentStatus.pending },
          data: {
            status: PaymentStatus.completed,
            paidAt: new Date(),
            providerPaymentId: transactionId || payment.providerPaymentId,
            metadata: { ...((payment.metadata as any) || {}), auditHistory } as object,
          },
        });
        if (claimed.count === 0) {
          return null;
        }

        const groupOrders = await tx.order.findMany({
          where: { checkoutGroupId: payment.checkoutGroupId },
          include: { buyer: true, seller: true, product: true },
        });

        // Cron yarışı: callback uçuştayken iptal edilen siparişler kısmi otomatik iadeye gider
        const aliveOrders = groupOrders.filter((o) => o.status === OrderStatus.pending_payment);
        const refundOrders = groupOrders.filter((o) => o.status === OrderStatus.cancelled);

        const preparingDays = parseInt(
          this.configService.get('PREPARING_DEADLINE_DAYS') || '3',
          10,
        );
        const preparingDeadline = new Date();
        preparingDeadline.setDate(preparingDeadline.getDate() + preparingDays);

        // 1. geçiş: TÜM canlı siparişler preparing — stockout kaskadından önce
        for (const order of aliveOrders) {
          await tx.order.update({
            where: { id: order.id },
            data: {
              status: OrderStatus.preparing,
              preparingDeadline,
              version: { increment: 1 },
            },
          });
        }

        const productIdsToInvalidate: string[] = [];

        // 2. geçiş: ürün başına stok düşümü + stockout kaskadı + hold + ledger
        for (const order of aliveOrders) {
          productIdsToInvalidate.push(order.productId);
          const product = await tx.product.findUnique({
            where: { id: order.productId },
          });
          if (!product) {
            throw new Error(`Product not found for group order ${order.id}`);
          }

          const newQuantity = product.quantity !== null ? product.quantity - 1 : null;
          const updateData: any = {
            status: getProductStatusFromQuantity(newQuantity),
            reservedQuantity: safeDecrementReserved(product.reservedQuantity, 1),
          };
          if (product.quantity !== null) {
            updateData.quantity = { decrement: 1 };
          }
          await tx.product.update({
            where: { id: order.productId },
            data: updateData,
          });

          const refreshed = await tx.product.findUnique({
            where: { id: order.productId },
            select: { quantity: true, reservedQuantity: true, categoryId: true },
          });
          const available = (refreshed?.quantity ?? 0) - (refreshed?.reservedQuantity ?? 0);
          if (refreshed && refreshed.quantity !== null && available <= 0) {
            stockoutCategoryId = refreshed.categoryId ?? null;
            const orderResult = await this.productLockService.invalidatePendingOrdersForProduct(
              tx,
              order.productId,
              'Stok tükendi',
            );
            const offerResult = await this.productLockService.invalidateRelatedOffers(
              tx,
              order.productId,
            );
            cancelledOrders.push(
              ...orderResult.cancelledOrders.map((o) => ({
                buyerId: o.buyerId,
                productId: o.productId,
                productTitle: o.productTitle,
                offerId: o.offerId,
                hadPayment: o.hadPayment,
              })),
            );
            cancelledOffers.push(
              ...offerResult.rejectedOffers.map((o) => ({
                buyerId: o.buyerId,
                productId: o.productId,
                productTitle: o.productTitle,
              })),
            );
          }

          // Satıcı başına escrow hold (tek payment'a sipariş başına bir hold)
          const sellerAmount = Number(order.totalAmount) - Number(order.commissionAmount);
          const releaseAt = new Date();
          releaseAt.setDate(releaseAt.getDate() + this.holdDays);
          await tx.paymentHold.create({
            data: {
              paymentId: payment.id,
              orderId: order.id,
              sellerId: order.sellerId,
              amount: sellerAmount,
              status: PaymentHoldStatus.held,
              releaseAt,
            },
          });

          await this.commissionLedger.upsertPending({
            orderId: order.id,
            sellerCommission: order.commissionAmount,
            buyerFee: order.buyerFeeAmount,
            tx,
          });
        }

        return { aliveOrders, refundOrders, productIdsToInvalidate };
      },
      { timeout: 60000 },
    );

    if (!result) {
      this.logger.log(
        `processSuccessfulGroupPayment: payment ${payment.id} already completed — skipping duplicate`,
      );
      return false;
    }

    // Cron yarışıyla iptal edilmiş siparişler: kısmi otomatik iade
    for (const order of result.refundOrders) {
      this.logger.warn(
        `Group payment ${payment.id} succeeded but order ${order.id} (${order.orderNumber}) already cancelled. Partial auto-refund.`,
      );
      try {
        await this.processRefund(order.id, Number(order.totalAmount));
        this.logger.log(`Partial auto-refund completed for group order ${order.id}`);
      } catch (refundError: any) {
        this.logger.error(
          `PARTIAL AUTO-REFUND FAILED for group order ${order.id}: ${refundError.message}. MANUAL INTERVENTION REQUIRED.`,
        );
      }
    }

    for (const productId of result.productIdsToInvalidate) {
      await this.cache.del(`products:detail:${productId}`);
    }
    await this.cache.delPattern('products:list:*').catch(() => {});

    // Stockout kaskad bildirimleri (tx sonrası; tek bildirimle alıcı başına)
    const notifiedBuyers = new Set<string>();
    for (const o of cancelledOrders) {
      if (notifiedBuyers.has(o.buyerId)) continue;
      notifiedBuyers.add(o.buyerId);
      const isUnpaidOffer = o.offerId !== null && !o.hadPayment;
      const notify = isUnpaidOffer
        ? this.notificationService.notifyOfferCancelledOutOfStock(o.buyerId, o.productId, o.productTitle, stockoutCategoryId)
        : this.notificationService.notifyOrderCancelledOutOfStock(o.buyerId, o.productId, o.productTitle, stockoutCategoryId);
      await notify.catch((err) =>
        this.logger.warn(`stockout-notify failed for ${o.buyerId}: ${err.message}`),
      );
    }
    for (const o of cancelledOffers) {
      if (notifiedBuyers.has(o.buyerId)) continue;
      notifiedBuyers.add(o.buyerId);
      await this.notificationService
        .notifyOfferCancelledOutOfStock(o.buyerId, o.productId, o.productTitle, stockoutCategoryId)
        .catch((err) =>
          this.logger.warn(`stockout-notify (offer) failed for ${o.buyerId}: ${err.message}`),
        );
    }

    // Sipariş başına: order.paid eventi, fatura, kargo kaydı
    for (const resultOrder of result.aliveOrders) {
      try {
        const shippingAddressData = resultOrder.shippingAddress as any;
        const isGuestOrder =
          resultOrder.buyer.email === 'guest@tarodan.system' || shippingAddressData?.isGuestOrder;
        const actualBuyerEmail = isGuestOrder
          ? (shippingAddressData?.guestEmail || shippingAddressData?.email || resultOrder.buyer.email)
          : resultOrder.buyer.email;
        const actualBuyerName = isGuestOrder
          ? (shippingAddressData?.guestName || shippingAddressData?.fullName || 'Misafir Müşteri')
          : (resultOrder.buyer.displayName || resultOrder.buyer.email);

        await this.eventService.emitOrderPaid({
          orderId: resultOrder.id,
          orderNumber: resultOrder.orderNumber,
          buyerId: resultOrder.buyerId,
          sellerId: resultOrder.sellerId,
          productId: resultOrder.productId,
          productTitle: resultOrder.product.title,
          totalAmount: Number(resultOrder.totalAmount),
          commissionAmount: Number(resultOrder.commissionAmount),
          buyerEmail: actualBuyerEmail,
          buyerName: actualBuyerName,
          sellerEmail: resultOrder.seller.email,
          sellerName: resultOrder.seller.displayName || resultOrder.seller.email,
          paymentMethod: payment.provider,
          transactionId: transactionId || payment.providerPaymentId || payment.id,
          shippingAddress: {
            fullName: shippingAddressData?.fullName || '',
            phone: shippingAddressData?.phone || '',
            address: shippingAddressData?.address || '',
            city: shippingAddressData?.city || '',
            district: shippingAddressData?.district || '',
            zipCode: shippingAddressData?.zipCode || '',
          },
          isGuestOrder,
          buyerSystemEmail: resultOrder.buyer.email || '',
        });
      } catch (error) {
        this.logger.error(`Failed to emit order.paid event for group order ${resultOrder.id}: ${error}`);
      }

      try {
        await this.invoiceService.generateAndSendInvoice(resultOrder.id);
      } catch (error) {
        this.logger.error(`Failed to generate invoice for order ${resultOrder.orderNumber}: ${error}`);
      }

      try {
        const existingShipment = await this.prisma.shipment.findFirst({
          where: { orderId: resultOrder.id },
        });
        if (!existingShipment) {
          const estimatedDelivery = new Date();
          estimatedDelivery.setDate(estimatedDelivery.getDate() + 3);
          await this.prisma.shipment.create({
            data: {
              orderId: resultOrder.id,
              provider: 'surat',
              status: 'pending',
              trackingNumber: resultOrder.orderNumber,
              cost: Number(resultOrder.shippingCost),
              estimatedDelivery,
            },
          });
          this.logger.log(
            `Auto-created shipment for group order ${resultOrder.orderNumber} tracking=${resultOrder.orderNumber}`,
          );
        }
      } catch (error) {
        this.logger.error(`Failed to auto-create shipment for order ${resultOrder.orderNumber}: ${error}`);
      }
    }

    this.logger.log(
      `Group payment ${payment.id} completed: ${result.aliveOrders.length} orders preparing, ${result.refundOrders.length} auto-refunded`,
    );
    return true;
  }

  /**
   * Ödeme başarısız/iptal olduğunda rezervasyonu kaldır, siparişi iptal et.
   * Offer-based orderlarda teklif status'u payment_expired yapılır (tekrar ödenebilir).
   */
  private async releaseProductForFailedPayment(orderId: string): Promise<void> {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        select: { status: true, productId: true, offerId: true },
      });
      if (!order || order.status !== OrderStatus.pending_payment || !order.productId) return;

      const before = await this.prisma.product.findUnique({
        where: { id: order.productId },
        select: { quantity: true, reservedQuantity: true, title: true, status: true },
      });
      const beforeAvailable = (before?.quantity ?? 0) - (before?.reservedQuantity ?? 0);

      const updateData: { reservedQuantity?: number; status?: ProductStatus } = {};
      if (before) {
        const newReserved = safeDecrementReserved(before.reservedQuantity, 1);
        updateData.reservedQuantity = newReserved;
        if (before.status === ProductStatus.reserved && newReserved === 0) {
          updateData.status = ProductStatus.active;
        }
      }

      await this.prisma.$transaction([
        this.prisma.order.update({
          where: { id: orderId },
          data: { status: OrderStatus.cancelled },
        }),
        ...(before && Object.keys(updateData).length > 0
          ? [
              this.prisma.product.update({
                where: { id: order.productId },
                data: updateData,
              }),
            ]
          : []),
        // Offer-based ise: payment_expired yap (tekrar ödenebilir)
        ...(order.offerId
          ? [
              this.prisma.offer.update({
                where: { id: order.offerId },
                data: { status: OfferStatus.payment_expired },
              }),
            ]
          : []),
      ]);
      this.logger.log(`Order ${orderId} cancelled and product ${order.productId} reservation released after payment failure`);
      await this.cache.del(`products:detail:${order.productId}`);

      // BACK_IN_STOCK dispatch: only when availability transitioned from <=0 to >0.
      const after = await this.prisma.product.findUnique({
        where: { id: order.productId },
        select: { quantity: true, reservedQuantity: true },
      });
      const afterAvailable = (after?.quantity ?? 0) - (after?.reservedQuantity ?? 0);
      if (beforeAvailable <= 0 && afterAvailable > 0 && before?.title) {
        await this.dispatchBackInStock(order.productId, before.title).catch((err: any) =>
          this.logger.warn(`back-in-stock dispatch failed: ${err?.message}`),
        );
      }
    } catch (error: any) {
      this.logger.error(`Failed to release product for order ${orderId}: ${error?.message}`);
    }
  }

  /**
   * Notify all wishlist users for a product that just transitioned from
   * unavailable -> available. Debounced 24h per (userId, productId) so
   * repeated payment failures don't spam wishlists.
   */
  private async dispatchBackInStock(productId: string, productTitle: string): Promise<void> {
    // Delegated to NotificationService.broadcastBackInStock — kept here only
    // as a thin wrapper to preserve the existing call site contract.
    return this.notificationService.broadcastBackInStock(productId, productTitle);
  }


  /**
   * Process failed payment
   */
  private async processFailedPayment(payment: any, reason: string) {
    const oldStatus = payment.status;

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.failed,
        failureReason: reason,
      },
    });

    // Trade cash payments don't have order/product to release
    if (payment.tradeCashPaymentId && !payment.orderId) {
      this.logger.warn(`Trade cash payment ${payment.id} failed: ${reason}`);
      return;
    }

    // Grup ödemesi: gruptaki tüm siparişleri iptal et, rezervasyonları + Sürat gönderilerini bırak
    if (payment.checkoutGroupId && !payment.orderId) {
      const groupOrders = await this.prisma.order.findMany({
        where: { checkoutGroupId: payment.checkoutGroupId },
        include: {
          buyer: { select: { id: true, email: true, displayName: true } },
        },
      });

      for (const order of groupOrders) {
        await this.releaseProductForFailedPayment(order.id);
        await this.cancelSuratShipmentIfExists(order.id, order.orderNumber);

        try {
          await this.eventService.emitPaymentFailed({
            paymentId: payment.id,
            orderId: order.id,
            orderNumber: order.orderNumber,
            buyerId: order.buyerId,
            buyerEmail: order.buyer.email,
            buyerName: order.buyer.displayName || order.buyer.email,
            amount: Number(order.totalAmount),
            provider: payment.provider,
            failureReason: reason,
          });
        } catch (error) {
          this.logger.error(`Failed to emit payment.failed event for group order ${order.id}: ${error}`);
        }
      }

      await this.logPaymentAction('failed', payment.id, undefined, undefined, oldStatus, PaymentStatus.failed, {
        reason,
        checkoutGroupId: payment.checkoutGroupId,
      });

      this.logger.warn(`Group payment ${payment.id} failed: ${reason} (${groupOrders.length} orders released)`);
      return;
    }

    // Siparişi iptal et ve ürünü tekrar satışa aç (ilanlar listesinde görünsün)
    if (payment.orderId) {
      await this.releaseProductForFailedPayment(payment.orderId);

      // Cancel any auto-created Surat shipment for this failed order
      const order = await this.prisma.order.findUnique({
        where: { id: payment.orderId },
        select: { orderNumber: true },
      });
      if (order) {
        await this.cancelSuratShipmentIfExists(payment.orderId, order.orderNumber);
      }
    }

    // Log payment failure
    await this.logPaymentAction('failed', payment.id, payment.orderId, undefined, oldStatus, PaymentStatus.failed, {
      reason,
    });

    this.logger.warn(`Payment ${payment.id} failed: ${reason}`);

    // Emit payment.failed event
    try {
      if (payment.orderId) {
        const order = await this.prisma.order.findUnique({
          where: { id: payment.orderId },
          include: {
            buyer: { select: { id: true, email: true, displayName: true } },
          },
        });

        if (order) {
          await this.eventService.emitPaymentFailed({
            paymentId: payment.id,
            orderId: payment.orderId,
            orderNumber: order.orderNumber,
            buyerId: order.buyerId,
            buyerEmail: order.buyer.email,
            buyerName: order.buyer.displayName || order.buyer.email,
            amount: Number(payment.amount),
            provider: payment.provider,
            failureReason: reason,
          });

          this.logger.log(`payment.failed event emitted for payment ${payment.id}`);
        }
      }
    } catch (error) {
      // Log but don't fail - payment was already marked as failed
      this.logger.error(`Failed to emit payment.failed event: ${error}`);
    }
  }

  /**
   * Handle successful trade cash payment separately from order payments.
   * Updates TradeCashPayment status to completed; does NOT touch orders/products.
   *
   * Safe-trade (escrow) flow: if the associated Trade is in `awaiting_payment`,
   * transition it to `shipping_to_warehouse` and set the shipping deadline.
   */
  private async processSuccessfulTradeCashPayment(payment: any, transactionId?: string): Promise<boolean> {
    // Platform ayarı: takas kargo süresi (gün). Varsayılan 7 gün.
    const shippingDaysSetting = await this.prisma.platformSetting.findUnique({
      where: { settingKey: 'trade_shipping_deadline_days' },
    });
    const shippingDays = parseInt(shippingDaysSetting?.settingValue ?? '7', 10) || 7;

    const result = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.payment.updateMany({
        where: { id: payment.id, status: PaymentStatus.pending },
        data: {
          status: PaymentStatus.completed,
          providerPaymentId: transactionId || payment.providerPaymentId,
          paidAt: new Date(),
        },
      });
      if (claimed.count === 0) {
        return { didComplete: false } as const;
      }

      const tcp = await tx.tradeCashPayment.update({
        where: { id: payment.tradeCashPaymentId },
        data: {
          status: PaymentStatus.completed,
          providerPaymentId: transactionId || payment.providerPaymentId,
          paidAt: new Date(),
        },
      });

      // Safe-trade geçişi: awaiting_payment -> shipping_to_warehouse
      const trade = await tx.trade.findUnique({ where: { id: tcp.tradeId } });
      let tradeTransitioned = false;
      let shippingDeadline: Date | null = null;

      if (trade && trade.status === TradeStatus.awaiting_payment) {
        const now = new Date();
        shippingDeadline = new Date(now);
        shippingDeadline.setDate(shippingDeadline.getDate() + shippingDays);

        await tx.trade.update({
          where: { id: trade.id, version: trade.version },
          data: {
            status: TradeStatus.shipping_to_warehouse,
            shippingDeadline,
            version: { increment: 1 },
          },
        });

        // Etiketler + Sürat sevkiyatı tx SONRASI tek kaynaktan
        // (TradeService.createInboundTradeShipments) yapılır — aşağıda çağrılıyor.
        tradeTransitioned = true;
      }

      return {
        didComplete: true,
        tradeTransitioned,
        trade,
        shippingDeadline,
      } as const;
    });

    if (!result.didComplete) {
      return false;
    }

    this.logger.log(`Trade cash payment ${payment.id} completed (tradeCashPaymentId=${payment.tradeCashPaymentId})`);

    // İşlem tamamlandıktan sonra bildirim emit et (her iki tarafa)
    if (result.tradeTransitioned && result.trade && result.shippingDeadline) {
      try {
        await this.eventService.emitTradeReadyForShipping({
          tradeId: result.trade.id,
          initiatorId: result.trade.initiatorId,
          receiverId: result.trade.receiverId,
          shippingDeadline: result.shippingDeadline,
        });
        this.logger.log(
          `trade.ready-for-shipping event emitted for trade ${result.trade.id}`,
        );
      } catch (error) {
        // Log but don't fail - payment was already completed
        this.logger.error(`Failed to emit trade.ready-for-shipping event: ${error}`);
      }

      // Auto-create the two `to_warehouse` Sürat shipments now that the cash
      // trade has cleared payment and entered `shipping_to_warehouse`. Mirrors
      // the non-cash hook in TradeService.acceptTrade. We resolve TradeService
      // lazily via ModuleRef + a runtime require to avoid the Trade<>Payment
      // module circular import (Membership eagerly imports Payment; Trade
      // imports Payment; Payment can't statically import Trade).
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { TradeService } = require('../trade/trade.service');
        const tradeService = this.moduleRef.get(TradeService, { strict: false });
        if (tradeService && typeof tradeService.createInboundTradeShipments === 'function') {
          tradeService.createInboundTradeShipments(result.trade.id).catch((err: any) =>
            this.logger.error(
              `createInboundTradeShipments crashed for cash-trade ${result.trade!.id}: ${err?.message ?? err}`,
            ),
          );
        } else {
          this.logger.warn(
            `TradeService.createInboundTradeShipments not available; inbound shipments NOT auto-created for cash-trade ${result.trade.id}`,
          );
        }
      } catch (err: any) {
        this.logger.error(
          `Failed to resolve TradeService for cash-trade inbound shipments: ${err?.message ?? err}`,
        );
      }
    }

    return true;
  }

  /**
   * Retry a failed payment
   * Creates a new payment for the same order
   */
  async retryPayment(paymentId: string, userId: string, req?: Request) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        order: {
          include: {
            buyer: true,
            seller: true,
            product: true,
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException('Ödeme bulunamadı');
    }

    // Grup ödemesi retry'ı initiate üzerinden yapılır (payment satırı yeniden kullanılır)
    if (!payment.order) {
      throw new BadRequestException(
        'Bu ödeme bir sipariş grubuna ait. Lütfen ödemeyi sipariş grubuyla yeniden başlatın.',
      );
    }

    // Verify user owns the order
    if (payment.order.buyerId !== userId && payment.order.sellerId !== userId) {
      throw new ForbiddenException('Bu ödemeyi tekrar deneme yetkiniz yok');
    }

    // Only allow retrying failed payments
    if (payment.status !== PaymentStatus.failed) {
      throw new BadRequestException('Sadece başarısız ödemeler tekrar denenebilir');
    }

    const order = payment.order;
    const wasCancelled = order.status === OrderStatus.cancelled;

    // Sipariş iptal edilmişse (ödeme başarısız sonrası): ürün hâlâ aktifse siparişi yeniden açıp rezerve et
    if (wasCancelled && order.productId) {
      const product = await this.prisma.product.findUnique({
        where: { id: order.productId },
      });
      if (!product || product.status !== ProductStatus.active) {
        throw new BadRequestException(
          'Ürün artık satışta değil veya başka alıcıya satıldı. Lütfen ilanlar sayfasından tekrar sipariş oluşturun.',
        );
      }
      await this.prisma.$transaction([
        this.prisma.order.update({
          where: { id: order.id },
          data: { status: OrderStatus.pending_payment },
        }),
        this.prisma.product.update({
          where: { id: order.productId },
          data: { status: ProductStatus.reserved },
        }),
      ]);
      // Reload order with relations for payment init
      (payment as any).order = await this.prisma.order.findUnique({
        where: { id: order.id },
        include: {
          buyer: true,
          seller: true,
          product: true,
        },
      });
    } else if (order.status !== OrderStatus.pending_payment) {
      throw new BadRequestException('Sipariş durumu ödeme tekrarına uygun değil');
    }

    // Create new payment record
    const newPayment = await this.prisma.payment.create({
      data: {
        orderId: payment.orderId,
        amount: payment.amount,
        currency: payment.currency,
        provider: payment.provider,
        status: PaymentStatus.pending,
        metadata: {
          retriedFrom: paymentId,
          retriedAt: new Date().toISOString(),
          auditHistory: [{
            action: 'payment.retried',
            timestamp: new Date().toISOString(),
            originalPaymentId: paymentId,
            userId,
          }],
        },
      },
    });

    // Log retry action on original payment
    await this.logPaymentAction('retried', paymentId, payment.orderId, undefined, PaymentStatus.failed, undefined, {
      newPaymentId: newPayment.id,
      userId,
    });

    // Generate payment URL based on provider
    let paymentUrl: string;
    let paymentHtml: string | undefined;
    const clientIp = this.getClientIp(req);

    const result = await this.initializePayTRPayment(newPayment, payment.order, clientIp);
    paymentUrl = result.paymentUrl;
    paymentHtml = result.paymentHtml;

    this.logger.log(`Payment ${paymentId} retried, new payment ${newPayment.id} created`);

    return {
      success: true,
      paymentId: payment.id,
      newPaymentId: newPayment.id,
      paymentUrl,
      paymentHtml,
      provider: payment.provider,
      expiresIn: 300,
    };
  }

  /**
   * Cancel a pending payment
   * Only allows canceling pending payments
   */
  async cancelPayment(paymentId: string, userId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        order: {
          include: {
            buyer: { select: { id: true, email: true, displayName: true } },
            seller: { select: { id: true, email: true, displayName: true } },
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException('Ödeme bulunamadı');
    }

    // Grup ödemesi: erişim grup üzerinden doğrulanır, tüm siparişler bırakılır
    if (!payment.order && payment.checkoutGroupId) {
      const group = await this.prisma.checkoutGroup.findUnique({
        where: { id: payment.checkoutGroupId },
        select: { buyerId: true },
      });
      if (!group || group.buyerId !== userId) {
        throw new ForbiddenException('Bu ödemeyi iptal etme yetkiniz yok');
      }
      if (payment.status !== PaymentStatus.pending) {
        throw new BadRequestException('Sadece bekleyen ödemeler iptal edilebilir');
      }
      await this.processFailedPayment(payment, 'Kullanıcı tarafından iptal edildi');
      this.logger.log(`Group payment ${paymentId} cancelled by user ${userId}`);
      return {
        success: true,
        paymentId: payment.id,
        message: 'Ödeme başarıyla iptal edildi',
      };
    }

    // Verify user owns the order
    if (payment.order.buyerId !== userId && payment.order.sellerId !== userId) {
      throw new ForbiddenException('Bu ödemeyi iptal etme yetkiniz yok');
    }

    // Only allow canceling pending payments
    if (payment.status !== PaymentStatus.pending) {
      throw new BadRequestException('Sadece bekleyen ödemeler iptal edilebilir');
    }

    const oldStatus = payment.status;

    // Update payment status to failed
    await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: PaymentStatus.failed,
        failureReason: 'Kullanıcı tarafından iptal edildi',
      },
    });

    // Siparişi iptal et ve ürünü tekrar satışa aç
    await this.releaseProductForFailedPayment(payment.orderId);

    this.logger.log(`Payment ${paymentId} cancelled by user ${userId}`);

    // Log payment cancellation
    await this.logPaymentAction('cancelled', paymentId, payment.orderId, undefined, oldStatus, PaymentStatus.failed, {
      reason: 'Kullanıcı tarafından iptal edildi',
      userId,
    });

    // Emit payment.failed event
    try {
      await this.eventService.emitPaymentFailed({
        paymentId: payment.id,
        orderId: payment.orderId,
        orderNumber: payment.order.orderNumber,
        buyerId: payment.order.buyerId,
        buyerEmail: payment.order.buyer.email,
        buyerName: payment.order.buyer.displayName || payment.order.buyer.email,
        amount: Number(payment.amount),
        provider: payment.provider,
        failureReason: 'Kullanıcı tarafından iptal edildi',
      });

      this.logger.log(`payment.failed event emitted for payment ${payment.id}`);
    } catch (error) {
      // Log but don't fail - payment was already cancelled
      this.logger.error(`Failed to emit payment.failed event: ${error}`);
    }

    return {
      success: true,
      paymentId: payment.id,
      message: 'Ödeme başarıyla iptal edildi',
    };
  }

  /**
   * Kullanıcı ödeme fail sayfasına geldiğinde çağrılır. PayTR callback bazen ulaşmayabiliyor;
   * bu endpoint ile ürün rezervasyonu hemen serbest bırakılır (ilan tekrar listelerde görünür).
   * Sadece status=pending ise işlem yapılır; idempotent.
   */
  async confirmFailedFromClient(paymentId: string): Promise<{ released: boolean }> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { order: { select: { id: true } } },
    });
    if (!payment || payment.status !== PaymentStatus.pending) {
      return { released: false };
    }
    await this.processFailedPayment(payment, 'Fail sayfasından onay - rezervasyon serbest bırakıldı');
    return { released: true };
  }

  /**
   * Success sayfasından çağrılır: PayTR durum-sorgu API'sini hemen çalıştırır,
   * ödeme tamamsa siparişi anında tamamlar (callback gelmesini beklemeden).
   * Public, idempotent: payment zaten completed ise { completed: true } döner.
   */
  async verifyPaymentFromClient(
    paymentId: string,
  ): Promise<{ completed: boolean; status: string }> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        order: { include: { buyer: true, seller: true, product: true } },
        tradeCashPayment: true,
      },
    });

    if (!payment) {
      return { completed: false, status: 'not_found' };
    }

    if (payment.status === PaymentStatus.completed) {
      return { completed: true, status: 'already_completed' };
    }

    if (payment.status !== PaymentStatus.pending) {
      return { completed: false, status: payment.status };
    }

    if (payment.provider !== 'paytr') {
      return { completed: false, status: 'unsupported_provider' };
    }

    const oid = (payment.providerConversationId || '').trim();
    if (!oid) {
      return { completed: false, status: 'no_provider_oid' };
    }

    let inquiry = await this.paytrService.queryPaymentStatus(oid);
    if (!inquiry.ok && oid.includes('-')) {
      inquiry = await this.paytrService.queryPaymentStatus(oid.replace(/-/g, ''));
    }

    if (!inquiry.ok) {
      return { completed: false, status: 'paytr_not_found' };
    }

    // O16: Tolerans eşiğini tüm yollarda BİRLEŞTİR (eskiden burada 0.01, reconcile/mismatch'te
    // 0.05 idi → aynı ödeme için tutarsız kabul/ret). Tek config: PAYTR_RECONCILE_AMOUNT_TOLERANCE_TL.
    const tolerance = parseFloat(
      this.configService.get('PAYTR_RECONCILE_AMOUNT_TOLERANCE_TL') || '0.05',
    );
    const ourAmount = Number(payment.amount);
    if (Math.abs(inquiry.paymentTotalTl - ourAmount) > tolerance) {
      this.logger.warn(
        `verifyPaymentFromClient amount mismatch payment=${payment.id} oid=${oid} paytr=${inquiry.paymentTotalTl} ours=${ourAmount}`,
      );
      return { completed: false, status: 'amount_mismatch' };
    }

    const txnRef =
      inquiry.paymentDate != null && inquiry.paymentDate !== ''
        ? `paytr:${oid}:${inquiry.paymentDate}`
        : `paytr:${oid}`;

    const did = await this.processSuccessfulPayment(payment, txnRef);
    if (did) {
      this.logger.log(`verifyPaymentFromClient completed payment=${payment.id} oid=${oid}`);
      return { completed: true, status: 'completed_now' };
    }
    return { completed: false, status: 'process_skipped' };
  }

  /**
   * Process refund
   * Requirement: Refund handling (project.md)
   */
  async processRefund(orderId: string, refundAmount?: number) {
    let payment = await this.prisma.payment.findFirst({
      where: {
        orderId,
        status: PaymentStatus.completed,
      },
      include: {
        order: true,
      },
    });

    // Grup ödemesi: payment.orderId null → siparişin checkoutGroupId'si üzerinden çöz
    const refundTargetOrder = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, orderNumber: true, totalAmount: true, checkoutGroupId: true },
    });
    if (!payment && refundTargetOrder?.checkoutGroupId) {
      payment = await this.prisma.payment.findFirst({
        where: {
          checkoutGroupId: refundTargetOrder.checkoutGroupId,
          status: PaymentStatus.completed,
        },
        include: { order: true },
      });
    }

    if (!payment) {
      throw new NotFoundException('Tamamlanmış ödeme bulunamadı');
    }

    const isGroupPayment = !payment.orderId && !!payment.checkoutGroupId;
    if (isGroupPayment && !refundTargetOrder) {
      throw new NotFoundException('Sipariş bulunamadı');
    }

    // Grup ödemesinde varsayılan iade tutarı SİPARİŞİN tutarıdır (grubun değil)
    const amountToRefund =
      refundAmount ||
      (isGroupPayment
        ? Number(refundTargetOrder!.totalAmount)
        : Number(payment.amount));

    // O12: İade tutarı üst sınırı. Aksi halde tek çağrıda işlem tutarından FAZLA iade
    // talep edilebilir (yalnız PayTR reddi engelliyordu). Üst sınır = ilgili siparişin
    // tutarı (grup) veya ödeme tutarı (tekil).
    const refundCap = isGroupPayment
      ? Number(refundTargetOrder!.totalAmount)
      : Number(payment.amount);
    if (amountToRefund > refundCap + 0.01) {
      throw new BadRequestException(
        `İade tutarı (${amountToRefund} TL) izin verilen üst sınırı (${refundCap} TL) aşıyor`,
      );
    }

    // Grup ödemesinde aynı sipariş ikinci kez iade edilemez
    const previouslyRefundedOrders: Record<string, number> =
      ((payment.metadata as any)?.refundedOrders as Record<string, number>) || {};
    if (isGroupPayment && previouslyRefundedOrders[orderId]) {
      throw new BadRequestException('Bu sipariş için iade zaten yapılmış');
    }

    // Çift-ödeme koruması (K1). Bunu PayTR/Sürat'a dokunmadan ÖNCE yap.
    // 1) Henüz icra edilmemiş payout'ları (pending/retry_pending) atomik olarak
    //    geçersiz kıl ki payout cron'u alıcıya iade yaparken satıcıya da ödeme yapmasın.
    //    Atomik updateMany sayesinde payout cron'unun pending→processing claim'iyle
    //    yarışırsa satır başına yalnızca biri kazanır (diğeri count=0 görür).
    await this.prisma.payoutTransfer.updateMany({
      where: {
        paymentHold: { orderId },
        status: { in: ['pending', 'retry_pending'] },
      },
      data: { status: 'failed', failureReason: 'order_refunded' },
    });
    // 2) Payout zaten icra edildi (completed) veya icra ediliyor (processing) ise para
    //    satıcıya gitti/gidiyor → iade çift-ödeme olur. Engelle (manuel clawback gerekir).
    const inFlightPayout = await this.prisma.payoutTransfer.findFirst({
      where: {
        paymentHold: { orderId },
        status: { in: ['completed', 'processing'] },
      },
    });
    if (inFlightPayout) {
      throw new BadRequestException('Transfer zaten başlatılmış, iade yapılamaz');
    }

    try {
      // Call provider refund API
      let refundResult: any;

      if (payment.provider === 'paytr') {
        // PAYMENT_BYPASS: dev/test modunda PayTR callback olmadan ödeme tamamlandığı
        // için PayTR tarafında oid kaydı yok. Refund'ı da bypass'la — DB'de payment
        // direkt refunded olarak işaretlenir; provider çağrısı atlanır.
        const bypassEnabled =
          this.configService.get('PAYMENT_BYPASS') === 'true';
        if (bypassEnabled) {
          this.logger.warn(
            `PAYMENT_BYPASS: PayTR refund atlandı payment=${payment.id} amount=${amountToRefund}`,
          );
          refundResult = {
            status: 'success',
            err_msg: null,
            return_amount: amountToRefund,
            bypass: true,
          };
        } else {
          const paytrOid =
            payment.providerConversationId?.trim() ||
            orderId.replace(/-/g, '');
          try {
            refundResult = await this.paytrService.createRefund(paytrOid, amountToRefund);
          } catch (err) {
            const msg = (err as Error).message || '';
            if (/odeme henuz siteye bildirilmemis|henuz siteye bildirilmemi/i.test(msg)) {
              throw new BadRequestException(
                'Ödeme yeni tamamlandı, PayTR henüz işlemi tam senkronize etmedi. Lütfen 1-2 dakika sonra tekrar deneyin.',
              );
            }
            throw err;
          }

          if (refundResult.status !== 'success') {
            throw new BadRequestException(
              refundResult.err_msg || 'PayTR iade işlemi başarısız',
            );
          }
        }
      } else {
        throw new BadRequestException(`Bilinmeyen ödeme sağlayıcı: ${payment.provider}`);
      }

      // Update payment status after successful refund
      return this.prisma.$transaction(async (tx) => {
        const oldStatus = payment.status;
        // O7: Grup iadesinde refundedOrders read-modify-write'ı SERİLEŞTİR. Eşzamanlı
        // kardeş iadeler aynı eski snapshot'ı okuyup birbirini EZMESİN diye payment
        // satırını kilitle ve metadata'yı TX İÇİNDE taze oku (lost-update guard).
        await tx.$queryRaw`SELECT id FROM payments WHERE id = ${payment.id} FOR UPDATE`;
        const freshPayment = await tx.payment.findUnique({
          where: { id: payment.id },
          select: { metadata: true },
        });
        const existingMetadata = (freshPayment?.metadata as any) || {};
        const auditHistory = existingMetadata.auditHistory || [];
        const currentRefundedOrders: Record<string, number> =
          (existingMetadata.refundedOrders as Record<string, number>) || {};

        // Grup ödemesi: sipariş başına iade biriktirilir; Payment yalnızca grubun
        // TAMAMI iade edildiğinde refunded olur (kardeş siparişler ödenmiş kalır)
        const refundedOrders = {
          ...currentRefundedOrders,
          [orderId]: amountToRefund,
        };
        const totalRefunded = Object.values(refundedOrders).reduce(
          (sum, v) => sum + Number(v || 0),
          0,
        );
        const fullyRefunded = !isGroupPayment || totalRefunded >= Number(payment.amount) - 0.01;

        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: fullyRefunded ? PaymentStatus.refunded : payment.status,
            metadata: {
              ...existingMetadata,
              refundAmount: totalRefunded,
              refundedAt: new Date().toISOString(),
              refundResult,
              ...(isGroupPayment ? { refundedOrders } : {}),
              auditHistory: auditHistory.concat({
                action: 'payment.refunded',
                timestamp: new Date().toISOString(),
                oldStatus,
                newStatus: fullyRefunded ? PaymentStatus.refunded : oldStatus,
                refundAmount: amountToRefund,
                ...(isGroupPayment ? { orderId, partial: !fullyRefunded } : {}),
              }),
            },
          },
        });

        // Hold'u iptal et. held VEYA released olabilir: releaseHoldsDue cron'u hold'u
        // released yapmış ama payout henüz icra edilmemiş olabilir (K1). Her iki durumda
        // da hold iptal edilmeli ki satıcıya ödeme yapılmasın.
        const activeHold = await tx.paymentHold.findFirst({
          where: {
            orderId,
            status: { in: [PaymentHoldStatus.held, PaymentHoldStatus.released] },
          },
        });
        if (activeHold) {
          // Savunma amaçlı TOCTOU kontrolü: erken guard zaten completed/processing'i
          // engelledi ve pending/retry_pending'i void etti, ama tx içinde tekrar bak.
          const activePayout = await tx.payoutTransfer.findFirst({
            where: { paymentHoldId: activeHold.id, status: { in: ['completed', 'processing'] } },
          });
          if (activePayout) {
            throw new BadRequestException('Transfer zaten başlatılmış, iade yapılamaz');
          }
          await tx.paymentHold.update({
            where: { id: activeHold.id },
            data: { status: PaymentHoldStatus.cancelled },
          });
        }

        // Ledger: pending/earned → refunded (Faz 3B.6).
        // markRefunded yalnızca pending/earned satırı varsa update eder; cancel
        // akışından gelmişse Task 3B.5'te waived olur ve burada noop.
        await this.commissionLedger.markRefunded(orderId, tx);

        // Update order status + restore stock on full refund.
        // Idempotent: skip stock restore if order is already cancelled (e.g.
        // handleExpiredPreparingOrders already restocked before calling us).
        // Grup ödemesinde "tam iade" eşiği SİPARİŞİN tutarıdır.
        const fullOrderRefundThreshold = isGroupPayment
          ? Number(refundTargetOrder!.totalAmount)
          : Number(payment.amount);
        if (amountToRefund >= fullOrderRefundThreshold) {
          const orderRow = await tx.order.findUnique({
            where: { id: orderId },
            select: { status: true, productId: true },
          });
          const alreadyCancelled = orderRow?.status === OrderStatus.cancelled;

          await tx.order.update({
            where: { id: orderId },
            data: { status: OrderStatus.cancelled },
          });

          if (!alreadyCancelled && orderRow?.productId) {
            const product = await tx.product.findUnique({
              where: { id: orderRow.productId },
              select: { quantity: true },
            });
            if (product?.quantity !== null && product?.quantity !== undefined) {
              const newQty = product.quantity + 1;
              await tx.product.update({
                where: { id: orderRow.productId },
                data: {
                  quantity: { increment: 1 },
                  status: getProductStatusFromQuantity(newQty),
                },
              });
              this.logger.log(`Restored stock for product ${orderRow.productId} after refund of order ${orderId}`);
            }
          }
        }

        this.logger.log(`Refund processed for payment ${payment.id}: ${amountToRefund} TRY`);

        const refundResponse = {
          success: true,
          paymentId: payment.id,
          refundAmount: amountToRefund,
          providerRefundId: refundResult.paymentId || refundResult.merchant_oid,
        };

        // Emit payment.refunded event
        try {
          const order = await tx.order.findUnique({
            where: { id: orderId },
            include: {
              buyer: { select: { id: true, email: true, displayName: true } },
              seller: { select: { id: true, email: true, displayName: true } },
            },
          });

          if (order) {
            await this.eventService.emitPaymentRefunded({
              paymentId: payment.id,
              orderId: orderId,
              orderNumber: order.orderNumber,
              buyerId: order.buyerId,
              buyerEmail: order.buyer.email,
              buyerName: order.buyer.displayName || order.buyer.email,
              sellerId: order.sellerId,
              sellerEmail: order.seller.email,
              sellerName: order.seller.displayName || order.seller.email,
              refundAmount: amountToRefund,
              totalAmount: Number(payment.amount),
              provider: payment.provider,
              providerRefundId: refundResponse.providerRefundId,
            });

            this.logger.log(`payment.refunded event emitted for payment ${payment.id}`);
          }
        } catch (error) {
          // Log but don't fail - refund was already processed
          this.logger.error(`Failed to emit payment.refunded event: ${error}`);
        }

        return refundResponse;
      }).then(async (response) => {
        // After PayTR refund + DB updates succeed, cancel the Sürat shipment.
        // Best-effort: a failure here doesn't undo the refund (money is already back).
        try {
          await this.cancelSuratShipmentIfExists(
            orderId,
            payment.order?.orderNumber ?? refundTargetOrder?.orderNumber ?? orderId,
          );
        } catch (err) {
          this.logger.error(
            `Sürat cancel failed after successful refund for order ${orderId}: ${(err as Error).message}. Manual cleanup may be needed.`,
          );
        }
        return response;
      });
    } catch (error: any) {
      this.logger.error(`Refund error for payment ${payment.id}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Takas nakit ödemesi PayTR ile tamamlanmışken iptal: PayTR iade API + payment / trade_cash_payment güncelleme.
   * Tamamlanmış PayTR trade ödemesi yoksa no-op (refunded: false).
   */
  async refundTradeCashPaymentIfCompleted(tradeId: string): Promise<{
    refunded: boolean;
    paymentId?: string;
    skippedReason?: string;
  }> {
    const payment = await this.prisma.payment.findFirst({
      where: {
        tradeCashPayment: {
          tradeId,
          // Escrow: sadece bırakılmamış ve daha önce iade edilmemiş olanlar
          releasedAt: null,
          refundedAt: null,
        },
        status: PaymentStatus.completed,
        provider: PaymentProvider.paytr,
      },
      include: { tradeCashPayment: true },
    });

    if (!payment) {
      return { refunded: false, skippedReason: 'no_completed_paytr_payment' };
    }

    // Defensive guard: eğer ilişkili tradeCashPayment bırakılmış veya iade edilmişse atla
    if (
      payment.tradeCashPayment?.releasedAt ||
      payment.tradeCashPayment?.refundedAt
    ) {
      return {
        refunded: false,
        skippedReason: payment.tradeCashPayment.releasedAt
          ? 'already_released'
          : 'already_refunded',
      };
    }

    // Race condition guard: eğer zaten PayoutTransfer oluşturulmuş ve processing/completed ise iade yapma
    const existingPayout = await this.prisma.payoutTransfer.findFirst({
      where: {
        tradeCashPaymentId: payment.tradeCashPaymentId,
        status: { in: ['completed', 'processing'] },
      },
    });
    if (existingPayout) {
      return {
        refunded: false,
        skippedReason: 'payout_already_in_progress',
      };
    }

    const oid =
      payment.providerConversationId?.trim() ||
      tradeId.replace(/-/g, '');
    // Always refund the full charged amount (product + commission). PayTR was
    // charged the totalAmount at capture time; partial commission retention
    // would leave the payer short when the admin reject is no-fault.
    const amount = Number(
      payment.tradeCashPayment?.totalAmount ?? payment.amount,
    );

    // PAYMENT_BYPASS: dev/test modunda PayTR'a refund çağrısı yapma.
    const bypassEnabled = this.configService.get('PAYMENT_BYPASS') === 'true';
    if (bypassEnabled) {
      this.logger.warn(
        `PAYMENT_BYPASS: PayTR trade refund atlandı tradeId=${tradeId} amount=${amount}`,
      );
    } else {
      try {
        const refundResult = await this.paytrService.createRefund(oid, amount);
        if (refundResult.status !== 'success') {
          throw new BadRequestException(
            refundResult.err_msg || 'PayTR iade işlemi başarısız',
          );
        }
      } catch (e: any) {
        const msg = (e as Error).message || '';
        if (/odeme henuz siteye bildirilmemis|henuz siteye bildirilmemi/i.test(msg)) {
          throw new BadRequestException(
            'Ödeme yeni tamamlandı, PayTR henüz işlemi tam senkronize etmedi. Lütfen 1-2 dakika sonra tekrar deneyin.',
          );
        }
        this.logger.error(
          `refundTradeCashPaymentIfCompleted(tradeId=${tradeId}) PayTR error: ${e?.message}`,
        );
        throw e;
      }
    }

    // Y6: PayTR iadesi YAPILDI. Şimdi refundedAt'i set etmek kritik — aksi halde sonraki
    // çağrı (refundedAt hâlâ null) tekrar refund dener (PayTR çağrısı idempotency anahtarı
    // taşımaz). tx-sonrası geçici DB hatasının refundedAt'i set etmeden bırakmasını önlemek
    // için persist'i birkaç kez dene; hepsi başarısızsa yüksek-öncelikli alarm (manuel düzeltme).
    const existingMeta = (payment.metadata as Record<string, unknown>) || {};
    let persisted = false;
    for (let attempt = 1; attempt <= 3 && !persisted; attempt++) {
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.payment.update({
            where: { id: payment.id },
            data: {
              status: PaymentStatus.refunded,
              metadata: {
                ...existingMeta,
                refundAmount: amount,
                refundedAt: new Date().toISOString(),
                tradeCashRefund: true,
              },
            },
          });
          if (payment.tradeCashPaymentId) {
            await tx.tradeCashPayment.update({
              where: { id: payment.tradeCashPaymentId },
              data: { status: PaymentStatus.refunded, refundedAt: new Date() },
            });
          }
        });
        persisted = true;
      } catch (persistErr: any) {
        this.logger.error(
          `refundTradeCash persist denemesi ${attempt}/3 başarısız (tradeId=${tradeId}): ${persistErr?.message}`,
        );
      }
    }
    if (!persisted) {
      this.logger.error(
        `KRİTİK: PayTR trade-cash iadesi YAPILDI ama refundedAt SET EDİLEMEDİ ` +
          `(tradeId=${tradeId}, paymentId=${payment.id}). Çift-iade riski — DB'de elle refunded işaretleyin.`,
      );
    }

    this.logger.log(`Trade cash refunded via PayTR tradeId=${tradeId} paymentId=${payment.id}`);
    return { refunded: true, paymentId: payment.id };
  }

  /**
   * Release held payment to seller
   * Called when order is completed
   */
  async releasePayment(orderId: string) {
    const hold = await this.prisma.paymentHold.findFirst({
      where: {
        orderId,
        status: PaymentHoldStatus.held,
      },
    });

    if (!hold) {
      throw new NotFoundException('Bekleyen ödeme bulunamadı');
    }

    await this.prisma.paymentHold.update({
      where: { id: hold.id },
      data: {
        status: PaymentHoldStatus.released,
        releasedAt: new Date(),
      },
    });

    // In production: transfer funds to seller
    this.logger.log(`Payment hold ${hold.id} released to seller ${hold.sellerId}`);

    return { success: true, holdId: hold.id, amount: Number(hold.amount) };
  }

  /**
   * Release all payment holds whose releaseAt date has passed (for cron).
   * Also releases TradeCashPayment (safe-trade escrow) records whose
   * holdReleaseAt has passed.
   * Returns the number of order holds and trade cash payments released.
   */
  async releaseHoldsDue(): Promise<{ count: number; tradeCashReleased: number }> {
    const now = new Date();

    // 1) Sipariş ödeme bekletmeleri (PaymentHold) — atomik: sadece held olanları release et
    const dueHolds = await this.prisma.paymentHold.findMany({
      where: {
        status: PaymentHoldStatus.held,
        releaseAt: { lte: now },
      },
    });

    // Y1: Escrow yalnızca ürün en az sevk edildiyse VE açık bir iade/itiraz yoksa
    // serbest bırakılmalı. releaseAt ödeme anında +7gün sabitlendiği için, teslim
    // edilmemiş ya da iadesi açık bir siparişte süre dolsa bile parayı satıcıya
    // BIRAKMAYIZ (held bırakmak, yanlış ödemekten güvenlidir). preparing'de takılan
    // siparişler zaten handleExpiredPreparingOrders tarafından iptal+iade edilir.
    const RELEASABLE_ORDER_STATUSES: OrderStatus[] = [
      OrderStatus.shipped,
      OrderStatus.delivered,
      OrderStatus.awaiting_buyer_confirmation,
      OrderStatus.completed,
    ];
    const OPEN_REFUND_STATUSES: RefundRequestStatus[] = [
      RefundRequestStatus.pending_review,
      RefundRequestStatus.approved,
      RefundRequestStatus.wait_for_delivery,
      RefundRequestStatus.return_shipment_open,
      RefundRequestStatus.return_in_transit,
      RefundRequestStatus.return_delivered,
      RefundRequestStatus.disputed,
    ];

    let holdCount = 0;
    for (const hold of dueHolds) {
      const order = await this.prisma.order.findUnique({
        where: { id: hold.orderId },
        select: {
          status: true,
          refundRequests: {
            where: { status: { in: OPEN_REFUND_STATUSES } },
            select: { id: true },
            take: 1,
          },
        },
      });
      if (
        !order ||
        !RELEASABLE_ORDER_STATUSES.includes(order.status) ||
        order.refundRequests.length > 0
      ) {
        // Henüz serbest bırakma — bir sonraki cron turunda tekrar denenir.
        continue;
      }
      const updated = await this.prisma.paymentHold.updateMany({
        where: { id: hold.id, status: PaymentHoldStatus.held },
        data: { status: PaymentHoldStatus.released, releasedAt: now },
      });
      if (updated.count > 0) holdCount++;
    }
    if (holdCount > 0) {
      this.logger.log(`Released ${holdCount} payment hold(s) (releaseAt <= ${now.toISOString()})`);
    }

    // 2) Safe-trade nakit ödemeleri: holdReleaseAt süresi geçmiş olanları bırak
    let tradeCashReleased = 0;
    const dueTradeCash = await this.prisma.tradeCashPayment.findMany({
      where: {
        status: PaymentStatus.completed,
        holdReleaseAt: { lte: now },
        releasedAt: null,
        refundedAt: null,
      },
    });

    for (const tcp of dueTradeCash) {
      // Atomik guard: sadece hâlâ released/refunded olmamış olanları güncelle
      const updated = await this.prisma.tradeCashPayment.updateMany({
        where: { id: tcp.id, releasedAt: null, refundedAt: null },
        data: { releasedAt: now },
      });
      if (updated.count > 0) tradeCashReleased++;
    }

    if (tradeCashReleased > 0) {
      this.logger.log(
        `Released ${tradeCashReleased} trade cash payment(s) (holdReleaseAt <= ${now.toISOString()})`,
      );
    }

    return { count: holdCount, tradeCashReleased };
  }

  /**
   * Try to release payment hold for an order (e.g. on delivery). Idempotent: no-op if already released or not found.
   */
  async releasePaymentIfHeld(orderId: string): Promise<boolean> {
    const hold = await this.prisma.paymentHold.findFirst({
      where: { orderId, status: PaymentHoldStatus.held },
    });
    if (!hold) return false;
    await this.prisma.paymentHold.update({
      where: { id: hold.id },
      data: { status: PaymentHoldStatus.released, releasedAt: new Date() },
    });
    this.logger.log(`Payment hold ${hold.id} released for order ${orderId}`);
    return true;
  }

  /**
   * İptal/iade edilmiş ama ödemesi hâlâ `completed` olan siparişleri bulup PayTR iadesini
   * GÜVENİLİR şekilde tamamlar. Tek bir DB-tabanlı, idempotent, crash'e dayanıklı sweep
   * şu boşlukları birden yedekler:
   *  - K3: alıcı iptali → OrderService.cancel order'ı `refunded` yapar ama iade tetiklemezdi.
   *  - Y9: handleExpiredPreparingOrders order'ı `cancelled` yapıp tx-dışı processRefund çağırır;
   *        başarısızsa eskiden yalnız "MANUAL INTERVENTION" log'u kalırdı — artık burada retry edilir.
   *  - Y7: processSuccessfulPayment cron-yarışı dalındaki tx-dışı iade başarısızlığı.
   * processRefund order'ı `cancelled` + payment'ı `refunded` yaptığından (ve payout
   * tamamlandıysa K1 guard'ı bloke ettiğinden) sweep idempotenttir: işlenen sipariş bir
   * daha eşleşmez, kalıcı bloke olan nadir vaka her turda loglanır (manuel alarm sinyali).
   * Yani bu sweep aynı zamanda tx-dışı iadeler için bir retry/outbox görevi görür.
   */
  async processRefundedOrders(): Promise<{ refunded: number; failed: number }> {
    const orders = await this.prisma.order.findMany({
      where: {
        status: { in: [OrderStatus.refunded, OrderStatus.cancelled] },
        payment: { is: { status: PaymentStatus.completed } },
      },
      select: { id: true },
      take: 50,
    });

    let refunded = 0;
    let failed = 0;
    for (const order of orders) {
      try {
        await this.processRefund(order.id);
        refunded++;
      } catch (error: any) {
        failed++;
        this.logger.error(
          `Auto-refund (iptal edilen sipariş ${order.id}) başarısız: ${error.message}`,
        );
      }
    }
    return { refunded, failed };
  }

  /**
   * Wave 4 (kapsülleme): Sipariş taraflarını döndürür. Controller'ın PaymentService'in
   * private `prisma`'sına bracket-notation ile erişmesini (`paymentService['prisma']`) önler.
   */
  async findOrderParties(
    orderId: string,
  ): Promise<{ buyerId: string; sellerId: string } | null> {
    return this.prisma.order.findUnique({
      where: { id: orderId },
      select: { buyerId: true, sellerId: true },
    });
  }

  /**
   * O6: Ödemesi tamamlanmış ama faturası oluşmamış siparişleri bulup faturayı yeniden üret.
   * processSuccessfulPayment'ta fatura üretimi tx-sonrası best-effort olduğundan (geçici hata
   * yutulup loglanır) bu sweep güvenilir bir TELAFİ/retry görevi görür. Yalnız faturası
   * OLMAYAN (invoices:none) siparişleri seçtiğinden çift-fatura riski yoktur. Membership/boost
   * sanal siparişlerine fatura kesilmez → hariç tutulur.
   */
  async reconcileMissingInvoices(): Promise<{ generated: number }> {
    const orders = await this.prisma.order.findMany({
      where: {
        status: {
          in: [
            OrderStatus.preparing,
            OrderStatus.shipped,
            OrderStatus.delivered,
            OrderStatus.awaiting_buyer_confirmation,
            OrderStatus.completed,
          ],
        },
        payment: { is: { status: PaymentStatus.completed } },
        invoices: { none: {} },
        NOT: {
          OR: [
            { productId: { startsWith: 'membership-' } },
            { productId: { startsWith: 'boost-' } },
          ],
        },
      },
      select: { id: true, orderNumber: true },
      take: 50,
    });

    let generated = 0;
    for (const o of orders) {
      try {
        await this.invoiceService.generateAndSendInvoice(o.id);
        generated++;
      } catch (e: any) {
        this.logger.error(
          `reconcileMissingInvoices: sipariş ${o.orderNumber} faturası üretilemedi: ${e?.message}`,
        );
      }
    }
    return { generated };
  }

  /**
   * Unified get payment status (works for both auth and guest)
   */
  async getPaymentStatusUnified(paymentId: string, userId: string | null) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        order: {
          select: {
            buyerId: true,
            sellerId: true,
            productId: true,
            shippingAddress: true,
            totalAmount: true,
            shippingCost: true,
            buyerFeeAmount: true,
            sellerFeeAmount: true,
            commissionAmount: true,
          },
        },
        tradeCashPayment: {
          select: {
            payerId: true,
            recipientId: true,
            tradeId: true,
          },
        },
        checkoutGroup: {
          select: {
            id: true,
            groupNumber: true,
            buyerId: true,
            isGuest: true,
            totalAmount: true,
            orders: {
              select: {
                id: true,
                orderNumber: true,
                status: true,
                productId: true,
                totalAmount: true,
                shippingCost: true,
                buyerFeeAmount: true,
                sellerFeeAmount: true,
                commissionAmount: true,
                product: { select: { title: true } },
              },
            },
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException('Ödeme bulunamadı');
    }

    const pendingPaytrResume =
      payment.status === PaymentStatus.pending &&
      payment.provider === PaymentProvider.paytr &&
      payment.providerPaymentId
        ? {
            paymentUrl: `https://www.paytr.com/odeme/guvenli/${payment.providerPaymentId}`,
            paymentHtml: `<iframe src="https://www.paytr.com/odeme/guvenli/${payment.providerPaymentId}" frameborder="0" style="width:100%;height:600px;border:none;"></iframe>`,
          }
        : {};

    // Trade cash payment (no order)
    if (!payment.order && payment.tradeCashPayment) {
      if (userId && payment.tradeCashPayment.payerId !== userId && payment.tradeCashPayment.recipientId !== userId) {
        throw new ForbiddenException('Bu ödeme durumunu görüntüleme yetkiniz yok');
      }
      return {
        id: payment.id,
        orderId: null,
        tradeId: payment.tradeCashPayment.tradeId,
        status: payment.status,
        amount: Number(payment.amount),
        currency: payment.currency,
        provider: payment.provider,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
        ...pendingPaytrResume,
      };
    }

    // Grup ödemesi (no single order)
    if (!payment.order && payment.checkoutGroup) {
      const group = payment.checkoutGroup;
      if (userId) {
        if (group.buyerId !== userId) {
          throw new ForbiddenException('Bu ödeme durumunu görüntüleme yetkiniz yok');
        }
      } else if (!group.isGuest) {
        const canPollWithoutAuth =
          payment.status === PaymentStatus.pending || payment.status === PaymentStatus.processing;
        if (!canPollWithoutAuth) {
          throw new ForbiddenException('Bu ödeme için giriş yapmanız gerekiyor');
        }
      }

      const groupTotal = Number(group.totalAmount ?? 0);
      const sum = (fn: (o: any) => number) => group.orders.reduce((acc: number, o: any) => acc + fn(o), 0);
      const shippingAmount = sum((o) => Number(o.shippingCost ?? 0));
      const buyerFeeAmount = sum((o) => Number(o.buyerFeeAmount ?? 0));
      const sellerFeeAmount = sum((o) => Number(o.sellerFeeAmount ?? 0));
      const commissionAmount = sum((o) => Number(o.commissionAmount ?? 0));
      const subtotal = groupTotal - shippingAmount - buyerFeeAmount;

      return {
        id: payment.id,
        orderId: null,
        checkoutGroupId: group.id,
        groupNumber: group.groupNumber,
        status: payment.status,
        amount: Number(payment.amount),
        currency: payment.currency,
        provider: payment.provider,
        providerTransactionId: payment.providerPaymentId || payment.providerConversationId,
        pricing: {
          subtotal,
          shippingAmount,
          buyerFeeAmount,
          sellerFeeAmount,
          commissionAmount,
          totalAmount: groupTotal,
          sellerNetAmount: Math.max(0, subtotal - sellerFeeAmount),
        },
        orders: group.orders.map((o: any) => ({
          orderId: o.id,
          orderNumber: o.orderNumber,
          status: o.status,
          productId: o.productId,
          productTitle: o.product?.title,
          totalAmount: Number(o.totalAmount),
        })),
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
        ...pendingPaytrResume,
      };
    }

    if (!payment.order) {
      throw new NotFoundException('Ödeme ile ilişkili sipariş veya takas bulunamadı');
    }

    // Check if this is a guest order
    const shippingAddress = payment.order.shippingAddress as any;
    const isGuestOrder = shippingAddress?.isGuestOrder === true;

    // Validate access
    if (userId) {
      if (payment.order.buyerId !== userId && payment.order.sellerId !== userId) {
        throw new ForbiddenException('Bu ödeme durumunu görüntüleme yetkiniz yok');
      }
    } else {
      if (!isGuestOrder) {
        // Oturum yok veya JWT decode edilemedi (ör. token checkout sırasında temizlendi): yine de
        // bekleyen/işlenen ödemede durum okunabilsin; ödeme kimliği UUID ile korunur.
        const canPollWithoutAuth =
          payment.status === PaymentStatus.pending || payment.status === PaymentStatus.processing;
        if (!canPollWithoutAuth) {
          throw new ForbiddenException('Bu ödeme için giriş yapmanız gerekiyor');
        }
      }
    }

    const totalAmount = Number(payment.order.totalAmount ?? 0);
    const shippingCost = Number(payment.order.shippingCost ?? 0);
    const buyerFeeAmount = Number(payment.order.buyerFeeAmount ?? 0);
    const sellerFeeAmount = Number(payment.order.sellerFeeAmount ?? 0);
    const commissionAmount = Number(payment.order.commissionAmount ?? 0);
    const subtotal = totalAmount - shippingCost - buyerFeeAmount;
    const sellerNetAmount = Math.max(0, subtotal - sellerFeeAmount);

    const pricing = {
      subtotal,
      shippingAmount: shippingCost,
      buyerFeeAmount,
      sellerFeeAmount,
      commissionAmount,
      totalAmount,
      sellerNetAmount,
    };

    const isMembershipOrder = payment.order.productId?.startsWith?.('membership-') ?? false;

    return {
      id: payment.id,
      orderId: payment.orderId,
      status: payment.status,
      amount: Number(payment.amount),
      currency: payment.currency,
      provider: payment.provider,
      providerTransactionId: payment.providerPaymentId || payment.providerConversationId,
      pricing,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
      ...pendingPaytrResume,
      ...(isMembershipOrder && { isMembershipOrder: true }),
    };
  }

  /**
   * Get payment status (legacy - for backward compatibility)
   */
  async getPaymentStatus(paymentId: string, userId: string) {
    return this.getPaymentStatusUnified(paymentId, userId);
  }

  /**
   * Get payment status for guest orders (legacy - for backward compatibility)
   */
  async getGuestPaymentStatus(paymentId: string) {
    return this.getPaymentStatusUnified(paymentId, null);
  }

  /**
   * Get payment by ID
   */
  async findOne(paymentId: string, userId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        order: {
          include: {
            buyer: { select: { id: true, displayName: true } },
            seller: { select: { id: true, displayName: true } },
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException('Ödeme bulunamadı');
    }

    // Grup veya takas ödemelerinde tekil sipariş yoktur; durum sorgusu için unified endpoint kullanılmalı
    if (!payment.order) {
      throw new BadRequestException(
        'Bu ödeme bir sipariş grubuna veya takasa ait. Lütfen ödeme durumunu sipariş grubuyla sorgulayın.',
      );
    }

    // Only buyer or seller can view
    if (payment.order.buyerId !== userId && payment.order.sellerId !== userId) {
      throw new ForbiddenException('Bu ödemeyi görüntüleme yetkiniz yok');
    }

    const totalAmount = Number(payment.order.totalAmount ?? 0);
    const shippingCost = Number(payment.order.shippingCost ?? 0);
    const buyerFeeAmount = Number(payment.order.buyerFeeAmount ?? 0);
    const sellerFeeAmount = Number(payment.order.sellerFeeAmount ?? 0);
    const commissionAmount = Number(payment.order.commissionAmount ?? 0);
    const subtotal = totalAmount - shippingCost - buyerFeeAmount;
    const sellerNetAmount = Math.max(0, subtotal - sellerFeeAmount);

    const pricing = {
      subtotal,
      shippingAmount: shippingCost,
      buyerFeeAmount,
      sellerFeeAmount,
      commissionAmount,
      totalAmount,
      sellerNetAmount,
    };

    return {
      id: payment.id,
      orderId: payment.orderId,
      amount: Number(payment.amount),
      currency: payment.currency,
      provider: payment.provider,
      status: payment.status,
      providerTransactionId: payment.providerPaymentId || payment.providerConversationId,
      pricing,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
    };
  }

  /**
   * Get payment holds for seller
   */
  async getSellerHolds(sellerId: string) {
    const holds = await this.prisma.paymentHold.findMany({
      where: { sellerId },
      orderBy: { createdAt: 'desc' },
      include: {
        payment: {
          include: {
            order: {
              include: {
                product: { select: { id: true, title: true } },
              },
            },
          },
        },
      },
    });

    return holds.map((h) => ({
      id: h.id,
      orderId: h.orderId,
      sellerId: h.sellerId,
      amount: Number(h.amount),
      status: h.status,
      releaseAt: h.releaseAt ?? undefined,
      releasedAt: h.releasedAt ?? undefined,
      product: h.payment.order.product,
      createdAt: h.createdAt,
    }));
  }

  /**
   * Get user's payment history
   */
  async getUserPayments(
    userId: string,
    options?: {
      status?: PaymentStatus;
      provider?: string;
      startDate?: Date;
      endDate?: Date;
      page?: number;
      limit?: number;
    },
  ) {
    const page = options?.page || 1;
    const limit = options?.limit || 20;
    const skip = (page - 1) * limit;

    // Payment üç ilişkiden biriyle bağlanır: tekil sipariş (orderId), sepet
    // (checkoutGroupId) veya takas nakit farkı (tradeCashPaymentId). Üçü de
    // kapsanmazsa sepet/takas ödemeleri geçmişte görünmez.
    const where: any = {
      OR: [
        { order: { buyerId: userId } },
        { order: { sellerId: userId } },
        { checkoutGroup: { buyerId: userId } },
        { tradeCashPayment: { payerId: userId } },
        { tradeCashPayment: { recipientId: userId } },
      ],
    };

    if (options?.status) {
      where.status = options.status;
    }

    if (options?.provider) {
      where.provider = options.provider;
    }

    if (options?.startDate || options?.endDate) {
      where.createdAt = {};
      if (options.startDate) {
        where.createdAt.gte = options.startDate;
      }
      if (options.endDate) {
        where.createdAt.lte = options.endDate;
      }
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
              product: {
                select: {
                  id: true,
                  title: true,
                  images: { take: 1, orderBy: { sortOrder: 'asc' as const }, select: { cardKey: true } },
                },
              },
              buyer: { select: { id: true, displayName: true } },
              seller: { select: { id: true, displayName: true } },
            },
          },
          checkoutGroup: {
            include: {
              buyer: { select: { id: true, displayName: true } },
              orders: {
                include: {
                  product: {
                    select: {
                      id: true,
                      title: true,
                      images: { take: 1, orderBy: { sortOrder: 'asc' as const }, select: { cardKey: true } },
                    },
                  },
                  seller: { select: { id: true, displayName: true } },
                },
              },
            },
          },
          tradeCashPayment: {
            include: {
              trade: { select: { id: true, tradeNumber: true } },
            },
          },
        },
      }),
      this.prisma.payment.count({ where }),
    ]);

    // ProductImage `cardKey` (S3 anahtarı) tutar; frontend <img src> için URL ister.
    const toImageUrls = (product: any) => {
      if (!product) return null;
      const urls = (product.images ?? [])
        .map((img: any) => {
          const key = img?.cardKey;
          if (!key) return null;
          if (key.startsWith('http://') || key.startsWith('https://') || key.startsWith('/')) return key;
          return this.storageService.getPublicAssetUrl(key) || null;
        })
        .filter(Boolean);
      return { id: product.id, title: product.title, images: urls };
    };

    return {
      payments: payments.map((p) => {
        const group = (p as any).checkoutGroup;
        const tradeCash = (p as any).tradeCashPayment;
        const firstGroupOrder = group?.orders?.[0];

        let type: 'order' | 'checkout_group' | 'trade_cash' = 'order';
        let description = p.order?.product?.title ?? 'Sipariş ödemesi';
        if (group) {
          type = 'checkout_group';
          const count = group.orders?.length ?? 0;
          description =
            count > 1
              ? `Sepet ödemesi (${count} ürün)`
              : firstGroupOrder?.product?.title ?? 'Sepet ödemesi';
        } else if (tradeCash) {
          type = 'trade_cash';
          description = tradeCash.trade?.tradeNumber
            ? `Takas nakit farkı (#${tradeCash.trade.tradeNumber})`
            : 'Takas nakit farkı';
        }

        return {
          id: p.id,
          type,
          description,
          orderId: p.orderId ?? firstGroupOrder?.id ?? null,
          orderNumber:
            p.order?.orderNumber ?? group?.groupNumber ?? tradeCash?.trade?.tradeNumber ?? null,
          amount: Number(p.amount),
          currency: p.currency,
          provider: p.provider,
          status: p.status,
          failureReason: p.failureReason,
          providerTransactionId: p.providerPaymentId || p.providerConversationId,
          product: toImageUrls(p.order?.product ?? firstGroupOrder?.product),
          products: group
            ? (group.orders ?? []).map((o: any) => toImageUrls(o.product)).filter(Boolean)
            : p.order?.product
              ? [toImageUrls(p.order.product)]
              : [],
          buyer: p.order?.buyer ?? group?.buyer ?? null,
          seller: p.order?.seller ?? firstGroupOrder?.seller ?? null,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
          paidAt: p.paidAt,
        };
      }),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * PayTR callback sunucuya ulaşmadan ödeme başarılı olduysa: durum-sorgu ile doğrula ve tamamla (1.4).
   * PAYTR_RECONCILIATION_ENABLED=false ile kapatılabilir.
   */
  async reconcilePendingPaytrPayments(): Promise<{ checked: number; completed: number }> {
    const enabled = this.configService.get('PAYTR_RECONCILIATION_ENABLED');
    if (enabled === 'false' || enabled === '0') {
      return { checked: 0, completed: 0 };
    }

    const minAgeMin = parseInt(
      this.configService.get('PAYTR_RECONCILIATION_MIN_AGE_MINUTES') || '3',
      10,
    );
    const batch = parseInt(this.configService.get('PAYTR_RECONCILIATION_BATCH_LIMIT') || '40', 10);
    const tolerance = parseFloat(this.configService.get('PAYTR_RECONCILE_AMOUNT_TOLERANCE_TL') || '0.05');

    const cutoff = new Date();
    cutoff.setMinutes(cutoff.getMinutes() - minAgeMin);

    const candidates = await this.prisma.payment.findMany({
      where: {
        provider: 'paytr',
        status: PaymentStatus.pending,
        providerConversationId: { not: null },
        OR: [
          { order: { status: OrderStatus.pending_payment } },
          // Grup ödemesi: gruptaki en az bir sipariş hâlâ ödeme bekliyorsa
          { checkoutGroup: { orders: { some: { status: OrderStatus.pending_payment } } } },
        ],
        createdAt: { lt: cutoff },
      },
      include: {
        order: { select: { id: true, status: true, totalAmount: true } },
      },
      take: batch,
      orderBy: { createdAt: 'asc' },
    });

    let checked = 0;
    let completed = 0;

    for (const row of candidates) {
      checked++;
      const oid = row.providerConversationId as string;
      try {
        const inquiry = await this.paytrService.queryPaymentStatus(oid);
        if (!inquiry.ok) {
          continue;
        }

        const ourAmount = Number(row.amount);
        if (Math.abs(inquiry.paymentTotalTl - ourAmount) > tolerance) {
          // O10: tutar uyuşmazlığını ALARM (error) olarak logla — sessizce atlamak yerine
          // operasyon ekibinin görmesi için yüksek-öncelik. Ödeme completed yapılmaz.
          this.logger.error(
            `ALARM: PayTR reconcile tutar uyuşmazlığı — payment=${row.id} oid=${oid} ` +
              `paytr=${inquiry.paymentTotalTl} ours=${ourAmount}. Ödeme tamamlanmadı, manuel inceleme gerekir.`,
          );
          continue;
        }

        const full = await this.prisma.payment.findUnique({
          where: { id: row.id },
          include: {
            order: { include: { buyer: true, seller: true, product: true } },
            checkoutGroup: {
              include: { orders: { select: { status: true } } },
            },
            tradeCashPayment: true,
          },
        });

        const orderStillPayable = full?.orderId
          ? full.order?.status === OrderStatus.pending_payment
          : full?.checkoutGroup?.orders.some((o) => o.status === OrderStatus.pending_payment) ?? false;

        if (!full || full.status !== PaymentStatus.pending || !orderStillPayable) {
          continue;
        }

        const txnRef =
          inquiry.paymentDate != null && inquiry.paymentDate !== ''
            ? `paytr:${oid}:${inquiry.paymentDate}`
            : `paytr:${oid}`;

        const did = await this.processSuccessfulPayment(full, txnRef);
        if (did) {
          completed++;
          this.logger.log(`PayTR reconcile completed payment ${row.id} oid=${oid}`);
        }
      } catch (error: any) {
        this.logger.error(`PayTR reconcile failed payment ${row.id}: ${error?.message}`);
      }
    }

    return { checked, completed };
  }

  /**
   * 30-dk rezervasyon serbest bırakma. pending_payment siparişler PAYMENT_TIMEOUT_MINUTES
   * (varsayılan 30) içinde ödenmediyse stok rezervasyonu kaldırılır, AMA sipariş yaşamaya
   * devam eder (status pending_payment kalır, reservationReleasedAt set edilir). Alıcı
   * 24 saat içinde tekrar payment-initiate çağırırsa stok varsa yeniden rezerv alınır.
   * 24h kill-switch'i için ayrı method: expireUnpaidOrders.
   */
  async releaseExpiredOrderReservations(): Promise<{ count: number }> {
    const timeoutMinutes = parseInt(
      this.configService.get('PAYMENT_TIMEOUT_MINUTES') || '30',
      10,
    );
    const cutoff = new Date();
    cutoff.setMinutes(cutoff.getMinutes() - timeoutMinutes);

    const expiredOrders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.pending_payment,
        createdAt: { lt: cutoff },
        reservationReleasedAt: null,
      },
      select: {
        id: true,
        productId: true,
        orderNumber: true,
        buyerId: true,
        product: { select: { title: true } },
      },
    });

    let released = 0;
    const dispatched: { buyerId: string; orderId: string; productTitle: string }[] = [];
    for (const order of expiredOrders) {
      if (!order.productId) continue;
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM orders WHERE id = ${order.id} FOR UPDATE`;
          const freshOrder = await tx.order.findUnique({
            where: { id: order.id },
            select: { status: true, reservationReleasedAt: true },
          });
          if (
            !freshOrder ||
            freshOrder.status !== OrderStatus.pending_payment ||
            freshOrder.reservationReleasedAt !== null
          ) {
            return;
          }

          await tx.$queryRaw`SELECT id FROM products WHERE id = ${order.productId} FOR UPDATE`;
          const product = await tx.product.findUnique({
            where: { id: order.productId },
            select: { reservedQuantity: true, quantity: true, status: true },
          });

          if (product) {
            const newReserved = safeDecrementReserved(product.reservedQuantity, 1);
            const remaining = (product.quantity ?? 0) - newReserved;
            await tx.product.update({
              where: { id: order.productId },
              data: {
                reservedQuantity: newReserved,
                status:
                  newReserved > 0
                    ? ProductStatus.reserved
                    : remaining > 0
                      ? ProductStatus.active
                      : ProductStatus.reserved,
              },
            });
          }

          // Mark the reservation as released; order stays pending_payment so
          // the buyer can re-initiate within paymentExpiresAt (24h window).
          await tx.order.update({
            where: { id: order.id },
            data: { reservationReleasedAt: new Date() },
          });
        });
        await this.cache.del(`products:detail:${order.productId}`);
        released++;
        dispatched.push({
          buyerId: order.buyerId,
          orderId: order.id,
          productTitle: order.product?.title ?? 'Ürün',
        });
        this.logger.log(`Released reservation for order ${order.orderNumber} (product ${order.productId})`);
      } catch (error: any) {
        this.logger.error(`Failed to release expired order ${order.id}: ${error?.message}`);
      }
    }

    for (const d of dispatched) {
      await this.notificationService
        .notifyReservationReleased(d.buyerId, d.orderId, d.productTitle)
        .catch((err) =>
          this.logger.warn(`reservation-released notify failed for ${d.buyerId}: ${err.message}`),
        );
    }

    return { count: released };
  }

  /**
   * Ground-truth reconciliation: bir ürünün reservedQuantity'si, o ürün için
   * gerçekten rezervasyon tutan sipariş sayısına (status=pending_payment AND
   * reservationReleasedAt IS NULL) eşit olmalı. Sipariş satırı silindiğinde veya
   * release adımı kaçırıldığında sayaç yukarıda takılı kalabilir; bu da
   * availableQuantity = quantity - reservedQuantity'yi yanlışlıkla 0 yaparak
   * stokta olan ürünü "Stok bitti" gösterir. Bu metod sapan sayaçları düzeltir.
   *
   * releaseExpiredOrderReservations() yalnızca HÂLÂ var olan süresi geçmiş
   * siparişleri serbest bırakır; orphan (siparişsiz) rezervasyonları yakalayamaz —
   * bu metod o boşluğu kapatan emniyet ağıdır.
   */
  async reconcileReservedQuantities(): Promise<{ count: number }> {
    const candidates = await this.prisma.product.findMany({
      where: { reservedQuantity: { gt: 0 } },
      select: { id: true },
    });

    let fixed = 0;
    for (const { id } of candidates) {
      try {
        const held = await this.prisma.order.count({
          where: {
            productId: id,
            status: OrderStatus.pending_payment,
            reservationReleasedAt: null,
          },
        });
        await this.prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM products WHERE id = ${id} FOR UPDATE`;
          const product = await tx.product.findUnique({
            where: { id },
            select: { reservedQuantity: true, quantity: true, status: true },
          });
          if (!product || product.reservedQuantity === held) return;

          const remaining = (product.quantity ?? 0) - held;
          // Sayacı yanlışlıkla "reserved" yaptıysa ve stok varsa active'e döndür;
          // gerçekten satılmış/pasif (quantity 0) ürünlere dokunma.
          const nextStatus =
            product.status === ProductStatus.reserved && held === 0 && (product.quantity == null || remaining > 0)
              ? ProductStatus.active
              : undefined;

          await tx.product.update({
            where: { id },
            data: {
              reservedQuantity: held,
              ...(nextStatus ? { status: nextStatus } : {}),
            },
          });
          fixed++;
        });
        await this.cache.del(`products:detail:${id}`).catch(() => undefined);
      } catch (error: any) {
        this.logger.error(`reconcileReservedQuantities failed for ${id}: ${error?.message}`);
      }
    }

    if (fixed > 0) {
      await this.cache.delPattern('products:list:*').catch(() => undefined);
    }
    return { count: fixed };
  }

  /**
   * 24h kill-switch: pending_payment siparişleri paymentExpiresAt geçtiğinde
   * iptal eder. Eğer rezerv hâlâ tutuluyorsa (cron 30dk pas'ı kaçırdıysa) önce
   * onu serbest bırakır. Bağlı offer payment_expired olur.
   */
  async expireUnpaidOrders(): Promise<{ count: number }> {
    const now = new Date();
    const expired = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.pending_payment,
        paymentExpiresAt: { lt: now },
      },
      select: {
        id: true,
        productId: true,
        offerId: true,
        buyerId: true,
        orderNumber: true,
        reservationReleasedAt: true,
        product: { select: { title: true } },
      },
    });

    let cancelled = 0;
    const dispatched: { buyerId: string; orderId: string; productTitle: string }[] = [];
    for (const order of expired) {
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM orders WHERE id = ${order.id} FOR UPDATE`;
          const fresh = await tx.order.findUnique({
            where: { id: order.id },
            select: { status: true },
          });
          if (!fresh || fresh.status !== OrderStatus.pending_payment) return;

          // Rezerv hâlâ canlıysa serbest bırak (rare: 30dk cron'u kaçırdı)
          if (!order.reservationReleasedAt && order.productId) {
            await tx.$queryRaw`SELECT id FROM products WHERE id = ${order.productId} FOR UPDATE`;
            const product = await tx.product.findUnique({
              where: { id: order.productId },
              select: { reservedQuantity: true, quantity: true },
            });
            if (product) {
              const newReserved = safeDecrementReserved(product.reservedQuantity, 1);
              const remaining = (product.quantity ?? 0) - newReserved;
              await tx.product.update({
                where: { id: order.productId },
                data: {
                  reservedQuantity: newReserved,
                  status:
                    newReserved > 0
                      ? ProductStatus.reserved
                      : remaining > 0
                        ? ProductStatus.active
                        : ProductStatus.reserved,
                },
              });
            }
          }

          await tx.order.update({
            where: { id: order.id },
            data: {
              status: OrderStatus.cancelled,
              cancelReason: 'Ödeme süresi (24 saat) doldu',
            },
          });

          if (order.offerId) {
            await tx.offer.update({
              where: { id: order.offerId },
              data: { status: OfferStatus.payment_expired },
            });
          }

          await tx.payment.updateMany({
            where: { orderId: order.id, status: PaymentStatus.pending },
            data: {
              status: PaymentStatus.failed,
              failureReason: 'Sipariş 24 saat içinde ödenmediği için iptal edildi',
            },
          });

          // Grup ödemesi: yalnızca gruptaki HİÇBİR kardeş sipariş pending_payment
          // kalmadıysa grup payment'ını da expire et (kardeş hâlâ ödenebilir olabilir)
          const orderRow = await tx.order.findUnique({
            where: { id: order.id },
            select: { checkoutGroupId: true },
          });
          if (orderRow?.checkoutGroupId) {
            const aliveSibling = await tx.order.findFirst({
              where: {
                checkoutGroupId: orderRow.checkoutGroupId,
                status: OrderStatus.pending_payment,
                id: { not: order.id },
              },
              select: { id: true },
            });
            if (!aliveSibling) {
              await tx.payment.updateMany({
                where: {
                  checkoutGroupId: orderRow.checkoutGroupId,
                  status: PaymentStatus.pending,
                },
                data: {
                  status: PaymentStatus.failed,
                  failureReason: 'Sipariş 24 saat içinde ödenmediği için iptal edildi',
                },
              });
            }
          }
        });
        if (order.productId) {
          await this.cache.del(`products:detail:${order.productId}`);
        }
        cancelled++;
        dispatched.push({
          buyerId: order.buyerId,
          orderId: order.id,
          productTitle: order.product?.title ?? 'Ürün',
        });
        this.logger.log(`Expired unpaid order ${order.orderNumber} (24h TTL)`);
      } catch (err: any) {
        this.logger.error(`expireUnpaidOrders failed for ${order.id}: ${err.message}`);
      }
    }

    for (const d of dispatched) {
      await this.notificationService
        .notifyOrderPaymentExpired(d.buyerId, d.orderId, d.productTitle)
        .catch((err) =>
          this.logger.warn(`order-expired notify failed for ${d.buyerId}: ${err.message}`),
        );
    }

    return { count: cancelled };
  }

  /**
   * Cancel expired pending payments
   * Called by scheduler to automatically cancel payments older than timeout period
   */
  async cancelExpiredPayments() {
    const timeoutMinutes = parseInt(
      this.configService.get('PAYMENT_TIMEOUT_MINUTES') || '30',
      10,
    );
    const timeoutDate = new Date();
    timeoutDate.setMinutes(timeoutDate.getMinutes() - timeoutMinutes);

    // Find pending payments older than timeout
    const expiredPayments = await this.prisma.payment.findMany({
      where: {
        status: PaymentStatus.pending,
        createdAt: {
          lt: timeoutDate,
        },
      },
      include: {
        order: {
          include: {
            buyer: { select: { id: true, email: true, displayName: true } },
          },
        },
        checkoutGroup: {
          include: {
            orders: {
              select: {
                id: true,
                orderNumber: true,
                status: true,
                paymentExpiresAt: true,
              },
            },
          },
        },
      },
    });

    let cancelledCount = 0;

    for (const payment of expiredPayments) {
      try {
        // Trade cash vb. siparişsiz/grupsuz ödemeleri bu cron'da atlama (eski davranış order'a bağlıydı)
        if (!payment.order && !payment.checkoutGroup) {
          continue;
        }

        // Split-window contract: if the parent order is still in pending_payment
        // and its 24h paymentExpiresAt has not yet passed, only fail the Payment
        // row. The order stays alive so the buyer can hit initiate again and a
        // new Payment row is created. The 30-min reservation cron and the 24h
        // kill-switch handle stock + order state independently.
        // Grup ödemesi: gruptaki HERHANGİ bir sipariş canlıysa ödeme yeniden başlatılabilir.
        const now = new Date();
        const orderStillAlive = payment.order
          ? payment.order.status === OrderStatus.pending_payment &&
            payment.order.paymentExpiresAt > now
          : payment.checkoutGroup!.orders.some(
              (o) => o.status === OrderStatus.pending_payment && o.paymentExpiresAt > now,
            );

        await this.prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.failed,
            failureReason: `Ödeme ${timeoutMinutes} dakika içinde tamamlanmadığı için otomatik olarak iptal edildi`,
          },
        });

        if (!orderStillAlive) {
          // Order has been cancelled (or 24h passed): release stock + cleanup.
          if (payment.order) {
            await this.releaseProductForFailedPayment(payment.orderId);
            await this.cancelSuratShipmentIfExists(payment.orderId, payment.order.orderNumber);
          } else {
            for (const groupOrder of payment.checkoutGroup!.orders) {
              await this.releaseProductForFailedPayment(groupOrder.id);
              await this.cancelSuratShipmentIfExists(groupOrder.id, groupOrder.orderNumber);
            }
          }
        }

        // Emit payment.failed event (grup ödemesinde alıcı bilgisi sipariş bazında olmadığından atlanır; log yeterli)
        if (payment.order) {
          try {
            await this.eventService.emitPaymentFailed({
              paymentId: payment.id,
              orderId: payment.orderId,
              orderNumber: payment.order.orderNumber,
              buyerId: payment.order.buyerId,
              buyerEmail: payment.order.buyer.email,
              buyerName: payment.order.buyer.displayName || payment.order.buyer.email,
              amount: Number(payment.amount),
              provider: payment.provider,
              failureReason: `Ödeme ${timeoutMinutes} dakika içinde tamamlanmadığı için otomatik olarak iptal edildi`,
            });
          } catch (error) {
            // Log but don't fail
            this.logger.error(`Failed to emit payment.failed event for payment ${payment.id}: ${error}`);
          }
        }

        cancelledCount++;
        this.logger.log(
          `Cancelled expired payment ${payment.id} for ${payment.order ? `order ${payment.order.orderNumber}` : `group ${payment.checkoutGroupId}`}`,
        );
      } catch (error: any) {
        this.logger.error(`Failed to cancel expired payment ${payment.id}: ${error.message}`);
      }
    }

    return { count: cancelledCount };
  }

  /**
   * Handle orders stuck in "preparing" status past their deadline.
   * Two phases:
   * 1. Warn: Send notification to seller 24h before deadline (once only).
   * 2. Cancel: Auto-cancel + refund orders past deadline, re-stock product.
   */
  async handleExpiredPreparingOrders(): Promise<{ warned: number; cancelled: number }> {
    const now = new Date();
    const warningWindow = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24h from now

    // --- Phase 1: Warn sellers approaching deadline ---
    const approachingDeadline = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.preparing,
        preparingDeadline: { gt: now, lte: warningWindow },
        preparingWarningSentAt: null,
      },
      include: {
        seller: { select: { id: true, email: true, displayName: true } },
        product: { select: { id: true, title: true } },
      },
    });

    let warned = 0;
    for (const order of approachingDeadline) {
      try {
        const deadlineStr = order.preparingDeadline
          ? order.preparingDeadline.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
          : '';

        await this.notificationService.createInAppNotification(
          order.sellerId,
          NotificationType.ORDER_PREPARING_DEADLINE_WARNING,
          { orderId: order.id, orderNumber: order.orderNumber, deadline: deadlineStr, productTitle: order.product.title },
        );

        await this.prisma.order.update({
          where: { id: order.id },
          data: { preparingWarningSentAt: now },
        });

        warned++;
        this.logger.log(`Preparing deadline warning sent to seller ${order.sellerId} for order ${order.orderNumber}`);
      } catch (err: any) {
        this.logger.error(`Failed to warn seller for order ${order.id}: ${err.message}`);
      }
    }

    // --- Phase 2: Auto-cancel orders past deadline ---
    const expiredOrders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.preparing,
        preparingDeadline: { lt: now },
      },
      include: {
        buyer: { select: { id: true, email: true, displayName: true } },
        seller: { select: { id: true, email: true, displayName: true } },
        product: { select: { id: true, title: true, quantity: true } },
      },
    });

    let cancelled = 0;
    for (const order of expiredOrders) {
      try {
        await this.prisma.$transaction(async (tx) => {
          // Lock the order row to prevent concurrent modifications (e.g., seller shipping at the same time)
          await tx.$queryRaw`SELECT id FROM orders WHERE id = ${order.id} FOR UPDATE`;

          const freshOrder = await tx.order.findUnique({
            where: { id: order.id },
            select: { status: true },
          });
          if (!freshOrder || freshOrder.status !== OrderStatus.preparing) {
            return; // Already shipped or handled by another process
          }

          // Cancel order
          await tx.order.update({
            where: { id: order.id },
            data: {
              status: OrderStatus.cancelled,
              cancelReason: 'Satıcı belirlenen süre içinde kargoya vermediği için otomatik iptal edildi',
              version: { increment: 1 },
            },
          });

          // Cancel the payment hold (escrow)
          await tx.paymentHold.updateMany({
            where: { orderId: order.id, status: PaymentHoldStatus.held },
            data: { status: PaymentHoldStatus.cancelled },
          });

          // Ledger: Senaryo A — komisyon waived (Faz 3B.7).
          // processRefund sonradan markRefunded çağıracak ama status guard
          // (sadece pending/earned) nedeniyle waived satıra dokunmaz.
          await this.commissionLedger.markWaived(
            order.id,
            'seller_did_not_ship',
            tx,
          );

          // Re-stock: increment quantity and recalculate status
          const newQuantity = order.product.quantity !== null ? order.product.quantity + 1 : null;
          await tx.product.update({
            where: { id: order.product.id },
            data: {
              quantity: order.product.quantity !== null ? { increment: 1 } : undefined,
              status: getProductStatusFromQuantity(newQuantity),
            },
          });
        });

        // Process refund via PayTR (outside transaction — calls external API)
        try {
          await this.processRefund(order.id);
          this.logger.log(`Refund processed for expired preparing order ${order.orderNumber}`);
        } catch (refundError: any) {
          this.logger.error(
            `REFUND FAILED for expired preparing order ${order.orderNumber}: ${refundError.message}. MANUAL INTERVENTION REQUIRED.`,
          );
        }

        // Senaryo A bildirimi (Faz 3B.7) — alıcıya "satıcı göndermedi" haberi
        try {
          await this.notificationService.notifySellerDidNotShipRefunded(
            order.buyerId,
            order.id,
          );
        } catch (notifyErr: any) {
          this.logger.warn(
            `notify seller-no-ship failed for ${order.id}: ${notifyErr?.message}`,
          );
        }

        // Invalidate product cache
        await this.cache.del(`products:detail:${order.product.id}`);

        cancelled++;
        this.logger.log(
          `Auto-cancelled expired preparing order ${order.orderNumber} (seller: ${order.sellerId}, product: ${order.product.id})`,
        );
      } catch (err: any) {
        this.logger.error(`Failed to auto-cancel expired preparing order ${order.id}: ${err.message}`);
      }
    }

    return { warned, cancelled };
  }
}
