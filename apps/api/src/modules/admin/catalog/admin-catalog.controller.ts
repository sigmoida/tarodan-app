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
import { AdminService } from "../admin.service";
import { AdvertisementService } from "../../advertisement/advertisement.service";
import { MediaService } from "../../media/media.service";
import {
  CreateAdvertisementDto,
  UpdateAdvertisementDto,
  ReorderAdsDto,
} from "../../advertisement/dto";
import { DiscountService } from "../../discount/discount.service";
import {
  CreateDiscountDto,
  UpdateDiscountDto,
  DiscountQueryDto,
} from "../../discount/dto";
import { AdminJwtAuthGuard } from "../../auth/guards/admin-jwt-auth.guard";
import { Roles } from "../../auth/decorators/roles.decorator";
import { RequirePermission } from "../../auth/decorators/require-permission.decorator";
import { BypassPermissionMatrix } from "../../auth/decorators/bypass-permission-matrix.decorator";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { AdminRoute } from "../../auth/decorators/admin-route.decorator";
import { Public } from "../../auth/decorators/public.decorator";
import { AdminRole } from "@prisma/client";
import { ForceCompleteOrderDto, ExtendConfirmationDto } from "../../order/dto";
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
  AdminCategoryQueryDto,
  AdminBrandQueryDto,
  AdminManufacturerQueryDto,
  AdminCarModelQueryDto,
  AdminAttributeGroupQueryDto,
  AdminAttributeQueryDto,
  CreateAttributeDto,
  UpdateAttributeDto,
} from "../dto";

@ApiTags("admin")
@Controller("admin")
@AdminRoute() // Mark as admin route to skip global JwtAuthGuard
@UseGuards(AdminJwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AdminCatalogController {
  constructor(private readonly adminService: AdminService) {}

  // ==================== CATEGORY MANAGEMENT ====================

  @Get("categories")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Get all categories with tree structure" })
  @ApiQuery({ name: "page", required: false })
  @ApiQuery({ name: "limit", required: false })
  @ApiQuery({ name: "search", required: false })
  @ApiResponse({ status: HttpStatus.OK, description: "List of categories" })
  async getCategories(@Query() query: AdminCategoryQueryDto) {
    return this.adminService.getCategories(query);
  }

  @Post("categories")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Create a new category" })
  @ApiResponse({ status: HttpStatus.CREATED, description: "Category created" })
  async createCategory(
    @CurrentUser("id") adminId: string,
    @Body()
    body: {
      name: string;
      description?: string;
      parentId?: string;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    return this.adminService.createCategory(adminId, body);
  }

  @Patch("categories/:id")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Update category" })
  @ApiParam({ name: "id", description: "Category ID" })
  @ApiResponse({ status: HttpStatus.OK, description: "Category updated" })
  async updateCategory(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
    @Body()
    body: {
      name?: string;
      description?: string;
      parentId?: string;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    return this.adminService.updateCategory(adminId, id, body);
  }

  @Delete("categories/:id")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Delete category" })
  @ApiParam({ name: "id", description: "Category ID" })
  @ApiResponse({ status: HttpStatus.OK, description: "Category deleted" })
  async deleteCategory(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
  ) {
    return this.adminService.deleteCategory(adminId, id);
  }

  // ==================== BRAND MANAGEMENT ====================

  @Get("brands")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Get all brands" })
  @ApiQuery({ name: "page", required: false })
  @ApiQuery({ name: "limit", required: false })
  @ApiQuery({ name: "search", required: false })
  @ApiQuery({ name: "status", required: false })
  @ApiResponse({ status: HttpStatus.OK, description: "List of brands" })
  async getBrands(@Query() query: AdminBrandQueryDto) {
    return this.adminService.getBrands(query);
  }

  @Post("brands")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Create a new brand" })
  @ApiResponse({ status: HttpStatus.CREATED, description: "Brand created" })
  async createBrand(
    @CurrentUser("id") adminId: string,
    @Body()
    body: {
      name: string;
      logo?: string;
      description?: string;
      website?: string;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    return this.adminService.createBrand(adminId, body);
  }

  @Patch("brands/:id")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Update brand" })
  @ApiParam({ name: "id", description: "Brand ID" })
  @ApiResponse({ status: HttpStatus.OK, description: "Brand updated" })
  async updateBrand(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
    @Body()
    body: {
      name?: string;
      logo?: string;
      description?: string;
      website?: string;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    return this.adminService.updateBrand(adminId, id, body);
  }

  @Delete("brands/:id")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Delete brand" })
  @ApiParam({ name: "id", description: "Brand ID" })
  @ApiResponse({ status: HttpStatus.OK, description: "Brand deleted" })
  async deleteBrand(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
  ) {
    return this.adminService.deleteBrand(adminId, id);
  }

  // ==================== MANUFACTURER MANAGEMENT ====================

  @Get("manufacturers")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Get all manufacturers" })
  @ApiQuery({ name: "page", required: false })
  @ApiQuery({ name: "limit", required: false })
  @ApiQuery({ name: "search", required: false })
  @ApiResponse({ status: HttpStatus.OK, description: "List of manufacturers" })
  async getManufacturers(@Query() query: AdminManufacturerQueryDto) {
    return this.adminService.getManufacturers(query);
  }

  @Post("manufacturers")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Create a new manufacturer" })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: "Manufacturer created",
  })
  async createManufacturer(
    @CurrentUser("id") adminId: string,
    @Body()
    body: {
      name: string;
      logo?: string;
      description?: string;
      website?: string;
      country?: string;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    return this.adminService.createManufacturer(adminId, body);
  }

  @Patch("manufacturers/:id")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Update manufacturer" })
  @ApiParam({ name: "id", description: "Manufacturer ID" })
  @ApiResponse({ status: HttpStatus.OK, description: "Manufacturer updated" })
  async updateManufacturer(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
    @Body()
    body: {
      name?: string;
      logo?: string;
      description?: string;
      website?: string;
      country?: string;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    return this.adminService.updateManufacturer(adminId, id, body);
  }

  @Delete("manufacturers/:id")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Delete manufacturer" })
  @ApiParam({ name: "id", description: "Manufacturer ID" })
  @ApiResponse({ status: HttpStatus.OK, description: "Manufacturer deleted" })
  async deleteManufacturer(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
  ) {
    return this.adminService.deleteManufacturer(adminId, id);
  }

  // ==================== CAR MODEL MANAGEMENT ====================

  @Get("car-models")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Get all car models" })
  @ApiQuery({ name: "brandId", required: false })
  @ApiQuery({ name: "page", required: false })
  @ApiQuery({ name: "limit", required: false })
  @ApiQuery({ name: "search", required: false })
  @ApiResponse({ status: HttpStatus.OK, description: "List of car models" })
  async getCarModels(@Query() query: AdminCarModelQueryDto) {
    return this.adminService.getCarModels(query);
  }

  @Post("car-models")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Create a new car model" })
  @ApiResponse({ status: HttpStatus.CREATED, description: "Car model created" })
  async createCarModel(
    @CurrentUser("id") adminId: string,
    @Body()
    body: {
      brandId: string;
      name: string;
      slug?: string;
      yearStart?: number;
      yearEnd?: number;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    return this.adminService.createCarModel(adminId, body);
  }

  @Patch("car-models/:id")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Update car model" })
  @ApiParam({ name: "id", description: "Car Model ID" })
  @ApiResponse({ status: HttpStatus.OK, description: "Car model updated" })
  async updateCarModel(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
    @Body()
    body: {
      name?: string;
      slug?: string;
      yearStart?: number;
      yearEnd?: number;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    return this.adminService.updateCarModel(adminId, id, body);
  }

  @Delete("car-models/:id")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Delete car model" })
  @ApiParam({ name: "id", description: "Car Model ID" })
  @ApiResponse({ status: HttpStatus.OK, description: "Car model deleted" })
  async deleteCarModel(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
  ) {
    return this.adminService.deleteCarModel(adminId, id);
  }

  // ==================== ATTRIBUTE GROUP MANAGEMENT ====================

  @Get("attribute-groups")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Get all attribute groups" })
  @ApiQuery({ name: "search", required: false })
  @ApiQuery({ name: "isActive", required: false })
  @ApiQuery({ name: "page", required: false })
  @ApiQuery({ name: "limit", required: false })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "List of attribute groups",
  })
  async getAttributeGroups(@Query() query: AdminAttributeGroupQueryDto) {
    return this.adminService.getAttributeGroups(query);
  }

  @Get("attribute-groups/:id")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Get attribute group with its values" })
  @ApiParam({ name: "id", description: "Attribute Group ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Attribute group details",
  })
  async getAttributeGroupById(@Param("id") id: string) {
    return this.adminService.getAttributeGroupById(id);
  }

  @Post("attribute-groups")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Create a new attribute group" })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: "Attribute group created",
  })
  async createAttributeGroup(
    @CurrentUser("id") adminId: string,
    @Body()
    body: {
      name: string;
      description?: string;
      isRequired?: boolean;
      isActive?: boolean;
      sortOrder?: number;
    },
  ) {
    return this.adminService.createAttributeGroup(adminId, body);
  }

  @Patch("attribute-groups/:id")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Update an attribute group" })
  @ApiParam({ name: "id", description: "Attribute Group ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Attribute group updated",
  })
  async updateAttributeGroup(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
    @Body()
    body: {
      name?: string;
      description?: string;
      isRequired?: boolean;
      isActive?: boolean;
      sortOrder?: number;
    },
  ) {
    return this.adminService.updateAttributeGroup(adminId, id, body);
  }

  @Delete("attribute-groups/:id")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete an attribute group" })
  @ApiParam({ name: "id", description: "Attribute Group ID" })
  async deleteAttributeGroup(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
  ) {
    return this.adminService.deleteAttributeGroup(adminId, id);
  }

  // ==================== ATTRIBUTE VALUE MANAGEMENT ====================

  @Get("attributes")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Get all attributes with filters" })
  @ApiQuery({ name: "groupId", required: false })
  @ApiQuery({ name: "search", required: false })
  @ApiQuery({ name: "isActive", required: false })
  @ApiQuery({ name: "page", required: false })
  @ApiQuery({ name: "limit", required: false })
  @ApiResponse({ status: HttpStatus.OK, description: "List of attributes" })
  async getAttributes(@Query() query: AdminAttributeQueryDto) {
    return this.adminService.getAttributes(query);
  }

  @Post("attributes")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Create a new attribute value" })
  @ApiResponse({ status: HttpStatus.CREATED, description: "Attribute created" })
  async createAttribute(
    @CurrentUser("id") adminId: string,
    @Body() body: CreateAttributeDto,
  ) {
    return this.adminService.createAttribute(adminId, body);
  }

  @Patch("attributes/:id")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Update an attribute value" })
  @ApiParam({ name: "id", description: "Attribute ID" })
  @ApiResponse({ status: HttpStatus.OK, description: "Attribute updated" })
  async updateAttribute(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
    @Body() body: UpdateAttributeDto,
  ) {
    return this.adminService.updateAttribute(adminId, id, body);
  }

  @Delete("attributes/:id")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete an attribute value" })
  @ApiParam({ name: "id", description: "Attribute ID" })
  async deleteAttribute(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
  ) {
    return this.adminService.deleteAttribute(adminId, id);
  }
}
