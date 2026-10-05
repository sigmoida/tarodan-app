import {
  IsBoolean,
  IsOptional,
  IsString,
  IsIn,
  IsDateString,
  IsNotEmpty,
  MaxLength,
} from "class-validator";
import { QueryBoolean } from "../../../common/transforms";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { AdminListQueryDto } from "../../../common/list";

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

export class PayoutExportQueryDto {
  @ApiPropertyOptional({ description: "Filter by seller ID" })
  @IsOptional()
  @IsString()
  sellerId?: string;

  @ApiPropertyOptional({ enum: ["held", "released", "cancelled"] })
  @IsOptional()
  @IsIn(["held", "released", "cancelled"])
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({
    description:
      "Only holds released EARLY (releasedAt before the planned releaseAt)",
    example: true,
  })
  @IsOptional()
  @QueryBoolean()
  @IsBoolean()
  earlyReleased?: boolean;
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
