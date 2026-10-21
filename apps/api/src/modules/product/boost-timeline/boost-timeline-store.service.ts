import { Injectable, Optional } from "@nestjs/common";
import { BoostStatus, Prisma, ProductBoost } from "@prisma/client";
import { SentryService } from "../../sentry/sentry.service";
import { OutboxService } from "../../outbox/outbox.service";
import {
  OUTBOX_BOOST_NOTICE,
  boostNoticeDedupeKey,
  type BoostNoticeKind,
  type BoostNoticePayload,
} from "../../outbox/outbox.types";
import { isPremiumEntitled } from "../../membership/helpers/membership.util";
import { computeRelevanceScore } from "../helpers/relevance-score";
import {
  boostCapMs,
  boostShowcaseEnd,
  laneEntries,
  layLane,
  type LaneEntry,
} from "./boost-lanes";

/** The boost columns the timeline reads to rebuild a listing's lanes. */
const LANE_ROW_SELECT = {
  id: true,
  showcaseOnHome: true,
  endsAt: true,
  showcaseEndsAt: true,
  durationDays: true,
  extendedDays: true,
  purchasedAt: true,
} satisfies Prisma.ProductBoostSelect;

type LaneRow = Prisma.ProductBoostGetPayload<{
  select: typeof LANE_ROW_SELECT;
}>;

/**
 * A listing's running boosts as two queues (see `boost-lanes.ts`): each
 * boost's own remaining time in queue order, plus the rows they were read
 * from, so a rewrite touches only what changed.
 */
export interface Lanes {
  search: LaneEntry[];
  showcase: LaneEntry[];
  rows: Map<string, LaneRow>;
}

/** A boost's own time per lane, in milliseconds. */
export interface OwnTime {
  searchMs: number;
  showcaseMs: number;
}

/** The pause fields a resume clears. */
export const RESUMED: Prisma.ProductBoostUncheckedUpdateInput = {
  status: BoostStatus.active,
  pausedAt: null,
  pausedBySystem: false,
  pausedRemainingSeconds: null,
  pausedShowcaseSeconds: null,
};

/**
 * The shared mechanics of the listing boost timeline (`BoostTimelineService`
 * is the facade): the listing row lock, reading and laying out the two lanes,
 * the single writer of the listing's promotion columns, the seller notice and
 * the Sentry breadcrumb. Every method runs in the caller's transaction.
 */
@Injectable()
export class BoostTimelineStore {
  constructor(
    @Optional() private readonly sentry?: SentryService,
    // The seller notice of a grant or a stop is written with it (lossless).
    // Global in the app; unit tests may leave it out.
    @Optional() private readonly outbox?: OutboxService,
  ) {}

  /**
   * Locks the listing row until the transaction ends. Every timeline mutation
   * calls it before reading `boostedUntil` or the listing's boost rows.
   * Taking it twice in one transaction is a no-op.
   */
  async lockProduct(
    tx: Prisma.TransactionClient,
    productId: string,
  ): Promise<void> {
    await tx.$queryRaw`SELECT id FROM products WHERE id = ${productId} FOR UPDATE`;
  }

  /**
   * The boost read under its listing's lock (null when it does not exist).
   * The listing id never changes, so reading it before the lock is safe; the
   * status and times are read again after it.
   */
  async lockedBoost(
    tx: Prisma.TransactionClient,
    boostId: string,
  ): Promise<ProductBoost | null> {
    const ref = await tx.productBoost.findUnique({
      where: { id: boostId },
      select: { productId: true },
    });
    if (!ref) return null;
    await this.lockProduct(tx, ref.productId);
    return tx.productBoost.findUnique({ where: { id: boostId } });
  }

  breadcrumb(action: string, data: { boostId: string; productId: string }) {
    this.sentry?.addBreadcrumb({
      category: "boost",
      message: `boost.${action}`,
      level: "info",
      data,
    });
  }

  /** A warning with ids only (no PII). */
  warn(message: string): void {
    this.sentry?.captureMessage(message, "warning");
  }

  /**
   * The seller notice, in the caller's transaction (sent after commit).
   * `at` is the reminder's claim stamp (`ending_soon` only).
   * @returns the queued payload, for the caller's immediate send (`flush`).
   */
  async enqueueNotice(
    tx: Prisma.TransactionClient,
    boostId: string,
    kind: BoostNoticeKind,
    at?: Date,
  ): Promise<BoostNoticePayload> {
    const payload: BoostNoticePayload = at
      ? { boostId, kind, at: at.toISOString() }
      : { boostId, kind };
    await this.outbox?.enqueue(tx, {
      type: OUTBOX_BOOST_NOTICE,
      payload: { ...payload },
      dedupeKey: boostNoticeDedupeKey(payload),
    });
    return payload;
  }

  /**
   * The listing's running boosts as two queues, read under its lock (the
   * caller holds it). Rows written before `showcaseEndsAt` existed read the
   * listing's showcase end instead (`boostShowcaseEnd`).
   */
  async readLanes(
    tx: Prisma.TransactionClient,
    productId: string,
    now: Date,
  ): Promise<Lanes> {
    const product = await tx.product.findUnique({
      where: { id: productId },
      select: { homeShowcaseUntil: true },
    });
    const rows = await tx.productBoost.findMany({
      where: { productId, status: BoostStatus.active },
      select: LANE_ROW_SELECT,
    });
    const listingShowcaseUntil = product?.homeShowcaseUntil ?? null;
    const lane = (endOf: (row: LaneRow) => Date | null) =>
      laneEntries(
        rows.flatMap((row) => {
          const endsAt = endOf(row);
          return endsAt
            ? [
                {
                  id: row.id,
                  endsAt,
                  capMs: boostCapMs(row),
                  purchasedAt: row.purchasedAt,
                },
              ]
            : [];
        }),
        now,
      );
    return {
      search: lane((row) => row.endsAt),
      showcase: lane((row) => boostShowcaseEnd(row, listingShowcaseUntil)),
      rows: new Map(rows.map((row) => [row.id, row])),
    };
  }

  /** Takes a boost out of both queues; returns the own time it had in each. */
  takeOut(lanes: Lanes, boostId: string): OwnTime {
    const take = (lane: LaneEntry[]) => {
      const index = lane.findIndex((entry) => entry.id === boostId);
      return index === -1 ? 0 : lane.splice(index, 1)[0].ownMs;
    };
    return { searchMs: take(lanes.search), showcaseMs: take(lanes.showcase) };
  }

  /** Queues a paused boost's own time behind the running boosts (both lanes). */
  queueBehind(lanes: Lanes, boostId: string, own: OwnTime): void {
    lanes.search.push({ id: boostId, ownMs: own.searchMs });
    if (own.showcaseMs > 0) {
      lanes.showcase.push({ id: boostId, ownMs: own.showcaseMs });
    }
  }

  /**
   * The own time a paused boost runs again with: its paused remainder, at most
   * its bought and extended days (a row paused before the remainder was kept
   * per boost may hold the time of the boosts before it). A showcase boost
   * paused before `pausedShowcaseSeconds` existed resumes its showcase with
   * its search remainder, as it used to.
   */
  pausedOwnTime(boost: {
    showcaseOnHome: boolean;
    pausedRemainingSeconds: number | null;
    pausedShowcaseSeconds: number | null;
    durationDays: number;
    extendedDays: number;
  }): OwnTime {
    const cap = boostCapMs(boost);
    const searchMs = Math.min((boost.pausedRemainingSeconds ?? 0) * 1000, cap);
    const showcaseMs = boost.showcaseOnHome
      ? Math.min(
          (boost.pausedShowcaseSeconds ?? boost.pausedRemainingSeconds ?? 0) *
            1000,
          cap,
        )
      : 0;
    return { searchMs, showcaseMs };
  }

  /**
   * Lays both queues end to end from now and writes every boost whose end
   * moved, plus the extra column changes in `patches` (status, pause fields).
   * The promotion columns are rebuilt afterwards (`refreshProductPromotion`).
   */
  async writeLanes(
    tx: Prisma.TransactionClient,
    lanes: Lanes,
    now: Date,
    patches: Map<string, Prisma.ProductBoostUncheckedUpdateInput> = new Map(),
  ): Promise<void> {
    const search = layLane(lanes.search, now).ends;
    const showcase = layLane(lanes.showcase, now).ends;
    const ids = new Set([
      ...search.keys(),
      ...showcase.keys(),
      ...patches.keys(),
    ]);
    for (const id of ids) {
      const row = lanes.rows.get(id);
      const data: Prisma.ProductBoostUncheckedUpdateInput = {};
      const endsAt = search.get(id);
      if (endsAt && endsAt.getTime() !== row?.endsAt?.getTime()) {
        data.endsAt = endsAt;
      }
      const showcaseEndsAt = showcase.get(id);
      if (
        showcaseEndsAt &&
        showcaseEndsAt.getTime() !== row?.showcaseEndsAt?.getTime()
      ) {
        data.showcaseEndsAt = showcaseEndsAt;
      }
      Object.assign(data, patches.get(id));
      if (Object.keys(data).length > 0) {
        await tx.productBoost.update({ where: { id }, data });
      }
    }
  }

  /**
   * Rebuilds the listing's promotion columns from its running boosts: the
   * latest active end is `boostedUntil`, the latest showcase end of a running
   * showcase boost is `homeShowcaseUntil` (each boost's own showcase end, never
   * its search end), the latest activation is the LIFO key `boostedAt`, rank
   * tier 2 while boosted, else 1 for a premium seller.
   *
   * Takes the listing lock itself (a no-op when the caller already holds it).
   */
  async refreshProductPromotion(
    tx: Prisma.TransactionClient,
    productId: string,
    now: Date = new Date(),
  ): Promise<void> {
    await this.lockProduct(tx, productId);
    // One after the other: an interactive transaction has one connection.
    const product = await tx.product.findUnique({
      where: { id: productId },
      select: {
        sellerId: true,
        qualityScore: true,
        popularityScore: true,
        homeShowcaseUntil: true,
        seller: {
          select: {
            businessStatus: true,
            companyName: true,
            taxId: true,
            membership: {
              select: {
                status: true,
                currentPeriodEnd: true,
                tier: { select: { type: true, isActive: true } },
              },
            },
          },
        },
      },
    });
    if (!product) return;
    const activeBoosts = await tx.productBoost.findMany({
      where: {
        productId,
        status: BoostStatus.active,
        endsAt: { gt: now },
      },
      select: {
        endsAt: true,
        showcaseEndsAt: true,
        purchasedAt: true,
        showcaseOnHome: true,
      },
    });

    const latest = (dates: Array<Date | null>): Date | null =>
      dates.reduce<Date | null>(
        (max, d) => (d && (!max || d > max) ? d : max),
        null,
      );
    const promotedUntil = latest(activeBoosts.map((b) => b.endsAt));
    const latestPurchase = latest(activeBoosts.map((b) => b.purchasedAt));
    const showcaseUntil = latest(
      activeBoosts.map((b) =>
        boostShowcaseEnd(b, product.homeShowcaseUntil ?? null),
      ),
    );
    const homeShowcaseUntil =
      showcaseUntil && showcaseUntil > now ? showcaseUntil : null;
    const premium = isPremiumEntitled(
      product.seller.membership,
      product.seller,
    );
    const rankTier = promotedUntil ? 2 : premium ? 1 : 0;

    await tx.product.update({
      where: { id: productId },
      data: {
        boostedUntil: promotedUntil,
        boostedAt: promotedUntil ? latestPurchase : null,
        homeShowcaseUntil,
        rankTier,
        relevanceScore: computeRelevanceScore({
          rankTier,
          qualityScore: product.qualityScore ?? 0,
          popularityScore: product.popularityScore,
        }),
      },
    });
  }
}
