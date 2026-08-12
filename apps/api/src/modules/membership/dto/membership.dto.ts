import {
  IsString,
  IsEnum,
  IsOptional,
  IsNumber,
  IsBoolean,
  Min,
  Max,
  MaxLength,
  IsNotEmpty,
  IsIn,
} from "class-validator";
import { Type } from "class-transformer";
import { MembershipTierType, SubscriptionStatus } from "@prisma/client";

export class SubscribeDto {
  @IsEnum(MembershipTierType)
  tierType: MembershipTierType;

  @IsString()
  @IsIn(["monthly", "yearly"])
  billingPeriod: "monthly" | "yearly";
}

export class ToggleAutoRenewDto {
  @IsBoolean()
  autoRenew: boolean;
}

export class UpdateMembershipTierDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1000000)
  monthlyPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(12000000)
  yearlyPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  maxFreeListings?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-1)
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
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(10000)
  sortOrder?: number;
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

  /**
   * DEVRE DIŞI: banner'lar herkese gösterilir. Kolon geriye uyum için duruyor;
   * yeni yanıtlarda doldurulmaz ve hiçbir yerde okunmaz.
   */
  isAdFree?: boolean;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  /** DEVRE DIŞI: öne çıkarmayı ücretli paketler devraldı; değer yazılsa da okunmaz. */
  featuredListingSlots?: number;
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
  /**
   * DEVRE DIŞI: banner'lar herkese gösterilir. Kolon geriye uyum için duruyor;
   * yeni yanıtlarda doldurulmaz ve hiçbir yerde okunmaz.
   */
  isAdFree?: boolean;
  /** DEVRE DIŞI (isAdFree gibi): yeni yanıtlarda doldurulmaz, hiçbir yerde okunmaz. */
  featuredListingSlots?: number;
  isActive: boolean;
}

export class UserMembershipResponseDto {
  id: string;
  userId: string;
  tier: MembershipTierResponseDto;
  status: SubscriptionStatus;
  autoRenew: boolean;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelledAt?: Date;
  createdAt: Date;
  /** Ödeme beklerken (past_due) yükseltilmek istenen plan adı */
  pendingTierName?: string;
  /** Ödeme niyetinin hedef plan tipi */
  pendingTierType?: MembershipTierType;
  /** Ödeme bekleniyor – üyelik sayfasında "satın alınmış" gibi gösterme */
  pendingPayment?: boolean;
  /** Ertelemeli downgrade: dönem sonunda geçilecek tier (null/yoksa bekleyen yok) */
  scheduledTierType?: MembershipTierType;
  /** Ertelemeli period değişimi: dönem sonunda geçilecek periyot ('monthly'|'yearly') */
  scheduledBillingPeriod?: string;
  paymentId?: string;
  orderId?: string;
  provider?: string;
  useBypass?: boolean;
  // Computed usage stats
  usedFreeListings: number;
  usedTotalListings: number;
  /** DEVRE DIŞI: hep 0'dı; yeni yanıtlarda doldurulmaz. */
  usedFeaturedSlots?: number;
  remainingFreeListings: number;
  remainingTotalListings: number;
  /** DEVRE DIŞI: yeni yanıtlarda doldurulmaz. */
  remainingFeaturedSlots?: number;
}

export class MembershipLimitsDto {
  canCreateListing: boolean;
  canUseFreeSlot: boolean;
  canTrade: boolean;
  canCreateCollection: boolean;
  /**
   * DEVRE DIŞI: banner'lar herkese gösterilir. Alan geriye uyum için duruyor;
   * yeni yanıtlarda doldurulmaz ve hiçbir yerde okunmaz.
   */
  isAdFree?: boolean;
  maxImages: number;
  maxFreeListings: number; // Total max free listings for tier
  maxTotalListings: number; // Total max listings for tier
  remainingFreeListings: number;
  remainingTotalListings: number;
  /** DEVRE DIŞI: yeni yanıtlarda doldurulmaz. */
  remainingFeaturedSlots?: number;
  tierName: string;
  tierType: MembershipTierType;
}

// Re-export payment DTOs
export * from "./membership-payment.dto";
