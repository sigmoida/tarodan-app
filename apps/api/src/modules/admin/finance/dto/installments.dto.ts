import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from "class-validator";
import {
  INSTALLMENT_RULE_NAME_MAX,
  INSTALLMENT_SEGMENTS,
  type AdminInstallmentSettingsPatch,
  type InstallmentBuyerSegment,
  type InstallmentRuleInput,
  type InstallmentSegment,
} from "@tarodan/types";

/**
 * Admin Finance > Installments (ADR 0019). The DTOs fix the shape; the
 * business rules (count range, share, validity) are `validateInstallmentRule`
 * and `validateInstallmentMinAmount` from `@tarodan/types`, which the admin
 * form also runs. The services re-check them (authoritative).
 */

const BUYER_SEGMENTS = INSTALLMENT_SEGMENTS.filter(
  (segment): segment is InstallmentBuyerSegment => segment !== "all",
);

/** `PATCH /admin/installments/settings`; an absent field is left as is. */
export class UpdateInstallmentSettingsDto implements AdminInstallmentSettingsPatch {
  @ApiPropertyOptional({ description: "installments_enabled: the kill switch" })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({
    description:
      "installment_min_amount, TL on the goods total (0 to 1,000,000, two decimals)",
    example: 500,
  })
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  minAmount?: number;
}

/** A rule version: `POST /admin/installments/rules` and `.../rules/:id/versions`. */
export class InstallmentRuleDto implements InstallmentRuleInput {
  @ApiProperty({ example: "Premium 3 taksit vade farksız" })
  @IsString()
  @MaxLength(INSTALLMENT_RULE_NAME_MAX)
  name: string;

  @ApiProperty({ enum: INSTALLMENT_SEGMENTS })
  @IsIn(INSTALLMENT_SEGMENTS)
  segment: InstallmentSegment;

  @ApiProperty({ example: 2, description: "Inclusive, 2..12" })
  @IsInt()
  minCount: number;

  @ApiProperty({ example: 3, description: "Inclusive, 2..12" })
  @IsInt()
  maxCount: number;

  @ApiProperty({
    description: "false: the counts are not offered to the segment",
  })
  @IsBoolean()
  allowed: boolean;

  @ApiProperty({ example: 100, description: "0..100; 0 when not allowed" })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  platformSharePct: number;

  @ApiProperty({ example: 0, description: "Higher wins" })
  @IsInt()
  priority: number;

  @ApiProperty({
    example: "2026-11-15T00:00:00.000Z",
    description: "Inclusive",
  })
  @IsISO8601({ strict: true })
  validFrom: string;

  @ApiPropertyOptional({
    nullable: true,
    description: "Exclusive; null = open-ended",
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsISO8601({ strict: true })
  validUntil?: string | null;
}

const toBoolean = ({ value }: { value: unknown }) =>
  value === "true" || value === true
    ? true
    : value === "false" || value === false
      ? false
      : value;

/**
 * `GET /admin/installments/preview`. With `draftMinCount` the draft rule is
 * priced as if it were live now and newest; its other fields default to the
 * previewed segment, allowed, share 0, priority 0.
 */
export class InstallmentPreviewQueryDto {
  @ApiProperty({ enum: BUYER_SEGMENTS })
  @IsIn(BUYER_SEGMENTS)
  segment: InstallmentBuyerSegment;

  @ApiProperty({ example: 1000, description: "Goods total T, TL" })
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1_000_000)
  amount: number;

  @ApiProperty({ example: "world", description: "PayTR card family" })
  @IsString()
  family: string;

  @ApiPropertyOptional({ enum: INSTALLMENT_SEGMENTS })
  @IsOptional()
  @IsIn(INSTALLMENT_SEGMENTS)
  draftSegment?: InstallmentSegment;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  draftMinCount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  draftMaxCount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  draftAllowed?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  draftPlatformSharePct?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  draftPriority?: number;

  @ApiPropertyOptional({
    description: "The version the draft replaces (editing)",
  })
  @IsOptional()
  @IsUUID()
  replacesRuleId?: string;
}
