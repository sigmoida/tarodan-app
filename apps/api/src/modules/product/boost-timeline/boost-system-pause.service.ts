import { Injectable } from "@nestjs/common";
import { BoostStatus, Prisma, ProductStatus } from "@prisma/client";
import { ceilSeconds } from "./boost-lanes";
import { BoostTimelineStore, RESUMED } from "./boost-timeline-store.service";

/**
 * The system pause of a listing's boosts while it is offline, and their
 * resume once it is live again (the expire-boosts cron, per listing). Every
 * boost keeps its own remaining time, so a stacked boost never resumes with
 * the time of the boosts before it. Part of `BoostTimelineService`.
 */
@Injectable()
export class BoostSystemPauseService {
  constructor(private readonly store: BoostTimelineStore) {}

  /**
   * System pause of a listing that went offline: every running boost keeps
   * its own remaining time (search and showcase) and leaves the listing. A
   * listing that is live again by the time the lock is taken is left alone.
   * @returns the number of boosts paused.
   */
  async pauseForDelisting(
    tx: Prisma.TransactionClient,
    productId: string,
    now: Date = new Date(),
  ): Promise<number> {
    await this.store.lockProduct(tx, productId);
    const product = await tx.product.findUnique({
      where: { id: productId },
      select: { status: true },
    });
    if (!product || product.status === ProductStatus.active) return 0;
    const lanes = await this.store.readLanes(tx, productId, now);
    let paused = 0;
    for (const entry of lanes.search) {
      const row = lanes.rows.get(entry.id);
      const showcaseMs =
        lanes.showcase.find((e) => e.id === entry.id)?.ownMs ?? 0;
      const result = await tx.productBoost.updateMany({
        where: { id: entry.id, status: BoostStatus.active },
        data: {
          status: BoostStatus.paused,
          pausedAt: now,
          pausedBySystem: true,
          pausedRemainingSeconds: Math.max(1, ceilSeconds(entry.ownMs)),
          pausedShowcaseSeconds: row?.showcaseOnHome
            ? ceilSeconds(showcaseMs)
            : null,
        },
      });
      paused += result.count;
    }
    await this.store.refreshProductPromotion(tx, productId, now);
    return paused;
  }

  /**
   * System resume of a listing that is live again: the boosts the system
   * paused run again with their own remaining time, queued in purchase order
   * behind whatever runs now (a boost bought while the listing was offline
   * keeps its place). A staff pause (`pausedBySystem = false`) stays paused.
   * The listing leads the boosted LIFO order again (`boostedAt = now`), as the
   * system resume always did.
   * @returns the number of boosts resumed.
   */
  async resumeSystemPaused(
    tx: Prisma.TransactionClient,
    productId: string,
    now: Date = new Date(),
  ): Promise<number> {
    await this.store.lockProduct(tx, productId);
    const product = await tx.product.findUnique({
      where: { id: productId },
      select: { status: true },
    });
    if (product?.status !== ProductStatus.active) return 0;
    const paused = (
      await tx.productBoost.findMany({
        where: {
          productId,
          status: BoostStatus.paused,
          pausedBySystem: true,
        },
      })
    ).sort(
      (a, b) =>
        (a.purchasedAt?.getTime() ?? 0) - (b.purchasedAt?.getTime() ?? 0) ||
        a.id.localeCompare(b.id),
    );
    if (paused.length === 0) return 0;
    const lanes = await this.store.readLanes(tx, productId, now);
    for (const boost of paused) {
      this.store.queueBehind(lanes, boost.id, this.store.pausedOwnTime(boost));
    }
    await this.store.writeLanes(
      tx,
      lanes,
      now,
      new Map(paused.map((b) => [b.id, RESUMED])),
    );
    await this.store.refreshProductPromotion(tx, productId, now);
    // Only while it is boosted: a stale LIFO key on an unboosted listing would
    // never be swept (the cron looks for an ended `boostedUntil`).
    await tx.product.updateMany({
      where: { id: productId, boostedUntil: { gt: now } },
      data: { boostedAt: now },
    });
    return paused.length;
  }
}
