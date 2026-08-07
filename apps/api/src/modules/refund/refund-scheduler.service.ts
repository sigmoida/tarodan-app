import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bull";
import { Queue } from "bull";
import { registerRepeatableCron } from "../../monitoring/bull-cron.helper";
import { QUEUE_NAMES } from "../../workers/constants";
import { RefundService } from "./refund.service";
import { CronStepFailuresError } from "../../monitoring/cron-step-runner";

@Injectable()
export class RefundSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(RefundSchedulerService.name);

  constructor(
    private readonly refundService: RefundService,
    @InjectQueue(QUEUE_NAMES.SCHEDULED) private readonly scheduledQueue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    await registerRepeatableCron(
      this.scheduledQueue,
      "refund-crons",
      "0 */10 * * * *",
      this.logger,
    );
  }

  /** Gerçek iş — Bull processor 'refund-crons' buradan çağırır. */
  async runRefundCrons(log: (msg: string) => void = () => {}) {
    const openResult = await this.openReturnShipmentsForDeliveredOrders();
    log(
      `${openResult.processed} iade kargosu açıldı, ${openResult.failed} başarısız`,
    );
    const finalizeResult = await this.finalizeReturnedShipments();
    log(
      `${finalizeResult.processed} iade finalize edildi, ${finalizeResult.failed} başarısız`,
    );
    // D25: şubeye hiç götürülmeyen iadeleri süre dolunca iptal et (hold çözülür).
    const expired = await this.refundService.expireStaleOpenReturns();
    if (expired > 0)
      log(`${expired} iade drop-off süresi dolduğu için iptal edildi`);
    // MONEY-H6: sipariş hiç teslim edilmediği için wait_for_delivery'de takılan
    // iadeleri süre dolunca iptal et (donuk hold çözülür).
    const waitExpired = await this.refundService.expireStaleWaitForDelivery();
    if (waitExpired > 0)
      log(
        `${waitExpired} iade teslim-bekleme süresi dolduğu için iptal edildi`,
      );
    const failed = openResult.failed + finalizeResult.failed;
    if (failed > 0) {
      throw new CronStepFailuresError(
        [
          ...(openResult.failed ? ["open-return-shipments"] : []),
          ...(finalizeResult.failed ? ["finalize-returned-shipments"] : []),
        ],
        [
          ...(openResult.failed
            ? [`open-return-shipments: ${openResult.failed} kayıt`]
            : []),
          ...(finalizeResult.failed
            ? [`finalize-returned-shipments: ${finalizeResult.failed} kayıt`]
            : []),
        ],
      );
    }
    return {
      summary: `${openResult.processed} açıldı · ${finalizeResult.processed} finalize · ${expired} süre doldu · ${waitExpired} teslim-bekleme doldu`,
      stats: {
        opened: openResult.processed,
        finalized: finalizeResult.processed,
        expired,
        waitExpired,
        failed,
      },
    };
  }

  private async openReturnShipmentsForDeliveredOrders(): Promise<{
    processed: number;
    failed: number;
  }> {
    const pending = await this.refundService.findPendingDeliveryToOpenReturn();
    if (pending.length === 0) return { processed: 0, failed: 0 };
    this.logger.log(
      `Opening return shipments for ${pending.length} delivered refund request(s)`,
    );
    let processed = 0;
    let failed = 0;
    for (const id of pending) {
      try {
        await this.refundService.openReturnShipment(id);
        processed++;
      } catch (e) {
        failed++;
        this.logger.error(
          `Failed to open return shipment for ${id}: ${(e as Error).message}`,
        );
      }
    }
    return { processed, failed };
  }

  private async finalizeReturnedShipments(): Promise<{
    processed: number;
    failed: number;
  }> {
    const pending =
      await this.refundService.findReturnDeliveredPendingFinalize();
    if (pending.length === 0) return { processed: 0, failed: 0 };
    this.logger.log(
      `Finalizing refund for ${pending.length} returned shipment(s)`,
    );
    let processed = 0;
    let failed = 0;
    for (const id of pending) {
      try {
        await this.refundService.finalizeRefundForReturnedShipment(id);
        processed++;
      } catch (e) {
        failed++;
        this.logger.error(
          `Failed to finalize refund ${id}: ${(e as Error).message}`,
        );
      }
    }
    return { processed, failed };
  }
}
