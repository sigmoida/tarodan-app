import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bull";
import { Queue } from "bull";
import { TrackedCron } from "../../monitoring/tracked-cron.decorator";
import {
  moneyCronsViaBull,
  registerRepeatableCron,
} from "../../monitoring/bull-cron.helper";
import { QUEUE_NAMES } from "../../workers/constants";
import { PayoutService } from "./payout.service";

@Injectable()
export class PayoutSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(PayoutSchedulerService.name);

  constructor(
    private readonly payoutService: PayoutService,
    @InjectQueue(QUEUE_NAMES.SCHEDULED) private readonly scheduledQueue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    const on = moneyCronsViaBull();
    await registerRepeatableCron(
      this.scheduledQueue,
      "payout-check-returned",
      "0 6 * * *",
      on,
      this.logger,
    );
    // Tier 3: gerçek PayTR transfer. Bull tek-sefer garantisi = çift-ödeme kilidi.
    await registerRepeatableCron(
      this.scheduledQueue,
      "payout-process",
      "*/15 * * * *",
      on,
      this.logger,
    );
  }

  /**
   * Every 15 minutes: process pending payouts via PayTR Platform Transfer.
   */
  @TrackedCron("*/15 * * * *")
  async handleProcessPayouts() {
    if (moneyCronsViaBull()) {
      return;
    }
    return this.runProcessPayouts();
  }

  /** Gerçek iş — in-process cron ve Bull processor buradan çağırır. */
  async runProcessPayouts(log: (msg: string) => void = () => {}) {
    try {
      // 1) Move retry_pending → pending if nextRetryAt has passed
      const retried = await this.payoutService.processRetryPayouts();
      log(`${retried} payout moved retry_pending → pending`);
      if (retried > 0) {
        this.logger.log(
          `Moved ${retried} payout(s) from retry_pending to pending`,
        );
      }

      // 2) Process all pending payouts
      const result = await this.payoutService.processPendingPayouts();
      log(
        `Payout processing: ${result.processed} completed · ${result.failed} failed`,
      );
      if (result.processed > 0 || result.failed > 0) {
        this.logger.log(
          `Payout processing: ${result.processed} completed, ${result.failed} failed`,
        );
      }

      // 3) Y3: 'processing'te takılı (zombie) payout'ları tespit et ve alarm ver.
      const stuck = await this.payoutService.detectStuckProcessingPayouts();
      if (stuck > 0) {
        log(`⚠ ${stuck} payouts stuck in 'processing'`);
        this.logger.error(
          `${stuck} payout 'processing'te takılı — manuel inceleme gerekir`,
        );
      }
      return {
        summary: `${result.processed} processed · ${result.failed} failed${stuck ? ` · ${stuck} stuck` : ""}`,
        stats: {
          retried,
          processed: result.processed,
          failed: result.failed,
          stuck,
        },
      };
    } catch (error: any) {
      this.logger.error(`Payout processing error: ${error.message}`);
      log(`ERROR: ${error.message}`);
      return { summary: `Error: ${error.message}`, stats: { errors: 1 } };
    }
  }

  /**
   * Daily at 06:00: check for returned transfers from PayTR.
   */
  @TrackedCron("0 6 * * *")
  async handleCheckReturnedTransfers() {
    if (moneyCronsViaBull()) {
      return;
    }
    return this.runCheckReturnedTransfers();
  }

  /** Gerçek iş — in-process cron ve Bull processor buradan çağırır. */
  async runCheckReturnedTransfers(log: (msg: string) => void = () => {}) {
    try {
      const returned = await this.payoutService.checkReturnedTransfers();
      log(`${returned} returned payout transfers found`);
      if (returned > 0) {
        this.logger.warn(`Found ${returned} returned payout transfer(s)`);
      }
      return { summary: `${returned} returned transfers`, stats: { returned } };
    } catch (error: any) {
      this.logger.error(`Returned transfer check error: ${error.message}`);
      log(`ERROR: ${error.message}`);
      return { summary: `Error: ${error.message}`, stats: { errors: 1 } };
    }
  }
}
