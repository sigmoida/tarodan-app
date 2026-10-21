import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from "@nestjs/swagger";
import { AdminAdPackageService } from "./admin-ad-package.service";
import { AdminBoostOperationsService } from "./boost/admin-boost-operations.service";
import { AdminJwtAuthGuard } from "../../auth/guards/admin-jwt-auth.guard";
import { Roles } from "../../auth/decorators/roles.decorator";
import { RequireAllPermissions } from "../../auth/decorators/require-permission.decorator";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { AdminRoute } from "../../auth/decorators/admin-route.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { AdminRole } from "@prisma/client";
import {
  CreateAdPackageDto,
  ExtendBoostDto,
  GrantBoostDto,
  RefundBoostDto,
  RevokeBoostDto,
  UpdateAdPackageDto,
} from "../dto/ad-package.dto";

@ApiTags("admin")
@Controller("admin/ad-packages")
@AdminRoute() // Mark as admin route to skip global JwtAuthGuard
@UseGuards(AdminJwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AdminAdPackageController {
  constructor(
    private readonly service: AdminAdPackageService,
    private readonly boostOperations: AdminBoostOperationsService,
  ) {}

  // ==================== BOOST PURCHASES (tracking) ====================
  // NOTE: declared before ":id" routes so "purchases" is not captured as an id param.

  @Get("purchases")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "List boost purchases (who bought what, when)" })
  @ApiQuery({ name: "page", required: false })
  @ApiQuery({ name: "limit", required: false })
  @ApiQuery({ name: "packageId", required: false })
  @ApiQuery({ name: "status", required: false })
  @ApiQuery({
    name: "source",
    required: false,
    enum: ["purchase", "admin_grant"],
  })
  @ApiQuery({ name: "search", required: false })
  @ApiResponse({ status: HttpStatus.OK, description: "Paginated purchases" })
  async listPurchases(
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("packageId") packageId?: string,
    @Query("status") status?: string,
    @Query("source") source?: string,
    @Query("search") search?: string,
  ) {
    return this.service.listPurchases({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      packageId,
      status,
      source,
      search,
    });
  }

  // Declared before the ":id" routes so "grant" is never read as an id.
  @Post("purchases/grant")
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({
    summary:
      "Grant a free boost to a live listing (no order, payment or invoice)",
  })
  @ApiResponse({ status: HttpStatus.CREATED, description: "The new grant" })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: "server.admin.boost.grantListingNotActive or validation",
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: "server.product.notFound, server.admin.adPackage.notFound",
  })
  async grantBoost(
    @CurrentUser("id") adminUserId: string,
    @Body() dto: GrantBoostDto,
  ) {
    return this.boostOperations.grant(adminUserId, dto);
  }

  @Get("purchases/:id")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Get boost purchase details and performance" })
  async getPurchase(@Param("id") id: string) {
    return this.service.getPurchase(id);
  }

  @Post("purchases/:id/pause")
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({ summary: "Pause an active boost purchase" })
  async pausePurchase(@Param("id") id: string) {
    return this.service.pausePurchase(id);
  }

  @Post("purchases/:id/resume")
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({ summary: "Resume a paused boost purchase" })
  async resumePurchase(@Param("id") id: string) {
    return this.service.resumePurchase(id);
  }

  @Post("purchases/:id/extend")
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({ summary: "Extend an active or paused boost purchase" })
  async extendPurchase(@Param("id") id: string, @Body() dto: ExtendBoostDto) {
    return this.service.extendPurchase(id, dto.days);
  }

  @Post("purchases/:id/refund")
  @Roles(AdminRole.super_admin, AdminRole.admin)
  // Money leaves the platform: the boost screen's `ads` and the payment
  // screen's `payments`, both (grant and revoke need `ads` only).
  @RequireAllPermissions("ads", "payments")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "Refund a paid active or paused boost (all or part) and stop it at once",
  })
  @ApiResponse({ status: HttpStatus.OK, description: "The stopped purchase" })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description:
      "server.admin.boost.refundNotAllowed, server.admin.boost.refundAmountInvalid, or a PayTR refusal",
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: "The role lacks the ads or the payments permission",
  })
  async refundBoost(
    @Param("id") id: string,
    @CurrentUser("id") adminUserId: string,
    @Body() dto: RefundBoostDto,
  ) {
    return this.boostOperations.refund(adminUserId, id, dto);
  }

  @Post("purchases/:id/revoke")
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Stop a free grant early, without a refund" })
  @ApiResponse({ status: HttpStatus.OK, description: "The stopped grant" })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description:
      "server.admin.boost.revokeGrantOnly, server.admin.boost.stopActiveOrPausedOnly",
  })
  async revokeBoost(
    @Param("id") id: string,
    @CurrentUser("id") adminUserId: string,
    @Body() dto: RevokeBoostDto,
  ) {
    return this.boostOperations.revoke(adminUserId, id, dto);
  }

  // ==================== PACKAGE MANAGEMENT ====================

  @Get()
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "List all ad packages with tiers" })
  @ApiResponse({ status: HttpStatus.OK, description: "List of ad packages" })
  async listPackages() {
    return this.service.listPackages();
  }

  @Post()
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({ summary: "Create a new ad package" })
  @ApiResponse({ status: HttpStatus.CREATED, description: "Package created" })
  async createPackage(@Body() dto: CreateAdPackageDto) {
    return this.service.createPackage(dto);
  }

  @Patch(":id")
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({
    summary: "Update an ad package (tiers replaced wholesale when provided)",
  })
  @ApiParam({ name: "id", description: "Ad package ID" })
  @ApiResponse({ status: HttpStatus.OK, description: "Package updated" })
  async updatePackage(
    @Param("id") id: string,
    @Body() dto: UpdateAdPackageDto,
  ) {
    return this.service.updatePackage(id, dto);
  }

  @Delete(":id")
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Delete an ad package" })
  @ApiParam({ name: "id", description: "Ad package ID" })
  @ApiResponse({ status: HttpStatus.OK, description: "Package deleted" })
  async deletePackage(@Param("id") id: string) {
    return this.service.deletePackage(id);
  }
}
