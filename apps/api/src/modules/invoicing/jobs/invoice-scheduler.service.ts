import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bull";
import { Queue } from "bull";
import { registerRepeatableCron } from "../../../monitoring/bull-cron.helper";
import { QUEUE_NAMES } from "../../../workers/constants";
import { InvoicingService } from "../invoicing.service";

/**
 * Gelir e-belgeleri için retry zamanlayıcı (sağlayıcıdan bağımsız).
 * pending/failed kalan kayıtları periyodik olarak yeniden gönderir (aynı numara/ETTN).
 * Sağlayıcı kapalıysa (eLogo: ELOGO_ENABLED=false) no-op.
 *
 * Faz 7.5: Bull tek zamanlama mekanizması ('elogo-retry-pending' repeatable job).
 * Cron kimliği eski adıyla kalır: Bull repeatable anahtarı ve Sentry check-in'i
 * ona bağlı, yeniden adlandırma bir ops adımıdır (bkz. workers/cron-catalog.ts).
 */
@Injectable()
export class InvoiceSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(InvoiceSchedulerService.name);

  constructor(
    private readonly invoicing: InvoicingService,
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
      // Deneme bütçesi tükenmiş faturalar otomatik kurtarılmaz; görünür olmaları
      // gerekir (yasal süre işliyor). Admin retry endpoint'i ile kurtarılabilirler.
      const exhausted = await this.invoicing.reportExhaustedInvoices();
      log(
        `eLogo retry çalıştı${exhausted > 0 ? ` · ${exhausted} fatura deneme bütçesi tükenmiş` : ""}`,
      );
      return {
        summary: `eLogo retry tamam${exhausted > 0 ? ` · ${exhausted} tükenmiş` : ""}`,
        stats: { exhausted } as Record<string, number>,
      };
    } catch (err: any) {
      this.logger.warn(`eLogo retry cron hatası: ${err?.message}`);
      log(`HATA: ${err?.message}`);
      // Yutmadan yükselt: Bull job'ı "failed" olsun ki attempts/backoff ve Sentry
      // Cron alarmı gerçekten devreye girsin (aksi halde başarısız tur bile
      // "başarılı" görünür ve hata yalnız log satırında kalır).
      throw err;
    }
  }
}
