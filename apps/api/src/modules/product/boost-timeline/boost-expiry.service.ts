import { Injectable } from "@nestjs/common";
import { BoostStatus, Prisma, ProductStatus } from "@prisma/client";
import { BOOST_REMINDER_LEAD_HOURS } from "@tarodan/types";
import { isPremiumEntitled } from "../../membership/helpers/membership.util";
import type { BoostNoticePayload } from "../../outbox/outbox.types";
import { BoostTimelineStore } from "./boost-timeline-store.service";

/** The ending-soon reminder goes out this long before the listing's end. */
export const BOOST_REMINDER_LEAD_MS =
  BOOST_REMINDER_LEAD_HOURS * 60 * 60 * 1000;

/**
 * Whether the listing's last running boost (its "tail") is due the
 * ending-soon reminder at `now`: the seller asked for it (`autoRenew`), the
 * end is within the lead time, and no reminder announced this end yet.
 *
 * A reminder sent at `reminderSentAt` announced an end within the lead time
 * of that moment. When the end has since moved past that window (a staff
 * extension, a resume after a pause) the old reminder no longer holds, so it
 * is due again; a new tail row (the seller bought more time) has no stamp.
 */
export function isBoostReminderDue(
  tail: { endsAt: Date; autoRenew: boolean; reminderSentAt: Date | null },
  now: Date,
): boolean {
  if (!tail.autoRenew) return false;
  const end = tail.endsAt.getTime();
  const armedFrom = end - BOOST_REMINDER_LEAD_MS;
  if (now.getTime() >= end || now.getTime() < armedFrom) return false;
  return (
    tail.reminderSentAt == null || tail.reminderSentAt.getTime() < armedFrom
  );
}

export interface BoostExpiryResult {
  /** Boosts of the listing that ended and were marked `expired`. */
  expired: number;
  /** The "promotion ended" notice queued with the change, if the listing's promotion ended. */
  notice: BoostNoticePayload | null;
}

/**
 * The end of a listing's boosts, run by the expire-boosts cron per listing:
 * the boosts whose time ran out are marked `expired` and the listing's
 * promotion columns are rebuilt, and the seller hears about it once per
 * listing, not once per stacked boost (a seller with two stacked boosts was
 * told "ended" while the listing was still featured). The ending-soon
 * reminder is claimed here too. Part of `BoostTimelineService`; every method
 * takes the listing lock first, so a boost activated or changed meanwhile is
 * seen, and runs in the caller's transaction with the outbox row of its
 * notice.
 */
@Injectable()
export class BoostExpiryService {
  constructor(private readonly store: BoostTimelineStore) {}

  /**
   * Marks the listing's ended boosts `expired` (with the listing's final
   * counters for the performance view) and rebuilds its promotion. When no
   * running boost of the listing ends later, its promotion really ended:
   * queues one `expired` notice, keyed by the boost that ended last.
   */
  async expireEnded(
    tx: Prisma.TransactionClient,
    productId: string,
    now: Date = new Date(),
  ): Promise<BoostExpiryResult> {
    await this.store.lockProduct(tx, productId);
    const ended = await tx.productBoost.findMany({
      where: { productId, status: BoostStatus.active, endsAt: { lte: now } },
      select: { id: true, endsAt: true },
    });
    let expired = 0;
    if (ended.length > 0) {
      const counters = await tx.product.findUnique({
        where: { id: productId },
        select: { viewCount: true, likeCount: true, clickCount: true },
      });
      const result = await tx.productBoost.updateMany({
        where: {
          id: { in: ended.map((boost) => boost.id) },
          status: BoostStatus.active,
        },
        data: {
          status: BoostStatus.expired,
          finalViewCount: counters?.viewCount,
          finalLikeCount: counters?.likeCount,
          finalClickCount: counters?.clickCount,
        },
      });
      expired = result.count;
    }
    // Also run for a listing with no ended row: it clears promotion columns
    // that outlived their boosts (an ended `boostedUntil` still set).
    await this.store.refreshProductPromotion(tx, productId, now);
    if (expired === 0) return { expired, notice: null };

    const runningLater = await tx.productBoost.count({
      where: { productId, status: BoostStatus.active, endsAt: { gt: now } },
    });
    if (runningLater > 0) return { expired, notice: null };

    const last = ended.reduce((a, b) =>
      (b.endsAt?.getTime() ?? 0) > (a.endsAt?.getTime() ?? 0) ? b : a,
    );
    const notice = await this.store.enqueueNotice(tx, last.id, "expired");
    this.store.breadcrumb("expired", { boostId: last.id, productId });
    return { expired, notice };
  }

  /**
   * Claims and queues the ending-soon reminder of a live listing: its tail
   * boost (the running boost that ends last) must be due
   * (`isBoostReminderDue`) and its seller still premium (the reminder is a
   * premium feature; the flag was only accepted from a premium member). The
   * claim is a compare-and-set on `reminderSentAt`, so two cron runs never
   * send it twice.
   * @returns the queued notice, or null when nothing is due.
   */
  async remindEndingSoon(
    tx: Prisma.TransactionClient,
    productId: string,
    now: Date = new Date(),
  ): Promise<BoostNoticePayload | null> {
    await this.store.lockProduct(tx, productId);
    const tail = await tx.productBoost.findFirst({
      where: { productId, status: BoostStatus.active, endsAt: { gt: now } },
      orderBy: [{ endsAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        endsAt: true,
        autoRenew: true,
        reminderSentAt: true,
        product: { select: { status: true } },
        user: {
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
    if (!tail?.endsAt || tail.product.status !== ProductStatus.active) {
      return null;
    }
    const due = isBoostReminderDue(
      {
        endsAt: tail.endsAt,
        autoRenew: tail.autoRenew,
        reminderSentAt: tail.reminderSentAt,
      },
      now,
    );
    if (!due || !isPremiumEntitled(tail.user.membership, tail.user)) {
      return null;
    }
    const claimed = await tx.productBoost.updateMany({
      where: { id: tail.id, reminderSentAt: tail.reminderSentAt },
      data: { reminderSentAt: now },
    });
    if (claimed.count === 0) return null;
    const notice = await this.store.enqueueNotice(
      tx,
      tail.id,
      "ending_soon",
      now,
    );
    this.store.breadcrumb("ending_soon", { boostId: tail.id, productId });
    return notice;
  }
}
