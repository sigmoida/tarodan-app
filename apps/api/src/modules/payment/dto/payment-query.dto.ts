import {
  IsOptional,
  IsEnum,
  IsInt,
  IsString,
  IsDateString,
  Min,
  Max,
} from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { PaymentStatus } from "@prisma/client";
import { BlankToUndefined } from "../../../common/transforms";

/**
 * GET /payments/me query. `status` bir PaymentStatus'tur (pending/processing/
 * completed/failed/refunded); OrderStatus'taki `paid` burada geçersizdir ve
 * doğrulama olmadan Prisma'ya geçince 500 üretiyordu (TARODAN-API-1M).
 * Tarihler `YYYY-MM-DD` ve kapsayıcıdır; serviste `dateRangeWhere` ile uygulanır.
 */
export class PaymentQueryDto {
  @ApiPropertyOptional({
    enum: PaymentStatus,
    example: "completed",
    description: "Filter by payment status",
  })
  @IsOptional()
  @BlankToUndefined()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @ApiPropertyOptional({ example: "paytr" })
  @IsOptional()
  @BlankToUndefined()
  @IsString()
  provider?: string;

  @ApiPropertyOptional({
    example: "2026-01-01",
    description: "Date range start (YYYY-MM-DD, inclusive)",
  })
  @IsOptional()
  @BlankToUndefined()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    example: "2026-12-31",
    description: "Date range end (YYYY-MM-DD, inclusive)",
  })
  @IsOptional()
  @BlankToUndefined()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ example: 1, minimum: 1 })
  @IsOptional()
  @BlankToUndefined()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @BlankToUndefined()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
