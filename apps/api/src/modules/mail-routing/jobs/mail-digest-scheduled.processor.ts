import { Process, Processor } from "@nestjs/bull";
import { Job } from "bull";
import { QUEUE_NAMES } from "../../../workers/constants";
import { runTrackedJob } from "../../../monitoring/cron-run.helper";
import { MailInternalDeliveryService } from "../internal/mail-internal-delivery.service";

/**
 * 'scheduled' kuyruğundaki personel bildirim özetleri. Job adları
 * `mail-digest.scheduler.ts`teki sabitlerle ve cron kataloğuyla aynıdır
 * (dekoratör sabit metin ister; sözleşme spec'i eşitliği zorlar).
 */
@Processor(QUEUE_NAMES.SCHEDULED)
export class MailDigestScheduledProcessor {
  constructor(private readonly delivery: MailInternalDeliveryService) {}

  @Process("mail-digest-hourly")
  async handleHourly(job: Job) {
    return runTrackedJob(job, "mail-digest-hourly", (log) =>
      this.delivery.runDigest("hourly", log),
    );
  }

  @Process("mail-digest-daily")
  async handleDaily(job: Job) {
    return runTrackedJob(job, "mail-digest-daily", (log) =>
      this.delivery.runDigest("daily", log),
    );
  }
}
