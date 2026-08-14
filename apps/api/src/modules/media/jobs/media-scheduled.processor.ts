import { Process, Processor } from "@nestjs/bull";
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bull";
import { Job, Queue } from "bull";
import { QUEUE_NAMES } from "../../../workers/constants";
import { runTrackedJob } from "../../../monitoring/cron-run.helper";
import { registerRepeatableCron } from "../../../monitoring/bull-cron.helper";
import { MediaCleanupService } from "./media-cleanup.service";

/** Cron KAYDI — her rolde koşar (repeatable kayıt idempotenttir, zamanlama senkron kalır). */
@Injectable()
export class MediaCleanupSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(MediaCleanupSchedulerService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.SCHEDULED) private readonly scheduledQueue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    // Günlük 04:30 — sahipsiz temp ürün görselleri (referans-bilinçli) temizlenir.
    await registerRepeatableCron(
      this.scheduledQueue,
      "media-temp-cleanup",
      "30 4 * * *",
      this.logger,
    );
  }
}

/** 'scheduled' kuyruğundaki medya cron işi — yalnız worker rolünde yüklenir. */
@Processor(QUEUE_NAMES.SCHEDULED)
export class MediaScheduledProcessor {
  constructor(private readonly cleanup: MediaCleanupService) {}

  @Process("media-temp-cleanup")
  async handleTempCleanup(job: Job) {
    return runTrackedJob(job, "media-temp-cleanup", async (log) => {
      const result = await this.cleanup.cleanupTempProductImages();
      log(
        `Temp temizliği: ${result.scanned} tarandı · ${result.deleted} silindi`,
      );
      return { summary: `${result.deleted} silindi`, stats: result };
    });
  }
}
