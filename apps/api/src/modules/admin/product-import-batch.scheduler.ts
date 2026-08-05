import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectQueue, Process, Processor } from "@nestjs/bull";
import { Job, Queue } from "bull";
import { registerRepeatableCron } from "../../monitoring/bull-cron.helper";
import { runTrackedJob } from "../../monitoring/cron-run.helper";
import { QUEUE_NAMES } from "../../workers/constants";
import { AdminProductBulkImportService } from "./admin-product-bulk-import.service";

/**
 * Toplu ürün yüklemesi tek HTTP isteğinde koşar; süreç ölürse (deploy, OOM,
 * crash) batch kaydı sonsuza dek `processing` kalır ve onu kimse tamamlayamaz.
 * Bu cron yarıda kalanları kapatır; kayıt her rolde yapılır, işi yalnız worker
 * rolü tüketir (bkz. `scheduledProcessors`).
 */
@Injectable()
export class ProductImportBatchScheduler implements OnModuleInit {
  private readonly logger = new Logger(ProductImportBatchScheduler.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.SCHEDULED) private readonly scheduledQueue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    // 10 dakikada bir: yaşlanma eşiği 30 dk olduğu için bu sıklık yeterli ve
    // koşmakta olan bir yüklemeyi asla erken kapatmaz.
    await registerRepeatableCron(
      this.scheduledQueue,
      "product-import-stale-batches",
      "*/10 * * * *",
      this.logger,
    );
  }
}

/** 'scheduled' kuyruğundaki 'product-import-stale-batches' işini çalıştırır. */
@Processor(QUEUE_NAMES.SCHEDULED)
export class ProductImportBatchProcessor {
  constructor(private readonly bulkImport: AdminProductBulkImportService) {}

  @Process("product-import-stale-batches")
  async handle(job: Job) {
    return runTrackedJob(job, "product-import-stale-batches", async (log) => {
      const { failed } = await this.bulkImport.failStaleBatches();
      log(`${failed} yarıda kalmış yükleme kapatıldı`);
      return {
        summary: `${failed} yarıda kalmış yükleme kapatıldı`,
        stats: { failed },
      };
    });
  }
}
