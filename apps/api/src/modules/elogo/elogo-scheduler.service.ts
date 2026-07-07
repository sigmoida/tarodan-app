import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ElogoInvoicingService } from './elogo-invoicing.service';

/**
 * eLogo gelir faturaları için retry zamanlayıcı.
 * pending/failed kalan kayıtları periyodik olarak yeniden gönderir (aynı numara/ETTN).
 * Servis kapalıysa (ELOGO_ENABLED=false) no-op.
 */
@Injectable()
export class ElogoSchedulerService {
  private readonly logger = new Logger(ElogoSchedulerService.name);

  constructor(private readonly invoicing: ElogoInvoicingService) {}

  @Cron(CronExpression.EVERY_30_MINUTES)
  async retryPending(): Promise<void> {
    try {
      await this.invoicing.retryPendingInvoices();
    } catch (err: any) {
      this.logger.warn(`eLogo retry cron hatası: ${err?.message}`);
    }
  }
}
