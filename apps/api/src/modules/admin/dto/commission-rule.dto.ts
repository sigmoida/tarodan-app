import {
  IsString,
  IsNumber,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsIn,
  IsInt,
  Min,
  Max,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  CommissionRuleType,
  CommissionAppliesTo,
  CommissionSellerType,
  CommissionTaxpayerType,
} from "@prisma/client";

export class CreateCommissionRuleDto {
  @ApiProperty({
    example: "Standart Komisyon",
    description: "Rule name",
  })
  @IsString()
  name: string;

  @ApiPropertyOptional({
    example: "category-uuid",
    description: "Category ID (null for all categories)",
  })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiProperty({
    enum: CommissionSellerType,
    example: "ALL",
    description: "Applicable seller type",
  })
  @IsEnum(CommissionSellerType)
  sellerType: CommissionSellerType;

  @ApiProperty({
    enum: CommissionAppliesTo,
    example: "SELLER",
    description: "Who pays the commission",
  })
  @IsEnum(CommissionAppliesTo)
  appliesTo: CommissionAppliesTo;

  @ApiPropertyOptional({
    example: 5.0,
    description:
      "Legacy seller rate (%). v2 rules use sellerCommissionRate instead; " +
      "the service requires at least one seller/buyer rate.",
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  @Max(100)
  sellerRate?: number;

  @ApiPropertyOptional({
    example: 2.0,
    description:
      "Legacy buyer rate (%). v2 rules use buyerServiceFeeRate instead.",
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  @Max(100)
  buyerRate?: number;

  @ApiPropertyOptional({
    example: 5.0,
    description: "Seller minimum commission (TRY)",
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  sellerMin?: number;

  @ApiPropertyOptional({
    example: 100.0,
    description: "Seller maximum commission (TRY)",
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  sellerMax?: number;

  @ApiPropertyOptional({
    example: 0.0,
    description: "Buyer minimum commission (TRY)",
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  buyerMin?: number;

  @ApiPropertyOptional({
    example: 50.0,
    description: "Buyer maximum commission (TRY)",
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  buyerMax?: number;

  @ApiPropertyOptional({
    example: 0,
    description: "Rule priority (higher values are evaluated first)",
  })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  priority?: number;

  @ApiPropertyOptional({
    example: true,
    description: "Whether the rule is active",
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  // ── v2: kesinti profili (opsiyonel; verilmezse legacy oranlar kullanılır) ──
  @ApiPropertyOptional({
    enum: CommissionTaxpayerType,
    example: "all",
    description: "Taxpayer axis: individual / corporate / all",
  })
  @IsOptional()
  @IsEnum(CommissionTaxpayerType)
  taxpayerType?: CommissionTaxpayerType;

  @ApiPropertyOptional({
    example: 5000,
    description: "Tiered range upper bound (TRY); minAmount = lower bound",
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  maxAmount?: number;

  @ApiPropertyOptional({
    example: 2.0,
    description: "Buyer commission rate (%)",
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  @Max(100)
  buyerCommissionRate?: number;
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  buyerCommissionMin?: number;
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  buyerCommissionMax?: number;

  @ApiPropertyOptional({
    example: 3.0,
    description: "Buyer protection service fee rate (%)",
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  @Max(100)
  buyerServiceFeeRate?: number;
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  buyerServiceFeeMin?: number;
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  buyerServiceFeeMax?: number;

  @ApiPropertyOptional({
    example: 8.0,
    description: "Seller commission rate (%)",
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  @Max(100)
  sellerCommissionRate?: number;
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  sellerCommissionMin?: number;
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  sellerCommissionMax?: number;

  @ApiPropertyOptional({
    example: 2.0,
    description: "Seller platform service fee rate (%)",
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  @Max(100)
  sellerPlatformFeeRate?: number;
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  sellerPlatformFeeMin?: number;
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  sellerPlatformFeeMax?: number;

  @ApiPropertyOptional({
    example: 100,
    description:
      "Buyer share (%) of the single shipping cost (seller = 100 - this)",
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  @Max(100)
  shippingBuyerShare?: number;

  // Legacy fields (optional for backward compatibility)
  @ApiPropertyOptional({
    example: 5.0,
    description: "Legacy commission percentage",
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  @Max(50)
  percentage?: number;

  @ApiPropertyOptional({
    enum: CommissionRuleType,
    example: "default",
    description: "Legacy rule type",
  })
  @IsOptional()
  @IsEnum(CommissionRuleType)
  type?: CommissionRuleType;

  @ApiPropertyOptional({
    example: 100,
    description: "Legacy minimum order amount",
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  minAmount?: number;
}

export class UpdateCommissionRuleDto {
  @ApiPropertyOptional({ example: "Premium Komisyon" })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    example: "category-uuid",
    description: "Category ID (null for all categories)",
  })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({
    enum: CommissionSellerType,
    example: "PREMIUM",
  })
  @IsOptional()
  @IsEnum(CommissionSellerType)
  sellerType?: CommissionSellerType;

  @ApiPropertyOptional({
    enum: CommissionAppliesTo,
    example: "BOTH",
  })
  @IsOptional()
  @IsEnum(CommissionAppliesTo)
  appliesTo?: CommissionAppliesTo;

  @ApiPropertyOptional({ example: 5.0 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  @Max(100)
  sellerRate?: number;

  @ApiPropertyOptional({ example: 2.0 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  @Max(100)
  buyerRate?: number;

  @ApiPropertyOptional({ example: 5.0 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  sellerMin?: number;

  @ApiPropertyOptional({ example: 100.0 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  sellerMax?: number;

  @ApiPropertyOptional({ example: 0.0 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  buyerMin?: number;

  @ApiPropertyOptional({ example: 50.0 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  buyerMax?: number;

  @ApiPropertyOptional({
    example: 0,
    description: "Rule priority (higher values are evaluated first)",
  })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  priority?: number;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  // ── v2: kesinti profili ──
  @ApiPropertyOptional({ enum: CommissionTaxpayerType })
  @IsOptional()
  @IsEnum(CommissionTaxpayerType)
  taxpayerType?: CommissionTaxpayerType;

  @ApiPropertyOptional({ example: 5000 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  maxAmount?: number;

  @ApiPropertyOptional({ example: 2.0 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  @Max(100)
  buyerCommissionRate?: number;
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  buyerCommissionMin?: number;
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  buyerCommissionMax?: number;

  @ApiPropertyOptional({ example: 3.0 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  @Max(100)
  buyerServiceFeeRate?: number;
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  buyerServiceFeeMin?: number;
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  buyerServiceFeeMax?: number;

  @ApiPropertyOptional({ example: 8.0 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  @Max(100)
  sellerCommissionRate?: number;
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  sellerCommissionMin?: number;
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  sellerCommissionMax?: number;

  @ApiPropertyOptional({ example: 2.0 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  @Max(100)
  sellerPlatformFeeRate?: number;
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  sellerPlatformFeeMin?: number;
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  sellerPlatformFeeMax?: number;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  @Max(100)
  shippingBuyerShare?: number;

  // Legacy fields
  @ApiPropertyOptional({ example: 3.5 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  @Max(50)
  percentage?: number;

  @ApiPropertyOptional({ enum: CommissionRuleType })
  @IsOptional()
  @IsEnum(CommissionRuleType)
  type?: CommissionRuleType;

  @ApiPropertyOptional({ example: 500 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  minAmount?: number;
}

export class PreviewCommissionDto {
  @ApiProperty({ example: 1000, description: "Example product price" })
  @IsNumber()
  @Type(() => Number)
  @Min(0.01)
  amount: number;

  @ApiPropertyOptional({ description: "Existing rule being edited" })
  @IsOptional()
  @IsString()
  ruleId?: string;

  @ApiPropertyOptional({ description: "Draft rule category (null for all)" })
  @IsOptional()
  @IsString()
  categoryId?: string | null;

  @ApiProperty({
    enum: CommissionSellerType,
    description: "Draft rule seller type",
  })
  @IsEnum(CommissionSellerType)
  sellerType: CommissionSellerType;

  @ApiProperty({ enum: CommissionAppliesTo })
  @IsEnum(CommissionAppliesTo)
  appliesTo: CommissionAppliesTo;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  @Max(100)
  sellerRate?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  @Max(100)
  buyerRate?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  sellerMin?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  sellerMax?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  buyerMin?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  buyerMax?: number | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: "Example product category (null for no category)",
  })
  @IsOptional()
  @IsString()
  previewCategoryId?: string | null;

  @ApiProperty({
    enum: [
      CommissionSellerType.FREE,
      CommissionSellerType.PREMIUM,
      CommissionSellerType.BUSINESS,
    ],
    description: "Example checkout seller type",
  })
  @IsIn([
    CommissionSellerType.FREE,
    CommissionSellerType.PREMIUM,
    CommissionSellerType.BUSINESS,
  ])
  previewSellerType: CommissionSellerType;
}

export class CommissionRuleResponseDto {
  @ApiProperty({ example: "uuid" })
  id: string;

  @ApiProperty({ example: "Standart Komisyon" })
  name: string;

  @ApiPropertyOptional({ example: "category-uuid" })
  categoryId?: string | null;

  @ApiPropertyOptional({ example: "Kategori Adı" })
  categoryName?: string | null;

  @ApiProperty({ enum: CommissionSellerType, example: "ALL" })
  sellerType: CommissionSellerType | null;

  @ApiProperty({ enum: CommissionAppliesTo, example: "SELLER" })
  appliesTo: CommissionAppliesTo;

  @ApiPropertyOptional({ example: 5.0 })
  sellerRate?: number | null;

  @ApiPropertyOptional({ example: 2.0 })
  buyerRate?: number | null;

  @ApiPropertyOptional({ example: 5.0 })
  sellerMin?: number | null;

  @ApiPropertyOptional({ example: 100.0 })
  sellerMax?: number | null;

  @ApiPropertyOptional({ example: 0.0 })
  buyerMin?: number | null;

  @ApiPropertyOptional({ example: 50.0 })
  buyerMax?: number | null;

  @ApiProperty({ example: 0 })
  priority: number;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({ example: "2024-01-15T10:30:00.000Z" })
  createdAt: Date;

  @ApiProperty({ example: "2024-01-15T10:30:00.000Z" })
  updatedAt: Date;

  // Legacy fields (for backward compatibility)
  @ApiPropertyOptional({ example: 5.0 })
  percentage?: number;

  @ApiPropertyOptional({ example: "default" })
  type?: string;

  @ApiPropertyOptional({ example: 100 })
  minAmount?: number | null;
}
