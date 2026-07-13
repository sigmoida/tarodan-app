import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { SearchCommonService } from "./search-common.service";
import { SearchProductService } from "./search-product.service";

/**
 * Periyodik ES↔DB senkron alt servisi: runHandlePeriodicSync, runHandleHourlyReconcile
 * ve deltaSync. Bu işler Bull repeatable olarak (SearchCommonService kaydeder,
 * SearchScheduledProcessor worker'da tüketir) tek-sefer koşar. indexProduct/removeProduct
 * için SearchProductService'e, client/where-builder'lar için SearchCommonService'e delege eder.
 */
@Injectable()
export class SearchSyncService {
  private readonly logger = new Logger(SearchSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly common: SearchCommonService,
    private readonly product: SearchProductService,
  ) {}

  // ──────────────────────────── Periodic Sync ────────────────────────────

  /** Gerçek iş — Bull processor buradan çağırır. */
  async runHandlePeriodicSync(log: (msg: string) => void = () => {}) {
    if (!this.common.isAvailable()) {
      log("Elasticsearch unreachable, skipped");
      return { summary: "ES unreachable, skipped", stats: { skipped: 1 } };
    }

    try {
      const dbCount = await this.prisma.product.count({
        where: this.common.indexableProductWhere(),
      });

      const esResponse = await this.common.client.count({
        index: this.common.productsIndex,
      });
      const esCount = esResponse.count;
      const drift = Math.abs(dbCount - esCount);
      log(`DB=${dbCount}, ES=${esCount}, drift=${drift}`);

      if (drift > 2) {
        this.logger.warn(
          `ES/DB count mismatch: DB=${dbCount}, ES=${esCount}. Running delta sync...`,
        );
        log("Drift > 2 → running delta sync");
        await this.deltaSync();
        return {
          summary: `Synced (DB=${dbCount}, ES=${esCount})`,
          stats: { dbCount, esCount, drift, synced: 1 },
        };
      }
      return {
        summary: `Sync OK (DB=${dbCount}, ES=${esCount})`,
        stats: { dbCount, esCount, drift, synced: 0 },
      };
    } catch (error: any) {
      this.logger.warn("Periodic sync check failed");
      log(`ERROR: ${error?.message ?? error}`);
      return {
        summary: `Error: ${error?.message ?? error}`,
        stats: { errors: 1 },
      };
    }
  }

  /**
   * Sayı bazlı 5-dk kontrol yalnızca |DB-ES| > 2 olunca deltaSync çağırıyor; ama
   * eşit sayıda eksik + yetim doküman olduğunda sayılar tutar (delta=0) ve ID
   * bazlı drift hiç yakalanmaz. Bu yüzden sayıdan bağımsız, saatlik tam reconcile
   * çalıştırıp yetim/eksik dokümanları her durumda eşitliyoruz.
   */
  /** Gerçek iş — Bull processor buradan çağırır. */
  async runHandleHourlyReconcile(log: (msg: string) => void = () => {}) {
    if (!this.common.isAvailable()) {
      log("Elasticsearch unreachable, skipped");
      return { summary: "ES unreachable, skipped", stats: { skipped: 1 } };
    }
    const { indexed, removed } = await this.deltaSync(log);
    return {
      summary: `Reconcile OK (indexed ${indexed}, removed ${removed})`,
      stats: { indexed, removed },
    };
  }

  private async deltaSync(
    log: (msg: string) => void = () => {},
  ): Promise<{ indexed: number; removed: number }> {
    try {
      const indexableProducts = await this.prisma.product.findMany({
        where: this.common.indexableProductWhere(),
        select: { id: true, updatedAt: true },
      });

      const dbIds = new Set(indexableProducts.map((p) => p.id));

      // Get all ES document IDs
      const esIds = new Set<string>();
      let searchAfter: any[] | undefined;
      while (true) {
        const params: any = {
          index: this.common.productsIndex,
          size: 1000,
          _source: false,
          sort: [{ _doc: "asc" }],
        };
        if (searchAfter) params.search_after = searchAfter;
        const resp = await this.common.client.search(params);
        const hits = resp.hits.hits;
        if (hits.length === 0) break;
        hits.forEach((h: any) => esIds.add(h._id));
        searchAfter = hits[hits.length - 1].sort;
      }

      // Index missing products
      const missingIds = [...dbIds].filter((id) => !esIds.has(id));
      for (const id of missingIds) {
        await this.product.indexProduct(id);
      }

      // Remove stale documents
      const staleIds = [...esIds].filter((id) => !dbIds.has(id));
      for (const id of staleIds) {
        await this.product.removeProduct(id);
      }

      if (missingIds.length > 0 || staleIds.length > 0) {
        this.logger.log(
          `Delta sync: indexed ${missingIds.length}, removed ${staleIds.length}`,
        );
      }
      log(`indexed ${missingIds.length}, removed ${staleIds.length}`);
      return { indexed: missingIds.length, removed: staleIds.length };
    } catch (error) {
      this.logger.error("Delta sync failed");
      log("delta sync ERROR");
      return { indexed: 0, removed: 0 };
    }
  }
}
