import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bull";
import { Queue } from "bull";
import { registerRepeatableCron } from "../../monitoring/bull-cron.helper";
import { QUEUE_NAMES } from "../../workers/constants";
import { ElogoInvoicingService } from "./elogo-invoicing.service";

/**
 * eLogo gelir faturaları için retry zamanlayıcı.
 * pending/failed kalan kayıtları periyodik olarak yeniden gönderir (aynı numara/ETTN).
 * Servis kapalıysa (ELOGO_ENABLED=false) no-op.
 *
 * Faz 7.5: Bull tek zamanlama mekanizması ('elogo-retry-pending' repeatable job).
 */
@Injectable()
export class ElogoSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(ElogoSchedulerService.name);

  constructor(
    private readonly invoicing: ElogoInvoicingService,
    @InjectQueue(QUEUE_NAMES.SCHEDULED) private readonly scheduledQueue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    await registerRepeatableCron(
      this.scheduledQueue,
      "elogo-retry-pending",
      "*/30 * * * *",
      this.logger,
    );
  }

  /** Gerçek iş — Bull processor 'elogo-retry-pending' buradan çağırır. */
  async runRetryPending(log: (msg: string) => void = () => {}) {
    try {
      await this.invoicing.retryPendingInvoices();
      log(`eLogo retry çalıştı`);
      return {
        summary: "eLogo retry tamam",
        stats: {} as Record<string, number>,
      };
    } catch (err: any) {
      this.logger.warn(`eLogo retry cron hatası: ${err?.message}`);
      log(`HATA: ${err?.message}`);
      return { summary: `Hata: ${err?.message}`, stats: { errors: 1 } };
    }
  }
}
