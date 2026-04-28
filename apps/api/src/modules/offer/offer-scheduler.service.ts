import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma';
import { OfferStatus } from '@prisma/client';

/**
 * Offer Scheduler Service
 * DB'de hâlâ "pending" kalan ama süresi dolmuş teklifleri periyodik olarak
 * "expired" statüsüne çeker.
 *
 * Neden gerekli:
 * - invalidateRelatedOffers() sadece status=pending teklifleri hedefler.
 * - Süresi dolmuş ama DB'de pending kalan teklifler yanlışlıkla "rejected"
 *   yapılır; doğru statü "expired" olmalıdır.
 */
@Injectable()
export class OfferSchedulerService {
  private readonly logger = new Logger(OfferSchedulerService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Her 5 dakikada bir süresi dolmuş pending teklifleri expired'a çeker.
   */
  @Cron('*/5 * * * *')
  async handleExpiredOffers() {
    try {
      const now = new Date();
      const result = await this.prisma.offer.updateMany({
        where: {
          status: OfferStatus.pending,
          expiresAt: { lt: now },
        },
        data: { status: OfferStatus.expired },
      });
      if (result.count > 0) {
        this.logger.log(`Marked ${result.count} expired offer(s) as expired`);
      }
    } catch (error: any) {
      this.logger.error(`Error in expired offers job: ${error.message}`, error.stack);
    }
  }
}
