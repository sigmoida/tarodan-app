import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectQueue, Process, Processor } from "@nestjs/bull";
import { Job, Queue } from "bull";
import { registerRepeatableCron } from "../../monitoring/bull-cron.helper";
import { runTrackedJob } from "../../monitoring/cron-run.helper";
import { QUEUE_NAMES } from "../../workers/constants";
import { LogRetentionService } from "./log-retention.service";

/**
 * Günlük log temizliği. Kayıt her rolde çalışır; işi yalnız worker rolü tüketir
 * (bkz. `scheduledProcessors`).
 */
@Injectable()
export class LogRetentionScheduler implements OnModuleInit {
  private readonly logger = new Logger(LogRetentionScheduler.name);

  constructor(
    private readonly retention: LogRetentionService,
    @InjectQueue(QUEUE_NAMES.SCHEDULED) private readonly scheduledQueue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    await registerRepeatableCron(
      this.scheduledQueue,
      "log-retention-purge",
      "15 4 * * *",
      this.logger,
    );
  }

  /** Gerçek iş — Bull processor 'log-retention-purge' buradan çağırır. */
  async runPurgeExpiredLogs(
    log: (msg: string) => void = () => {},
  ): Promise<{ summary: string; stats: Record<string, number> }> {
    const counts = await this.retention.purgeExpiredLogs();
    const total =
      counts.error + counts.security + counts.email + counts.notification;

    // Gizlilik sözleşmesi: cron kaydına YALNIZ sayaç yazılır, PII yok.
    log(
      `hata ${counts.error} · güvenlik ${counts.security} · e-posta ${counts.email} · bildirim ${counts.notification}`,
    );

    return {
      summary: `${total} eski log satırı silindi`,
      stats: { ...counts, total },
    };
  }
}

/** 'scheduled' kuyruğundaki 'log-retention-purge' işini çalıştırır. */
@Processor(QUEUE_NAMES.SCHEDULED)
export class LogRetentionProcessor {
  constructor(private readonly scheduler: LogRetentionScheduler) {}

  @Process("log-retention-purge")
  async handle(job: Job) {
    return runTrackedJob(job, "log-retention-purge", (log) =>
      this.scheduler.runPurgeExpiredLogs(log),
    );
  }
}
