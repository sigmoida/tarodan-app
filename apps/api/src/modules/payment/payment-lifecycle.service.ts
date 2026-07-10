import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma';
import { PaymentStatus, OrderStatus, ProductStatus } from '@prisma/client';
import { PayTRService } from '../payment-providers/paytr.service';
import { EventService } from '../events';
import { Request } from 'express';
import { PaymentCommonService } from './payment-common.service';
import { PaymentFulfillmentService } from './payment-fulfillment.service';

@Injectable()
export class PaymentLifecycleService {
  private readonly logger = new Logger(PaymentLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly paytrService: PayTRService,
    private readonly eventService: EventService,
    private readonly paymentCommon: PaymentCommonService,
    private readonly paymentFulfillment: PaymentFulfillmentService,
  ) {}

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
      throw new BadRequestException(
        'Sadece başarısız ödemeler tekrar denenebilir',
      );
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
      throw new BadRequestException(
        'Sipariş durumu ödeme tekrarına uygun değil',
      );
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
          auditHistory: [
            {
              action: 'payment.retried',
              timestamp: new Date().toISOString(),
              originalPaymentId: paymentId,
              userId,
            },
          ],
        },
      },
    });

    // Log retry action on original payment
    await this.paymentCommon.logPaymentAction(
      'retried',
      paymentId,
      payment.orderId,
      undefined,
      PaymentStatus.failed,
      undefined,
      {
        newPaymentId: newPayment.id,
        userId,
      },
    );

    // Ödeme niyeti (intent): merchant_oid ata (callback eşleşsin), kart /payments/process-direct ile.
    await this.paymentCommon.assignMerchantOid(
      newPayment.id,
      String(order.orderNumber || order.id),
    );

    this.logger.log(
      `Payment ${paymentId} retried, new payment ${newPayment.id} created`,
    );

    return {
      success: true,
      paymentId: payment.id,
      newPaymentId: newPayment.id,
      orderId: payment.orderId,
      amount: Number(payment.amount),
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
        throw new BadRequestException(
          'Sadece bekleyen ödemeler iptal edilebilir',
        );
      }
      await this.paymentFulfillment.processFailedPayment(
        payment,
        'Kullanıcı tarafından iptal edildi',
      );
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
      throw new BadRequestException(
        'Sadece bekleyen ödemeler iptal edilebilir',
      );
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
    await this.paymentFulfillment.releaseProductForFailedPayment(
      payment.orderId,
    );

    this.logger.log(`Payment ${paymentId} cancelled by user ${userId}`);

    // Log payment cancellation
    await this.paymentCommon.logPaymentAction(
      'cancelled',
      paymentId,
      payment.orderId,
      undefined,
      oldStatus,
      PaymentStatus.failed,
      {
        reason: 'Kullanıcı tarafından iptal edildi',
        userId,
      },
    );

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
  async confirmFailedFromClient(
    paymentId: string,
  ): Promise<{ released: boolean }> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { order: { select: { id: true } } },
    });
    if (!payment || payment.status !== PaymentStatus.pending) {
      return { released: false };
    }
    await this.paymentFulfillment.processFailedPayment(
      payment,
      'Fail sayfasından onay - rezervasyon serbest bırakıldı',
    );
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
      inquiry = await this.paytrService.queryPaymentStatus(
        oid.replace(/-/g, ''),
      );
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

    const did = await this.paymentFulfillment.processSuccessfulPayment(
      payment,
      txnRef,
    );
    if (did) {
      this.logger.log(
        `verifyPaymentFromClient completed payment=${payment.id} oid=${oid}`,
      );
      return { completed: true, status: 'completed_now' };
    }
    return { completed: false, status: 'process_skipped' };
  }
}
