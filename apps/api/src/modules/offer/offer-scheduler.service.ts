import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { TrackedCron } from '../../monitoring/tracked-cron.decorator';
import { cronsViaBull, registerRepeatableCron } from '../../monitoring/bull-cron.helper';
import { QUEUE_NAMES } from '../../workers/constants';
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
export class OfferSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(OfferSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.SCHEDULED) private readonly scheduledQueue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    await registerRepeatableCron(this.scheduledQueue, 'expire-offers', '*/5 * * * *', cronsViaBull(), this.logger);
  }

  /**
   * Her 5 dakikada bir süresi dolmuş pending teklifleri expired'a çeker.
   * Flag (CRONS_VIA_BULL) açıkken iş Bull repeatable'a taşınır; in-process no-op.
   */
  @TrackedCron('*/5 * * * *')
  async handleExpiredOffers() {
    if (cronsViaBull()) {
      return;
    }
    return this.runHandleExpiredOffers();
  }

  /** Gerçek iş — in-process cron ve Bull processor buradan çağırır. */
  async runHandleExpiredOffers(log: (msg: string) => void = () => {}) {
    try {
      const now = new Date();
      const result = await this.prisma.offer.updateMany({
        where: {
          status: OfferStatus.pending,
          expiresAt: { lt: now },
        },
        data: { status: OfferStatus.expired },
      });
      log(`${result.count} süresi dolmuş teklif 'expired' yapıldı`);
      if (result.count > 0) {
        this.logger.log(`Marked ${result.count} expired offer(s) as expired`);
      }
      return { summary: `${result.count} teklif süresi doldu`, stats: { expired: result.count } };
    } catch (error: any) {
      this.logger.error(`Error in expired offers job: ${error.message}`, error.stack);
      log(`HATA: ${error.message}`);
      return { summary: `Hata: ${error.message}`, stats: { expired: 0, errors: 1 } };
    }
  }
}
