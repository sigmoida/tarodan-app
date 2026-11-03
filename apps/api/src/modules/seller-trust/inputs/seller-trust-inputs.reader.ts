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

/** Module-private: only this file can stamp a `GuestBuyerRef`. */
const GUEST_BUYER_REF = Symbol("GuestBuyerRef");

/**
 * The shared guest buyer account, as `guestBuyerId` resolved it. Guest orders
 * are told apart by e-mail only when the reader knows this id; given `null`
 * by mistake, every guest would collapse into one counterparty and a reader
 * other than the batch would count fewer counterparties than the stored row.
 * Branded so `readInputs` accepts only a value the reader resolved (the
 * brand is checked at runtime too), never a hand-made id or `null`.
 */
export interface GuestBuyerRef {
  /** The account's id, or null when there has never been a guest checkout. */
  readonly id: string | null;
  readonly [GUEST_BUYER_REF]: true;
}

const isGuestBuyerRef = (value: unknown): value is GuestBuyerRef =>
  typeof value === "object" &&
  value !== null &&
  (value as Record<symbol, unknown>)[GUEST_BUYER_REF] === true;

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

  /**
   * The shared guest buyer account, whose orders are told apart by e-mail.
   * Resolve it once per snapshot (or per run) and pass it to `readInputs`.
   */
  async guestBuyerId(tx: Prisma.TransactionClient): Promise<GuestBuyerRef> {
    const id = await this.userStats.guestBuyerId(tx);
    return Object.freeze({ id, [GUEST_BUYER_REF]: true as const });
  }

  /**
   * Formula inputs for `ids`, one entry per eligible user (banned, deleted
   * and test-lane accounts are left out by the user domain), in the eligible
   * order. Reads nothing more when no id is eligible. `guestBuyer` must come
   * from `guestBuyerId`; anything else is refused before any read.
   */
  async readInputs(
    tx: Prisma.TransactionClient,
    ids: string[],
    asOf: Date,
    guestBuyer: GuestBuyerRef,
  ): Promise<AssembledTrustInputs[]> {
    if (!isGuestBuyerRef(guestBuyer)) {
      throw new TypeError(
        "readInputs needs the guest buyer resolved by guestBuyerId",
      );
    }
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
      guestBuyer.id,
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
