/**
 * Payment Processing Worker
 * Handles payment webhooks, refunds, and escrow releases (PayTR / internal jobs)
 */
import { Processor, Process, OnQueueFailed, OnQueueCompleted } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma';
import { PaymentStatus, OrderStatus } from '@prisma/client';

export interface PaymentJobData {
  type: 'webhook' | 'refund' | 'escrow-release' | 'payout';
  orderId?: string;
  paymentId?: string;
  amount?: number;
  reason?: string;
  sellerId?: string;
  webhookData?: Record<string, any>;
}

@Processor('payment')
export class PaymentWorker {
  private readonly logger = new Logger(PaymentWorker.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  @Process('webhook')
  async handleWebhook(job: Job<PaymentJobData>) {
    this.logger.log(`Processing payment webhook job ${job.id}`);

    const { webhookData } = job.data;

    try {
      // Process payment webhook (generic)
      const status = webhookData?.status;
      const paymentId = webhookData?.paymentId;
      const token = webhookData?.token;

      if (!paymentId && !token) {
        throw new Error('Invalid webhook data: missing paymentId or token');
      }

      // Find the payment record by providerPaymentId or providerConversationId
      const payment = await this.prisma.payment.findFirst({
        where: paymentId 
          ? { providerPaymentId: paymentId } 
          : { providerConversationId: token },
        include: { order: true },
      });

      if (!payment) {
        this.logger.warn(`Payment not found for webhook: ${paymentId || token}`);
        return { success: false, reason: 'Payment not found' };
      }

      // Update payment status based on webhook
      if (status === 'SUCCESS') {
        await this.prisma.$transaction([
          this.prisma.payment.update({
            where: { id: payment.id },
            data: {
              status: PaymentStatus.completed,
              paidAt: new Date(),
            },
          }),
          this.prisma.order.update({
            where: { id: payment.orderId },
            data: { status: OrderStatus.preparing },
          }),
        ]);
        this.logger.log(`Payment ${payment.id} marked as completed`);
      } else if (status === 'FAILURE') {
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: { status: PaymentStatus.failed },
        });
        this.logger.log(`Payment ${payment.id} marked as failed`);
      }

      return { success: true, paymentId: payment.id, status };
    } catch (error: any) {
      this.logger.error(`Failed to process webhook: ${error.message}`);
      throw error;
    }
  }

  @Process('refund')
  async handleRefund(job: Job<PaymentJobData>) {
    this.logger.log(`Processing refund job ${job.id} for order ${job.data.orderId}`);

    const { orderId, amount, reason } = job.data;

    try {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: { payment: true },
      });

      if (!order || !order.payment) {
        throw new Error(`Order or payment not found: ${orderId}`);
      }

      const refundAmount = amount || order.payment.amount.toNumber();
      const refundResult = await this.processProviderRefundStub(
        order.payment.providerPaymentId || '',
        refundAmount,
      );

      // Update payment record - store refund info in metadata
      await this.prisma.payment.update({
        where: { id: order.payment.id },
        data: {
          status: PaymentStatus.refunded,
          metadata: {
            refundedAt: new Date().toISOString(),
            refundAmount: refundAmount,
            refundReason: reason,
          },
        },
      });

      // Update order status
      await this.prisma.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.refunded },
      });

      this.logger.log(`Refund processed for order ${orderId}`);
      return { success: true, refundResult };
    } catch (error: any) {
      this.logger.error(`Failed to process refund for order ${orderId}: ${error.message}`);
      throw error;
    }
  }

  @Process('escrow-release')
  async handleEscrowRelease(job: Job<PaymentJobData>) {
    this.logger.log(`Processing escrow release job ${job.id} for order ${job.data.orderId}`);

    const { orderId } = job.data;

    try {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: {
          payment: true,
          seller: true,
        },
      });

      if (!order || !order.payment) {
        throw new Error(`Order or payment not found: ${orderId}`);
      }

      // Calculate commission (e.g., 10%)
      const paymentAmount = order.payment.amount.toNumber();
      const commissionRate = 0.10;
      const commission = paymentAmount * commissionRate;
      const sellerAmount = paymentAmount - commission;

      // In production: release escrow to seller (provider / payout)
      this.logger.log(
        `Releasing ${sellerAmount} TL to seller ${order.sellerId} (commission: ${commission} TL)`,
      );

      // Update payment record - store commission in order
      await this.prisma.order.update({
        where: { id: orderId },
        data: {
          commissionAmount: commission,
        },
      });

      return {
        success: true,
        orderId,
        sellerAmount,
        commission,
      };
    } catch (error: any) {
      this.logger.error(`Failed to release escrow for order ${orderId}: ${error.message}`);
      throw error;
    }
  }

  @Process('payout')
  async handlePayout(job: Job<PaymentJobData>) {
    this.logger.log(`Processing payout job ${job.id} for seller ${job.data.sellerId}`);

    const { sellerId, amount } = job.data;

    try {
      // Get seller's pending balance - completed payments
      const pendingPayments = await this.prisma.payment.findMany({
        where: {
          order: { sellerId },
          status: PaymentStatus.completed,
        },
      });

      const totalPending = pendingPayments.reduce(
        (sum, p) => sum + p.amount.toNumber(),
        0,
      );

      if (totalPending < (amount || 0)) {
        throw new Error(`Insufficient balance: ${totalPending} < ${amount}`);
      }

      // In production: Process payout via bank transfer
      this.logger.log(`Processing payout of ${amount || totalPending} TL to seller ${sellerId}`);

      // For now, just log that payout was processed
      // In a real system, you'd create a Payout record and call bank API

      return {
        success: true,
        amount: amount || totalPending,
      };
    } catch (error: any) {
      this.logger.error(`Failed to process payout for seller ${sellerId}: ${error.message}`);
      throw error;
    }
  }

  @OnQueueCompleted()
  onCompleted(job: Job) {
    this.logger.log(`Payment job ${job.id} completed`);
  }

  @OnQueueFailed()
  onFailed(job: Job, error: Error) {
    this.logger.error(`Payment job ${job.id} failed: ${error.message}`);
  }

  /** Stub: real refunds go through PaymentService + PayTR API */
  private async processProviderRefundStub(paymentId: string, amount: number): Promise<any> {
    this.logger.log(`Refund stub for provider txn ${paymentId}, amount: ${amount}`);
    return { status: 'success', paymentId, amount };
  }
}
