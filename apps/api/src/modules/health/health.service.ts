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
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../prisma";
import { CacheService } from "../cache/cache.service";
import { MembershipTierType } from "@prisma/client";
import { getProcessRole } from "../../process-role";
import { WORKER_HEARTBEAT_KEY } from "./worker-heartbeat.service";

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
    if (process.env.NODE_ENV !== "production") return true;
    if (getProcessRole() !== "web") return true;

    const heartbeat = await this.cacheService.get<{ at?: number }>(
      WORKER_HEARTBEAT_KEY,
    );
    return (
      typeof heartbeat?.at === "number" && Date.now() - heartbeat.at < 60_000
    );
  }

  private async checkOutbox(): Promise<boolean> {
    if (process.env.NODE_ENV !== "production") return true;

    try {
      const staleProcessingBefore = new Date(Date.now() - 5 * 60_000);
      const staleProcessingCount = await this.prisma.outboxEvent.count({
        where: {
          status: "processing",
          updatedAt: { lt: staleProcessingBefore },
        },
      });
      return staleProcessingCount === 0;
    } catch (error) {
      this.logger.error("Outbox readiness check failed", error);
      return false;
    }
  }

  private async checkBusinessConfig(): Promise<boolean> {
    if (process.env.NODE_ENV !== "production") return true;

    try {
      const [
        membershipTierCount,
        commissionRuleCount,
        taxRuleCount,
        shippingTariff,
        platformSeller,
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
        this.prisma.commissionRule.count({ where: { isActive: true } }),
        this.prisma.taxRule.count({ where: { isActive: true } }),
        this.prisma.shippingTariff.findFirst({
          where: { provider: "surat", status: "active" },
          select: { id: true },
        }),
        this.prisma.user.findUnique({
          where: { email: "platform@tarodan.com" },
          select: { id: true },
        }),
      ]);

      return (
        membershipTierCount === 4 &&
        commissionRuleCount > 0 &&
        taxRuleCount > 0 &&
        !!shippingTariff &&
        !!platformSeller
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
