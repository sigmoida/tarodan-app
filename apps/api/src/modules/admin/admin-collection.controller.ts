import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Res,
} from "@nestjs/common";

import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from "@nestjs/swagger";
import { AdminService } from "./admin.service";
import { AdvertisementService } from "../advertisement/advertisement.service";
import { MediaService } from "../media/media.service";
import {
  CreateAdvertisementDto,
  UpdateAdvertisementDto,
  ReorderAdsDto,
} from "../advertisement/dto";
import { DiscountService } from "../discount/discount.service";
import {
  CreateDiscountDto,
  UpdateDiscountDto,
  DiscountQueryDto,
} from "../discount/dto";
import { AdminJwtAuthGuard } from "../auth/guards/admin-jwt-auth.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { RequirePermission } from "../auth/decorators/require-permission.decorator";
import { BypassPermissionMatrix } from "../auth/decorators/bypass-permission-matrix.decorator";
import { RolesGuard } from "../auth/guards/roles.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AdminRoute } from "../auth/decorators/admin-route.decorator";
import { Public } from "../auth/decorators/public.decorator";
import { AdminRole } from "@prisma/client";
import { ForceCompleteOrderDto, ExtendConfirmationDto } from "../order/dto";
import {
  OverrideRefundPolicyDto,
  SetReturnShippingPayerDto,
} from "../refund/dto";
import {
  CreateCommissionRuleDto,
  UpdateCommissionRuleDto,
  CommissionRuleResponseDto,
  UpdatePlatformSettingDto,
  PlatformSettingResponseDto,
  AdminUserQueryDto,
  AdminProductQueryDto,
  AdminOrderQueryDto,
  AuditLogQueryDto,
  ApproveProductDto,
  RejectProductDto,
  BanUserDto,
  AssignAdminStaffDto,
  UpdateAdminStaffDto,
  UpdateStaffSettingsDto,
  SetRolePermissionsDto,
  ResolveDisputeDto,
  AnalyticsQueryDto,
  UpdateOrderStatusDto,
  ReportQueryDto,
  AdminPaymentQueryDto,
  PaymentStatisticsQueryDto,
  PayoutTransactionsQueryDto,
  PayoutExportQueryDto,
  CreateTaxRegionDto,
  UpdateTaxRegionDto,
  CreateTaxRateDto,
  UpdateTaxRateDto,
  CreateTaxRuleDto,
  UpdateTaxRuleDto,
  TaxReportQueryDto,
  CreateStaticPageDto,
  UpdateStaticPageDto,
  UpdateEmailTemplateDto,
  UpdateProductDto,
  SendTestEmailDto,
  RatingQueryDto,
  UpdateRatingStatusDto,
  ApproveWarehouseTradeDto,
  RejectWarehouseTradeDto,
  MarkShipmentDto,
  MarkReturnLostDto,
  ForceCancelStuckDto,
  TradeShipmentQueryDto,
  RefundRequestQueryDto,
  AdminChangeMembershipDto,
  AdminCollectionQueryDto,
} from "./dto";

@ApiTags("admin")
@Controller("admin")
@AdminRoute() // Mark as admin route to skip global JwtAuthGuard
@UseGuards(AdminJwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AdminCollectionController {
  constructor(private readonly adminService: AdminService) {}

  // ==================== COLLECTION MANAGEMENT ====================

  @Get("collections")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Get all collections with filters" })
  @ApiResponse({ status: HttpStatus.OK, description: "List of collections" })
  async getCollections(@Query() query: AdminCollectionQueryDto) {
    return this.adminService.getCollections(query);
  }

  @Get("collections/:id")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Get collection details" })
  @ApiParam({ name: "id", description: "Collection ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Collection details with items",
  })
  async getCollectionById(@Param("id") id: string) {
    return this.adminService.getCollectionById(id);
  }

  @Post("collections")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Create a new collection" })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: "Collection created",
  })
  async createCollection(
    @CurrentUser("id") adminId: string,
    @Body()
    body: {
      name: string;
      description?: string;
      isPublic?: boolean;
      isFeatured?: boolean;
      coverImageUrl?: string;
      userId?: string;
    },
  ) {
    return this.adminService.createAdminCollection(adminId, body);
  }

  @Patch("collections/:id")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Update a collection" })
  @ApiParam({ name: "id", description: "Collection ID" })
  @ApiResponse({ status: HttpStatus.OK, description: "Collection updated" })
  async updateCollection(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
    @Body()
    body: {
      name?: string;
      description?: string;
      isPublic?: boolean;
      isFeatured?: boolean;
      coverImageUrl?: string;
    },
  ) {
    return this.adminService.updateAdminCollection(adminId, id, body);
  }

  @Delete("collections/:id")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete a collection" })
  @ApiParam({ name: "id", description: "Collection ID" })
  async deleteCollection(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
  ) {
    return this.adminService.deleteAdminCollection(adminId, id);
  }

  @Post("collections/:id/items")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Add products to a collection" })
  @ApiParam({ name: "id", description: "Collection ID" })
  @ApiResponse({ status: HttpStatus.OK, description: "Products added" })
  async addItemsToCollection(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
    @Body() body: { productIds: string[] },
  ) {
    return this.adminService.addItemsToCollection(adminId, id, body.productIds);
  }

  @Delete("collections/:collectionId/items/:itemId")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Remove an item from a collection" })
  @ApiParam({ name: "collectionId", description: "Collection ID" })
  @ApiParam({ name: "itemId", description: "Collection Item ID" })
  async removeItemFromCollection(
    @Param("collectionId") collectionId: string,
    @Param("itemId") itemId: string,
    @CurrentUser("id") adminId: string,
  ) {
    return this.adminService.removeItemFromAdminCollection(
      adminId,
      collectionId,
      itemId,
    );
  }

  @Patch("collections/:id/visibility")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Set collection visibility" })
  @ApiParam({ name: "id", description: "Collection ID" })
  async setCollectionVisibility(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
    @Body() body: { isPublic: boolean },
  ) {
    return this.adminService.setCollectionVisibility(
      adminId,
      id,
      body.isPublic,
    );
  }

  @Patch("collections/:id/featured")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Set collection featured status" })
  @ApiParam({ name: "id", description: "Collection ID" })
  async setCollectionFeatured(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
    @Body() body: { isFeatured: boolean },
  ) {
    return this.adminService.setCollectionFeatured(
      adminId,
      id,
      body.isFeatured,
    );
  }
}
