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

  /** Gerçek iş — Bull processor 'refund-crons' buradan çağırır. */
  async runRefundCrons(log: (msg: string) => void = () => {}) {
    const opened = await this.openReturnShipmentsForDeliveredOrders();
    log(`${opened} iade kargosu açıldı (teslim edilmiş siparişler)`);
    const finalized = await this.finalizeReturnedShipments();
    log(`${finalized} iade finalize edildi (kargo döndü)`);
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
    return {
      summary: `${opened} açıldı · ${finalized} finalize · ${expired} süre doldu · ${waitExpired} teslim-bekleme doldu`,
      stats: { opened, finalized, expired, waitExpired },
    };
  }

  private async openReturnShipmentsForDeliveredOrders(): Promise<number> {
    const pending = await this.refundService.findPendingDeliveryToOpenReturn();
    if (pending.length === 0) return 0;
    this.logger.log(
      `Opening return shipments for ${pending.length} delivered refund request(s)`,
    );
    for (const id of pending) {
      try {
        await this.refundService.openReturnShipment(id);
      } catch (e) {
        this.logger.error(
          `Failed to open return shipment for ${id}: ${(e as Error).message}`,
        );
      }
    }
    return pending.length;
  }

  private async finalizeReturnedShipments(): Promise<number> {
    const pending =
      await this.refundService.findReturnDeliveredPendingFinalize();
    if (pending.length === 0) return 0;
    this.logger.log(
      `Finalizing refund for ${pending.length} returned shipment(s)`,
    );
    for (const id of pending) {
      try {
        await this.refundService.finalizeRefundForReturnedShipment(id);
      } catch (e) {
        this.logger.error(
          `Failed to finalize refund ${id}: ${(e as Error).message}`,
        );
      }
    }
    return pending.length;
  }
}
