/**
 * Health Check Controller
 * Provides comprehensive health check endpoints for monitoring
 *
 * Architecture: All three clients (Web, Mobile, Admin) communicate through
 * this API Gateway to PostgreSQL, Redis, and Elasticsearch
 */
import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { HealthService, DetailedHealthResponse } from "./health.service";
import { Public } from "../auth/decorators/public.decorator";
import { AdminRoute, Roles } from "../auth/decorators";
import { AdminAuthGuard, RolesGuard } from "../auth/guards";

@ApiTags("Health")
@Controller("health")
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /**
   * Basic health check - returns 200 if API is running
   */
  @Get()
  @Public()
  @ApiOperation({ summary: "Basic health check" })
  @ApiResponse({ status: 200, description: "API is healthy" })
  async check() {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      service: "tarodan-api",
      version: process.env.npm_package_version || "1.0.0",
    };
  }

  /**
   * Detailed health check - checks all service connections
   */
  @Get("detailed")
  @AdminRoute()
  @Roles("super_admin", "admin")
  @UseGuards(AdminAuthGuard, RolesGuard)
  @ApiOperation({ summary: "Detailed health check with service status" })
  @ApiResponse({ status: 200, description: "Detailed health status" })
  async detailedCheck(): Promise<DetailedHealthResponse> {
    return this.healthService.getDetailedHealth();
  }

  /**
   * Liveness probe - for Kubernetes/Docker health checks
   */
  @Get("live")
  @Public()
  @ApiOperation({ summary: "Liveness probe" })
  @ApiResponse({ status: 200, description: "Service is alive" })
  async liveness() {
    return { status: "alive", timestamp: new Date().toISOString() };
  }

  /**
   * Readiness probe - checks if service is ready to accept traffic
   */
  @Get("ready")
  @Public()
  @ApiOperation({ summary: "Readiness probe" })
  @ApiResponse({ status: 200, description: "Service is ready" })
  @ApiResponse({ status: 503, description: "Service is not ready" })
  async readiness() {
    return this.healthService.checkReadiness();
  }
}
