import {
  IsBoolean,
  IsOptional,
  IsString,
  IsIn,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  MaxLength,
  Min,
} from "class-validator";
import { PayoutStatus } from "@prisma/client";
import {
  PAYOUT_MANUAL_SETTLEMENT_METHODS,
  type PayoutManualSettlementMethod,
} from "@tarodan/types";
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

/** Satıcı kusurlu kalıntıyı platforma kapatma — geri dönülemez, sebep zorunlu. */
export class SettleHoldResidualDto {
  @ApiProperty({
    description: "Why the seller-fault residual is settled to the platform",
    maxLength: 500,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}

/**
 * Retry a failed or returned payout transfer. A transfer PayTR may have taken
 * (`resolution.retryRequiresProviderCheck` on the list row) needs
 * `confirmProviderChecked: true` and a reason; otherwise the body may be empty.
 */
export class RetryPayoutTransferDto {
  @ApiPropertyOptional({
    description:
      "The admin checked the PayTR panel: no transfer with this trans_id exists. Required (true) for a transfer whose outcome is unknown.",
  })
  @IsOptional()
  @IsBoolean()
  confirmProviderChecked?: boolean;

  @ApiPropertyOptional({
    description:
      "Why the transfer is retried. Required with confirmProviderChecked.",
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/**
 * "Mark as paid": record a failed payout transfer as paid without PayTR.
 * The list row says which method fits (`resolution.markPaidMethod`) and the
 * net to confirm (`resolution.markPaidNetAmount`).
 */
export class MarkPayoutTransferPaidDto {
  @ApiProperty({
    enum: PAYOUT_MANUAL_SETTLEMENT_METHODS,
    description:
      "paytr_confirmed: the PayTR panel shows the transfer arrived. external_bank: the platform paid the net from its own bank account.",
  })
  @IsIn(PAYOUT_MANUAL_SETTLEMENT_METHODS)
  method: PayoutManualSettlementMethod;

  @ApiProperty({
    description:
      "Bank transfer reference (external_bank) or PayTR panel reference (paytr_confirmed)",
    maxLength: 120,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  reference: string;

  @ApiProperty({ description: "Why it is marked as paid", maxLength: 500 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;

  @ApiProperty({
    description:
      "The net (TL) the admin confirms was paid; must equal the row's current net, else 409",
    example: 40,
  })
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0.01)
  expectedNetAmount: number;
}
