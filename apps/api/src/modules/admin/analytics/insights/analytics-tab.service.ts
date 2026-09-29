import { Injectable } from "@nestjs/common";
import type { AnalyticsRangeQuery, AnalyticsTab } from "@tarodan/types";
import { PrismaService } from "../../../../prisma";
import { CacheService } from "../../../cache/cache.service";
import { analyticsCacheKey } from "./analytics-cache.helper";
import {
  resolveAnalyticsRange,
  type ResolvedAnalyticsRange,
} from "./analytics-range.helper";

/**
 * Bir analitik sekmesinin ortak iskeleti: aralığı çöz, önbelleğe bak, yoksa
 * hesapla.
 *
 * Her sekme KENDİ ucundan servis edilir. Eski ekran sekme ne olursa olsun beş
 * isteği birden atıyordu — takas sekmesine bakan yönetici ürün raporunu da
 * bekliyordu — ve hiçbiri önbelleklenmiyordu.
 */
@Injectable()
export abstract class AnalyticsTabService<T> {
  protected abstract readonly tab: AnalyticsTab;

  constructor(
    protected readonly prisma: PrismaService,
    protected readonly cache: CacheService,
  ) {}

  async get(query: AnalyticsRangeQuery | undefined): Promise<T> {
    const now = new Date();
    const range = resolveAnalyticsRange(query, now);
    const { key, ttl } = analyticsCacheKey(this.tab, range, now);
    return this.cache.getOrSet(key, () => this.compute(range), { ttl });
  }

  protected abstract compute(range: ResolvedAnalyticsRange): Promise<T>;
}
