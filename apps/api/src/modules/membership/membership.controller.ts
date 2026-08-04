import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Request,
  Query,
  Req,
  UseGuards,
  ParseEnumPipe,
} from "@nestjs/common";
import { Request as ExpressRequest } from "express";
import { MembershipService } from "./membership.service";
import {
  SubscribeDto,
  CreateMembershipTierDto,
  UpdateMembershipTierDto,
  ToggleAutoRenewDto,
  MembershipTierResponseDto,
  UserMembershipResponseDto,
  MembershipLimitsDto,
  InitiateMembershipPaymentDto,
  MembershipPaymentInitResponseDto,
} from "./dto";
import { Roles } from "../auth/decorators/roles.decorator";
import { Public } from "../auth/decorators/public.decorator";
import { AdminRoute } from "../auth/decorators/admin-route.decorator";
import { RequirePermission } from "../auth/decorators/require-permission.decorator";
import { AdminJwtAuthGuard } from "../auth/guards/admin-jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { AdminRole, MembershipTierType } from "@prisma/client";

@Controller("membership")
export class MembershipController {
  constructor(private readonly membershipService: MembershipService) {}

  /**
   * Get all available membership tiers (public)
   * GET /membership/tiers
   */
  @Public()
  @Get("tiers")
  async getAllTiers(): Promise<MembershipTierResponseDto[]> {
    return this.membershipService.getAllTiers(false);
  }

  /**
   * Get a specific tier by type
   * GET /membership/tiers/:type
   */
  @Public()
  @Get("tiers/:type")
  async getTierByType(
    @Param("type", new ParseEnumPipe(MembershipTierType))
    type: MembershipTierType,
  ): Promise<MembershipTierResponseDto> {
    return this.membershipService.getTierByType(type);
  }

  /**
   * Get current user's membership
   * GET /membership/me
   */
  @Get("me")
  async getMyMembership(
    @Request() req: any,
  ): Promise<UserMembershipResponseDto> {
    return this.membershipService.getUserMembership(req.user.id);
  }

  /**
   * Get current user's limits
   * GET /membership/me/limits
   */
  @Get("me/limits")
  async getMyLimits(@Request() req: any): Promise<MembershipLimitsDto> {
    return this.membershipService.getUserLimits(req.user.id);
  }

  /**
   * Subscribe to a membership tier
   * POST /membership/subscribe
   */
  @Post("subscribe")
  async subscribe(
    @Request() req: any,
    @Body() dto: SubscribeDto,
  ): Promise<UserMembershipResponseDto> {
    return this.membershipService.subscribe(req.user.id, dto);
  }

  /**
   * Initiate payment for membership subscription
   * POST /membership/payments/initiate
   */
  @Post("payments/initiate")
  async initiateMembershipPayment(
    @Request() req: any,
    @Body() dto: InitiateMembershipPaymentDto,
    @Req() expressReq: ExpressRequest,
  ): Promise<MembershipPaymentInitResponseDto> {
    return this.membershipService.initiateMembershipPayment(
      req.user.id,
      dto.provider,
      expressReq,
    );
  }

  /**
   * Cancel subscription
   * POST /membership/cancel
   */
  @Post("cancel")
  async cancelSubscription(
    @Request() req: any,
  ): Promise<UserMembershipResponseDto> {
    return this.membershipService.cancelSubscription(req.user.id);
  }

  /**
   * Bekleyen plan değişikliğini (ertelemeli downgrade / period) iptal et
   * POST /membership/cancel-scheduled-change
   */
  @Post("cancel-scheduled-change")
  async cancelScheduledChange(
    @Request() req: any,
  ): Promise<UserMembershipResponseDto> {
    return this.membershipService.cancelScheduledChange(req.user.id);
  }

  /**
   * Toggle auto-renew setting
   * PATCH /membership/auto-renew
   */
  @Patch("auto-renew")
  async toggleAutoRenew(
    @Request() req: any,
    @Body() dto: ToggleAutoRenewDto,
  ): Promise<UserMembershipResponseDto> {
    return this.membershipService.toggleAutoRenew(req.user.id, dto.autoRenew);
  }

  // ==========================================================================
  // SAVED CARDS (CAPI) — kayıtlı kart yönetimi
  // ==========================================================================

  /**
   * Kullanıcının kayıtlı kartlarını listele (oto-yenileme için).
   * GET /membership/cards
   */
  @Get("cards")
  async listSavedCards(@Request() req: any) {
    return this.membershipService.listSavedCards(req.user.id);
  }

  /** PayTR silmeyi onayladıktan sonra yerelde revoke eder. */
  @Delete("cards/:id")
  async deleteSavedCard(
    @Request() req: any,
    @Param("id") id: string,
  ): Promise<{ deleted: boolean }> {
    return this.membershipService.deleteSavedCard(req.user.id, id);
  }

  // ==========================================================================
  // ADMIN ENDPOINTS
  // ==========================================================================

  /**
   * Get all tiers including inactive (Admin)
   * GET /membership/admin/tiers
   */
  @Get("admin/tiers")
  @AdminRoute()
  @UseGuards(AdminJwtAuthGuard, RolesGuard)
  @Roles(AdminRole.admin, AdminRole.super_admin)
  @RequirePermission("membership_tiers")
  async getAllTiersAdmin(
    @Query("includeInactive") includeInactive?: boolean,
  ): Promise<MembershipTierResponseDto[]> {
    return this.membershipService.getAllTiers(includeInactive);
  }

  /**
   * Create a new membership tier (Admin)
   * POST /membership/admin/tiers
   */
  @Post("admin/tiers")
  @AdminRoute()
  @UseGuards(AdminJwtAuthGuard, RolesGuard)
  @Roles(AdminRole.super_admin)
  @RequirePermission("membership_tiers")
  async createTier(
    @Body() dto: CreateMembershipTierDto,
  ): Promise<MembershipTierResponseDto> {
    return this.membershipService.createTier(dto);
  }

  /**
   * Update a membership tier (Admin)
   * PATCH /membership/admin/tiers/:type
   */
  @Patch("admin/tiers/:type")
  @AdminRoute()
  @UseGuards(AdminJwtAuthGuard, RolesGuard)
  @Roles(AdminRole.super_admin)
  @RequirePermission("membership_tiers")
  async updateTier(
    @Param("type", new ParseEnumPipe(MembershipTierType))
    type: MembershipTierType,
    @Body() dto: UpdateMembershipTierDto,
  ): Promise<MembershipTierResponseDto> {
    return this.membershipService.updateTier(type, dto);
  }

  /**
   * Check can create listing
   * GET /membership/check/listing
   */
  @Get("check/listing")
  async checkCanCreateListing(@Request() req: any) {
    return this.membershipService.canCreateListing(req.user.id);
  }

  /**
   * Check can create trade
   * GET /membership/check/trade
   */
  @Get("check/trade")
  async checkCanCreateTrade(@Request() req: any) {
    return this.membershipService.canCreateTrade(req.user.id);
  }

  /**
   * Check can create collection
   * GET /membership/check/collection
   */
  @Get("check/collection")
  async checkCanCreateCollection(@Request() req: any) {
    return this.membershipService.canCreateCollection(req.user.id);
  }
}
