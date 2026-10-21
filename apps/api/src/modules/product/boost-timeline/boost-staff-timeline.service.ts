import { BadRequestException, Injectable } from "@nestjs/common";
import { BoostStatus, Prisma } from "@prisma/client";
import { i18nMessage } from "../../i18n";
import { ceilSeconds, DAY_MS, type LaneEntry } from "./boost-lanes";
import { BoostTimelineStore, RESUMED } from "./boost-timeline-store.service";

/**
 * Staff changes to one boost on its listing's timeline: pause, resume and
 * extend. Each takes the boost's own remaining time out of the listing's
 * lanes, changes it and lays the lanes again, so no other boost's time is
 * added or lost. Part of `BoostTimelineService`.
 */
@Injectable()
export class BoostStaffTimelineService {
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
}
