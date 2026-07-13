import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bull";
import { Queue } from "bull";
import { registerRepeatableCron } from "../../monitoring/bull-cron.helper";
import { QUEUE_NAMES } from "../../workers/constants";
import { RefundService } from "./refund.service";

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

  /** Gerçek iş — Bull processor (ve manuel tetik) buradan çağırır. */
  async runRefundCrons(log: (msg: string) => void = () => {}) {
    const opened = await this.openReturnShipmentsForDeliveredOrders(log);
    const finalized = await this.finalizeReturnedShipments(log);
    const failed = opened.failed + finalized.failed;
    return {
      summary: `${opened.done} opened · ${finalized.done} finalized${failed ? ` · ${failed} failed` : ""}`,
      // NOT: 'failed' kalem-seviyesidir (bir sonraki turda yeniden denenir) → işi
      // KIRMIZI YAPMAZ ama özet/stats'ta görünür. İş-seviyesi hata olsaydı 'errors' olurdu.
      stats: { opened: opened.done, finalized: finalized.done, failed },
    };
  }

  private async openReturnShipmentsForDeliveredOrders(
    log: (msg: string) => void,
  ): Promise<{ done: number; failed: number }> {
    const pending = await this.refundService.findPendingDeliveryToOpenReturn();
    if (pending.length === 0) return { done: 0, failed: 0 };
    this.logger.log(
      `Opening return shipments for ${pending.length} delivered refund request(s)`,
    );
    let failed = 0;
    for (const id of pending) {
      try {
        await this.refundService.openReturnShipment(id);
      } catch (e) {
        failed++;
        this.logger.error(
          `Failed to open return shipment for ${id}: ${(e as Error).message}`,
        );
      }
    }
    const done = pending.length - failed;
    log(
      `${done} return shipments opened${failed ? ` · ${failed} failed` : ""}`,
    );
    return { done, failed };
  }

  private async finalizeReturnedShipments(
    log: (msg: string) => void,
  ): Promise<{ done: number; failed: number }> {
    const pending =
      await this.refundService.findReturnDeliveredPendingFinalize();
    if (pending.length === 0) return { done: 0, failed: 0 };
    this.logger.log(
      `Finalizing refund for ${pending.length} returned shipment(s)`,
    );
    let failed = 0;
    for (const id of pending) {
      try {
        await this.refundService.finalizeRefundForReturnedShipment(id);
      } catch (e) {
        failed++;
        this.logger.error(
          `Failed to finalize refund ${id}: ${(e as Error).message}`,
        );
      }
    }
    const done = pending.length - failed;
    log(`${done} refunds finalized${failed ? ` · ${failed} failed` : ""}`);
    return { done, failed };
  }
}
