import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Request,
  Query,
  Req,
} from '@nestjs/common';
import { Request as ExpressRequest } from 'express';
import { MembershipService } from './membership.service';
import {
  SubscribeDto,
  CreateMembershipTierDto,
  UpdateMembershipTierDto,
  MembershipTierResponseDto,
  UserMembershipResponseDto,
  MembershipLimitsDto,
  InitiateMembershipPaymentDto,
  MembershipPaymentInitResponseDto,
} from './dto';
import { PaymentProvider } from '../payment/dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { AdminRole, MembershipTierType } from '@prisma/client';

@Controller('membership')
export class MembershipController {
  constructor(private readonly membershipService: MembershipService) {}

  /**
   * Get all available membership tiers (public)
   * GET /membership/tiers
   */
  @Public()
  @Get('tiers')
  async getAllTiers(): Promise<MembershipTierResponseDto[]> {
    return this.membershipService.getAllTiers(false);
  }

  /**
   * Get a specific tier by type
   * GET /membership/tiers/:type
   */
  @Public()
  @Get('tiers/:type')
  async getTierByType(
    @Param('type') type: MembershipTierType,
  ): Promise<MembershipTierResponseDto> {
    return this.membershipService.getTierByType(type);
  }

  /**
   * Get current user's membership
   * GET /membership/me
   */
  @Get('me')
  async getMyMembership(
    @Request() req: any,
  ): Promise<UserMembershipResponseDto> {
    return this.membershipService.getUserMembership(req.user.id);
  }

  /**
   * Get current user's limits
   * GET /membership/me/limits
   */
  @Get('me/limits')
  async getMyLimits(@Request() req: any): Promise<MembershipLimitsDto> {
    return this.membershipService.getUserLimits(req.user.id);
  }

  /**
   * Subscribe to a membership tier
   * POST /membership/subscribe
   */
  @Post('subscribe')
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
  @Post('payments/initiate')
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
  @Post('cancel')
  async cancelSubscription(
    @Request() req: any,
  ): Promise<UserMembershipResponseDto> {
    return this.membershipService.cancelSubscription(req.user.id);
  }

  // ==========================================================================
  // ADMIN ENDPOINTS
  // ==========================================================================

  /**
   * Get all tiers including inactive (Admin)
   * GET /membership/admin/tiers
   */
  @Get('admin/tiers')
  @Roles(AdminRole.admin, AdminRole.super_admin)
  async getAllTiersAdmin(
    @Query('includeInactive') includeInactive?: boolean,
  ): Promise<MembershipTierResponseDto[]> {
    return this.membershipService.getAllTiers(includeInactive);
  }

  /**
   * Create a new membership tier (Admin)
   * POST /membership/admin/tiers
   */
  @Post('admin/tiers')
  @Roles(AdminRole.super_admin)
  async createTier(
    @Body() dto: CreateMembershipTierDto,
  ): Promise<MembershipTierResponseDto> {
    return this.membershipService.createTier(dto);
  }

  /**
   * Update a membership tier (Admin)
   * PATCH /membership/admin/tiers/:type
   */
  @Patch('admin/tiers/:type')
  @Roles(AdminRole.super_admin)
  async updateTier(
    @Param('type') type: MembershipTierType,
    @Body() dto: UpdateMembershipTierDto,
  ): Promise<MembershipTierResponseDto> {
    return this.membershipService.updateTier(type, dto);
  }

  /**
   * Check can create listing
   * GET /membership/check/listing
   */
  @Get('check/listing')
  async checkCanCreateListing(@Request() req: any) {
    return this.membershipService.canCreateListing(req.user.id);
  }

  /**
   * Check can create trade
   * GET /membership/check/trade
   */
  @Get('check/trade')
  async checkCanCreateTrade(@Request() req: any) {
    return this.membershipService.canCreateTrade(req.user.id);
  }

  /**
   * Check can create collection
   * GET /membership/check/collection
   */
  @Get('check/collection')
  async checkCanCreateCollection(@Request() req: any) {
    return this.membershipService.canCreateCollection(req.user.id);
  }
}
