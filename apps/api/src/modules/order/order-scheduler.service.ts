import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../../prisma';
import { OrderService } from './order.service';

const OPEN_REFUND_STATUSES = [
  'pending_review',
  'approved',
  'wait_for_delivery',
  'return_shipment_open',
  'return_in_transit',
  'return_delivered',
  'disputed',
] as const;

@Injectable()
export class OrderSchedulerService {
  private readonly logger = new Logger(OrderSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orderService: OrderService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * 48h penceresi dolan siparişleri otomatik tamamla.
   * Spec: Bölüm 6.3.
   * Feature flag korumalı: FEATURE_48H_CONFIRMATION_WINDOW=true gerekli.
   */
  @Cron('*/10 * * * *')
  async autoCompleteConfirmedOrders(): Promise<void> {
    if (
      this.configService.get<string>('FEATURE_48H_CONFIRMATION_WINDOW') !== 'true'
    ) {
      return;
    }

    const candidates = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.awaiting_buyer_confirmation,
        confirmationDeadline: { lt: new Date() },
      },
      select: { id: true },
      take: 100,
    });

    if (candidates.length === 0) return;

    let processed = 0;
    let skipped = 0;
    let failed = 0;

    for (const { id } of candidates) {
      try {
        const openRefund = await this.prisma.refundRequest.findFirst({
          where: { orderId: id, status: { in: OPEN_REFUND_STATUSES as any } },
          select: { id: true },
        });
        if (openRefund) {
          skipped++;
          continue;
        }

        const result = await this.orderService.completeOrder(id, 'auto_timeout');
        if (result.completed) processed++;
        else skipped++;
      } catch (e: any) {
        failed++;
        this.logger.error(
          `auto-complete failed for ${id}: ${e?.message}`,
          e?.stack,
        );
      }
    }

    this.logger.log(
      `autoCompleteConfirmedOrders: processed=${processed} skipped=${skipped} failed=${failed} total=${candidates.length}`,
    );
  }
}
