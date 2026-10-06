import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bull";
import { Queue } from "bull";
import { QUEUE_NAMES } from "../../../workers/constants";
import { registerRepeatableCron } from "../../../monitoring/bull-cron.helper";

/** Bull job adları — cron kataloğundaki anahtarların aynısı. */
export const MAIL_DIGEST_HOURLY_JOB = "mail-digest-hourly";
export const MAIL_DIGEST_DAILY_JOB = "mail-digest-daily";

/**
 * Personel bildirim özetlerinin zamanlaması. Saatler Europe/Istanbul'dur
 * (`registerRepeatableCron` tz'yi sabitler): saatlik özet her saat başı,
 * günlük özet 09:00'da.
 */
@Injectable()
export class MailDigestScheduler implements OnModuleInit {
  private readonly logger = new Logger(MailDigestScheduler.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.SCHEDULED) private readonly scheduledQueue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    await registerRepeatableCron(
      this.scheduledQueue,
      MAIL_DIGEST_HOURLY_JOB,
      "0 * * * *",
      this.logger,
    );
    await registerRepeatableCron(
      this.scheduledQueue,
      MAIL_DIGEST_DAILY_JOB,
      "0 9 * * *",
      this.logger,
    );
  }
}
