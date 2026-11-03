import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { AdminRole } from "@prisma/client";
import type {
  AdminInstallmentPreviewResponse,
  AdminInstallmentRule,
  AdminInstallmentRuleWriteResponse,
  AdminInstallmentSettings,
} from "@tarodan/types";
import { AdminJwtAuthGuard } from "../../auth/guards/admin-jwt-auth.guard";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { Roles } from "../../auth/decorators/roles.decorator";
import { AdminRoute } from "../../auth/decorators/admin-route.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { UuidParam } from "../../../common/pipes/uuid-param.decorator";
import { AdminInstallmentsService } from "./admin-installments.service";
import {
  InstallmentPreviewQueryDto,
  InstallmentRuleDto,
  UpdateInstallmentSettingsDto,
} from "./dto/installments.dto";

/**
 * Finance > Installments (ADR 0019): the kill switch and minimum amount, the
 * segment rule versions and the price preview. Reads for super_admin and
 * admin (permission matrix segment `installments` -> `payments`, the finance
 * menu key); every write is money configuration and super_admin only, with
 * a required audit row. The generic `PATCH /admin/settings` refuses the two
 * installment keys.
 */
@ApiTags("admin")
@Controller("admin")
@AdminRoute()
@UseGuards(AdminJwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AdminInstallmentsController {
  constructor(private readonly service: AdminInstallmentsService) {}

  @Get("installments/settings")
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({
    summary: "Installment settings and the latest PayTR rate snapshot",
  })
  @ApiResponse({ status: 200, description: "AdminInstallmentSettings" })
  getSettings(): Promise<AdminInstallmentSettings> {
    return this.service.getSettings();
  }

  @Patch("installments/settings")
  @Roles(AdminRole.super_admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "Change the kill switch and/or the minimum amount (super_admin, audited)",
  })
  @ApiResponse({ status: 200, description: "AdminInstallmentSettings" })
  @ApiResponse({ status: 400, description: "Minimum amount out of bounds" })
  updateSettings(
    @CurrentUser("id") userId: string,
    @Body() dto: UpdateInstallmentSettingsDto,
  ): Promise<AdminInstallmentSettings> {
    return this.service.updateSettings(userId, dto);
  }

  @Get("installments/rules")
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({ summary: "Every installment rule version with its status" })
  @ApiResponse({ status: 200, description: "AdminInstallmentRule[]" })
  listRules(): Promise<AdminInstallmentRule[]> {
    return this.service.listRules();
  }

  @Post("installments/rules")
  @Roles(AdminRole.super_admin)
  @ApiOperation({ summary: "Create a rule (version 1; super_admin, audited)" })
  @ApiResponse({
    status: 201,
    description: "AdminInstallmentRuleWriteResponse (overlaps: a warning)",
  })
  @ApiResponse({ status: 400, description: "Rule validation (catalog key)" })
  createRule(
    @CurrentUser("id") userId: string,
    @Body() dto: InstallmentRuleDto,
  ): Promise<AdminInstallmentRuleWriteResponse> {
    return this.service.createRule(userId, dto);
  }

  @Post("installments/rules/:id/versions")
  @Roles(AdminRole.super_admin)
  @ApiOperation({
    summary:
      "Edit = archive this version and create the next one, atomically (super_admin, audited)",
  })
  @ApiResponse({
    status: 201,
    description: "AdminInstallmentRuleWriteResponse",
  })
  @ApiResponse({ status: 404, description: "Unknown rule version" })
  @ApiResponse({ status: 409, description: "The version is no longer current" })
  createRuleVersion(
    @CurrentUser("id") userId: string,
    @UuidParam("id") id: string,
    @Body() dto: InstallmentRuleDto,
  ): Promise<AdminInstallmentRuleWriteResponse> {
    return this.service.createRuleVersion(userId, id, dto);
  }

  @Post("installments/rules/:id/archive")
  @Roles(AdminRole.super_admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Remove = archive the current version (super_admin, audited)",
  })
  @ApiResponse({
    status: 200,
    description: "AdminInstallmentRuleWriteResponse",
  })
  @ApiResponse({ status: 404, description: "Unknown rule version" })
  @ApiResponse({ status: 409, description: "The version is no longer current" })
  archiveRule(
    @CurrentUser("id") userId: string,
    @UuidParam("id") id: string,
  ): Promise<AdminInstallmentRuleWriteResponse> {
    return this.service.archiveRule(userId, id);
  }

  @Get("installments/preview")
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({
    summary:
      "Option table (C, F, monthly, P) for a segment, amount and card family, optionally with a draft rule",
  })
  @ApiResponse({ status: 200, description: "AdminInstallmentPreviewResponse" })
  preview(
    @Query() query: InstallmentPreviewQueryDto,
  ): Promise<AdminInstallmentPreviewResponse> {
    return this.service.preview(query);
  }
}
