import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../prisma";
import { isLiveProduction } from "../../../config/environment";
import { productionCopyCutoff } from "../helpers/uat-refresh.helper";

/**
 * Which rows of this database are copies of production (docs/UAT_REFRESH.md).
 * The staging refresh replaces the staging database with a masked production
 * dump, including production's cancelled orders whose refund had not gone
 * through yet. Staging talks to the PayTR TEST store, which refuses those
 * refunds forever, so the refund sweeps leave copied rows alone (D1, the
 * staging refund loop).
 *
 * Off on live production without a query (`isLiveProduction` fails closed:
 * an optimized build is live unless `APP_ENV=staging`), so a production
 * refund is never skipped by this guard. The refresh itself is refused there.
 */
@Injectable()
export class UatProductionCopyService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Rows created at or before the returned instant came from production;
   * `null` on live production or when no refresh copied anything.
   */
  async copiedBefore(now = new Date()): Promise<Date | null> {
    if (isLiveProduction()) return null;
    const runs = await this.prisma.uatRefreshRun.findMany({
      where: { dryRun: false },
      select: {
        state: true,
        dryRun: true,
        requestedAt: true,
        startedAt: true,
        finishedAt: true,
        sourceSnapshotAt: true,
      },
    });
    return productionCopyCutoff(runs, now);
  }
}
