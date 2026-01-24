import {
  IsString,
  IsEnum,
  IsOptional,
  IsNumber,
  IsBoolean,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MembershipTierType, SubscriptionStatus } from '@prisma/client';

export class SubscribeDto {
  @IsEnum(MembershipTierType)
  tierType: MembershipTierType;

  @IsString()
  billingPeriod: 'monthly' | 'yearly';
}

export class UpdateMembershipTierDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  monthlyPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  yearlyPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  maxFreeListings?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  maxTotalListings?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(20)
  maxImagesPerListing?: number;

  @IsOptional()
  @IsBoolean()
  canCreateCollections?: boolean;

  @IsOptional()
  @IsBoolean()
  canTrade?: boolean;

  @IsOptional()
  @IsBoolean()
  isAdFree?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  featuredListingSlots?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  commissionDiscount?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateMembershipTierDto {
  @IsEnum(MembershipTierType)
  type: MembershipTierType;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  monthlyPrice: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  yearlyPrice: number;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  maxFreeListings: number;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  maxTotalListings: number;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(20)
  maxImagesPerListing: number;

  @IsBoolean()
  canCreateCollections: boolean;

  @IsBoolean()
  canTrade: boolean;

  @IsBoolean()
  isAdFree: boolean;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  featuredListingSlots: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  commissionDiscount: number;
}

export class MembershipTierResponseDto {
  id: string;
  type: MembershipTierType;
  name: string;
  description?: string;
  monthlyPrice: number;
  yearlyPrice: number;
  maxFreeListings: number;
  maxTotalListings: number;
  maxImagesPerListing: number;
  canCreateCollections: boolean;
  canTrade: boolean;
  isAdFree: boolean;
  featuredListingSlots: number;
  commissionDiscount: number;
  isActive: boolean;
}

export class UserMembershipResponseDto {
  id: string;
  userId: string;
  tier: MembershipTierResponseDto;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelledAt?: Date;
  createdAt: Date;
  
  // Computed usage stats
  usedFreeListings: number;
  usedTotalListings: number;
  usedFeaturedSlots: number;
  remainingFreeListings: number;
  remainingTotalListings: number;
  remainingFeaturedSlots: number;
}

export class MembershipLimitsDto {
  canCreateListing: boolean;
  canUseFreeSlot: boolean;
  canTrade: boolean;
  canCreateCollection: boolean;
  maxImages: number;
  maxFreeListings: number;      // Total max free listings for tier
  maxTotalListings: number;     // Total max listings for tier
  remainingFreeListings: number;
  remainingTotalListings: number;
  remainingFeaturedSlots: number;
  commissionDiscount: number;
  tierName: string;
  tierType: MembershipTierType;
}

// Re-export payment DTOs
export * from './membership-payment.dto';