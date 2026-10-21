import { Injectable, Logger } from "@nestjs/common";
import { BoostStatus, Prisma } from "@prisma/client";
import { computeRelevanceScore } from "../helpers/relevance-score";
import { DAY_MS } from "./boost-lanes";
import { BoostTimelineStore } from "./boost-timeline-store.service";
import type { BoostActivation } from "./boost-timeline.types";

/**
 * A paid boost activates from `pending`, or from `failed` when the payment
 * arrives after the abandoned checkout was swept (the seller paid, so the
 * boost runs). Any other status means it already ran: activating again would
 * stack the same duration twice.
 */
const ACTIVATABLE_STATUSES: BoostStatus[] = [
  BoostStatus.pending,
  BoostStatus.failed,
];

/**
 * Starting a paid boost on a listing's timeline when its payment is
 * fulfilled. Part of `BoostTimelineService`.
 */
@Injectable()
export class BoostActivationService {
  private readonly logger = new Logger(BoostActivationService.name);

  constructor(private readonly store: BoostTimelineStore) {}

  /**
   * Activates the boost bought by a paid boost order (see `activate`).
   * `found: false` when the order has no boost row at all; otherwise
   * `activation` is null when the boost was already activated.
   */
  async activateForOrder(
    tx: Prisma.TransactionClient,
    orderId: string,
    now: Date = new Date(),
  ): Promise<{ found: boolean; activation: BoostActivation | null }> {
    const boost = await tx.productBoost.findUnique({
      where: { orderId },
      select: { id: true },
    });
    if (!boost) return { found: false, activation: null };
    return { found: true, activation: await this.activate(tx, boost.id, now) };
  }

  /**
   * Activates a paid boost. Stacking: when the listing is already boosted, the
   * new duration starts at the current `boostedUntil`, not now. The home
   * showcase window is tracked separately: a showcase ("Vitrin") package adds
   * only its own duration to the remaining showcase time, and the boost keeps
   * that end as its own (`showcaseEndsAt`). (Writing
   * `homeShowcaseUntil = endsAt` used to give a 3-day Vitrin bought on top of a
   * 30-day boost 33 days in the showcase.)
   *
   * Idempotent: only a `pending` (or late-paid `failed`) boost activates, and
   * the claim is a compare-and-set on the status, so a second activation of
   * the same boost changes nothing.
   *
   * @returns the listing and the boost's end, or null when the boost is gone
   * or already activated.
   */
  async activate(
    tx: Prisma.TransactionClient,
    boostId: string,
    now: Date = new Date(),
  ): Promise<BoostActivation | null> {
    const boost = await this.store.lockedBoost(tx, boostId);
    if (!boost) return null;
    if (!ACTIVATABLE_STATUSES.includes(boost.status)) {
      this.logger.warn(
        `Boost ${boost.id} not activated again: status ${boost.status}`,
      );
      this.store.warn(
        `Boost ${boost.id} activation skipped: status ${boost.status}`,
      );
      return null;
    }

    const product = await tx.product.findUnique({
      where: { id: boost.productId },
      select: {
        boostedUntil: true,
        homeShowcaseUntil: true,
        qualityScore: true,
        popularityScore: true,
        viewCount: true,
        likeCount: true,
        clickCount: true,
      },
    });
    const base =
      product?.boostedUntil && product.boostedUntil > now
        ? product.boostedUntil
        : now;
    const endsAt = new Date(base.getTime() + boost.durationDays * DAY_MS);
    const showcaseBase =
      product?.homeShowcaseUntil && product.homeShowcaseUntil > now
        ? product.homeShowcaseUntil
        : now;
    const showcaseEndsAt = new Date(
      showcaseBase.getTime() + boost.durationDays * DAY_MS,
    );

    const claimed = await tx.productBoost.updateMany({
      where: { id: boost.id, status: { in: ACTIVATABLE_STATUSES } },
      data: {
        status: BoostStatus.active,
        startsAt: now,
        endsAt,
        ...(boost.showcaseOnHome ? { showcaseEndsAt } : {}),
        purchasedAt: now,
        baselineViewCount: product?.viewCount ?? 0,
        baselineLikeCount: product?.likeCount ?? 0,
        baselineClickCount: product?.clickCount ?? 0,
      },
    });
    // Cannot miss under the listing lock; kept as the database-level guard.
    if (claimed.count !== 1) return null;
    await tx.product.update({
      where: { id: boost.productId },
      data: {
        boostedUntil: endsAt,
        // LIFO ordering key (most recently purchased first) for search and home.
        boostedAt: now,
        // A showcase package also lights up the home showcase, for its own
        // duration only (no free showcase time in a mixed stack).
        ...(boost.showcaseOnHome ? { homeShowcaseUntil: showcaseEndsAt } : {}),
        rankTier: 2,
        relevanceScore: computeRelevanceScore({
          rankTier: 2,
          qualityScore: product?.qualityScore ?? 0,
          popularityScore: product?.popularityScore,
        }),
      },
    });
    this.logger.log(
      `Boost ${boost.id} activated for product ${boost.productId} until ${endsAt.toISOString()}`,
    );
    this.store.breadcrumb("activate", {
      boostId: boost.id,
      productId: boost.productId,
    });
    return { productId: boost.productId, endsAt };
  }
}
