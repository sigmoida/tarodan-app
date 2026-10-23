import { Injectable, Logger } from "@nestjs/common";
import { RefundAttemptStatus, TradeStatus } from "@prisma/client";
import { PrismaService } from "../../../prisma";
import { CacheService } from "../../cache/cache.service";
import { UatProductionCopyService } from "../../admin-test-tools/uat-refresh/uat-production-copy.service";
import { PaymentRefundService } from "./payment-refund.service";
import {
  REFUND_SWEEP_COOLDOWN_SECONDS,
  REFUND_SWEEP_MAX_DELAY_MS,
  claimRefundAlarm,
  copiedPaymentWhere,
  waitingSubjectIds,
} from "../helpers/refund-sweep-policy";

/** Trades per run (bounded, ordered: the oldest failure first). */
const TRADE_REFUND_SWEEP_BATCH = 50;

/**
 * Trade statuses that can still owe a cash refund. `completed` is in: a
 * dispute resolved with compensation leaves the trade completed, and a
 * failed compensation refund writes the marker too. The unscoped call is
 * safe there: the row filter (holdReleaseAt = null) only sees refund debts.
 */
const REFUND_OWING_TRADE_STATUSES = [
  TradeStatus.cancelled,
  TradeStatus.returning,
  TradeStatus.disputed,
  TradeStatus.completed,
];

/** Same ownership rule as the order sweep (refund-order-sweep.service). */
const UNRESOLVED_REFUND_ATTEMPT_STATUSES = [
  RefundAttemptStatus.prepared,
  RefundAttemptStatus.submitting,
  RefundAttemptStatus.succeeded,
  RefundAttemptStatus.manual_review,
];

/** Cache key of the cooldown after a failure that left no attempt. */
const cooldownKey = (tradeId: string) =>
  `refund-sweep:trade-cooldown:${tradeId}`;

/**
 * MONEY-H2 retry sweep of trade cash refunds (cron `trade-expired`, every 5
 * minutes; `TradeReconciliationService` delegates here). The cancel, dispute
 * and warehouse-reject flows write `trade.refundFailureReason` when the PayTR
 * refund fails (`refundTradeCashTracked`); this sweep retries those trades
 * until the refund goes through and the marker is cleared.
 *
 * D1 parity with the order sweep (helpers/refund-sweep-policy): a trade whose
 * attempt failed waits on the attempt's failure count; a trade whose refund
 * has an unresolved attempt (e.g. PayTR said nothing is left: manual review)
 * is not retried; a failure that left no attempt cools down for an hour; one
 * alarm line per trade, error at most once a day; the payer is notified once
 * per failure episode (`refundTradeCashTracked`), never by a retry; on
 * staging, trades paid before the last production copy are left out.
 */
@Injectable()
export class RefundTradeSweepService {
  private readonly logger = new Logger(RefundTradeSweepService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentRefund: PaymentRefundService,
    private readonly cache: CacheService,
    private readonly productionCopy: UatProductionCopyService,
  ) {}

  async retryFailedTradeRefunds(
    now = new Date(),
  ): Promise<{ retried: number; recovered: number }> {
    const [recentFailures, copiedBefore] = await Promise.all([
      this.prisma.refundAttempt.findMany({
        where: {
          status: RefundAttemptStatus.failed,
          tradeId: { not: null },
          updatedAt: {
            gt: new Date(now.getTime() - REFUND_SWEEP_MAX_DELAY_MS),
          },
        },
        select: { tradeId: true, failureCount: true, updatedAt: true },
      }),
      this.productionCopy.copiedBefore(now),
    ]);
    const waiting = waitingSubjectIds(
      recentFailures.map((attempt) => ({
        subjectId: attempt.tradeId,
        failureCount: attempt.failureCount,
        updatedAt: attempt.updatedAt,
      })),
      now,
    );

    const stuck = await this.prisma.trade.findMany({
      where: {
        refundFailureReason: { not: null },
        status: { in: REFUND_OWING_TRADE_STATUSES },
        ...(waiting.length > 0 ? { id: { notIn: waiting } } : {}),
        refundAttempts: {
          none: { status: { in: UNRESOLVED_REFUND_ATTEMPT_STATUSES } },
        },
        // Staging: the PayTR test store refuses production's refunds forever.
        ...(copiedBefore
          ? {
              cashPayments: {
                none: { payment: { is: copiedPaymentWhere(copiedBefore) } },
              },
            }
          : {}),
      },
      select: { id: true },
      orderBy: [{ refundFailureAt: "asc" }, { id: "asc" }],
      take: TRADE_REFUND_SWEEP_BATCH,
    });

    let retried = 0;
    let recovered = 0;
    for (const trade of stuck) {
      // A failure that left no attempt to wait on cools down in the cache.
      if (await this.cache.exists(cooldownKey(trade.id))) continue;
      retried++;
      const triedAt = new Date();
      const result = await this.paymentRefund.refundTradeCashTracked(trade.id, {
        callerAlarms: true,
      });
      // "Recovered": the marker is cleared (refunded, or nothing left to
      // refund). Only a failure keeps it.
      if (!result.failed) {
        recovered++;
        continue;
      }
      const leftAttempt = await this.prisma.refundAttempt.findFirst({
        where: {
          tradeId: trade.id,
          status: RefundAttemptStatus.failed,
          updatedAt: { gte: triedAt },
        },
        select: { id: true },
      });
      if (!leftAttempt) {
        await this.cache.setIfAbsent(
          cooldownKey(trade.id),
          REFUND_SWEEP_COOLDOWN_SECONDS,
        );
      }
      // One line per trade (the Sentry repeat throttle keys it by the id).
      const line =
        `REFUND_MANUAL_REVIEW: trade cash refund of trade ${trade.id} failed: ${result.reason ?? "unknown reason"}; ` +
        `the sweep retries it with a growing wait`;
      if (
        await claimRefundAlarm(this.cache, `refund-sweep:trade:${trade.id}`)
      ) {
        this.logger.error(line);
      } else {
        this.logger.warn(line);
      }
    }

    if (retried > 0) {
      this.logger.log(
        `retryFailedTradeRefunds: ${retried} trade(s) retried, ${recovered} recovered`,
      );
    }
    return { retried, recovered };
  }
}
