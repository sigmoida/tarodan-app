import { Injectable, Logger } from "@nestjs/common";
import { ProductKind, ProductStatus } from "@prisma/client";
import { PrismaService } from "../../../prisma";
import { resolveTimingValue } from "../../../common/timing-rules";
import { errorMessage } from "../../../common/helpers/error-message";
import { AdminAuditService } from "../ops/admin-audit.service";
import { ProductRenewalService } from "../../product/lifecycle/product-renewal.service";
import { describeRenewalFailure } from "../../product/helpers/product-renewal";
import {
  classifyLegacyExpiry,
  type LegacyExpiryVerdict,
} from "../../product/helpers/legacy-expiry-selection";
import type {
  ExpiredListingMode,
  ExpiredListingsMaintenanceDto,
} from "../dto/expired-listings-maintenance.dto";

/** Tarama sayfa boyutu (id sırasıyla, kararlı). */
const SCAN_BATCH = 500;
const DEFAULT_GRACE_DAYS = 3;
const DEFAULT_LIMIT = 200;
/** Raporda gösterilen örnek ilan sayısı. */
const SAMPLE_SIZE = 25;

export interface ExpiredListingsMaintenanceReport {
  mode: ExpiredListingMode;
  dryRun: boolean;
  rule: { ttlDays: number; graceDays: number };
  scanned: number;
  matched: number;
  /** Bu çalıştırmada işlenen (limit uygulanmış) ilan sayısı. */
  selected: number;
  /** Limit yüzünden bu turda işlenmeyen eşleşenler — tekrar çalıştırın. */
  remaining: number;
  /** Eşleşmeyenlerin nedene göre dökümü (belirsizlik raporu). */
  skipped: Record<Exclude<LegacyExpiryVerdict, "match">, number>;
  sample: Array<{ id: string; title: string }>;
  /** Yalnız dryRun=false iken dolu. */
  applied: null | {
    marked: number;
    reactivated: number;
    failed: Array<{ id: string; errorKey: string }>;
  };
}

/**
 * Bu özellikten ÖNCE süresi dolup işaretsiz pasife alınmış ilanlar için tek
 * seferlik, yönetici tetikli bakım işlemi. Önce kuru çalıştırma (varsayılan),
 * sonra uygulama. Seçim kuralı `classifyLegacyExpiry`'de tek yerdedir; yazımlar
 * alan servisine (`ProductRenewalService`) delege edilir.
 *
 * Başka nedenle pasife alınmış ilana (elle pasife alma, stok bitişi, iade
 * karantinası, moderasyon) dokunmaz: yalnız `inactiveReason = null` + stoklu +
 * satıcısı kullanılabilir + dolum-anı kuralını sağlayanlar seçilir.
 */
@Injectable()
export class AdminExpiredListingsService {
  private readonly logger = new Logger(AdminExpiredListingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
    private readonly renewal: ProductRenewalService,
  ) {}

  async run(
    adminId: string,
    dto: ExpiredListingsMaintenanceDto,
  ): Promise<ExpiredListingsMaintenanceReport> {
    const mode = dto.mode ?? "mark";
    const dryRun = dto.dryRun ?? true;
    const ttlDays =
      dto.ttlDays ?? (await resolveTimingValue(this.prisma, "listingTtlDays"));
    const graceDays = dto.graceDays ?? DEFAULT_GRACE_DAYS;
    const limit = dto.limit ?? DEFAULT_LIMIT;

    const skipped: ExpiredListingsMaintenanceReport["skipped"] = {
      not_at_lifetime: 0,
      touched_after_expiry: 0,
      out_of_stock: 0,
      seller_unavailable: 0,
    };
    const matches: Array<{ id: string; title: string }> = [];
    let scanned = 0;

    // Kararlı id sırasıyla sayfa sayfa taranır; yalnız eşleşenlerin id'si tutulur.
    let cursor: string | undefined;
    for (;;) {
      const batch = await this.prisma.product.findMany({
        where: {
          kind: ProductKind.listing,
          status: ProductStatus.inactive,
          // Nedeni KAYITLI ilana (iade karantinası, yeni süre-dolumu işareti)
          // hiç dokunulmaz.
          inactiveReason: null,
        },
        select: {
          id: true,
          title: true,
          publishedAt: true,
          createdAt: true,
          updatedAt: true,
          quantity: true,
          seller: { select: { isBanned: true, deletedAt: true } },
        },
        orderBy: { id: "asc" },
        take: SCAN_BATCH,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (batch.length === 0) break;
      for (const listing of batch) {
        scanned += 1;
        const verdict = classifyLegacyExpiry(listing, { ttlDays, graceDays });
        if (verdict === "match") {
          matches.push({ id: listing.id, title: listing.title });
        } else {
          skipped[verdict] += 1;
        }
      }
      cursor = batch[batch.length - 1].id;
      if (batch.length < SCAN_BATCH) break;
    }

    const selected = matches.slice(0, limit);
    const report: ExpiredListingsMaintenanceReport = {
      mode,
      dryRun,
      rule: { ttlDays, graceDays },
      scanned,
      matched: matches.length,
      selected: selected.length,
      remaining: matches.length - selected.length,
      skipped,
      sample: selected.slice(0, SAMPLE_SIZE),
      applied: null,
    };
    if (dryRun || selected.length === 0) return report;

    // Fail-closed denetim: kayıt yazılamazsa hiçbir ilana dokunulmaz.
    await this.audit.createRequiredAuditLog(
      adminId,
      "expired_listings_maintenance",
      "Product",
      "bulk",
      null,
      {
        mode,
        rule: report.rule,
        stampBaseline: dto.stampBaseline ?? false,
        productIds: selected.map((m) => m.id),
      },
    );

    report.applied = await this.apply(
      mode,
      selected.map((m) => m.id),
      dto.stampBaseline ?? false,
    );
    return report;
  }

  private async apply(
    mode: ExpiredListingMode,
    ids: string[],
    stampBaseline: boolean,
  ): Promise<NonNullable<ExpiredListingsMaintenanceReport["applied"]>> {
    // Her iki modda da önce işaret: reaktivasyon da "süresi dolmuş ilanı
    // yenile" yolundan geçer, başarısız olan ilan işaretli kalır (satıcı yenileyebilir).
    const marked = await this.renewal.markExpired(ids, {
      stampBaseline: mode === "mark" && stampBaseline,
    });
    const failed: Array<{ id: string; errorKey: string }> = [];
    let reactivated = 0;
    if (mode === "reactivate") {
      // Sıralı: üyelik ilan limiti her ilandan önce güncel sayıdan okunur.
      for (const id of marked) {
        try {
          await this.renewal.reactivateByAdmin(id);
          reactivated += 1;
        } catch (error) {
          const failure = describeRenewalFailure(error);
          if (failure.unexpected) {
            this.logger.error(
              `reactivate failed for ${id}: ${errorMessage(error)}`,
            );
          }
          failed.push({ id, errorKey: failure.errorKey });
        }
      }
    }
    return { marked: marked.length, reactivated, failed };
  }
}
