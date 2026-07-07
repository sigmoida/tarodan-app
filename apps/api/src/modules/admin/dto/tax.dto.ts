import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, IsNumber, IsEnum, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export enum TaxRuleScopeDto {
  default_rate = 'default_rate',
  category = 'category',
  product = 'product',
}

export class CreateTaxRegionDto {
  @ApiProperty({ example: 'Türkiye' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'TR' })
  @IsString()
  countryCode: string;

  @ApiPropertyOptional({ example: '34' })
  @IsOptional()
  @IsString()
  regionCode?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  sortOrder?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateTaxRegionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  countryCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  regionCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateTaxRateDto {
  @ApiPropertyOptional({ description: "Verilmezse varsayılan (TR) bölge kullanılır" })
  @IsOptional()
  @IsString()
  taxRegionId?: string;

  @ApiProperty({ example: 'KDV Standart' })
  @IsString()
  name: string;

  @ApiProperty({ example: 18, description: 'Percentage e.g. 18 for 18%' })
  @IsNumber()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  rate: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  effectiveFrom?: string; // ISO date

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  effectiveTo?: string; // ISO date

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  sortOrder?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateTaxRateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  rate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  effectiveFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  effectiveTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateTaxRuleDto {
  @ApiPropertyOptional({ description: "Verilmezse varsayılan (TR) bölge kullanılır" })
  @IsOptional()
  @IsString()
  taxRegionId?: string;

  @ApiProperty()
  @IsString()
  taxRateId: string;

  @ApiProperty({ enum: TaxRuleScopeDto })
  @IsEnum(TaxRuleScopeDto)
  scope: TaxRuleScopeDto;

  @ApiPropertyOptional({ description: 'Required when scope=category' })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  priority?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateTaxRuleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  taxRateId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(TaxRuleScopeDto)
  scope?: TaxRuleScopeDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  priority?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class TaxReportQueryDto {
  @ApiPropertyOptional({ description: 'From date (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  fromDate?: string;

  @ApiPropertyOptional({ description: 'To date (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  toDate?: string;

  @ApiPropertyOptional({ description: 'Group by: day, month, year, region' })
  @IsOptional()
  @IsString()
  groupBy?: 'day' | 'month' | 'year' | 'region';

  @ApiPropertyOptional({ description: 'Tax region ID filter' })
  @IsOptional()
  @IsString()
  regionId?: string;
}

export class SetWithholdingRateDto {
  @ApiProperty({ description: 'E-ticaret stopaj (tevkifat) oranı %, GVK 94/19', example: 1 })
  @IsNumber()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  rate: number;
}

export class WithholdingReportQueryDto {
  @ApiProperty({ description: 'Yıl (örn. 2026)', example: 2026 })
  @IsNumber()
  @Min(2020)
  @Max(2100)
  @Type(() => Number)
  year: number;

  @ApiProperty({ description: 'Ay (1-12)', example: 6 })
  @IsNumber()
  @Min(1)
  @Max(12)
  @Type(() => Number)
  month: number;
}

export class SetDefaultVatDto {
  @ApiProperty({ description: 'Varsayılan KDV oranı (%)', example: 20 })
  @IsNumber()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  rate: number;
}

export class SetVatOverrideDto {
  @ApiProperty({ description: 'Kategori ID' })
  @IsString()
  categoryId: string;

  @ApiProperty({ description: 'Bu kategori için KDV oranı (%)', example: 0 })
  @IsNumber()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  rate: number;
}
