import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bull";
import { Queue } from "bull";
import { TrackedCron } from "../../monitoring/tracked-cron.decorator";
import {
  cronsViaBull,
  registerRepeatableCron,
} from "../../monitoring/bull-cron.helper";
import { QUEUE_NAMES } from "../../workers/constants";
import { ElogoInvoicingService } from "./elogo-invoicing.service";

/**
 * eLogo gelir faturaları için retry zamanlayıcı.
 * pending/failed kalan kayıtları periyodik olarak yeniden gönderir (aynı numara/ETTN).
 * Servis kapalıysa (ELOGO_ENABLED=false) no-op.
 *
 * Faz 7.1: pure @Cron → dual (in-process @TrackedCron + Bull). Bu bir PARA cron'u DEĞİL
 * (gelir faturası retry) → `cronsViaBull` (CRONS_VIA_BULL) ile geçiş yapar, money flag'i değil.
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
      cronsViaBull(),
      this.logger,
    );
  }

  @TrackedCron("*/30 * * * *")
  async retryPending(): Promise<void> {
    if (cronsViaBull()) {
      return;
    }
    await this.runRetryPending();
  }

  /** Gerçek iş — in-process cron ve (Faz 7) Bull processor buradan çağırır. */
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
