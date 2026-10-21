import {
  IsString,
  IsBoolean,
  IsOptional,
  IsInt,
  IsNumber,
  IsArray,
  ValidateNested,
  Min,
  Max,
  IsDateString,
  IsEnum,
  IsUUID,
  IsNotEmpty,
  Length,
  MaxLength,
} from "class-validator";
import { Transform, Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { AdPackageAudienceMode, MembershipTierType } from "@prisma/client";
import {
  BOOST_ADMIN_REASON_MAX_LENGTH,
  BOOST_ADMIN_REASON_MIN_LENGTH,
  BOOST_GRANT_MAX_DAYS,
  BOOST_GRANT_MIN_DAYS,
} from "@tarodan/types";

/** Trims a string body field before it is validated (a reason of spaces is empty). */
const trimmed = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  );

export class AdPackageTierDto {
  @ApiProperty({ example: 7 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  durationDays: number;

  @ApiProperty({ example: 200 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minAmount: number;

  @ApiPropertyOptional({ example: 999, description: "null = no upper bound" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxAmount?: number | null;

  @ApiProperty({ example: 150 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price: number;

  @ApiPropertyOptional({ example: 1750 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  campaignPrice?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  campaignStartsAt?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  campaignEndsAt?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateAdPackageDto {
  @ApiProperty({ example: "Vitrin Paket" })
  @IsString()
  name: string;

  @ApiProperty({ example: "vitrin" })
  @IsString()
  slug: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  showcaseOnHome?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({
    enum: AdPackageAudienceMode,
    default: AdPackageAudienceMode.everyone,
  })
  @IsOptional()
  @IsEnum(AdPackageAudienceMode)
  audienceMode?: AdPackageAudienceMode;

  @ApiPropertyOptional({ enum: MembershipTierType, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(MembershipTierType, { each: true })
  targetTierTypes?: MembershipTierType[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID("4", { each: true })
  targetUserIds?: string[];

  @ApiPropertyOptional({ type: [AdPackageTierDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdPackageTierDto)
  tiers?: AdPackageTierDto[];
}

export class UpdateAdPackageDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showcaseOnHome?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({ enum: AdPackageAudienceMode })
  @IsOptional()
  @IsEnum(AdPackageAudienceMode)
  audienceMode?: AdPackageAudienceMode;

  @ApiPropertyOptional({ enum: MembershipTierType, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(MembershipTierType, { each: true })
  targetTierTypes?: MembershipTierType[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID("4", { each: true })
  targetUserIds?: string[];

  @ApiPropertyOptional({
    type: [AdPackageTierDto],
    description: "When provided, replaces the package's tier rows wholesale.",
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdPackageTierDto)
  tiers?: AdPackageTierDto[];
}

export class ExtendBoostDto {
  @ApiProperty({ example: 7, minimum: 1, maximum: 365 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  days: number;
}

/** Why staff grant, revoke or refund a boost: on the boost and in the audit log. */
class BoostAdminReasonDto {
  @ApiProperty({
    minLength: BOOST_ADMIN_REASON_MIN_LENGTH,
    maxLength: BOOST_ADMIN_REASON_MAX_LENGTH,
  })
  @trimmed()
  @IsString()
  @Length(BOOST_ADMIN_REASON_MIN_LENGTH, BOOST_ADMIN_REASON_MAX_LENGTH)
  reason: string;
}

export class GrantBoostDto extends BoostAdminReasonDto {
  @ApiProperty({ description: "Listing id or listing code (U010001)" })
  @trimmed()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  productId: string;

  @ApiPropertyOptional({
    description: "Ad package to snapshot; none means search priority only",
  })
  @IsOptional()
  @IsUUID("4")
  packageId?: string;

  @ApiProperty({
    example: 7,
    minimum: BOOST_GRANT_MIN_DAYS,
    maximum: BOOST_GRANT_MAX_DAYS,
  })
  @Type(() => Number)
  @IsInt()
  @Min(BOOST_GRANT_MIN_DAYS)
  @Max(BOOST_GRANT_MAX_DAYS)
  durationDays: number;
}

export class RefundBoostDto extends BoostAdminReasonDto {
  @ApiPropertyOptional({
    minimum: 0.01,
    description:
      "TL, at most the purchase's refundableAmount; empty refunds all of it",
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount?: number;
}

export class RevokeBoostDto extends BoostAdminReasonDto {}
