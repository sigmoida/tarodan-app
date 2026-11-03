import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  statsWindowEndingAt,
  type StatsWindow,
} from "../../../common/helpers/stats-window";
import { OrderSellerTrustStatsService } from "../../order/stats/order-seller-trust-stats.service";
import { RefundSellerTrustStatsService } from "../../refund/stats/refund-seller-trust-stats.service";
import { RatingSellerTrustStatsService } from "../../rating/stats/rating-seller-trust-stats.service";
import { TradeSellerTrustStatsService } from "../../trade/stats/trade-seller-trust-stats.service";
import { UserSellerTrustStatsService } from "../../user/stats/user-seller-trust-stats.service";
import { TRUST_FORMULA_V1 as F } from "../helpers/trust-formula.constants";
import {
  assembleTrustInputs,
  type AssembledTrustInputs,
} from "../helpers/trust-inputs";

/**
 * Candidates by `preparing_deadline` look this much further back than the
 * volume window: an order completes some days to weeks after it was paid
 * (preparing, transit, return window), so a seller whose completions are all
 * near the window's start is still found.
 */
const CANDIDATE_MARGIN_DAYS = 30;

/** The formula's windows, all ending at one `asOf` instant. */
export interface TrustWindows {
  rating: StatsWindow;
  operations: StatsWindow;
  volume: StatsWindow;
}

/**
 * The one read path for seller trust inputs (ADR 0014,
 * `docs/SELLER_TRUST.md`): the nightly batch and any read-only tool on top of
 * it read through here, so they cannot drift apart. Each owning domain is read
 * through its own stats service; this class only orders the calls and joins
 * the rows.
 *
 * It never opens a transaction: the caller passes the read-only snapshot
 * (`inReadOnlySnapshot`) and owns its limits, and every method here only reads.
 * Every read takes one `asOf` and derives its windows from it, so tenure and
 * the windows can never end at different instants.
 */
@Injectable()
export class SellerTrustInputsReader {
  constructor(
    private readonly orderStats: OrderSellerTrustStatsService,
    private readonly refundStats: RefundSellerTrustStatsService,
    private readonly ratingStats: RatingSellerTrustStatsService,
    private readonly tradeStats: TradeSellerTrustStatsService,
    private readonly userStats: UserSellerTrustStatsService,
  ) {}

  /** Every window of formula v1, ending at `asOf`. */
  windowsAt(asOf: Date): TrustWindows {
    return {
      rating: statsWindowEndingAt(asOf, F.windows.ratingDays),
      operations: statsWindowEndingAt(asOf, F.windows.operationsDays),
      volume: statsWindowEndingAt(asOf, F.windows.volumeDays),
    };
  }

  /**
   * Users who may have activity in the windows: sellers with a paid order in
   * the volume window plus the margin, and participants of trades completed
   * in the volume window. Deduplicated and sorted, so batches are stable.
   */
  async candidateIds(
    tx: Prisma.TransactionClient,
    asOf: Date,
  ): Promise<string[]> {
    const windows = this.windowsAt(asOf);
    const sellers = await this.orderStats.activeSellerIds(
      tx,
      statsWindowEndingAt(asOf, F.windows.volumeDays + CANDIDATE_MARGIN_DAYS)
        .since,
    );
    const traders = await this.tradeStats.activeTraderIds(
      tx,
      windows.volume.since,
    );
    return [...new Set([...sellers, ...traders])].sort();
  }

  /** The shared guest buyer account, whose orders are told apart by e-mail. */
  guestBuyerId(tx: Prisma.TransactionClient): Promise<string | null> {
    return this.userStats.guestBuyerId(tx);
  }

  /**
   * Formula inputs for `ids`, one entry per eligible user (banned, deleted
   * and test-lane accounts are left out by the user domain), in the eligible
   * order. Reads nothing more when no id is eligible.
   */
  async readInputs(
    tx: Prisma.TransactionClient,
    ids: string[],
    asOf: Date,
    guestBuyerId: string | null,
  ): Promise<AssembledTrustInputs[]> {
    const windows = this.windowsAt(asOf);
    const eligible = await this.userStats.trustEligibleUsers(tx, ids);
    const userIds = eligible.map((u) => u.id);
    if (userIds.length === 0) return [];
    // Fault refunds first: the order query needs their ids.
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
  }
}
