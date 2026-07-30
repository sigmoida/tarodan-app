import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
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
import { ShippingPackageTierCode } from "@prisma/client";

/**
 * Satıcıya gösterilen paket boyutu. Desi aralığı yalnız admin tarafındadır:
 * satıcı boyut seçer, fiyat aralıktan çözülür. Son boyutun `maxDesi`'si null
 * olmalıdır (üst sınırsız) — aksi halde aktifleştirme guard'ı reddeder.
 */
export class ShippingPackageTierDto {
  @IsEnum(ShippingPackageTierCode)
  code: ShippingPackageTierCode;

  @IsString()
  @MaxLength(60)
  label: string;

  @IsInt()
  @Min(0)
  @Max(20000)
  @Type(() => Number)
  minDesi: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20000)
  @Type(() => Number)
  maxDesi: number | null;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  amount: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  sampleWidth?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  sampleHeight?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  sampleLength?: number | null;
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
  @Type(() => ShippingPackageTierDto)
  packageTiers: ShippingPackageTierDto[];
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
  @Type(() => ShippingPackageTierDto)
  packageTiers?: ShippingPackageTierDto[];
}

/** Admin: preview a tariff's outbound shipping for sample seller-package subtotals. */
export class PreviewShippingTariffDto {
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  @Type(() => Number)
  subtotals?: number[];
}
