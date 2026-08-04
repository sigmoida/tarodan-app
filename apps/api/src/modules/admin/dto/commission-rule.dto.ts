import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  CommissionRuleSetStatus,
  CommissionSellerType,
  ShippingPackageTierCode,
} from "@prisma/client";

export class CommissionShippingShareDto {
  @ApiProperty({ enum: ShippingPackageTierCode })
  @IsEnum(ShippingPackageTierCode)
  tierCode: ShippingPackageTierCode;

  @ApiProperty({ example: 70 })
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  @Max(100)
  buyerShare: number;
}

export class CreateCommissionRuleDto {
  @ApiPropertyOptional({ description: "Draft set; current draft when omitted" })
  @IsOptional()
  @IsString()
  ruleSetId?: string;

  @ApiProperty({ example: "Model Arabalar / Basic / 0-5000" })
  @IsString()
  name: string;

  @ApiProperty({ description: "Exact category id; wildcards are not allowed" })
  @IsString()
  categoryId: string;

  @ApiProperty({ enum: CommissionSellerType })
  @IsEnum(CommissionSellerType)
  sellerType: CommissionSellerType;

  @ApiProperty({ example: 0, description: "Inclusive lower bound" })
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  minAmount: number;

  @ApiPropertyOptional({ example: 5000, description: "Exclusive upper bound" })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0.01)
  maxAmount?: number | null;

  @ApiProperty({ example: 0 })
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  @Max(100)
  buyerCommissionRate: number;

  @ApiProperty({ example: 0 })
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  @Max(100)
  buyerServiceFeeRate: number;

  @ApiProperty({ example: 10 })
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  @Max(100)
  sellerCommissionRate: number;

  @ApiProperty({ example: 0 })
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  @Max(100)
  sellerPlatformFeeRate: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  buyerCommissionMin?: number | null;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  buyerCommissionMax?: number | null;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  buyerServiceFeeMin?: number | null;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  buyerServiceFeeMax?: number | null;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  sellerCommissionMin?: number | null;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  sellerCommissionMax?: number | null;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  sellerPlatformFeeMin?: number | null;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  sellerPlatformFeeMax?: number | null;

  @ApiProperty({ example: 25 })
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  tradeFeeSellerAmount: number;

  @ApiProperty({ example: 15 })
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  tradeFeeBuyerAmount: number;

  @ApiPropertyOptional({ default: 100 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  @Max(100)
  shippingBuyerShare?: number;

  @ApiPropertyOptional({ type: [CommissionShippingShareDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CommissionShippingShareDto)
  shippingShares?: CommissionShippingShareDto[];
}

export class UpdateCommissionRuleDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() categoryId?: string;
  @ApiPropertyOptional({ enum: CommissionSellerType })
  @IsOptional()
  @IsEnum(CommissionSellerType)
  sellerType?: CommissionSellerType;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  minAmount?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0.01)
  maxAmount?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  @Max(100)
  buyerCommissionRate?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  @Max(100)
  buyerServiceFeeRate?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  @Max(100)
  sellerCommissionRate?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  @Max(100)
  sellerPlatformFeeRate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  buyerCommissionMin?: number | null;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  buyerCommissionMax?: number | null;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  buyerServiceFeeMin?: number | null;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  buyerServiceFeeMax?: number | null;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  sellerCommissionMin?: number | null;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  sellerCommissionMax?: number | null;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  sellerPlatformFeeMin?: number | null;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  sellerPlatformFeeMax?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  tradeFeeSellerAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  tradeFeeBuyerAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  @Max(100)
  shippingBuyerShare?: number;
  @ApiPropertyOptional({ type: [CommissionShippingShareDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CommissionShippingShareDto)
  shippingShares?: CommissionShippingShareDto[];
}

export class PreviewCommissionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() ruleSetId?: string;
  @ApiProperty() @IsString() categoryId: string;
  @ApiProperty({ enum: CommissionSellerType })
  @IsEnum(CommissionSellerType)
  sellerType: CommissionSellerType;
  @ApiProperty() @IsNumber() @Type(() => Number) @Min(0) amount: number;
}

export class CreateCommissionRuleSetDto {
  @ApiPropertyOptional({ example: "2026 Ağustos komisyonları" })
  @IsOptional()
  @IsString()
  name?: string;
}

export class CommissionRuleSetResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() version: number;
  @ApiProperty({ enum: CommissionRuleSetStatus })
  status: CommissionRuleSetStatus;
  @ApiPropertyOptional() publishedAt?: Date | null;
}

export class CommissionRuleResponseDto extends CreateCommissionRuleDto {
  @ApiProperty() id: string;
  @ApiProperty() ruleSetId: string;
  @ApiProperty() categoryName: string;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}
