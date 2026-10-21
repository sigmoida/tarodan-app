import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { BoostStatus, Prisma, ProductKind } from "@prisma/client";
import {
  MY_BOOST_STATE_STATUSES,
  MY_BOOSTS_DEFAULT_LIMIT,
  type BoostMetricCounts,
  type BoostReminderResponse,
  type MyBoostRow,
  type MyBoostState,
  type MyBoostsResponse,
} from "@tarodan/types";
import { PrismaService } from "../../../prisma";
import { paginate } from "../../../common/list";
import { i18nMessage } from "../../i18n";
import { SentryService } from "../../sentry/sentry.service";
import { StorageService } from "../../storage/storage.service";
import {
  boostBreadcrumb,
  tagBoostRequest,
} from "../helpers/boost-observability";
import { BoostAudienceService } from "./boost-audience.service";

/** The boost columns "My boosts" returns, with its listing's summary. */
const MY_BOOST_SELECT = {
  id: true,
  productId: true,
  source: true,
  packageName: true,
  showcaseOnHome: true,
  durationDays: true,
  extendedDays: true,
  price: true,
  refundedAmount: true,
  status: true,
  autoRenew: true,
  startsAt: true,
  endsAt: true,
  pausedRemainingSeconds: true,
  cancelledAt: true,
  orderId: true,
  createdAt: true,
  baselineViewCount: true,
  baselineLikeCount: true,
  baselineClickCount: true,
  finalViewCount: true,
  finalLikeCount: true,
  finalClickCount: true,
  product: {
    select: {
      id: true,
      title: true,
      status: true,
      viewCount: true,
      likeCount: true,
      clickCount: true,
      boostedUntil: true,
      homeShowcaseUntil: true,
      images: {
        orderBy: { sortOrder: "asc" },
        take: 1,
        select: { cardKey: true },
      },
    },
  },
} satisfies Prisma.ProductBoostSelect;

/** Newest first; the id breaks ties so pages never overlap. */
const MY_BOOST_ORDER: Prisma.ProductBoostOrderByWithRelationInput[] = [
  { createdAt: "desc" },
  { id: "desc" },
];

type MyBoostRecord = Prisma.ProductBoostGetPayload<{
  select: typeof MY_BOOST_SELECT;
}>;

/** The boosts the seller can still change the reminder of. */
const RUNNING_STATUSES: BoostStatus[] = [
  BoostStatus.active,
  BoostStatus.paused,
];

/** One row of "My boosts" (without `isBest`, which compares the page). */
function toMyBoostRow(
  b: MyBoostRecord,
  orderNumber: string | null,
  now: Date,
  imageUrl: string | null,
): Omit<MyBoostRow, "isBest"> {
  const current: BoostMetricCounts = {
    views: b.finalViewCount ?? b.product.viewCount ?? 0,
    likes: b.finalLikeCount ?? b.product.likeCount ?? 0,
    clicks: b.finalClickCount ?? b.product.clickCount ?? 0,
  };
  const before: BoostMetricCounts | null =
    b.baselineViewCount == null
      ? null
      : {
          views: b.baselineViewCount,
          likes: b.baselineLikeCount ?? 0,
          clicks: b.baselineClickCount ?? 0,
        };
  const gain: BoostMetricCounts | null = before
    ? {
        views: current.views - before.views,
        likes: current.likes - before.likes,
        clicks: current.clicks - before.clicks,
      }
    : null;
  const performanceScore = gain
    ? Math.max(0, gain.views) +
      Math.max(0, gain.likes) * 5 +
      Math.max(0, gain.clicks) * 3
    : null;
  const running =
    b.status === BoostStatus.active && b.endsAt != null && b.endsAt > now;

  return {
    id: b.id,
    productId: b.productId,
    product: {
      id: b.product.id,
      title: b.product.title,
      status: b.product.status,
      image: imageUrl,
      boostedUntil: b.product.boostedUntil?.toISOString() ?? null,
      homeShowcaseUntil: b.product.homeShowcaseUntil?.toISOString() ?? null,
    },
    source: b.source,
    packageName: b.packageName,
    showcaseOnHome: b.showcaseOnHome,
    durationDays: b.durationDays,
    extendedDays: b.extendedDays,
    price: b.price.toNumber(),
    refundedAmount: b.refundedAmount?.toNumber() ?? 0,
    status: b.status,
    autoRenew: b.autoRenew,
    startsAt: b.startsAt?.toISOString() ?? null,
    endsAt: b.endsAt?.toISOString() ?? null,
    cancelledAt: b.cancelledAt?.toISOString() ?? null,
    orderId: b.orderId,
    orderNumber,
    isActive: running,
    remainingMs: running
      ? (b.endsAt as Date).getTime() - now.getTime()
      : b.status === BoostStatus.paused
        ? (b.pausedRemainingSeconds ?? 0) * 1000
        : 0,
    metrics: { before, current, gain, performanceScore },
    createdAt: b.createdAt.toISOString(),
  };
}

/**
 * The seller's side of their boosts ("My boosts", web only per ADR 0015): the
 * running and past boosts with their listing's real end and performance, and
 * the ending-soon reminder switch. A seller sees and changes only their own
 * boosts; there is no cancel (a boost cannot be cancelled once it started).
 */
@Injectable()
export class BoostSellerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audience: BoostAudienceService,
    private readonly storage: StorageService,
    @Optional() private readonly sentry?: SentryService,
  ) {}

  /** Public URL of a card-size image key, or null when there is none. */
  private cardImageUrl(key: string | undefined): string | null {
    return key ? this.storage.getPublicAssetUrl(key) : null;
  }

  /**
   * One section of "My boosts", newest first: `current` (active, paused) or
   * `history` (expired, cancelled). Abandoned checkouts (`pending`,
   * `failed`) are never shown. One page query with the listing summary, a
   * count, and one query for the page's order numbers (no per-row query).
   */
  async getMyBoosts(
    userId: string,
    query: { state?: MyBoostState; page?: number; limit?: number },
  ): Promise<MyBoostsResponse> {
    const state = query.state ?? "current";
    const where: Prisma.ProductBoostWhereInput = {
      userId,
      status: { in: [...MY_BOOST_STATE_STATUSES[state]] },
    };
    const page = await paginate(
      this.prisma.productBoost,
      {
        where,
        orderBy: MY_BOOST_ORDER,
        select: MY_BOOST_SELECT,
      },
      {
        page: query.page,
        limit: query.limit ?? MY_BOOSTS_DEFAULT_LIMIT[state],
      },
    );
    const orderNumbers = await this.orderNumbersOf(page.data);
    const now = new Date();
    const rows = page.data.map((b) =>
      toMyBoostRow(
        b,
        b.orderId ? (orderNumbers.get(b.orderId) ?? null) : null,
        now,
        this.cardImageUrl(b.product.images[0]?.cardKey),
      ),
    );
    // One "best performing" row at most: the first with the highest score
    // above zero (a tie of zeros, all freshly started, marked every row).
    const best = rows.reduce<(typeof rows)[number] | null>(
      (top, row) =>
        (row.metrics.performanceScore ?? 0) >
        (top?.metrics.performanceScore ?? 0)
          ? row
          : top,
      null,
    );
    return {
      data: rows.map((row) => ({ ...row, isBest: row === best })),
      meta: page.meta,
    };
  }

  /** The `BST-` order numbers of the page's boosts, in one query. */
  private async orderNumbersOf(
    boosts: Array<{ orderId: string | null }>,
  ): Promise<Map<string, string>> {
    const ids = [
      ...new Set(boosts.flatMap((b) => (b.orderId ? [b.orderId] : []))),
    ];
    if (ids.length === 0) return new Map();
    const orders = await this.prisma.order.findMany({
      where: { id: { in: ids } },
      select: { id: true, orderNumber: true },
    });
    return new Map(orders.map((o) => [o.id, o.orderNumber]));
  }

  /**
   * The ending-soon reminder of the caller's listing: sets it on the
   * listing's running and paused boosts (a reminder, never a charge).
   * Someone else's listing or a missing one is the same 404 (no existence
   * leak). Turning it on needs premium (400
   * `server.product.boostReminderPremiumOnly`); turning it off never does.
   * @returns `enabled` false when no boost of the listing runs.
   */
  async setReminder(
    userId: string,
    productId: string,
    enabled: boolean,
  ): Promise<BoostReminderResponse> {
    tagBoostRequest(this.sentry);
    const product = await this.prisma.product.findFirst({
      where: { id: productId, kind: ProductKind.listing },
      select: { sellerId: true },
    });
    if (!product || product.sellerId !== userId) {
      throw new NotFoundException(i18nMessage("server.product.notFound"));
    }
    if (enabled && !(await this.audience.isPremium(userId))) {
      throw new BadRequestException(
        i18nMessage("server.product.boostReminderPremiumOnly"),
      );
    }
    const { count } = await this.prisma.productBoost.updateMany({
      where: { productId, userId, status: { in: RUNNING_STATUSES } },
      data: { autoRenew: enabled },
    });
    boostBreadcrumb(this.sentry, enabled ? "reminder_on" : "reminder_off", {
      productId,
    });
    return { enabled: enabled && count > 0 };
  }
}
