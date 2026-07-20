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
  ValidateIf,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  CommissionRuleType,
  CommissionAppliesTo,
  CommissionSellerType,
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
      "Seller commission rate (%) - Required if appliesTo is SELLER or BOTH",
  })
  @ValidateIf((o) => o.appliesTo === "SELLER" || o.appliesTo === "BOTH")
  @IsNumber(
    {},
    { message: "sellerRate is required when appliesTo is SELLER or BOTH" },
  )
  @Type(() => Number)
  @Min(0)
  @Max(100)
  sellerRate?: number;

  @ApiPropertyOptional({
    example: 2.0,
    description:
      "Buyer commission rate (%) - Required if appliesTo is BUYER or BOTH",
  })
  @ValidateIf((o) => o.appliesTo === "BUYER" || o.appliesTo === "BOTH")
  @IsNumber(
    {},
    { message: "buyerRate is required when appliesTo is BUYER or BOTH" },
  )
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
