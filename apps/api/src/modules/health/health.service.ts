/**
 * Health Service
 * Checks connectivity to all data services:
 * - PostgreSQL (primary database)
 * - Redis (caching, sessions, queues)
 * - Elasticsearch (search)
 */
import {
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
} from "@nestjs/common";
import { InjectQueue } from "@nestjs/bull";
import type { Queue } from "bull";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../prisma";
import { CacheService } from "../cache/cache.service";
import { CommissionRuleSetStatus, MembershipTierType } from "@prisma/client";
import { SHIPPING_PACKAGE_TIER_ORDER } from "../shipping/shipping-package-tier";
import { AdminTradeCommonService } from "../admin/admin-trade-common.service";
import { getProcessRole } from "../../process-role";
import { WORKER_HEARTBEAT_KEY } from "./worker-heartbeat.service";
import { validateStrictCommissionCoverage } from "../order/order-commission.helper";
import { QUEUE_NAMES } from "../../workers/constants";
import { CRON_CATALOG } from "../../workers/cron-catalog";
import { isProduction } from "../../config/environment";

/**
 * Bu sayıda DLQ (`dead`) outbox satırı biriktiğinde instance hazır-değil sayılır:
 * otomatik kurtarılamayan para yan-etkileri var ve trafiği kesmek, sessizce
 * devam etmekten iyidir.
 */
const OUTBOX_DEAD_READINESS_THRESHOLD = 20;

export interface ServiceHealth {
  status: "healthy" | "unhealthy" | "degraded";
  latency?: number;
  message?: string;
  details?: Record<string, any>;
}

export interface DetailedHealthResponse {
  status: "healthy" | "unhealthy" | "degraded";
  timestamp: string;
  uptime: number;
  services: {
    postgresql: ServiceHealth;
    redis: ServiceHealth;
    elasticsearch: ServiceHealth;
  };
  system: {
    memory: {
      used: number;
      total: number;
      percentage: number;
    };
    cpu: {
      load: number[];
    };
  };
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  private readonly startTime = Date.now();

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly cacheService: CacheService,
    // Depo adresi readiness'ı, takas onayının kullandığı çözümlemeyle AYNI
    // olmalı (tek kaynak) — leaf servis, health module'de de provide edilir.
    private readonly tradeCommon: AdminTradeCommonService,
    @Optional()
    @InjectQueue(QUEUE_NAMES.SCHEDULED)
    private readonly scheduledQueue?: Queue,
  ) {}

  /**
   * Get detailed health status of all services
   */
  async getDetailedHealth(): Promise<DetailedHealthResponse> {
    const [postgresql, redis, elasticsearch] = await Promise.all([
      this.checkPostgresql(),
      this.checkRedis(),
      this.checkElasticsearch(),
    ]);

    const services = { postgresql, redis, elasticsearch };

    // Determine overall status
    const statuses = Object.values(services).map((s) => s.status);
    let overallStatus: "healthy" | "unhealthy" | "degraded" = "healthy";

    if (statuses.includes("unhealthy")) {
      // If PostgreSQL is unhealthy, overall is unhealthy
      if (postgresql.status === "unhealthy") {
        overallStatus = "unhealthy";
      } else {
        overallStatus = "degraded";
      }
    } else if (statuses.includes("degraded")) {
      overallStatus = "degraded";
    }

    // System metrics
    const memUsage = process.memoryUsage();
    const totalMem = require("os").totalmem();

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      services,
      system: {
        memory: {
          used: Math.round(memUsage.heapUsed / 1024 / 1024),
          total: Math.round(totalMem / 1024 / 1024),
          percentage: Math.round((memUsage.heapUsed / totalMem) * 100),
        },
        cpu: {
          load: require("os").loadavg(),
        },
      },
    };
  }

  /**
   * Check if service is ready to accept traffic
   */
  async checkReadiness(): Promise<{
    status: string;
    checks: Record<string, boolean>;
  }> {
    const [postgresql, redis, worker, outbox, businessConfig] =
      await Promise.all([
        this.checkPostgresql(),
        this.checkRedis(),
        this.checkWorker(),
        this.checkOutbox(),
        this.checkBusinessConfig(),
      ]);

    const checks = {
      postgresql: postgresql.status === "healthy",
      redis: redis.status === "healthy",
      worker,
      outbox,
      businessConfig,
    };
    const isReady = Object.values(checks).every(Boolean);

    if (!isReady) {
      throw new ServiceUnavailableException({
        status: "not_ready",
        checks,
      });
    }

    return {
      status: "ready",
      checks,
    };
  }

  private async checkWorker(): Promise<boolean> {
    if (!isProduction()) return true;
    if (!this.scheduledQueue) return false;

    try {
      const [workers, repeatableJobs] = await Promise.all([
        this.scheduledQueue.getWorkers(),
        this.scheduledQueue.getRepeatableJobs(),
      ]);
      const registeredNames = new Set(repeatableJobs.map((job) => job.name));
      const missingCrons = CRON_CATALOG.map((entry) => entry.key).filter(
        (key) => !registeredNames.has(key),
      );
      if (workers.length === 0 || missingCrons.length > 0) {
        this.logger.error(
          `BULL_NOT_READY workers=${workers.length} missingCrons=${missingCrons.join(",") || "none"}`,
        );
        return false;
      }

      // Ayrı web/worker dağıtımında heartbeat, worker process'inin yalnız Redis'e
      // bağlı değil event-loop olarak da canlı olduğunu doğrular. `all` rolünde
      // aynı process zaten yukarıdaki Bull worker bağlantısıyla kanıtlanır.
      if (getProcessRole() === "web") {
        const heartbeat = await this.cacheService.get<{ at?: number }>(
          WORKER_HEARTBEAT_KEY,
        );
        return (
          typeof heartbeat?.at === "number" &&
          Date.now() - heartbeat.at < 60_000
        );
      }
      return true;
    } catch (error) {
      this.logger.error("Bull worker readiness check failed", error);
      return false;
    }
  }

  /**
   * Outbox sağlığı. Bayat `processing` satırı bir ALARM'dır, trafiği kesme
   * gerekçesi DEĞİLDİR: drain turu onu zaten `pending`'e geri alır, oysa /ready'yi
   * düşürmek Traefik'in TÜM replikaları yükten çekmesine yol açıyordu — tek bir
   * çökme sitewide 503'e dönüşüyor ve yeniden başlatmak bile düzeltmiyordu.
   * Hazır-DEĞİL yalnızca kurtarılamayan birikme (DLQ eşiği) için verilir.
   */
  private async checkOutbox(): Promise<boolean> {
    if (!isProduction()) return true;

    try {
      const staleProcessingBefore = new Date(Date.now() - 5 * 60_000);
      const [staleProcessingCount, deadCount] = await Promise.all([
        this.prisma.outboxEvent.count({
          where: {
            status: "processing",
            updatedAt: { lt: staleProcessingBefore },
          },
        }),
        this.prisma.outboxEvent.count({ where: { status: "dead" } }),
      ]);

      if (staleProcessingCount > 0) {
        this.logger.error(
          `OUTBOX_STALE_PROCESSING count=${staleProcessingCount} — kesintiye uğramış claim'ler bir sonraki drain turunda kurtarılacak`,
        );
      }
      if (deadCount >= OUTBOX_DEAD_READINESS_THRESHOLD) {
        this.logger.error(
          `OUTBOX_DEAD_BACKLOG count=${deadCount} — otomatik kurtarılamayan yan-etkiler; manuel inceleme gerekir`,
        );
        return false;
      }
      return true;
    } catch (error) {
      this.logger.error("Outbox readiness check failed", error);
      return false;
    }
  }

  private async checkBusinessConfig(): Promise<boolean> {
    if (!isProduction()) return true;

    try {
      const [
        membershipTierCount,
        activeCommissionRuleSet,
        taxRuleCount,
        shippingTariff,
        platformSeller,
        activeCategories,
      ] = await Promise.all([
        this.prisma.membershipTier.count({
          where: {
            type: {
              in: [
                MembershipTierType.free,
                MembershipTierType.basic,
                MembershipTierType.premium,
                MembershipTierType.business,
              ],
            },
            isActive: true,
          },
        }),
        this.prisma.commissionRuleSet.findFirst({
          where: { status: CommissionRuleSetStatus.ACTIVE },
          select: {
            id: true,
            rules: {
              select: {
                categoryId: true,
                sellerType: true,
                minAmount: true,
                maxAmount: true,
              },
            },
          },
        }),
        this.prisma.taxRule.count({ where: { isActive: true } }),
        // Kademesiz aktif tarife "hazır" görünür ama checkout hiçbir desi için
        // fiyat çözemez (fail-closed 503) → kademeleri de doğrula.
        this.prisma.shippingTariff.findFirst({
          where: { provider: "surat", status: "active" },
          select: { id: true, packageTiers: { select: { code: true } } },
        }),
        this.prisma.user.findUnique({
          where: { email: "platform@tarodan.com" },
          select: { id: true },
        }),
        this.prisma.category.findMany({
          where: { isActive: true },
          select: { id: true, name: true },
        }),
      ]);

      // Depo adresi: güvenli-takas escrow'unun önkoşulu. Yapılandırılmamışken
      // admin'in İLK takas onayı 400 verir — runbook (docs/OPERATIONS.md Adım 5)
      // eskiden "/health/ready bunu kontrol etmez" diye uyarmak zorunda kalıyordu.
      // Takas onayıyla AYNI çözümleyici kullanılır; throw = yapılandırılmamış.
      const hasWarehouseAddress = await this.tradeCommon
        .resolveWarehouseAddressId(this.prisma)
        .then(() => true)
        .catch(() => false);

      const commissionCoverage = activeCommissionRuleSet
        ? validateStrictCommissionCoverage(
            activeCommissionRuleSet.id,
            activeCategories,
            activeCommissionRuleSet.rules,
          )
        : null;
      const hasActiveCommissionRuleSet = commissionCoverage?.valid === true;
      const hasCompleteShippingTiers =
        !!shippingTariff &&
        SHIPPING_PACKAGE_TIER_ORDER.every((code) =>
          shippingTariff.packageTiers.some((tier) => tier.code === code),
        );
      if (shippingTariff && !hasCompleteShippingTiers) {
        this.logger.error(
          "BUSINESS_CONFIG_MISSING: the active shipping tariff has incomplete package tiers. " +
            "Checkout cannot resolve a shipping price and will fail with 503.",
        );
      }
      if (!hasActiveCommissionRuleSet) {
        this.logger.error(
          "BUSINESS_CONFIG_MISSING: published commission coverage is absent or incomplete. " +
            `errors=${commissionCoverage?.errors.length ?? "no-active-set"}.`,
        );
      }
      if (!hasWarehouseAddress) {
        this.logger.error(
          "BUSINESS_CONFIG_MISSING: no resolvable warehouse address " +
            "(`warehouse_address_id` setting or an active admin's address). " +
            "The first safe-trade approval will fail with 400.",
        );
      }

      return (
        membershipTierCount === 4 &&
        hasActiveCommissionRuleSet &&
        taxRuleCount > 0 &&
        hasCompleteShippingTiers &&
        !!platformSeller &&
        hasWarehouseAddress
      );
    } catch (error) {
      this.logger.error("Business configuration readiness check failed", error);
      return false;
    }
  }

  /**
   * Check PostgreSQL connectivity
   */
  private async checkPostgresql(): Promise<ServiceHealth> {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      const latency = Date.now() - start;

      // Get connection pool stats if available
      const details: Record<string, any> = {
        connected: true,
      };

      return {
        status: "healthy",
        latency,
        message: "PostgreSQL connection successful",
        details,
      };
    } catch (error) {
      this.logger.error("PostgreSQL health check failed", error);
      return {
        status: "unhealthy",
        latency: Date.now() - start,
        message: `PostgreSQL connection failed: ${error.message}`,
      };
    }
  }

  /**
   * Check Redis connectivity using CacheService
   */
  private async checkRedis(): Promise<ServiceHealth> {
    const start = Date.now();
    try {
      // Use actual CacheService to test Redis connection
      const testKey = "health:check:ping";
      const testValue = Date.now().toString();

      // Try to set and get a value
      await this.cacheService.set(testKey, testValue, { ttl: 60 });
      const retrieved = await this.cacheService.get<string>(testKey);
      await this.cacheService.del(testKey);

      const latency = Date.now() - start;

      if (retrieved === testValue) {
        // Get Redis memory info for additional details
        const memoryInfo = await this.cacheService.getMemoryUsage();

        return {
          status: "healthy",
          latency,
          message: "Redis connection successful",
          details: {
            memoryUsedMB: Math.round(memoryInfo.used / 1024 / 1024),
            memoryPeakMB: Math.round(memoryInfo.peak / 1024 / 1024),
          },
        };
      } else {
        return {
          status: "unhealthy",
          latency,
          message: "Redis set/get test failed",
        };
      }
    } catch (error) {
      this.logger.error("Redis health check failed", error);
      return {
        status: "unhealthy",
        latency: Date.now() - start,
        message: `Redis connection failed: ${error.message}`,
      };
    }
  }

  /**
   * Check Elasticsearch connectivity
   */
  private async checkElasticsearch(): Promise<ServiceHealth> {
    const start = Date.now();
    try {
      // Node çözümü + auth, SearchService'in ES client'ı ile birebir aynı olmalı;
      // aksi halde prod'da (yalnızca ELASTICSEARCH_NODE + auth set) raw fetch
      // localhost:9200'e auth'suz gidip yanlış-negatif "unhealthy" verir.
      const esUrl =
        this.configService.get("ELASTICSEARCH_URL") ||
        this.configService.get("ELASTICSEARCH_NODE", "http://localhost:9200");
      const username = this.configService.get(
        "ELASTICSEARCH_USERNAME",
        "elastic",
      );
      const password = this.configService.get(
        "ELASTICSEARCH_PASSWORD",
        "changeme",
      );

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (username && password) {
        headers.Authorization =
          "Basic " + Buffer.from(`${username}:${password}`).toString("base64");
      }

      const response = await fetch(`${esUrl}/_cluster/health`, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(5000),
      });

      const latency = Date.now() - start;

      if (!response.ok) {
        return {
          status: "unhealthy",
          latency,
          message: `Elasticsearch returned status ${response.status}`,
        };
      }

      const health = await response.json();

      // Map ES cluster status to our health status
      let status: "healthy" | "unhealthy" | "degraded" = "healthy";
      if (health.status === "red") {
        status = "unhealthy";
      } else if (health.status === "yellow") {
        status = "degraded";
      }

      return {
        status,
        latency,
        message: `Elasticsearch cluster status: ${health.status}`,
        details: {
          clusterName: health.cluster_name,
          numberOfNodes: health.number_of_nodes,
          activeShards: health.active_shards,
        },
      };
    } catch (error) {
      this.logger.error("Elasticsearch health check failed", error);
      return {
        status: "unhealthy",
        latency: Date.now() - start,
        message: `Elasticsearch connection failed: ${error.message}`,
      };
    }
  }
}
