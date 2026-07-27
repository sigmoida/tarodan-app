import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
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

  @IsOptional()
  @IsInt()
  @Min(0)
  featuredListingSlots?: number;

  // Decimal(5,4) — indirim oranı 0..1 aralığında bir kesirdir.
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  commissionDiscount?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
