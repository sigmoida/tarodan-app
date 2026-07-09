import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { PaymentStatus } from '@prisma/client';
import { SuratCargoService } from '../surat-cargo/surat-cargo.service';

/**
 * Ödeme grupları arasında paylaşılan yardımcılar (order/trade split'lerindeki
 * *-common deseni): Sürat kargo iptali (best-effort) ve ödeme aksiyonu audit log'u.
 * PaymentService facade'i ve alt servisler (ör. PaymentRefundService) buraya delege eder.
 */
@Injectable()
export class PaymentCommonService {
  private readonly logger = new Logger(PaymentCommonService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly suratCargoService: SuratCargoService,
  ) {}

  /**
   * Cancel any active Surat shipment for an order. Best-effort: errors are logged
   * but don't block the calling flow. Used when an order is cancelled or refunded.
   */
  async cancelSuratShipmentIfExists(orderId: string, orderNumber: string): Promise<void> {
    try {
      const shipment = await this.prisma.shipment.findFirst({
        where: { orderId, provider: 'surat' },
      });
      if (!shipment) return;

      // Halihazırda 'cancelled' ise yapacak bir şey yok.
      if (shipment.status === 'cancelled') {
        this.logger.log(
          `Skip Surat cancel: shipment ${shipment.id} already cancelled`,
        );
        return;
      }

      // 'delivered'/'returned'/'failed' gibi terminal durumlarda Sürat'a iptal
      // çağrısı atmanın anlamı yok; ancak sipariş iptal edildiği için yerel
      // kargo kaydını yine de 'cancelled' yaparak veriyi tutarlı tutuyoruz
      // (aksi halde iptal edilen siparişte kargo "Teslim Edildi" görünüyordu).
      const terminalStatuses = ['delivered', 'returned', 'failed'];
      if (terminalStatuses.includes(shipment.status)) {
        await this.prisma.shipment.update({
          where: { id: shipment.id },
          data: { status: 'cancelled' as any },
        });
        this.logger.log(
          `Surat shipment locally marked cancelled (was ${shipment.status}) for order ${orderNumber}`,
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
   * Log payment action to audit log
   * Note: AuditLog requires adminUserId, so we only log admin actions
   * For user actions, we store in payment metadata
   */
  async logPaymentAction(
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
   * Payment'a merchant_oid (providerConversationId) atar — PayTR çağrısı YAPMAZ.
   * iframe kaldırıldıktan sonra ödeme niyeti (initiate) bir conversation id taşımalı ki
   * gelen callback eşleşebilsin ve reconciliation çalışsın. Eski oid'i merchantOidHistory'e
   * taşır (kullanıcı eski oid'le öderse callback yine eşleşir). process-direct daha sonra
   * kendi oid'iyle bunu tazeler (aynı history mantığı).
   */
  async assignMerchantOid(paymentId: string, baseOidRaw: string): Promise<string> {
    const baseOid = String(baseOidRaw).replace(/-/g, '');
    const merchantOid = `${baseOid}T${Date.now().toString().slice(-6)}`;
    const current = await this.prisma.payment.findUnique({
      where: { id: paymentId },
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
      where: { id: paymentId },
      data: {
        providerConversationId: merchantOid,
        providerPaymentId: null,
        metadata: { ...prevMeta, merchantOidHistory: oidHistory },
      },
    });
    return merchantOid;
  }
}
