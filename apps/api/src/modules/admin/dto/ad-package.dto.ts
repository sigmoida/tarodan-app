import {
  IsString,
  IsBoolean,
  IsOptional,
  IsInt,
  IsNumber,
  IsArray,
  ValidateNested,
  Min,
  IsDateString,
} from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

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
