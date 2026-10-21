import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { BoostStatus, Prisma } from "@prisma/client";
import { i18nMessage } from "../../i18n";
import { ceilSeconds, DAY_MS, type LaneEntry } from "./boost-lanes";
import { BoostTimelineStore, RESUMED } from "./boost-timeline-store.service";
import type { BoostStopInput, BoostStopResult } from "./boost-timeline.types";

/** What staff can stop: a running boost or one waiting while paused. */
const STOPPABLE_STATUSES: BoostStatus[] = [
  BoostStatus.active,
  BoostStatus.paused,
];

/**
 * A refund is recorded on these as well: a boost that ended in the moment
 * between the refund check and the refund still had its money returned.
 */
const REFUND_RECORDABLE_STATUSES: BoostStatus[] = [
  ...STOPPABLE_STATUSES,
  BoostStatus.expired,
];

/**
 * Staff changes to one boost on its listing's timeline: pause, resume,
 * extend, and stop (revoke, or refund and stop). Each takes the boost's own
 * remaining time out of the listing's lanes, changes it and lays the lanes
 * again, so no other boost's time is added or lost. Part of
 * `BoostTimelineService`.
 */
@Injectable()
export class BoostStaffTimelineService {
  private readonly logger = new Logger(BoostStaffTimelineService.name);

  constructor(private readonly store: BoostTimelineStore) {}

  /**
   * Staff pause: keeps the boost's own remaining time (search and showcase)
   * and takes it off the listing; the boosts queued behind it move up.
   */
  async pause(
    tx: Prisma.TransactionClient,
    boostId: string,
    now: Date = new Date(),
  ): Promise<void> {
    const boost = await this.store.lockedBoost(tx, boostId);
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
    const lanes = await this.store.readLanes(tx, boost.productId, now);
    const own = this.store.takeOut(lanes, boostId);
    await this.store.writeLanes(
      tx,
      lanes,
      now,
      new Map([
        [
          boostId,
          {
            status: BoostStatus.paused,
            pausedAt: now,
            // A staff pause: the cron never resumes it on its own, even when
            // the system had paused this boost before.
            pausedBySystem: false,
            pausedRemainingSeconds: Math.max(1, ceilSeconds(own.searchMs)),
            pausedShowcaseSeconds: boost.showcaseOnHome
              ? ceilSeconds(own.showcaseMs)
              : null,
          },
        ],
      ]),
    );
    await this.store.refreshProductPromotion(tx, boost.productId, now);
    this.store.breadcrumb("pause", { boostId, productId: boost.productId });
  }

  /**
   * Staff resume: the boost's own remaining time runs again behind the
   * listing's running boosts (or from now), in each lane.
   */
  async resume(
    tx: Prisma.TransactionClient,
    boostId: string,
    now: Date = new Date(),
  ): Promise<void> {
    const boost = await this.store.lockedBoost(tx, boostId);
    if (!boost || boost.status !== BoostStatus.paused) {
      throw new BadRequestException(
        i18nMessage("server.admin.adPackage.resumePausedOnly"),
      );
    }
    const lanes = await this.store.readLanes(tx, boost.productId, now);
    this.store.queueBehind(lanes, boostId, this.store.pausedOwnTime(boost));
    await this.store.writeLanes(tx, lanes, now, new Map([[boostId, RESUMED]]));
    await this.store.refreshProductPromotion(tx, boost.productId, now);
    this.store.breadcrumb("resume", { boostId, productId: boost.productId });
  }

  /**
   * Staff extension by whole days, of an active or a paused boost. The days
   * are added to the boost's own time in each of its lanes, so every boost
   * queued behind it moves back by them and the listing gains exactly that
   * much. (Extending a boost with another one stacked behind it used to move
   * only its own end, and the extension was lost under the later boost.)
   */
  async extend(
    tx: Prisma.TransactionClient,
    boostId: string,
    days: number,
    now: Date = new Date(),
  ): Promise<void> {
    const boost = await this.store.lockedBoost(tx, boostId);
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
    const addMs = days * DAY_MS;

    if (boost.status === BoostStatus.paused) {
      const addSeconds = addMs / 1000;
      await tx.productBoost.update({
        where: { id: boostId },
        data: {
          pausedRemainingSeconds:
            (boost.pausedRemainingSeconds ?? 0) + addSeconds,
          ...(boost.showcaseOnHome
            ? {
                pausedShowcaseSeconds:
                  (boost.pausedShowcaseSeconds ??
                    boost.pausedRemainingSeconds ??
                    0) + addSeconds,
              }
            : {}),
          extendedDays: { increment: days },
        },
      });
    } else {
      const lanes = await this.store.readLanes(tx, boost.productId, now);
      const addTo = (lane: LaneEntry[]) => {
        const entry = lane.find((e) => e.id === boostId);
        // Still active but its end has passed (the cron has not expired it
        // yet): it runs again from now, ahead of the boosts queued behind.
        if (entry) entry.ownMs += addMs;
        else lane.unshift({ id: boostId, ownMs: addMs });
      };
      addTo(lanes.search);
      if (boost.showcaseOnHome) addTo(lanes.showcase);
      await this.store.writeLanes(
        tx,
        lanes,
        now,
        new Map([[boostId, { extendedDays: { increment: days } }]]),
      );
    }
    await this.store.refreshProductPromotion(tx, boost.productId, now);
    this.store.breadcrumb("extend", { boostId, productId: boost.productId });
  }

  /**
   * Stops a boost early (status `cancelled`) and records who did it and why.
   * A running boost leaves both lanes: its own unused time is dropped and the
   * boosts queued behind it move up by exactly that much. A refund adds its
   * amount to `refundedAmount` (which tells a refund from a revoke) and is
   * recorded on a boost that ended a moment ago too. Queues the seller notice.
   *
   * Idempotent: anything not stoppable (already cancelled, pending, failed,
   * or ended for a non-refund stop) is left alone and reported with its
   * status, so a replay never adds a refund twice. LB4 never stops a pending
   * boost, so a late payment always finds its boost activatable.
   */
  async cancel(
    tx: Prisma.TransactionClient,
    boostId: string,
    input: BoostStopInput,
    now: Date = new Date(),
  ): Promise<BoostStopResult> {
    const boost = await this.store.lockedBoost(tx, boostId);
    if (!boost) return { stopped: false, status: null };
    const refund = input.refundedAmount !== undefined;
    const allowed = refund ? REFUND_RECORDABLE_STATUSES : STOPPABLE_STATUSES;
    if (!allowed.includes(boost.status)) {
      return { stopped: false, status: boost.status };
    }

    const patch: Prisma.ProductBoostUncheckedUpdateInput = {
      status: BoostStatus.cancelled,
      cancelledAt: now,
      cancelledById: input.actorId,
      cancelReason: input.reason,
      ...(refund
        ? {
            refundedAmount: new Prisma.Decimal(boost.refundedAmount ?? 0).plus(
              input.refundedAmount ?? 0,
            ),
          }
        : {}),
    };
    let unconsumedMs = 0;
    if (boost.status === BoostStatus.active) {
      const lanes = await this.store.readLanes(tx, boost.productId, now);
      unconsumedMs = this.store.takeOut(lanes, boostId).searchMs;
      // It ran until now; its stretch in the future is gone.
      if (boost.endsAt && boost.endsAt > now) patch.endsAt = now;
      if (boost.showcaseEndsAt && boost.showcaseEndsAt > now) {
        patch.showcaseEndsAt = now;
      }
      await this.store.writeLanes(tx, lanes, now, new Map([[boostId, patch]]));
    } else {
      if (boost.status === BoostStatus.paused) {
        unconsumedMs = this.store.pausedOwnTime(boost).searchMs;
      }
      await tx.productBoost.update({ where: { id: boostId }, data: patch });
    }
    await this.store.refreshProductPromotion(tx, boost.productId, now);
    await this.store.enqueueNotice(
      tx,
      boostId,
      refund ? "refunded" : "cancelled",
    );
    this.store.breadcrumb(refund ? "refund_stop" : "cancel", {
      boostId,
      productId: boost.productId,
    });
    return {
      stopped: true,
      boostId,
      productId: boost.productId,
      unconsumedSeconds: ceilSeconds(unconsumedMs),
    };
  }

  /**
   * A refund of a boost order was finalized (in the refund's transaction):
   * stop its boost and record the amount. Null when the order has no boost
   * (a membership order). Whichever path finalizes the refund (the admin
   * boost refund, the stuck-refund recovery cron) stops the boost with it, so
   * money never goes back while the boost keeps running.
   */
  async stopForRefund(
    tx: Prisma.TransactionClient,
    orderId: string,
    input: BoostStopInput & { refundedAmount: Prisma.Decimal.Value },
    now: Date = new Date(),
  ): Promise<BoostStopResult | null> {
    const boost = await tx.productBoost.findUnique({
      where: { orderId },
      select: { id: true },
    });
    if (!boost) return null;
    const result = await this.cancel(tx, boost.id, input, now);
    if (!result.stopped) {
      this.logger.warn(
        `Refund of boost order ${orderId} left boost ${boost.id} as it was: status ${result.status}`,
      );
    }
    return result;
  }
}
