import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

export class ShippingTariffRateDto {
  @IsInt()
  @Min(1)
  @Max(20000)
  @Type(() => Number)
  desi: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  amount: number;
}

/**
 * Admin: create a DRAFT shipping tariff. Version + status are server-assigned.
 * All amounts are non-negative (@Min(0)) — the generic PlatformSetting endpoint this
 * replaces had no such validation.
 */
export class CreateShippingTariffDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  provider?: string;

  @IsString()
  @MaxLength(120)
  name: string;

  @IsNumber()
  @Min(0)
  outboundPackageFee: number;

  @IsOptional()
  @IsBoolean()
  freeShippingEnabled?: boolean;

  @IsNumber()
  @Min(0)
  freeShippingThreshold: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  returnPackageFee?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  tradeLegFee?: number;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ShippingTariffRateDto)
  rates: ShippingTariffRateDto[];
}

/** Admin: update a DRAFT tariff (all fields optional). */
export class UpdateShippingTariffDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  outboundPackageFee?: number;

  @IsOptional()
  @IsBoolean()
  freeShippingEnabled?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  freeShippingThreshold?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  returnPackageFee?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  tradeLegFee?: number;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ShippingTariffRateDto)
  rates?: ShippingTariffRateDto[];
}

/** Admin: preview a tariff's outbound shipping for sample seller-package subtotals. */
export class PreviewShippingTariffDto {
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  @Type(() => Number)
  subtotals?: number[];
}
