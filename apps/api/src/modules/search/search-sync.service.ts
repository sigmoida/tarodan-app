import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { SearchCommonService } from "./search-common.service";
import { SearchProductService } from "./search-product.service";

/**
 * Periyodik ES↔DB senkron alt servisi: runHandlePeriodicSync + runHourlyReconcile
 * + deltaSync. Zamanlama Bull repeatable ('search-periodic-sync' /
 * 'search-hourly-reconcile', SearchCommonService.onModuleInit'te kaydedilir) ile
 * yapılır; işi bu servisin run* metotları yürütür. indexProduct/removeProduct için
 * SearchProductService'e, client/where-builder'lar için SearchCommonService'e delege eder.
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

  /** Gerçek iş — Bull processor 'search-periodic-sync' buradan çağırır. */
  async runHandlePeriodicSync(log: (msg: string) => void = () => {}) {
    if (!this.common.isAvailable()) {
      log("Elasticsearch erişilemez, atlandı");
      return { summary: "ES erişilemez, atlandı", stats: { skipped: 1 } };
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
      log(`DB=${dbCount}, ES=${esCount}, fark=${drift}`);

      if (drift > 2) {
        this.logger.warn(
          `ES/DB count mismatch: DB=${dbCount}, ES=${esCount}. Running delta sync...`,
        );
        log("Fark > 2 → delta sync çalıştırılıyor");
        await this.deltaSync();
        return {
          summary: `Senkron yapıldı (DB=${dbCount}, ES=${esCount})`,
          stats: { dbCount, esCount, drift, synced: 1 },
        };
      }
      return {
        summary: `Senkron OK (DB=${dbCount}, ES=${esCount})`,
        stats: { dbCount, esCount, drift, synced: 0 },
      };
    } catch (error: any) {
      this.logger.warn("Periodic sync check failed");
      log(`HATA: ${error?.message ?? error}`);
      // Yutmadan yükselt: Bull job'ı "failed" olsun ki attempts/backoff ve Sentry
      // Cron alarmı gerçekten devreye girsin (aksi halde başarısız tur bile
      // "başarılı" görünür ve hata yalnız log satırında kalır).
      throw error;
    }
  }

  /**
   * Sayı bazlı 5-dk kontrol yalnızca |DB-ES| > 2 olunca deltaSync çağırıyor; ama
   * eşit sayıda eksik + yetim doküman olduğunda sayılar tutar (delta=0) ve ID
   * bazlı drift hiç yakalanmaz. Bu yüzden sayıdan bağımsız, saatlik tam reconcile
   * çalıştırıp yetim/eksik dokümanları her durumda eşitliyoruz.
   */
  /** Gerçek iş — Bull processor 'search-hourly-reconcile' buradan çağırır. */
  async runHourlyReconcile(log: (msg: string) => void = () => {}) {
    if (!this.common.isAvailable()) {
      log("Elasticsearch erişilemez, atlandı");
      return { summary: "ES erişilemez, atlandı", stats: { skipped: 1 } };
    }
    await this.deltaSync();
    log("Saatlik reconcile tamam");
    return {
      summary: "Saatlik reconcile tamam",
      stats: {} as Record<string, number>,
    };
  }

  private async deltaSync(): Promise<void> {
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
    } catch (error) {
      this.logger.error("Delta sync failed");
    }
  }
}
