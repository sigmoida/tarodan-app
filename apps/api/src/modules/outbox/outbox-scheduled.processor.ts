import { Process, Processor } from "@nestjs/bull";
import { Job } from "bull";
import { QUEUE_NAMES } from "../../workers/constants";
import { runTrackedJob } from "../../monitoring/cron-run.helper";
import { OutboxDrainerService } from "./outbox-drainer.service";

/**
 * 'scheduled' kuyruğundaki outbox drain işi (Faz 7). MONEY_CRONS_VIA_BULL=true iken
 * in-process cron yerine bu çalışır (tek-sefer garantisi + ayrı worker'a taşınabilir).
 */
@Processor(QUEUE_NAMES.SCHEDULED)
export class OutboxScheduledProcessor {
  constructor(private readonly drainer: OutboxDrainerService) {}

  @Process("outbox-drain")
  async handleDrain(job: Job) {
    return runTrackedJob(job, "outbox-drain", (log) =>
      this.drainer.runDrain(log),
    );
  }
}
