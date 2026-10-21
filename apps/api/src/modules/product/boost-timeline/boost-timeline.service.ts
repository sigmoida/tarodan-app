import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { BoostTimelineStore } from "./boost-timeline-store.service";
import { BoostActivationService } from "./boost-activation.service";
import { BoostStaffTimelineService } from "./boost-staff-timeline.service";
import { BoostSystemPauseService } from "./boost-system-pause.service";
import type {
  BoostActivation,
  BoostGrant,
  BoostGrantInput,
  BoostStopInput,
  BoostStopResult,
} from "./boost-timeline.types";

export type {
  BoostActivation,
  BoostGrant,
  BoostGrantInput,
  BoostStopInput,
  BoostStopResult,
} from "./boost-timeline.types";

/**
 * The one owner of a listing's boost timeline: the `product_boosts` rows of a
 * listing and the promotion columns they drive on the product (`boostedUntil`,
 * `boostedAt`, `homeShowcaseUntil`, `rankTier`, `relevanceScore`). A facade:
 * it only delegates, by responsibility, to activation (paid boost, free
 * grant), staff changes (pause, resume, extend, stop) and the system pause of
 * offline listings; the store holds the shared lock, lanes and refresh.
 *
 * Payment fulfilment (activation), refunds (stop), the admin boost screen and
 * the expire-boosts cron call it. Every method runs inside the caller's
 * transaction (`tx`), so the change commits with the business event that
 * caused it.
 *
 * Time: the running boosts of a listing form two queues, search priority and
 * home showcase (`boost-lanes.ts`). A change takes each boost's own remaining
 * time, changes the queue and lays it end to end again from now, so a pause,
 * a resume, an extension or a stop never adds or loses another boost's time.
 *
 * Concurrency: every mutation first locks the listing row (`lockProduct`,
 * `SELECT ... FOR UPDATE`) and only then reads the timeline, so two writers on
 * one listing (two boost payments fulfilled at once, a payment and a staff
 * action) run one after the other and the second stacks on the first's result
 * instead of on the same old `boostedUntil`. Lock order: a payment path has
 * already locked the payment and then the order (`payment-order-lock.ts`);
 * the listing comes after them, and boost rows are only touched under it.
 *
 * A leaf: Prisma, the global outbox and pure helpers only, no Payment or Admin
 * import, so both can import it without a cycle (`ProductModule` already
 * imports `PaymentModule`).
 */
@Injectable()
export class BoostTimelineService {
  constructor(
    private readonly store: BoostTimelineStore,
    private readonly activation: BoostActivationService,
    private readonly staff: BoostStaffTimelineService,
    private readonly system: BoostSystemPauseService,
  ) {}

  lockProduct(tx: Prisma.TransactionClient, productId: string) {
    return this.store.lockProduct(tx, productId);
  }

  refreshProductPromotion(
    tx: Prisma.TransactionClient,
    productId: string,
    now?: Date,
  ): Promise<void> {
    return this.store.refreshProductPromotion(tx, productId, now);
  }

  activateForOrder(
    tx: Prisma.TransactionClient,
    orderId: string,
    now?: Date,
  ): Promise<{ found: boolean; activation: BoostActivation | null }> {
    return this.activation.activateForOrder(tx, orderId, now);
  }

  activate(
    tx: Prisma.TransactionClient,
    boostId: string,
    now?: Date,
  ): Promise<BoostActivation | null> {
    return this.activation.activate(tx, boostId, now);
  }

  grant(
    tx: Prisma.TransactionClient,
    input: BoostGrantInput,
    now?: Date,
  ): Promise<BoostGrant> {
    return this.activation.grant(tx, input, now);
  }

  pause(tx: Prisma.TransactionClient, boostId: string, now?: Date) {
    return this.staff.pause(tx, boostId, now);
  }

  resume(tx: Prisma.TransactionClient, boostId: string, now?: Date) {
    return this.staff.resume(tx, boostId, now);
  }

  extend(
    tx: Prisma.TransactionClient,
    boostId: string,
    days: number,
    now?: Date,
  ) {
    return this.staff.extend(tx, boostId, days, now);
  }

  cancel(
    tx: Prisma.TransactionClient,
    boostId: string,
    input: BoostStopInput,
    now?: Date,
  ): Promise<BoostStopResult> {
    return this.staff.cancel(tx, boostId, input, now);
  }

  stopForRefund(
    tx: Prisma.TransactionClient,
    orderId: string,
    input: BoostStopInput & { refundedAmount: Prisma.Decimal.Value },
    now?: Date,
  ): Promise<BoostStopResult | null> {
    return this.staff.stopForRefund(tx, orderId, input, now);
  }

  pauseForDelisting(
    tx: Prisma.TransactionClient,
    productId: string,
    now?: Date,
  ): Promise<number> {
    return this.system.pauseForDelisting(tx, productId, now);
  }

  resumeSystemPaused(
    tx: Prisma.TransactionClient,
    productId: string,
    now?: Date,
  ): Promise<number> {
    return this.system.resumeSystemPaused(tx, productId, now);
  }
}
