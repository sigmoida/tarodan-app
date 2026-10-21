import { Injectable, Optional } from "@nestjs/common";
import { BoostStatus, ProductKind, ProductStatus } from "@prisma/client";
import {
  BOOST_ENABLED_SETTING,
  BOOST_OFFER_MAX,
  BOOST_OFFER_SINCE_SETTING,
  BOOST_OFFER_WINDOW_DAYS,
  boostOfferSince,
  isBoostEnabled,
  type BoostOffersResponse,
} from "@tarodan/types";
import { PrismaService } from "../../../prisma";
import { SentryService } from "../../sentry/sentry.service";
import { StorageService } from "../../storage/storage.service";
import { cardImageUrl } from "../helpers/card-image-url";
import { boostTierBasePrice } from "../helpers/product-sale-window";
import {
  boostBreadcrumb,
  tagBoostRequest,
} from "../helpers/boost-observability";
import {
  BoostAudienceService,
  eligibleAudienceWhere,
  tierCoversPrice,
} from "./boost-audience.service";
import { DAY_MS } from "../boost-timeline/boost-lanes";

/**
 * Candidate listings read at most per call, newest first. The price filter
 * runs in memory afterwards, so more than `BOOST_OFFER_MAX` are read: a few
 * listings priced outside every package do not hide the ones after them.
 */
const OFFER_CANDIDATE_CAP = BOOST_OFFER_MAX * 5;

/** Statuses that mean "this listing was boosted" (abandoned checkouts do not). */
const BOOSTED_STATUSES: BoostStatus[] = [
  BoostStatus.active,
  BoostStatus.paused,
  BoostStatus.expired,
  BoostStatus.cancelled,
];

/**
 * The one-time boost offer after a listing goes live (web only, ADR 0015).
 * Eligibility is computed, never stored: an offer is due for the seller's
 * live listing created after `boost_offer_since` and in the last
 * `BOOST_OFFER_WINDOW_DAYS` days, never boosted, not dismissed, with at least
 * one package tier for its price and the seller's audience. Only a dismissal
 * is stored (`boost_offer_dismissals`), so it holds on every device and no
 * path that makes a listing live needs a hook.
 */
@Injectable()
export class BoostOfferService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audience: BoostAudienceService,
    private readonly storage: StorageService,
    @Optional() private readonly sentry?: SentryService,
  ) {}

  /**
   * The caller's due offers, newest first, at most `BOOST_OFFER_MAX`. Off
   * (empty) while boost sales are off or `boost_offer_since` is empty or
   * invalid. One settings read, one candidate query and one tier query for
   * all candidates (price bands filtered in memory), never one per listing.
   */
  async getOffers(userId: string): Promise<BoostOffersResponse> {
    tagBoostRequest(this.sentry);
    const settings = await this.prisma.platformSetting.findMany({
      where: {
        settingKey: { in: [BOOST_ENABLED_SETTING, BOOST_OFFER_SINCE_SETTING] },
      },
      select: { settingKey: true, settingValue: true },
    });
    const valueOf = (key: string) =>
      settings.find((s) => s.settingKey === key)?.settingValue;
    const enabled = isBoostEnabled(valueOf(BOOST_ENABLED_SETTING));
    const since = boostOfferSince(valueOf(BOOST_OFFER_SINCE_SETTING));
    if (!enabled || !since) return { enabled, offers: [] };

    const windowStart = new Date(Date.now() - BOOST_OFFER_WINDOW_DAYS * DAY_MS);
    const createdFrom = since > windowStart ? since : windowStart;
    const [candidates, tierType] = await Promise.all([
      this.prisma.product.findMany({
        where: {
          sellerId: userId,
          kind: ProductKind.listing,
          status: ProductStatus.active,
          createdAt: { gte: createdFrom },
          boosts: { none: { status: { in: BOOSTED_STATUSES } } },
          boostOfferDismissal: { is: null },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: OFFER_CANDIDATE_CAP,
        select: {
          id: true,
          title: true,
          price: true,
          oldPrice: true,
          createdAt: true,
          images: {
            orderBy: { sortOrder: "asc" },
            take: 1,
            select: { cardKey: true },
          },
        },
      }),
      this.audience.audienceTierType(userId),
    ]);
    if (candidates.length === 0) return { enabled, offers: [] };

    const tiers = await this.prisma.adPackageTier.findMany({
      where: {
        isActive: true,
        package: { isActive: true, ...eligibleAudienceWhere(userId, tierType) },
      },
      select: { minAmount: true, maxAmount: true },
    });
    const offers = candidates
      .filter((product) => {
        const price = boostTierBasePrice(product);
        return tiers.some((tier) => tierCoversPrice(tier, price));
      })
      .slice(0, BOOST_OFFER_MAX)
      .map((product) => ({
        productId: product.id,
        title: product.title,
        image: cardImageUrl(this.storage, product.images[0]?.cardKey),
        price: product.price.toNumber(),
        createdAt: product.createdAt.toISOString(),
      }));
    return { enabled, offers };
  }

  /**
   * Records the dismissal of the offers the dialog showed, for the caller's
   * own listings only (someone else's id is ignored, so nothing about it
   * changes or leaks). Idempotent: a listing dismissed before keeps its row
   * (`ON CONFLICT DO NOTHING`).
   */
  async dismissOffers(userId: string, productIds: string[]): Promise<void> {
    tagBoostRequest(this.sentry);
    const own = await this.prisma.product.findMany({
      where: {
        id: { in: [...new Set(productIds)] },
        sellerId: userId,
        kind: ProductKind.listing,
      },
      select: { id: true },
    });
    if (own.length === 0) return;
    const dismissedAt = new Date();
    await this.prisma.boostOfferDismissal.createMany({
      data: own.map((product) => ({
        productId: product.id,
        userId,
        dismissedAt,
      })),
      skipDuplicates: true,
    });
    for (const product of own) {
      boostBreadcrumb(this.sentry, "offer_dismissed", {
        productId: product.id,
      });
    }
  }
}
