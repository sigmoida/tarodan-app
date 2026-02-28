import {
  IsString,
  IsOptional,
  IsEnum,
  IsUUID,
  IsNumber,
  Min,
  Max,
  IsBoolean,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import { ProductStatus, ProductCondition } from '@prisma/client';

export class ProductQueryDto {
  @ApiPropertyOptional({
    example: 'star wars',
    description: 'Search query for title/description',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    example: 'uuid-category-id',
    description: 'Filter by category ID',
  })
  @IsOptional()
  @IsUUID('4')
  categoryId?: string;

  @ApiPropertyOptional({
    example: 'uuid-seller-id',
    description: 'Filter by seller ID',
  })
  @IsOptional()
  @IsUUID('4')
  sellerId?: string;

  @ApiPropertyOptional({
    example: 'uuid-brand-id',
    description: 'Filter by brand ID',
  })
  @IsOptional()
  @IsString()
  brandId?: string;

  @ApiPropertyOptional({
    enum: ProductStatus,
    example: 'active',
    description: 'Filter by status',
  })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @ApiPropertyOptional({
    enum: ProductCondition,
    example: 'very_good',
    description: 'Filter by condition',
  })
  @IsOptional()
  @IsEnum(ProductCondition)
  condition?: ProductCondition;

  @ApiPropertyOptional({
    example: 'Hot Wheels',
    description: 'Filter by brand name',
  })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiPropertyOptional({
    example: '1:64',
    description: 'Filter by scale',
  })
  @IsOptional()
  @IsString()
  scale?: string;

  @ApiPropertyOptional({
    example: 'diecast',
    description: 'Filter by material (attribute slug: diecast, resin, composite, plastic)',
  })
  @IsOptional()
  @IsString()
  material?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Filter only trade-enabled products',
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  tradeOnly?: boolean;

  @ApiPropertyOptional({
    example: true,
    description: 'Filter only products currently on sale/discount',
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  discountOnly?: boolean;

  @ApiPropertyOptional({
    example: true,
    description: 'Filter only pre-order products',
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  preOrder?: boolean;

  @ApiPropertyOptional({
    example: true,
    description: 'Filter only limited edition products',
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  limited?: boolean;

  @ApiPropertyOptional({
    example: true,
    description: 'Filter only set/bundle products (multi-pack, car sets)',
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  set?: boolean;

  @ApiPropertyOptional({
    example: 'araba',
    description: 'Filter by vehicle type (searches in title/description)',
  })
  @IsOptional()
  @IsString()
  vehicleType?: string;

  @ApiPropertyOptional({
    example: 100,
    description: 'Minimum price filter',
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional({
    example: 1000,
    description: 'Maximum price filter',
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Max(9999999)
  maxPrice?: number;

  @ApiPropertyOptional({
    example: 'price_asc',
    description: 'Sort order',
    enum: ['price_asc', 'price_desc', 'created_asc', 'created_desc', 'title_asc', 'title_desc', 'view_count_desc', 'view_count_asc'],
  })
  @IsOptional()
  @IsString()
  sortBy?: 'price_asc' | 'price_desc' | 'created_asc' | 'created_desc' | 'title_asc' | 'title_desc' | 'view_count_desc' | 'view_count_asc';

  @ApiPropertyOptional({
    example: 1,
    description: 'Page number (1-based)',
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    example: 20,
    description: 'Items per page',
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  limit?: number;
  @ApiPropertyOptional({
    example: 'uuid-brand-id',
    description: 'Filter by car model ID',
  })
  @IsOptional()
  @IsUUID('4')
  carModelId?: string;

  @ApiPropertyOptional({
    example: 'uuid-manufacturer-id',
    description: 'Filter by manufacturer ID',
  })
  @IsOptional()
  @IsUUID('4')
  manufacturerId?: string;

  @ApiPropertyOptional({
    example: 'Hot Wheels',
    description: 'Filter by manufacturer name (text search)',
  })
  @IsOptional()
  @IsString()
  manufacturer?: string;
}
