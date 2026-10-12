import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bull";
import { Queue } from "bull";
import { registerRepeatableCron } from "../../../monitoring/bull-cron.helper";
import { QUEUE_NAMES } from "../../../workers/constants";
import { NetsisAccountingPostingService } from "../accounting/netsis-accounting-posting.service";
import { NetsisAccountingSyncService } from "../accounting/netsis-accounting-sync.service";

/** Bull job adı = cron kataloğu anahtarı (workers/cron-catalog.ts). */
export const NETSIS_ACCOUNTING_CRON = "netsis-accounting-retry";

/**
 * Netsis muhasebe senkronunun zamanlayıcısı (15 dakikada bir, worker rolü).
 * Bir tur üç adımdır, üçü de idempotenttir:
 *  1. süpürme — olayı kaybolan ya da olay yaymayan kaynakların iş kaydını açar,
 *  2. yazma — bekleyen kayıtları Netsis'e yazar (senkron kapalı/hazır değilse no-op),
 *  3. alarm — bütçesi tükenen ya da sonucu bilinmeyen kayıtları admin'e bildirir.
 */
@Injectable()
export class NetsisAccountingSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(NetsisAccountingSchedulerService.name);

  constructor(
    private readonly sync: NetsisAccountingSyncService,
    private readonly posting: NetsisAccountingPostingService,
    @InjectQueue(QUEUE_NAMES.SCHEDULED) private readonly scheduledQueue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    await registerRepeatableCron(
      this.scheduledQueue,
      NETSIS_ACCOUNTING_CRON,
      "*/15 * * * *",
      this.logger,
    );
  }

  /** Gerçek iş — Bull processor 'netsis-accounting-retry' buradan çağırır. */
  async run(log: (msg: string) => void = () => {}) {
    try {
      const opened = await this.sync.sweep();
      const result = await this.posting.runPending();
      const exhausted = await this.posting.reportExhausted();
      const summary =
        `Netsis muhasebe: ${result.state} · ${opened} yeni kayıt · ` +
        `${result.synced} yazıldı · ${result.failed} başarısız` +
        (result.blockers?.length
          ? ` · eksik ayar: ${result.blockers.join(", ")}`
          : "") +
        (exhausted > 0 ? ` · ${exhausted} tükenmiş` : "");
      log(summary);
      return {
        summary,
        stats: {
          opened,
          synced: result.synced,
          failed: result.failed,
          exhausted,
        } as Record<string, number>,
      };
    } catch (err: unknown) {
      const message = (err as Error)?.message;
      this.logger.warn(`Netsis muhasebe cron hatası: ${message}`);
      log(`HATA: ${message}`);
      // Yutmadan yükselt: Bull job'ı "failed" olsun ki Sentry Cron alarmı çalsın.
      throw err;
    }
  }
}
