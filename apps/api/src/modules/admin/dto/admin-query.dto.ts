import {
  IsOptional,
  IsEnum,
  IsInt,
  IsString,
  IsDateString,
  IsBoolean,
  IsIn,
  Min,
} from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  ProductStatus,
  OrderStatus,
  MembershipTierType,
  SubscriptionStatus,
} from "@prisma/client";
import { ACCOUNT_STATUSES, type AccountStatus } from "@tarodan/types";
import { AdminListQueryDto } from "../../../common/list";

export class AdminUserQueryDto extends AdminListQueryDto {
  @ApiPropertyOptional({ example: "john" })
  @IsOptional()
  @IsString()
  search?: string;

  // Query string'den "false" gelince de false olmalı; dönüşümsüz hali "false"
  // metnini truthy olarak Prisma'ya geçiriyordu (Alıcılar filtresi çalışmıyordu).
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  isSeller?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  isVerified?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  isBanned?: boolean;

  /**
   * Türetilmiş hesap durumu (deletedAt / isBanned / isEmailVerified).
   * Verilmezse silinmiş hesaplar listelenmez.
   */
  @ApiPropertyOptional({ enum: ACCOUNT_STATUSES })
  @IsOptional()
  @IsIn(ACCOUNT_STATUSES)
  accountStatus?: AccountStatus;

  /** Filter by current membership tier (free/basic/premium/business). */
  @ApiPropertyOptional({ enum: MembershipTierType })
  @IsOptional()
  @IsEnum(MembershipTierType)
  membershipTier?: MembershipTierType;

  /** Filter by membership lifecycle status (active/cancelled/expired/past_due). */
  @ApiPropertyOptional({ enum: SubscriptionStatus })
  @IsOptional()
  @IsEnum(SubscriptionStatus)
  membershipStatus?: SubscriptionStatus;

  /** Only paid memberships whose period ends within the next N days ("expiring soon"). */
  @ApiPropertyOptional({ example: 7 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expiringInDays?: number;
}

export class SellerApplicationQueryDto extends AdminListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;
}

export class AdminProductQueryDto extends AdminListQueryDto {
  @ApiPropertyOptional({ example: "ferrari" })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: ProductStatus })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @ApiPropertyOptional({ example: "uuid-category-id" })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ example: "uuid-seller-id" })
  @IsOptional()
  @IsString()
  sellerId?: string;

  @ApiPropertyOptional({ example: "uuid-brand-id" })
  @IsOptional()
  @IsString()
  brandId?: string;

  @ApiPropertyOptional({ example: "uuid-car-model-id" })
  @IsOptional()
  @IsString()
  carModelId?: string;
}

export class AdminOrderQueryDto extends AdminListQueryDto {
  @ApiPropertyOptional({ example: "ORD-123" })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: OrderStatus })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiPropertyOptional({ example: "2024-01-01" })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({ example: "2024-12-31" })
  @IsOptional()
  @IsDateString()
  toDate?: string;

  @ApiPropertyOptional({ example: "uuid-user-id" })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({
    enum: ["buyer", "seller"],
    description: "When filtering by userId: buyer or seller",
  })
  @IsOptional()
  @IsIn(["buyer", "seller"])
  userRole?: "buyer" | "seller";

  @ApiPropertyOptional({ example: "uuid-product-id" })
  @IsOptional()
  @IsString()
  productId?: string;
}

export class AuditLogQueryDto extends AdminListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: "user_update" })
  @IsOptional()
  @IsString()
  action?: string;

  @ApiPropertyOptional({ example: "uuid-admin-id" })
  @IsOptional()
  @IsString()
  adminId?: string;

  // Panelde "Varlık Türü" filtresi hep vardı ama DTO'da tanımlı olmadığı için
  // global `whitelist` onu sessizce kırpıyordu: dropdown çalışıyor görünüp
  // listeyi hiç değiştirmiyordu.
  @ApiPropertyOptional({ example: "Product" })
  @IsOptional()
  @IsString()
  entityType?: string;

  @ApiPropertyOptional({ example: "2024-01-01" })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({ example: "2024-12-31" })
  @IsOptional()
  @IsDateString()
  toDate?: string;
}

export class AdminPaymentQueryDto extends AdminListQueryDto {
  @ApiPropertyOptional({ example: "completed" })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: "paytr" })
  @IsOptional()
  @IsString()
  provider?: string;

  @ApiPropertyOptional({ example: "2024-01-01" })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: "2024-12-31" })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ example: "order-123" })
  @IsOptional()
  @IsString()
  search?: string;
}

export enum PaymentStatisticsPeriod {
  DAILY = "daily",
  WEEKLY = "weekly",
  MONTHLY = "monthly",
}

export class PaymentStatisticsQueryDto {
  @ApiPropertyOptional({ enum: PaymentStatisticsPeriod, example: "monthly" })
  @IsOptional()
  @IsEnum(PaymentStatisticsPeriod)
  period?: PaymentStatisticsPeriod;

  @ApiPropertyOptional({ example: "2024-01-01" })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: "2024-12-31" })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
