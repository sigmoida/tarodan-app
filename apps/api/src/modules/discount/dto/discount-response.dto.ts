import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DiscountType, DiscountScope } from '@prisma/client';

export class DiscountResponseDto {
  @ApiProperty()
  id: string;

  @ApiPropertyOptional()
  code?: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiProperty({ enum: DiscountType })
  type: DiscountType;

  @ApiProperty()
  value: number;

  @ApiProperty({ enum: DiscountScope })
  scope: DiscountScope;

  @ApiPropertyOptional()
  sellerId?: string;

  @ApiPropertyOptional()
  sellerName?: string;

  @ApiPropertyOptional()
  categoryId?: string;

  @ApiPropertyOptional()
  categoryName?: string;

  @ApiProperty({ type: [String] })
  targetProductIds: string[];

  @ApiPropertyOptional()
  minCartValue?: number;

  @ApiPropertyOptional()
  maxDiscountAmount?: number;

  @ApiPropertyOptional()
  usageLimitTotal?: number;

  @ApiPropertyOptional()
  minQuantity?: number;

  @ApiPropertyOptional()
  buyQuantity?: number;

  @ApiPropertyOptional()
  getQuantity?: number;

  @ApiPropertyOptional()
  isFlashSale?: boolean;


  @ApiProperty()
  usageLimitPerUser: number;

  @ApiProperty()
  usedCount: number;

  @ApiProperty()
  isStackable: boolean;

  @ApiProperty()
  priority: number;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  startDate: Date;

  @ApiProperty()
  endDate: Date;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  // Computed fields
  @ApiProperty({ description: 'İndirim şu an geçerli mi?' })
  isCurrentlyValid: boolean;

  @ApiProperty({ description: 'Kalan kullanım hakkı' })
  remainingUsage?: number;
}

export class PaginatedDiscountsDto {
  @ApiProperty({ type: [DiscountResponseDto] })
  items: DiscountResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  totalPages: number;
}

export class ActiveCampaignDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiProperty({ enum: DiscountType })
  type: DiscountType;

  @ApiProperty()
  value: number;

  @ApiProperty({ enum: DiscountScope })
  scope: DiscountScope;

  @ApiPropertyOptional()
  categoryId?: string;

  @ApiPropertyOptional()
  categoryName?: string;

  @ApiPropertyOptional()
  minCartValue?: number;

  @ApiProperty()
  endDate: Date;
}
