import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma';
import { PaymentProvider, PayTRCallbackDto } from './dto';
import { PaymentStatus, OrderStatus } from '@prisma/client';
import { PayTRService } from '../payment-providers/paytr.service';
import { PaymentCommonService } from './payment-common.service';
import { PaymentFulfillmentService } from './payment-fulfillment.service';
import { PaymentReconciliationService } from './payment-reconciliation.service';

@Injectable()
export class PaymentCallbackService {
  private readonly logger = new Logger(PaymentCallbackService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly paytrService: PayTRService,
    private readonly paymentCommon: PaymentCommonService,
    private readonly paymentFulfillment: PaymentFulfillmentService,
    private readonly paymentReconciliation: PaymentReconciliationService,
  ) {}

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
        OR: [{ providerConversationId: merchantOid }, { orderId: merchantOid }],
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
          metadata: {
            path: ['merchantOidHistory'],
            array_contains: merchantOid,
          },
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
  private async handlePayTRCallbackHashMismatch(
    dto: PayTRCallbackDto,
  ): Promise<string> {
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

    if (
      payment.orderId &&
      payment.order &&
      payment.order.status !== OrderStatus.pending_payment
    ) {
      this.logger.error(
        `PayTR hash mismatch: payment=${payment.id} orderStatus=${payment.order.status} merchant_oid=${dto.merchant_oid}`,
      );
      return 'OK';
    }

    const tolerance = parseFloat(
      this.configService.get('PAYTR_RECONCILE_AMOUNT_TOLERANCE_TL') || '0.05',
    );
    const oid =
      (payment.providerConversationId || dto.merchant_oid || '').trim() ||
      dto.merchant_oid.trim();

    let inquiry = await this.paytrService.queryPaymentStatus(oid);
    if (!inquiry.ok && oid.includes('-')) {
      inquiry = await this.paytrService.queryPaymentStatus(
        oid.replace(/-/g, ''),
      );
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

    const did = await this.paymentFulfillment.processSuccessfulPayment(
      payment,
      txnRef,
    );
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
      this.logger.warn(
        `PayTR callback: payment not found for merchant_oid=${dto.merchant_oid}`,
      );
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
      await this.paymentFulfillment.processSuccessfulPayment(
        payment,
        dto.merchant_oid,
      );
      // CAPI (Faz 3): store_card ödemesinde PayTR bildirimle utoken döndürür → kullanıcının
      // kayıtlı kartlarını SavedCard'a senkronla (recurring için). Best-effort, ödemeyi etkilemez.
      if (dto.utoken && payment.order?.buyerId) {
        try {
          await this.paymentReconciliation.syncSavedCardsFromUtoken(
            payment.order.buyerId,
            dto.utoken,
          );
        } catch (e: any) {
          this.logger.error(
            `SavedCard senkron hatası (oid=${dto.merchant_oid}): ${e?.message}`,
          );
        }
      }
    } else {
      await this.paymentFulfillment.processFailedPayment(
        payment,
        dto.failed_reason_msg || 'PayTR payment failed',
      );
    }

    return 'OK';
  }
}
