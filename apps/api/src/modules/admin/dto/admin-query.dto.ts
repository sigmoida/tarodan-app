import {
  IsOptional,
  IsEnum,
  IsString,
  IsNumber,
  Min,
  Max,
  IsDateString,
  IsBoolean,
  IsIn,
} from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type, Transform } from "class-transformer";
import { ProductStatus, OrderStatus } from "@prisma/client";
import { AdminListQueryDto } from "../../../common/list";

export class AdminUserQueryDto {
  @ApiPropertyOptional({ example: "john" })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  isSeller?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  isVerified?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  isBanned?: boolean;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  limit?: number;
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

export class AuditLogQueryDto {
  @ApiPropertyOptional({ example: "user_update" })
  @IsOptional()
  @IsString()
  action?: string;

  @ApiPropertyOptional({ example: "uuid-admin-id" })
  @IsOptional()
  @IsString()
  adminId?: string;

  @ApiPropertyOptional({ example: "2024-01-01" })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({ example: "2024-12-31" })
  @IsOptional()
  @IsDateString()
  toDate?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 50 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  limit?: number;
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
