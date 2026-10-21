import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { BoostStatus, Prisma } from "@prisma/client";
import { i18nMessage } from "../../i18n";
import { isPremiumEntitled } from "../../membership/helpers/membership.util";
import { computeRelevanceScore } from "../helpers/relevance-score";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Result of an activation: the boosted listing and its boost's end. */
export interface BoostActivation {
  productId: string;
  endsAt: Date;
}

/**
 * The one owner of a listing's boost timeline: the `product_boosts` rows of a
 * listing and the promotion columns they drive on the product (`boostedUntil`,
 * `boostedAt`, `homeShowcaseUntil`, `rankTier`, `relevanceScore`).
 *
 * Payment fulfilment (activation) and the admin boost screen (pause, resume,
 * extend) call it; nothing else writes these columns for a boost. Every method
 * runs inside the caller's transaction (`tx`), so the change commits with the
 * business event that caused it.
 *
 * A leaf: Prisma and pure helpers only, no Payment or Admin import, so both can
 * import it without a cycle (`ProductModule` already imports `PaymentModule`).
 */
@Injectable()
export class BoostTimelineService {
  private readonly logger = new Logger(BoostTimelineService.name);

  /**
   * Activates a paid boost. Stacking: when the listing is already boosted, the
   * new duration starts at the current `boostedUntil`, not now. The home
   * showcase window is tracked separately: a showcase ("Vitrin") package adds
   * only its own duration to the remaining showcase time. (Writing
   * `homeShowcaseUntil = endsAt` used to give a 3-day Vitrin bought on top of a
   * 30-day boost 33 days in the showcase.)
   *
   * @returns the listing and the boost's end, or null when the boost is gone.
   */
  async activate(
    tx: Prisma.TransactionClient,
    boostId: string,
    now: Date = new Date(),
  ): Promise<BoostActivation | null> {
    const boost = await tx.productBoost.findUnique({ where: { id: boostId } });
    if (!boost) return null;

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

    await tx.productBoost.update({
      where: { id: boost.id },
      data: {
        status: BoostStatus.active,
        startsAt: now,
        endsAt,
        purchasedAt: now,
        baselineViewCount: product?.viewCount ?? 0,
        baselineLikeCount: product?.likeCount ?? 0,
        baselineClickCount: product?.clickCount ?? 0,
      },
    });
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
    return { productId: boost.productId, endsAt };
  }

  /** Staff pause: keeps the remaining seconds and takes the boost off the listing. */
  async pause(
    tx: Prisma.TransactionClient,
    boostId: string,
    now: Date = new Date(),
  ): Promise<void> {
    const boost = await tx.productBoost.findUnique({ where: { id: boostId } });
    if (
      !boost ||
      boost.status !== BoostStatus.active ||
      !boost.endsAt ||
      boost.endsAt <= now
    ) {
      throw new BadRequestException(
        i18nMessage("server.admin.adPackage.pauseActiveOnly"),
      );
    }
    await tx.productBoost.update({
      where: { id: boostId },
      data: {
        status: BoostStatus.paused,
        pausedAt: now,
        pausedRemainingSeconds: Math.max(
          1,
          Math.ceil((boost.endsAt.getTime() - now.getTime()) / 1000),
        ),
      },
    });
    await this.refreshProductPromotion(tx, boost.productId, now);
  }

  /**
   * Staff resume: the remaining seconds run again from the end of the
   * listing's latest other active boost (or from now).
   */
  async resume(
    tx: Prisma.TransactionClient,
    boostId: string,
    now: Date = new Date(),
  ): Promise<void> {
    const boost = await tx.productBoost.findUnique({ where: { id: boostId } });
    if (!boost || boost.status !== BoostStatus.paused) {
      throw new BadRequestException(
        i18nMessage("server.admin.adPackage.resumePausedOnly"),
      );
    }
    const lastActive = await tx.productBoost.findFirst({
      where: {
        productId: boost.productId,
        id: { not: boostId },
        status: BoostStatus.active,
        endsAt: { gt: now },
      },
      orderBy: { endsAt: "desc" },
      select: { endsAt: true },
    });
    const base =
      lastActive?.endsAt && lastActive.endsAt > now ? lastActive.endsAt : now;
    const endsAt = new Date(
      base.getTime() + (boost.pausedRemainingSeconds ?? 0) * 1000,
    );
    await tx.productBoost.update({
      where: { id: boostId },
      data: {
        status: BoostStatus.active,
        endsAt,
        pausedAt: null,
        pausedRemainingSeconds: null,
      },
    });
    await this.refreshProductPromotion(tx, boost.productId, now);
  }

  /** Staff extension by whole days, of an active or a paused boost. */
  async extend(
    tx: Prisma.TransactionClient,
    boostId: string,
    days: number,
    now: Date = new Date(),
  ): Promise<void> {
    const boost = await tx.productBoost.findUnique({ where: { id: boostId } });
    if (
      !boost ||
      (boost.status !== BoostStatus.active &&
        boost.status !== BoostStatus.paused)
    ) {
      throw new BadRequestException(
        i18nMessage("server.admin.adPackage.extendActiveOrPausedOnly"),
      );
    }
    if (days < 1 || days > 365) {
      throw new BadRequestException(
        i18nMessage("server.admin.adPackage.extensionRange"),
      );
    }

    if (boost.status === BoostStatus.paused) {
      await tx.productBoost.update({
        where: { id: boostId },
        data: {
          pausedRemainingSeconds:
            (boost.pausedRemainingSeconds ?? 0) + days * 24 * 60 * 60,
          extendedDays: { increment: days },
        },
      });
    } else {
      const base = boost.endsAt && boost.endsAt > now ? boost.endsAt : now;
      await tx.productBoost.update({
        where: { id: boostId },
        data: {
          endsAt: new Date(base.getTime() + days * DAY_MS),
          extendedDays: { increment: days },
        },
      });
    }
    await this.refreshProductPromotion(tx, boost.productId, now);
  }

  /**
   * Rebuilds the listing's promotion columns from its running boosts: the
   * latest active end is `boostedUntil`, the latest activation is the LIFO key
   * `boostedAt`, rank tier 2 while boosted, else 1 for a premium seller.
   *
   * Known gap (kept as is): `homeShowcaseUntil` becomes the end of the latest
   * active showcase boost, while activation gives a stacked showcase boost its
   * own duration from now. A staff action on a listing whose showcase boost is
   * stacked behind another boost therefore lengthens the showcase window.
   */
  async refreshProductPromotion(
    tx: Prisma.TransactionClient,
    productId: string,
    now: Date = new Date(),
  ): Promise<void> {
    const [product, activeBoosts] = await Promise.all([
      tx.product.findUnique({
        where: { id: productId },
        select: {
          sellerId: true,
          qualityScore: true,
          popularityScore: true,
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
      }),
      tx.productBoost.findMany({
        where: {
          productId,
          status: BoostStatus.active,
          endsAt: { gt: now },
        },
        select: {
          endsAt: true,
          purchasedAt: true,
          showcaseOnHome: true,
        },
        orderBy: { endsAt: "desc" },
      }),
    ]);
    if (!product) return;

    const promotedUntil = activeBoosts[0]?.endsAt ?? null;
    const latestPurchase = activeBoosts.reduce<Date | null>(
      (latest, item) =>
        item.purchasedAt && (!latest || item.purchasedAt > latest)
          ? item.purchasedAt
          : latest,
      null,
    );
    const homeShowcaseUntil =
      activeBoosts.find((item) => item.showcaseOnHome)?.endsAt ?? null;
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
