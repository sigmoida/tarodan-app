import {
  IsBoolean,
  IsOptional,
  IsString,
  IsIn,
  IsDateString,
  IsNotEmpty,
  MaxLength,
} from "class-validator";
import { PayoutStatus } from "@prisma/client";
import { QueryBoolean } from "../../../common/transforms";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { AdminListQueryDto } from "../../../common/list";

/** Transferler sekmesinin durum süzgeci: "all" ya da bir `PayoutStatus`. */
const TRANSFER_STATUS_FILTERS = ["all", ...Object.values(PayoutStatus)];

export class PayoutTransactionsQueryDto extends AdminListQueryDto {
  @ApiPropertyOptional({
    description: "Search by seller name, email or order number",
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: "Filter by seller ID" })
  @IsOptional()
  @IsString()
  sellerId?: string;

  @ApiPropertyOptional({ enum: ["held", "released", "cancelled"] })
  @IsOptional()
  @IsIn(["held", "released", "cancelled"])
  status?: string;

  @ApiPropertyOptional({ example: "2024-01-01" })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ example: "2024-12-31" })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  // Query string'den "false" gelince de false olmalı (dönüşümsüz hali truthy).
  @ApiPropertyOptional({
    description:
      "Only holds released EARLY (releasedAt before the planned releaseAt)",
    example: true,
  })
  @IsOptional()
  @QueryBoolean()
  @IsBoolean()
  earlyReleased?: boolean;

  @ApiPropertyOptional({
    description:
      "Only OVERDUE holds: still held although their release date has passed (the dashboard's holdsOverdue set)",
    example: true,
  })
  @IsOptional()
  @QueryBoolean()
  @IsBoolean()
  overdue?: boolean;
}

export class PayoutScheduleQueryDto extends AdminListQueryDto {
  @ApiPropertyOptional({
    description: "Search by seller name, email or order number",
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: "Filter by seller ID" })
  @IsOptional()
  @IsString()
  sellerId?: string;
}

/**
 * Transferler sekmesi — liste ve Excel dökümü AYNI DTO'yu alır. `status`
 * "all" ya da bir `PayoutStatus`; tarih uçları Türkiye günüdür.
 */
export class PayoutTransfersQueryDto extends AdminListQueryDto {
  @ApiPropertyOptional({
    description: "Search by seller name, email or order number",
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: '"all" or a PayoutStatus (failed, returned, completed, …)',
    enum: TRANSFER_STATUS_FILTERS,
  })
  @IsOptional()
  @IsIn(TRANSFER_STATUS_FILTERS)
  status?: string;

  @ApiPropertyOptional({ example: "2024-01-01" })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ example: "2024-12-31" })
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}

export class ReleasePayoutDto {
  @ApiProperty({ description: "Manual release reason", maxLength: 500 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;

  @ApiPropertyOptional({
    description:
      "Early release: skip only the hold-date check. Delivery/refund/frozen guards still apply.",
  })
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}
