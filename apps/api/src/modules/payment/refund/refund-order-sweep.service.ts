import { Injectable, Logger } from "@nestjs/common";
import {
  CancellationActor,
  OrderStatus,
  PaymentStatus,
  Prisma,
  RefundAttemptStatus,
  ShipmentStatus,
} from "@prisma/client";
import { PrismaService } from "../../../prisma";
import { CacheService } from "../../cache/cache.service";
import { UatProductionCopyService } from "../../admin-test-tools/uat-refresh/uat-production-copy.service";
import { errorMessage } from "../../../common/helpers/error-message";
import { RefundPendingReconciliationException } from "../../payment-providers/refund-errors";
import { PaymentRefundService } from "./payment-refund.service";
import {
  REFUND_SWEEP_COOLDOWN_SECONDS,
  REFUND_SWEEP_MAX_DELAY_MS,
  claimRefundAlarm,
  sweepablePaymentWhere,
  waitingOrderIds,
} from "../helpers/refund-sweep-policy";

/**
 * A sweep candidate with the payment that holds its refund record: its own
 * payment (single order) or its basket group's payment.
 */
const REFUND_SWEEP_CANDIDATE_SELECT = {
  id: true,
  payment: { select: { metadata: true } },
  checkoutGroup: { select: { payment: { select: { metadata: true } } } },
} as const;

/**
 * Branch 3 also reads whether a refund was carried out as an attempt (also
 * a zero-cash settlement, which records 0 on the payment). Branches 1-2 leave
 * those orders out in SQL.
 */
const RETURNED_CANDIDATE_SELECT = {
  ...REFUND_SWEEP_CANDIDATE_SELECT,
  refundAttempts: {
    where: { status: RefundAttemptStatus.finalized },
    select: { id: true },
    take: 1,
  },
} as const;

interface RefundSweepCandidate {
  id: string;
  payment?: { metadata: unknown } | null;
  checkoutGroup?: { payment?: { metadata: unknown } | null } | null;
  refundAttempts?: { id: string }[];
}

/** Cache key of the cooldown after a failure that left no attempt. */
const cooldownKey = (orderId: string) => `refund-sweep:cooldown:${orderId}`;

/** Candidates per branch and run (bounded, ordered: oldest change first). */
const REFUND_SWEEP_BATCH = 50;

/**
 * Attempt states owned by someone else: the stuck-attempt recovery
 * (`prepared`, `succeeded`), the stale-submission quarantine (`submitting`),
 * the status inquiry or a person (`manual_review`). The claim would refuse the
 * sweep anyway (`RefundPendingReconciliation`), only after logging a failure.
 */
const UNRESOLVED_REFUND_ATTEMPT_STATUSES = [
  RefundAttemptStatus.prepared,
  RefundAttemptStatus.submitting,
  RefundAttemptStatus.succeeded,
  RefundAttemptStatus.manual_review,
];

/**
 * Was a refund of this order already carried out (full, partial or a
 * zero-cash settlement)?
 *
 * A carried-out refund is a decision: a partial amount is the outcome of a
 * settlement (seller fault, shipping share) and the order closed with it. The
 * sweep always asks for the FULL amount, so a retry would hit the cumulative
 * cap (`refundAmountExceedsLimit`, MONEY-H4) and log the order as failed on
 * every run (TARODAN-API-8), or, after a zero-cash settlement that records 0
 * on the payment, refund the whole amount. A failed refund leaves neither a
 * finalized attempt nor a payment record, so no retry target is lost. The
 * payment record also covers refunds from before the attempt ledger.
 */
function hasCarriedOutRefund(candidate: RefundSweepCandidate): boolean {
  if ((candidate.refundAttempts?.length ?? 0) > 0) return true;
  const metadata =
    candidate.payment?.metadata ?? candidate.checkoutGroup?.payment?.metadata;
  const meta = (metadata as Record<string, unknown> | null) ?? {};
  const refundedOrders =
    (meta.refundedOrders as Record<string, number> | undefined) ?? {};
  return Number(refundedOrders[candidate.id] ?? 0) > 0;
}

/**
 * Splits candidates into "refund not done yet" and "refund already recorded"
 * (single and basket payments alike).
 *
 * `skipped` goes back to the caller because skipping means different things
 * per branch: on a terminal order (cancelled/refunded) the refund decision
 * was carried out and dropping it silently is right; on a non-terminal order
 * the order is stuck and must stay visible.
 */
function partitionRefundCandidates(candidates: RefundSweepCandidate[]): {
  pending: string[];
  skipped: string[];
} {
  const pending: string[] = [];
  const skipped: string[] = [];
  for (const candidate of candidates) {
    (hasCarriedOutRefund(candidate) ? skipped : pending).push(candidate.id);
  }
  return { pending, skipped };
}

/**
 * Retry sweep of order refunds that did not go through (cron
 * `payment-expired`, every 5 minutes; `PaymentReconciliationService`
 * delegates here). One DB-driven, idempotent, crash-safe sweep that backs up:
 *  - K3: a buyer cancel sets the order `refunded` without starting the refund;
 *  - Y9: the missed-preparation cancel refunds outside its transaction and
 *    used to leave only a "MANUAL INTERVENTION" log when that failed;
 *  - Y7: the out-of-transaction refund of the payment/cron race.
 * A full refund cancels the order and refunds the payment, so the order no
 * longer matches. A partial refund leaves the payment `completed`, so every
 * branch leaves out orders whose refund was already carried out (a finalized
 * attempt, or a refund recorded on the payment): the rest of the balance is
 * an admin decision, never the sweep's full refund.
 *
 * D1 (Sentry TARODAN-API-3M/3N/3P): a refund the provider keeps refusing is
 * not resent on every run. An order whose attempt failed waits longer the
 * longer it has been failing (read from the attempt, helpers/
 * refund-sweep-policy) and is left out of the queries meanwhile; its alarm
 * (error, `REFUND_MANUAL_REVIEW`, one line per order) goes out once a day,
 * warn in between. An order whose refund has an unresolved attempt belongs to
 * the attempt recovery or to a person. On staging, orders paid before the
 * last production copy are left out (`UatProductionCopyService`).
 */
@Injectable()
export class RefundOrderSweepService {
  private readonly logger = new Logger(RefundOrderSweepService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentRefund: PaymentRefundService,
    private readonly cache: CacheService,
    private readonly productionCopy: UatProductionCopyService,
  ) {}

  async processRefundedOrders(
    now = new Date(),
  ): Promise<{ refunded: number; failed: number }> {
    const [recentFailures, copiedBefore] = await Promise.all([
      // Only failures recent enough to still be waiting (the longest wait).
      this.prisma.refundAttempt.findMany({
        where: {
          status: RefundAttemptStatus.failed,
          orderId: { not: null },
          updatedAt: {
            gt: new Date(now.getTime() - REFUND_SWEEP_MAX_DELAY_MS),
          },
        },
        select: { orderId: true, failureCount: true, updatedAt: true },
      }),
      this.productionCopy.copiedBefore(now),
    ]);
    const waiting = waitingOrderIds(recentFailures, now);
    const sweepable = sweepablePaymentWhere(copiedBefore);

    // Common to the three branches: not while the order waits after a
    // failure, not while (or once) another refund owns it.
    const candidateWhere = (
      where: Prisma.OrderWhereInput,
      ownedStatuses: RefundAttemptStatus[],
    ): Prisma.OrderWhereInput => ({
      ...where,
      ...(waiting.length > 0 ? { id: { notIn: waiting } } : {}),
      refundAttempts: { none: { status: { in: ownedStatuses } } },
    });
    const batch = {
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take: REFUND_SWEEP_BATCH,
    } satisfies Prisma.OrderFindManyArgs;
    const findCandidates = (
      where: Prisma.OrderWhereInput,
      ownedStatuses: RefundAttemptStatus[],
    ) =>
      this.prisma.order.findMany({
        where: candidateWhere(where, ownedStatuses),
        select: REFUND_SWEEP_CANDIDATE_SELECT,
        ...batch,
      });
    // Branches 1-2 also leave out orders with a finalized refund in SQL, not
    // only in app code: a closed order with a carried-out refund (partial,
    // or a zero-cash settlement that records nothing on the payment) would
    // otherwise match forever, fill the 50-row batch and hide new cancels,
    // and a zero-cash one would be refunded in full.
    const settledOrOwned = [
      ...UNRESOLVED_REFUND_ATTEMPT_STATUSES,
      RefundAttemptStatus.finalized,
    ];

    // 1) Single-order payments: Order.payment belongs to the order. After a
    // partial refund the payment stays `completed` (MONEY-H4), hence the
    // finalized-attempt filter and the `hasCarriedOutRefund` backstop.
    const orders = await findCandidates(
      {
        status: { in: [OrderStatus.refunded, OrderStatus.cancelled] },
        payment: { is: { status: PaymentStatus.completed, ...sweepable } },
      },
      settledOrOwned,
    );

    // 2) MONEY-H5: basket (group) orders. Their Order.payment is null (the
    // payment belongs to the CheckoutGroup), so branch 1 never sees them. The
    // group payment turns `refunded` only when every order of the group is
    // refunded, so cancelled orders of a group whose payment is still
    // `completed` are candidates until their own refund is done.
    const groupOrders = await findCandidates(
      {
        status: { in: [OrderStatus.refunded, OrderStatus.cancelled] },
        payment: { is: null },
        checkoutGroupId: { not: null },
        checkoutGroup: {
          is: {
            payment: { is: { status: PaymentStatus.completed, ...sweepable } },
          },
        },
      },
      settledOrOwned,
    );

    // 3) SEAM-B3 recovery: the outbound parcel came back to the sender
    // (shipment `returned`) but the refund failed, so the order is stuck in
    // `refund_requested`. The tracking poller stops at a terminal shipment
    // and cannot retry; this sweep does. `shipment.status = returned` tells
    // them apart from ordinary `refund_requested` orders (return tracked on
    // the RefundRequest). Orders with a carried-out refund stay in this
    // query: closed money on a still open order is the stuck case alarmed
    // below, never a second (full) refund.
    const returnedStuckOrders = await this.prisma.order.findMany({
      where: candidateWhere(
        {
          status: OrderStatus.refund_requested,
          shipment: { is: { status: ShipmentStatus.returned } },
          ...(copiedBefore
            ? {
                OR: [
                  { payment: { is: sweepable } },
                  { checkoutGroup: { is: { payment: { is: sweepable } } } },
                ],
              }
            : {}),
        },
        UNRESOLVED_REFUND_ATTEMPT_STATUSES,
      ),
      select: RETURNED_CANDIDATE_SELECT,
      ...batch,
    });

    // Skips in branches 1-2 are terminal (cancelled/refunded: the refund was
    // carried out) and silent. In branch 3 the order is not terminal: a
    // refund is recorded but the order is still open, and nothing but this
    // sweep would move it, so it is reported once a day per order.
    const returnedCandidates = partitionRefundCandidates(returnedStuckOrders);
    const returnedDue = await Promise.all(
      returnedCandidates.skipped.map((orderId) =>
        claimRefundAlarm(this.cache, `refund-sweep:returned:${orderId}`),
      ),
    );
    returnedCandidates.skipped.forEach((orderId, index) => {
      if (!returnedDue[index]) return;
      this.logger.warn(
        `REFUND_MANUAL_REVIEW: order ${orderId} has a recorded refund but is still refund_requested; ` +
          `the refund sweep cannot close it, manual review needed`,
      );
    });

    const allOrderIds = [
      ...partitionRefundCandidates(orders).pending,
      ...partitionRefundCandidates(groupOrders).pending,
      ...returnedCandidates.pending,
    ];

    let refunded = 0;
    let failed = 0;
    for (const orderId of allOrderIds) {
      // A failure that left no attempt to wait on cools down in the cache.
      if (await this.cache.exists(cooldownKey(orderId))) continue;
      const triedAt = new Date();
      try {
        // Branches 1-2: the order is already cancelled (its actor is kept).
        // Branch 3: the parcel came back; nobody asked to cancel, the system
        // closes it. The sweep raises its own alarm (below).
        await this.paymentRefund.processRefund(orderId, undefined, {
          cancelledBy: CancellationActor.system,
          callerAlarms: true,
        });
        refunded++;
      } catch (error) {
        failed++;
        if (error instanceof RefundPendingReconciliationException) {
          // The refund now has an unresolved attempt (e.g. PayTR said nothing
          // is left, or the outcome is unknown): the next runs leave the order
          // out, and the manual review alarm names that attempt.
          this.logger.warn(
            `Auto-refund of order ${orderId} handed to refund attempt reconciliation: ${errorMessage(error)}`,
          );
          continue;
        }
        // No failed attempt from this try (a data problem before the
        // claim, e.g. the group cap or a missing oid): nothing in the ledger
        // to wait on, so the order cools down in the cache for an hour.
        const leftAttempt = await this.prisma.refundAttempt.findFirst({
          where: {
            orderId,
            status: RefundAttemptStatus.failed,
            updatedAt: { gte: triedAt },
          },
          select: { id: true },
        });
        if (!leftAttempt) {
          await this.cache.setIfAbsent(
            cooldownKey(orderId),
            REFUND_SWEEP_COOLDOWN_SECONDS,
          );
        }
        // One line per order (the Sentry repeat throttle keys it by the
        // order id). Stock is restored at cancel time, so a stuck refund only
        // holds the buyer's money.
        const line =
          `REFUND_MANUAL_REVIEW: auto-refund of order ${orderId} failed: ${errorMessage(error)}; ` +
          `the sweep retries it with a growing wait`;
        if (
          await claimRefundAlarm(this.cache, `refund-sweep:order:${orderId}`)
        ) {
          this.logger.error(line);
        } else {
          this.logger.warn(line);
        }
      }
    }
    return { refunded, failed };
  }
}
