import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  DASHBOARD_ALERT_KEYS,
  DASHBOARD_ALERT_LINKS,
  DASHBOARD_QUEUE_KEYS,
  DASHBOARD_QUEUE_LINKS,
  DASHBOARD_QUEUE_PARTS,
  DASHBOARD_QUEUE_PART_LINKS,
  type DashboardAlert,
  type DashboardAlertKey,
  type DashboardQueuePart,
  type DashboardQueueTile,
  type DashboardWorklistResponse,
} from "@tarodan/types";
import { PrismaService } from "../../../../prisma";
import { CacheService } from "../../../cache/cache.service";
import { RevenueSplitService } from "../../../finance-reconciliation/revenue-split.service";
import {
  ALERT_DEFINITIONS,
  DIAGNOSTIC_ALERT_SEVERITY,
  type QueryableAlertKey,
} from "./dashboard-alert.definitions";
import { QUEUE_PART_DEFINITIONS } from "./dashboard-queue.definitions";

/**
 * Zone A ("Bekleyen işler") + Zone B ("Uyarılar") — tek uç, çünkü ikisi de aynı
 * soruyu cevaplar: "şu an beni ne bekliyor?".
 *
 * Dönem filtresinden BAĞIMSIZDIR; filtre yalnız dönem özetini etkiler.
 *
 * Yük: yirmiye yakın satır tek `$transaction`ta toplu okunur ve sonuç tüm
 * adminler için AYNI olduğundan tek anahtarla önbelleğe alınır — kişiye özel
 * hiçbir veri taşımaz.
 */
@Injectable()
export class AdminDashboardWorklistService {
  private readonly logger = new Logger(AdminDashboardWorklistService.name);

  /** Kuyruk/uyarı şeridi: 60 sn. Operasyon temposu için yeterince taze. */
  static readonly CACHE_KEY = "admin:dashboard:worklist:v1";
  static readonly CACHE_TTL_SECONDS = 60;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly config: ConfigService,
    private readonly revenueSplit: RevenueSplitService,
  ) {}

  /** Önbellekli okuma. Redis erişilemezse sessizce canlı hesaba düşer. */
  async getWorklist(): Promise<DashboardWorklistResponse> {
    return this.cache.getOrSet(
      AdminDashboardWorklistService.CACHE_KEY,
      () => this.buildWorklist(),
      { ttl: AdminDashboardWorklistService.CACHE_TTL_SECONDS },
    );
  }

  /** Önbelleği düşürür — ekrandaki "yenile" düğmesi bunu kullanır. */
  async invalidate(): Promise<void> {
    await this.cache.del(AdminDashboardWorklistService.CACHE_KEY);
  }

  private async buildWorklist(): Promise<DashboardWorklistResponse> {
    const now = new Date();
    const [queues, alerts] = await Promise.all([
      this.buildQueues(now),
      this.buildAlerts(now),
    ]);
    return { generatedAt: now.toISOString(), queues, alerts };
  }

  private async buildQueues(now: Date): Promise<DashboardQueueTile[]> {
    const partKeys = DASHBOARD_QUEUE_KEYS.flatMap(
      (queue) => DASHBOARD_QUEUE_PARTS[queue],
    );

    const rows = await this.prisma.$transaction(
      partKeys.map((key) =>
        QUEUE_PART_DEFINITIONS[key].query(this.prisma, now, this.config),
      ),
    );

    const readings = new Map(
      partKeys.map((key, index) => [
        key,
        QUEUE_PART_DEFINITIONS[key].read(rows[index]),
      ]),
    );

    return DASHBOARD_QUEUE_KEYS.map((queueKey) => {
      const parts: DashboardQueuePart[] = [];
      let total = 0;
      let oldest: Date | null = null;

      for (const partKey of DASHBOARD_QUEUE_PARTS[queueKey]) {
        const reading = readings.get(partKey);
        if (!reading) continue;
        parts.push({
          key: partKey,
          count: reading.count,
          oldestAt: reading.oldestAt ? reading.oldestAt.toISOString() : null,
          ...(reading.amount === undefined ? {} : { amount: reading.amount }),
          href: DASHBOARD_QUEUE_PART_LINKS[partKey],
        });
        // Alt küme satırı (acil destek talebi) toplamı ikinci kez şişirmez.
        if (!QUEUE_PART_DEFINITIONS[partKey].subsetOf) total += reading.count;
        if (
          reading.count > 0 &&
          reading.oldestAt &&
          (!oldest || reading.oldestAt < oldest)
        ) {
          oldest = reading.oldestAt;
        }
      }

      return {
        key: queueKey,
        total,
        oldestAt: oldest ? oldest.toISOString() : null,
        parts,
        href: DASHBOARD_QUEUE_LINKS[queueKey],
      };
    });
  }

  private async buildAlerts(now: Date): Promise<DashboardAlert[]> {
    const keys = Object.keys(ALERT_DEFINITIONS) as QueryableAlertKey[];

    const [rows, diagnostics] = await Promise.all([
      this.prisma.$transaction(
        keys.map((key) =>
          ALERT_DEFINITIONS[key].query(this.prisma, now, this.config),
        ),
      ),
      // Mutabakat teşhisleri (komisyon defteri sapması, siparişsiz ödeme,
      // hold'suz sipariş) tek kaynaktan gelir. Patlarsa şerit çizilmeye devam
      // eder — bir teşhis sorgusu tüm uyarı listesini düşürmemeli.
      this.revenueSplit
        .compute()
        .then((split) => split.diagnostics)
        .catch((error: unknown) => {
          this.logger.warn(
            `Dashboard mutabakat teşhisleri okunamadı: ${String(error)}`,
          );
          return null;
        }),
    ]);

    const alerts = new Map<DashboardAlertKey, DashboardAlert>();

    keys.forEach((key, index) => {
      const definition = ALERT_DEFINITIONS[key];
      const reading = definition.read(rows[index]);
      if (reading.count <= 0) return;
      alerts.set(key, {
        key,
        count: reading.count,
        ...(reading.amount === undefined ? {} : { amount: reading.amount }),
        ...(definition.threshold
          ? { threshold: definition.threshold(this.config) }
          : {}),
        severity: definition.severity,
        href: DASHBOARD_ALERT_LINKS[key],
      });
    });

    if (diagnostics) {
      const drift = Math.abs(diagnostics.commissionLedgerDrift);
      if (drift >= 0.01) {
        alerts.set("commissionLedgerDrift", {
          key: "commissionLedgerDrift",
          count: 1,
          amount: diagnostics.commissionLedgerDrift,
          severity: DIAGNOSTIC_ALERT_SEVERITY.commissionLedgerDrift,
          href: DASHBOARD_ALERT_LINKS.commissionLedgerDrift,
        });
      }
      if (diagnostics.paymentsWithoutOrders > 0) {
        alerts.set("paymentsWithoutOrders", {
          key: "paymentsWithoutOrders",
          count: diagnostics.paymentsWithoutOrders,
          severity: DIAGNOSTIC_ALERT_SEVERITY.paymentsWithoutOrders,
          href: DASHBOARD_ALERT_LINKS.paymentsWithoutOrders,
        });
      }
      if (diagnostics.ordersWithoutHold > 0) {
        alerts.set("ordersWithoutHold", {
          key: "ordersWithoutHold",
          count: diagnostics.ordersWithoutHold,
          severity: DIAGNOSTIC_ALERT_SEVERITY.ordersWithoutHold,
          href: DASHBOARD_ALERT_LINKS.ordersWithoutHold,
        });
      }
    }

    // Katalog sırası = ekrandaki sıra: uyarıların yeri turdan tura oynamaz.
    return DASHBOARD_ALERT_KEYS.map((key) => alerts.get(key)).filter(
      (alert): alert is DashboardAlert => alert !== undefined,
    );
  }
}
