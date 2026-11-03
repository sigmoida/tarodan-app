import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { AdminRole } from "@prisma/client";
import type {
  SellerTrustLabParamsResponse,
  SellerTrustLabPopulation,
  SellerTrustLabScenarioPreset,
  SellerTrustLabScenarioResult,
  SellerTrustLabSeller,
} from "@tarodan/types";
import { AdminJwtAuthGuard } from "../../../auth/guards/admin-jwt-auth.guard";
import { RolesGuard } from "../../../auth/guards/roles.guard";
import { Roles } from "../../../auth/decorators/roles.decorator";
import { AdminRoute } from "../../../auth/decorators/admin-route.decorator";
import { CurrentUser } from "../../../auth/decorators/current-user.decorator";
import { AdminSellerTrustLabService } from "./admin-seller-trust-lab.service";
import {
  SellerTrustLabPopulationDto,
  SellerTrustLabScenarioDto,
  SellerTrustLabSellerDto,
} from "./dto/seller-trust-lab.dto";

/** Per caller address and minute (the throttler counts by IP). */
export const SELLER_TRUST_LAB_THROTTLES = {
  reference: 60,
  seller: 30,
  population: 6,
} as const;

const perMinute = (limit: number) => ({
  default: { limit, ttl: 60_000 },
});

const NO_STORE = "no-store";

/**
 * Seller trust lab (tarodan-ops plan 2026-11-03-seller-trust-score-lab):
 * read-only tools to explain, recompute and simulate the score. Nothing is
 * saved; candidates are evidence for a v2 decision (ADR 0014), never a
 * change to v1.
 *
 * Access (decision D1): super admin and admin, through the permission
 * `seller_trust_lab` (`PERMISSION_MAP["seller-trust-lab"]`). The role check
 * runs first, so a moderator is refused even if the matrix grants the key.
 * Seller and population calls are audited. Every response is `no-store`.
 */
@ApiTags("admin")
@Controller("admin/seller-trust-lab")
@AdminRoute()
@UseGuards(AdminJwtAuthGuard, RolesGuard)
@Roles(AdminRole.super_admin, AdminRole.admin)
@ApiBearerAuth()
export class AdminSellerTrustLabController {
  constructor(private readonly service: AdminSellerTrustLabService) {}

  @Get("params")
  @Throttle(perMinute(SELLER_TRUST_LAB_THROTTLES.reference))
  @Header("Cache-Control", NO_STORE)
  @ApiOperation({
    summary: "Formula v1 params, their limits and the environment",
  })
  @ApiResponse({ status: 200, description: "SellerTrustLabParamsResponse" })
  params(): SellerTrustLabParamsResponse {
    return this.service.params();
  }

  @Get("scenarios")
  @Throttle(perMinute(SELLER_TRUST_LAB_THROTTLES.reference))
  @Header("Cache-Control", NO_STORE)
  @ApiOperation({
    summary: "The approved golden scenarios with their v1 result",
  })
  @ApiResponse({ status: 200, description: "SellerTrustLabScenarioPreset[]" })
  scenarios(): SellerTrustLabScenarioPreset[] {
    return this.service.scenarios();
  }

  @Post("scenario")
  @HttpCode(200)
  @Throttle(perMinute(SELLER_TRUST_LAB_THROTTLES.reference))
  @Header("Cache-Control", NO_STORE)
  @ApiOperation({
    summary:
      "Hypothetical inputs through the formula (no real data, not audited)",
  })
  @ApiResponse({ status: 200, description: "SellerTrustLabScenarioResult" })
  @ApiResponse({ status: 400, description: "Invalid inputs or params" })
  scenario(
    @Body() dto: SellerTrustLabScenarioDto,
  ): SellerTrustLabScenarioResult {
    return this.service.scenario(dto);
  }

  @Post("sellers/:userId")
  @HttpCode(200)
  @Throttle(perMinute(SELLER_TRUST_LAB_THROTTLES.seller))
  @Header("Cache-Control", NO_STORE)
  @ApiOperation({
    summary: "Explain one seller live next to the stored row (audited)",
  })
  @ApiParam({ name: "userId", description: "User ID" })
  @ApiResponse({ status: 200, description: "SellerTrustLabSeller" })
  @ApiResponse({ status: 400, description: "Invalid params" })
  @ApiResponse({ status: 404, description: "Unknown user" })
  seller(
    @CurrentUser("id") actorUserId: string,
    @Param("userId", new ParseUUIDPipe()) userId: string,
    @Body() dto: SellerTrustLabSellerDto,
  ): Promise<SellerTrustLabSeller> {
    return this.service.seller(actorUserId, userId, dto);
  }

  @Post("population")
  @HttpCode(200)
  @Throttle(perMinute(SELLER_TRUST_LAB_THROTTLES.population))
  @Header("Cache-Control", NO_STORE)
  @ApiOperation({
    summary: "A candidate against every stored score (audited)",
  })
  @ApiResponse({ status: 200, description: "SellerTrustLabPopulation" })
  @ApiResponse({ status: 400, description: "Invalid params or filters" })
  @ApiResponse({ status: 422, description: "Too many matching rows" })
  population(
    @CurrentUser("id") actorUserId: string,
    @Body() dto: SellerTrustLabPopulationDto,
  ): Promise<SellerTrustLabPopulation> {
    return this.service.population(actorUserId, dto);
  }
}
