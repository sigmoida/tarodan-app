import {
  Injectable,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { PayTRService } from '../payment-providers/paytr.service';
import { PayoutStatus, PaymentHoldStatus, PaymentStatus } from '@prisma/client';

@Injectable()
export class PayoutService {
  private readonly logger = new Logger(PayoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paytrService: PayTRService,
  ) {}

  /**
   * Create PayoutTransfer records for all newly released holds.
   * Called after releaseHoldsDue() marks holds as released.
   */
  async createPayoutsForReleasedHolds(): Promise<number> {
    // 1) Order PaymentHolds released but no PayoutTransfer yet
    const releasedHolds = await this.prisma.paymentHold.findMany({
      where: {
        status: PaymentHoldStatus.released,
        payoutTransfer: null,
      },
      include: {
        payment: { include: { order: true } },
        seller: { include: { bankAccount: true } },
      },
    });

    let created = 0;

    for (const hold of releasedHolds) {
      const payment = hold.payment;
      if (!payment?.order) continue;

      const merchantOid =
        payment.providerConversationId?.trim() ||
        payment.order.orderNumber.replace(/-/g, '');

      const bankAccount = hold.seller.bankAccount;
      const transId = `ORD${hold.orderId.replace(/-/g, '').slice(0, 20)}${Date.now()}`;

      await this.prisma.payoutTransfer.create({
        data: {
          paymentHoldId: hold.id,
          sellerId: hold.sellerId,
          amount: payment.order.totalAmount,
          commission: payment.order.commissionAmount,
          netAmount: hold.amount,
          merchantOid,
          transId,
          transferIban: bankAccount?.iban || '',
          transferName: bankAccount?.accountHolder || '',
          status: bankAccount ? PayoutStatus.pending : PayoutStatus.failed,
          failureReason: bankAccount ? null : 'no_bank_account',
        },
      });
      created++;
    }

    // 2) TradeCashPayment released but no PayoutTransfer yet
    const releasedTradeCash = await this.prisma.tradeCashPayment.findMany({
      where: {
        status: PaymentStatus.completed,
        releasedAt: { not: null },
        payoutTransfers: { none: {} },
      },
      include: {
        trade: true,
        payment: true,
      },
    });

    for (const tcp of releasedTradeCash) {
      const recipientId = tcp.recipientId;
      const recipient = await this.prisma.user.findUnique({
        where: { id: recipientId },
        include: { bankAccount: true },
      });
      if (!recipient) continue;

      const payment = tcp.payment;
      const merchantOid =
        payment?.providerConversationId?.trim() ||
        tcp.tradeId.replace(/-/g, '');

      const transId = `TRD${tcp.tradeId.replace(/-/g, '').slice(0, 20)}${Date.now()}`;
      const bankAccount = recipient.bankAccount;

      await this.prisma.payoutTransfer.create({
        data: {
          tradeCashPaymentId: tcp.id,
          sellerId: recipientId,
          amount: tcp.totalAmount,
          commission: tcp.commission,
          netAmount: tcp.amount,
          merchantOid,
          transId,
          transferIban: bankAccount?.iban || '',
          transferName: bankAccount?.accountHolder || '',
          status: bankAccount ? PayoutStatus.pending : PayoutStatus.failed,
          failureReason: bankAccount ? null : 'no_bank_account',
        },
      });
      created++;
    }

    if (created > 0) {
      this.logger.log(`Created ${created} payout transfer(s)`);
    }
    return created;
  }

  /**
   * Process pending PayoutTransfers — call PayTR Platform Transfer API.
   */
  async processPendingPayouts(): Promise<{ processed: number; failed: number }> {
    const pending = await this.prisma.payoutTransfer.findMany({
      where: { status: PayoutStatus.pending },
      take: 50,
    });

    let processed = 0;
    let failed = 0;

    for (const payout of pending) {
      if (!payout.transferIban || !payout.transferName) {
        await this.prisma.payoutTransfer.update({
          where: { id: payout.id },
          data: {
            status: PayoutStatus.failed,
            failureReason: 'no_bank_account',
          },
        });
        failed++;
        continue;
      }

      // Mark as processing before API call
      await this.prisma.payoutTransfer.update({
        where: { id: payout.id },
        data: { status: PayoutStatus.processing },
      });

      try {
        const result = await this.paytrService.createPlatformTransfer({
          merchantOid: payout.merchantOid,
          transId: payout.transId,
          submerchantAmount: Number(payout.netAmount),
          totalAmount: Number(payout.amount),
          transferName: payout.transferName,
          transferIban: payout.transferIban,
        });

        if (result.status === 'success') {
          await this.prisma.payoutTransfer.update({
            where: { id: payout.id },
            data: {
              status: PayoutStatus.completed,
              providerResponse: result as any,
              processedAt: new Date(),
            },
          });
          // Başarılı transfer = IBAN gerçek ve çalışıyor → otomatik doğrula.
          await this.syncBankAccountVerification(payout.sellerId, payout.transferIban, true);
          processed++;
          this.logger.log(
            `Payout ${payout.transId} completed: ${payout.netAmount} TL → ${payout.transferIban}`,
          );
        } else {
          await this.handlePayoutFailure(payout.id, result.err_msg || 'PayTR error', result);
          failed++;
        }
      } catch (error: any) {
        await this.handlePayoutFailure(payout.id, error.message, null);
        failed++;
      }
    }

    if (processed > 0 || failed > 0) {
      this.logger.log(`Payouts processed: ${processed} success, ${failed} failed`);
    }
    return { processed, failed };
  }

  /**
   * Process retry-pending payouts (exponential backoff).
   */
  async processRetryPayouts(): Promise<number> {
    const retryable = await this.prisma.payoutTransfer.findMany({
      where: {
        status: PayoutStatus.retry_pending,
        nextRetryAt: { lte: new Date() },
      },
      take: 20,
    });

    let retried = 0;
    for (const payout of retryable) {
      await this.prisma.payoutTransfer.update({
        where: { id: payout.id },
        data: { status: PayoutStatus.pending },
      });
      retried++;
    }

    return retried;
  }

  /**
   * Check for returned transfers from PayTR and update status.
   */
  async checkReturnedTransfers(): Promise<number> {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 7);

    const startDate = yesterday.toISOString().replace('T', ' ').slice(0, 19);
    const endDate = now.toISOString().replace('T', ' ').slice(0, 19);

    try {
      const result = await this.paytrService.getReturnedTransfers({
        startDate,
        endDate,
      });

      if (result.status !== 'success' || !Array.isArray(result.data)) {
        return 0;
      }

      let updated = 0;
      for (const returned of result.data) {
        const transfer = await this.prisma.payoutTransfer.findUnique({
          where: { transId: returned.trans_id },
        });
        if (transfer && transfer.status === PayoutStatus.completed) {
          await this.prisma.payoutTransfer.update({
            where: { id: transfer.id },
            data: {
              status: PayoutStatus.returned,
              failureReason: `Geri döndü: ${returned.reason || 'bilinmeyen neden'}`,
              providerResponse: returned as any,
            },
          });
          // Transfer geri döndü = IBAN sorunlu → doğrulamayı geri al.
          await this.syncBankAccountVerification(transfer.sellerId, transfer.transferIban, false);
          updated++;
          this.logger.warn(`Payout ${transfer.transId} returned: ${returned.reason}`);
        }
      }

      return updated;
    } catch (error: any) {
      this.logger.error(`Check returned transfers failed: ${error.message}`);
      return 0;
    }
  }

  /**
   * Satıcının banka hesabının doğrulama durumunu payout sonucuna göre günceller.
   * IBAN, transfer anındaki IBAN ile eşleşmiyorsa (satıcı sonradan değiştirmişse) dokunmaz.
   */
  private async syncBankAccountVerification(
    sellerId: string,
    transferIban: string,
    verified: boolean,
  ): Promise<void> {
    if (!sellerId || !transferIban) return;
    try {
      const account = await this.prisma.sellerBankAccount.findUnique({
        where: { userId: sellerId },
      });
      if (!account || account.iban !== transferIban) return;
      if (account.isVerified === verified) return;
      await this.prisma.sellerBankAccount.update({
        where: { userId: sellerId },
        data: { isVerified: verified, verifiedAt: verified ? new Date() : null },
      });
      this.logger.log(
        `Bank account for seller ${sellerId} isVerified=${verified} (payout sonucu).`,
      );
    } catch (error: any) {
      this.logger.error(`syncBankAccountVerification failed: ${error.message}`);
    }
  }

  private async handlePayoutFailure(
    payoutId: string,
    reason: string,
    providerResponse: any,
  ) {
    const payout = await this.prisma.payoutTransfer.findUnique({
      where: { id: payoutId },
    });
    if (!payout) return;

    const newRetryCount = payout.retryCount + 1;

    if (newRetryCount >= payout.maxRetries) {
      await this.prisma.payoutTransfer.update({
        where: { id: payoutId },
        data: {
          status: PayoutStatus.failed,
          failureReason: reason,
          retryCount: newRetryCount,
          providerResponse: providerResponse as any,
        },
      });
      this.logger.error(
        `Payout ${payout.transId} permanently failed after ${newRetryCount} attempts: ${reason}`,
      );
    } else {
      // Exponential backoff: 15min, 1hr, 4hr
      const backoffMinutes = Math.pow(4, newRetryCount) * 15;
      const nextRetryAt = new Date();
      nextRetryAt.setMinutes(nextRetryAt.getMinutes() + backoffMinutes);

      await this.prisma.payoutTransfer.update({
        where: { id: payoutId },
        data: {
          status: PayoutStatus.retry_pending,
          failureReason: reason,
          retryCount: newRetryCount,
          nextRetryAt,
          providerResponse: providerResponse as any,
        },
      });
      this.logger.warn(
        `Payout ${payout.transId} failed (attempt ${newRetryCount}/${payout.maxRetries}), retry at ${nextRetryAt.toISOString()}`,
      );
    }
  }
}
