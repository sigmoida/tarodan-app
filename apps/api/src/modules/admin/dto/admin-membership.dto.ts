import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";
import { MembershipTierType } from "@prisma/client";

/** Admin: kullanıcının üyelik kademesini değiştirir (ödeme yok, admin override). */
export class AdminChangeMembershipDto {
  @IsEnum(MembershipTierType)
  tierType: MembershipTierType;

  @IsOptional()
  @IsIn(["monthly", "yearly"])
  billingPeriod?: "monthly" | "yearly";
}

/**
 * Admin: üyelik kademesi (fiyat/limit/yetki) güncelleme gövdesi. Global
 * ValidationPipe bu DTO üzerinden negatif fiyat/limit ve sınır dışı indirim gibi
 * geçersiz değerleri API seviyesinde reddeder; whitelist bilinmeyen alanları düşürür.
 */
export class UpdateMembershipTierDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  monthlyPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  yearlyPrice?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxFreeListings?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxTotalListings?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
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

  // featuredListingSlots + commissionDiscount are intentionally NOT editable here:
  // the former is superseded by the paid ad-packages boost system, the latter was
  // never applied by the commission engine (commission-rules-v2). The DB columns are
  // retained (deprecated) but the admin can no longer set misleading values.

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
