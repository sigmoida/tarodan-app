import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bull";
import type { Queue } from "bull";
import { PrismaService } from "../../../prisma";
import { isTest } from "../../../config/environment";
import { registerRepeatableCron } from "../../../monitoring/bull-cron.helper";
import type { CronRunSummary } from "../../../monitoring/cron-run.helper";
import { QUEUE_NAMES } from "../../../workers/constants";
import {
  inReadOnlySnapshot,
  type ReadSnapshotLimits,
} from "../../../common/helpers/bounded-transaction";
import {
  statsWindowEndingAt,
  type StatsWindow,
} from "../../../common/helpers/stats-window";
import { CacheService } from "../../cache/cache.service";
import { OrderSellerTrustStatsService } from "../../order/stats/order-seller-trust-stats.service";
import { RefundSellerTrustStatsService } from "../../refund/stats/refund-seller-trust-stats.service";
import { RatingSellerTrustStatsService } from "../../rating/stats/rating-seller-trust-stats.service";
import { TradeSellerTrustStatsService } from "../../trade/stats/trade-seller-trust-stats.service";
import { UserSellerTrustStatsService } from "../../user/stats/user-seller-trust-stats.service";
import { SellerTrustService } from "../seller-trust.service";
import { computeSellerTrust } from "../helpers/trust-formula";
import { TRUST_FORMULA_V1 as F } from "../helpers/trust-formula.constants";
import { assembleTrustInputs, hasTrustActivity } from "../helpers/trust-inputs";

/** Bull job name = cron catalog key = Sentry monitor slug. Renaming is an ops step. */
export const SELLER_TRUST_REFRESH_JOB = "seller-trust-refresh";
/** 02:30 Europe/Istanbul: before `update-popularity` (03:00) reads the scores. */
export const SELLER_TRUST_REFRESH_CRON = "30 2 * * *";
/** Fixed id: however many instances boot on an empty table, one run is queued. */
export const SELLER_TRUST_BOOTSTRAP_JOB_ID = "seller-trust-bootstrap";
export const SELLER_TRUST_LOCK_KEY = "seller-trust:refresh-lock";

/** Lock TTL; the run budget below stays well inside it. */
const LOCK_TTL_SECONDS = 2 * 60 * 60;
/** Stop starting batches after this, so the lock never expires under a run. */
const RUN_BUDGET_MS = 90 * 60 * 1000;
const BATCH_SIZE = 500;
const PAUSE_BETWEEN_BATCHES_MS = 100;
/**
 * Candidates by `preparing_deadline` look this much further back than the
 * volume window: an order completes some days to weeks after it was paid
 * (preparing, transit, return window), so a seller whose completions are all
 * near the window's start is still found.
 */
const CANDIDATE_MARGIN_DAYS = 30;

const READ_LIMITS: ReadSnapshotLimits = {
  statementTimeoutMs: 15_000,
  transactionTimeoutMs: 30_000,
};

interface TrustWindows {
  rating: StatsWindow;
  operations: StatsWindow;
  volume: StatsWindow;
}

interface BatchResult {
  eligible: number;
  written: number;
  scored: number;
  notEnoughData: number;
}

/** Error class and code only: a message can carry ids or values (no PII in logs). */
function errorKind(error: unknown): string {
  if (!(error instanceof Error)) return typeof error;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string"
    ? `${error.constructor.name}(${code})`
    : error.constructor.name;
}

/**
 * Nightly seller trust refresh (ADR 0014, `docs/SELLER_TRUST.md`).
 *
 * One run = one `asOf` instant; every window ends there, so re-running over
 * unchanged data writes the same rows. (State that changes during a run, such
 * as an order shipped between two batches, is read as of each batch's
 * snapshot; the next night picks it up.) Safeguards:
 * a Redis run lock (on top of Bull's one-consumer delivery), set-based reads
 * per owning domain in batches of 500 inside a read-only snapshot with a
 * statement timeout, one bounded upsert per batch, a pause between batches,
 * and stale-row cleanup only after every batch succeeded. Nothing writes to
 * `users` or to any hot table.
 */
@Injectable()
export class SellerTrustSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SellerTrustSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly sellerTrust: SellerTrustService,
    private readonly orderStats: OrderSellerTrustStatsService,
    private readonly refundStats: RefundSellerTrustStatsService,
    private readonly ratingStats: RatingSellerTrustStatsService,
    private readonly tradeStats: TradeSellerTrustStatsService,
    private readonly userStats: UserSellerTrustStatsService,
    @InjectQueue(QUEUE_NAMES.SCHEDULED) private readonly scheduledQueue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    await registerRepeatableCron(
      this.scheduledQueue,
      SELLER_TRUST_REFRESH_JOB,
      SELLER_TRUST_REFRESH_CRON,
      this.logger,
    );
    await this.enqueueBootstrapIfEmpty();
  }

  /**
   * First deploy: the table is empty, so queue one run now instead of waiting
   * for 02:30. The fixed job id makes concurrent boots add it once; the worker
   * role runs it. Skipped under tests. A failure here must not stop the boot:
   * the nightly run fills the table anyway.
   */
  async enqueueBootstrapIfEmpty(): Promise<void> {
    if (isTest()) return;
    try {
      if (!(await this.sellerTrust.isEmpty())) return;
      await this.scheduledQueue.add(
        SELLER_TRUST_REFRESH_JOB,
        {},
        {
          jobId: SELLER_TRUST_BOOTSTRAP_JOB_ID,
          attempts: 3,
          backoff: { type: "exponential", delay: 30_000 },
          removeOnComplete: true,
          removeOnFail: true,
        },
      );
      this.logger.log("Seller trust table is empty: bootstrap run queued");
    } catch (error) {
      this.logger.warn(
        `Seller trust bootstrap enqueue failed: ${errorKind(error)}`,
      );
    }
  }

  /** The job body: the Bull processor calls this through `runTrackedJob`. */
  async runRefresh(
    log: (msg: string) => void = () => undefined,
    asOf: Date = new Date(),
  ): Promise<CronRunSummary> {
    if (
      !(await this.cache.setIfAbsent(SELLER_TRUST_LOCK_KEY, LOCK_TTL_SECONDS))
    ) {
      // setIfAbsent also answers false when Redis fails. Only a lock that is
      // really there is a skip; anything else fails the job so Bull retries
      // and the failure alarm sees it, instead of a silent green no-op.
      if (!(await this.cache.exists(SELLER_TRUST_LOCK_KEY))) {
        throw new Error("seller-trust-refresh: run lock unavailable");
      }
      log("another run holds the lock");
      return { summary: "skipped: locked", stats: { skipped: 1 } };
    }
    try {
      return await this.refresh(log, asOf);
    } finally {
      await this.cache.del(SELLER_TRUST_LOCK_KEY);
    }
  }

  private async refresh(
    log: (msg: string) => void,
    asOf: Date,
  ): Promise<CronRunSummary> {
    const started = Date.now();
    const windows: TrustWindows = {
      rating: statsWindowEndingAt(asOf, F.windows.ratingDays),
      operations: statsWindowEndingAt(asOf, F.windows.operationsDays),
      volume: statsWindowEndingAt(asOf, F.windows.volumeDays),
    };

    const { candidates, guestBuyerId } = await inReadOnlySnapshot(
      this.prisma,
      READ_LIMITS,
      async (tx) => {
        const sellers = await this.orderStats.activeSellerIds(
          tx,
          statsWindowEndingAt(
            asOf,
            F.windows.volumeDays + CANDIDATE_MARGIN_DAYS,
          ).since,
        );
        const traders = await this.tradeStats.activeTraderIds(
          tx,
          windows.volume.since,
        );
        return {
          candidates: [...new Set([...sellers, ...traders])].sort(),
          guestBuyerId: await this.userStats.guestBuyerId(tx),
        };
      },
    );

    const batches: string[][] = [];
    for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
      batches.push(candidates.slice(i, i + BATCH_SIZE));
    }
    log(`${candidates.length} candidates in ${batches.length} batches`);

    const stats = {
      candidates: candidates.length,
      batches: batches.length,
      eligible: 0,
      scored: 0,
      notEnoughData: 0,
      written: 0,
      deleted: 0,
      failedBatches: 0,
    };

    for (let i = 0; i < batches.length; i++) {
      if (Date.now() - started > RUN_BUDGET_MS) {
        stats.failedBatches += batches.length - i;
        log(`run budget exhausted before batch ${i}`);
        this.logger.warn(
          `Seller trust run budget exhausted; ${batches.length - i} batches not run`,
        );
        break;
      }
      try {
        const result = await this.runBatch(
          batches[i],
          asOf,
          windows,
          guestBuyerId,
        );
        stats.eligible += result.eligible;
        stats.scored += result.scored;
        stats.notEnoughData += result.notEnoughData;
        stats.written += result.written;
      } catch (error) {
        stats.failedBatches += 1;
        log(`batch ${i} failed: ${errorKind(error)}`);
        this.logger.warn(`Seller trust batch ${i} failed: ${errorKind(error)}`);
      }
      if (i < batches.length - 1) await this.pause(PAUSE_BETWEEN_BATCHES_MS);
    }

    const counters = () =>
      Object.entries(stats)
        .map(([k, v]) => `${k}=${v}`)
        .join(" ");
    if (stats.failedBatches > 0) {
      // Keep every existing row: a failed batch's sellers keep yesterday's
      // score. Throwing marks the Bull job failed (retries, failure alarm).
      log(`not cleaned up: ${counters()}`);
      throw new Error(
        `seller-trust-refresh: ${stats.failedBatches} of ${stats.batches} batches failed; stale rows kept`,
      );
    }
    if (stats.written === 0) {
      // A run that wrote nothing would delete every score. That is far more
      // likely a broken candidate query or an empty snapshot than every
      // seller dropping out at once, so keep the rows and say so.
      log(`cleanup skipped: nothing written`);
      this.logger.warn("Seller trust run wrote no row; cleanup skipped");
      return { summary: `cleanup skipped: ${counters()}`, stats };
    }

    stats.deleted = await this.sellerTrust.deleteStale(asOf);
    return { summary: counters(), stats };
  }

  private async runBatch(
    ids: string[],
    asOf: Date,
    windows: TrustWindows,
    guestBuyerId: string | null,
  ): Promise<BatchResult> {
    const assembled = await inReadOnlySnapshot(
      this.prisma,
      READ_LIMITS,
      async (tx) => {
        const eligible = await this.userStats.trustEligibleUsers(tx, ids);
        const userIds = eligible.map((u) => u.id);
        if (userIds.length === 0) return [];
        const sellerFaultOrderIds = await this.refundStats.sellerFaultOrderIds(
          tx,
          userIds,
          windows.operations.since,
        );
        const fulfilment = await this.orderStats.fulfilmentStats(
          tx,
          userIds,
          windows.operations,
          F.onTime.graceMinutes,
          sellerFaultOrderIds,
        );
        const sales = await this.orderStats.salesCounterparties(
          tx,
          userIds,
          windows.volume,
          guestBuyerId,
        );
        const trades = await this.tradeStats.tradeCounterparties(
          tx,
          userIds,
          windows.volume,
        );
        const ratings = await this.ratingStats.sellerRatingStats(
          tx,
          userIds,
          windows.rating,
        );
        return assembleTrustInputs(
          { eligible, fulfilment, sales, trades, ratings },
          asOf,
        );
      },
    );

    const rows = assembled
      .filter((a) => hasTrustActivity(a.inputs))
      .map((a) => ({
        userId: a.userId,
        formulaVersion: F.version,
        ...computeSellerTrust(a.inputs),
      }));
    const written = await this.sellerTrust.upsertBatch(rows, asOf);
    const scored = rows.filter((r) => r.scoreX100 !== null).length;
    return {
      eligible: assembled.length,
      written,
      scored,
      notEnoughData: rows.length - scored,
    };
  }

  /** Lets the database breathe between batches; a seam for the spec. */
  protected pause(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
