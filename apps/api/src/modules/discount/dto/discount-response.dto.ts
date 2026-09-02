import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  DiscountType,
  DiscountScope,
  DiscountTarget,
  DiscountAudience,
} from "@prisma/client";

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
  @ApiProperty({ description: "İndirim şu an geçerli mi?" })
  isCurrentlyValid: boolean;

  @ApiProperty({ description: "Kalan kullanım hakkı" })
  remainingUsage?: number;

  @ApiProperty({ enum: DiscountTarget })
  target?: DiscountTarget;

  @ApiProperty({ enum: DiscountAudience })
  audience?: DiscountAudience;

  @ApiPropertyOptional({ isArray: true, type: String })
  targetTierTypes?: string[];

  @ApiPropertyOptional({ isArray: true, type: String })
  targetUserIds?: string[];

  /** Hedeflenen kullanıcılar, görünen adlarıyla — yönetim formu için. */
  @ApiPropertyOptional({ isArray: true, type: Object })
  targetUsers?: Array<{
    id: string;
    displayName: string | null;
    email: string | null;
  }>;

  @ApiPropertyOptional()
  budgetLimit?: number;

  @ApiPropertyOptional()
  budgetSpent?: number;

  @ApiPropertyOptional()
  budgetStoppedAt?: Date;
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
