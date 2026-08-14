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
import { AdminJwtAuthGuard } from "../../auth/guards/admin-jwt-auth.guard";
import { Roles } from "../../auth/decorators/roles.decorator";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { AdminRoute } from "../../auth/decorators/admin-route.decorator";
import { AdminRole } from "@prisma/client";
import {
  CreateAdPackageDto,
  ExtendBoostDto,
  UpdateAdPackageDto,
} from "../dto/ad-package.dto";

@ApiTags("admin")
@Controller("admin/ad-packages")
@AdminRoute() // Mark as admin route to skip global JwtAuthGuard
@UseGuards(AdminJwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AdminAdPackageController {
  constructor(private readonly service: AdminAdPackageService) {}

  // ==================== BOOST PURCHASES (tracking) ====================
  // NOTE: declared before ":id" routes so "purchases" is not captured as an id param.

  @Get("purchases")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "List boost purchases (who bought what, when)" })
  @ApiQuery({ name: "page", required: false })
  @ApiQuery({ name: "limit", required: false })
  @ApiQuery({ name: "packageId", required: false })
  @ApiQuery({ name: "status", required: false })
  @ApiQuery({ name: "search", required: false })
  @ApiResponse({ status: HttpStatus.OK, description: "Paginated purchases" })
  async listPurchases(
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("packageId") packageId?: string,
    @Query("status") status?: string,
    @Query("search") search?: string,
  ) {
    return this.service.listPurchases({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      packageId,
      status,
      search,
    });
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
