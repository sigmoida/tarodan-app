import {
  IsBoolean,
  IsOptional,
  IsDateString,
  IsEnum,
  IsString,
  IsNotEmpty,
  IsIn,
  Matches,
  MaxLength,
  Validate,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from "class-validator";
import { ApiPropertyOptional, ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { OrderStatus } from "@prisma/client";
import {
  ANALYTICS_EXPORT_FORMATS,
  ANALYTICS_GROUP_BYS,
  DASHBOARD_PERIODS,
  DEFAULT_ANALYTICS_GROUP_BY,
  DEFAULT_DASHBOARD_PERIOD,
  analyticsRangeIssue,
  dashboardRangeIssue,
  type AnalyticsExportFormat,
  type AnalyticsGroupBy,
  type AnalyticsRangeQuery,
  type DashboardPeriod,
  type DashboardPeriodQuery,
} from "@tarodan/types";

export class AnalyticsQueryDto {
  @ApiPropertyOptional({ description: "Start date (ISO format)" })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: "End date (ISO format)" })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class SalesAnalyticsResponseDto {
  @ApiProperty({ description: "Date label" })
  date: string;

  @ApiProperty({ description: "Total sales amount" })
  totalSales: number;

  @ApiProperty({ description: "Number of orders" })
  orderCount: number;

  @ApiProperty({ description: "Average order value" })
  averageOrderValue: number;
}

export class RevenueAnalyticsResponseDto {
  @ApiProperty({ description: "Date label" })
  date: string;

  @ApiProperty({ description: "Gross revenue" })
  grossRevenue: number;

  @ApiProperty({ description: "Commission earned" })
  commissionRevenue: number;

  @ApiProperty({ description: "Net revenue (after refunds)" })
  netRevenue: number;
}

export class UserAnalyticsResponseDto {
  @ApiProperty({ description: "Date label" })
  date: string;

  @ApiProperty({ description: "New user registrations" })
  newUsers: number;

  @ApiProperty({ description: "Active users (made a purchase or listing)" })
  activeUsers: number;

  @ApiProperty({ description: "New sellers registered" })
  newSellers: number;
}

export class ReportQueryDto {
  @ApiPropertyOptional({
    description: "Report format",
    enum: ["pdf", "csv", "json"],
  })
  @IsOptional()
  @IsString()
  format?: "pdf" | "csv" | "json" = "json";

  @ApiPropertyOptional({ description: "Start date (ISO format)" })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: "End date (ISO format)" })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class UpdateOrderStatusDto {
  @ApiProperty({ description: "New order status", enum: OrderStatus })
  @IsEnum(OrderStatus)
  status: OrderStatus;

  @ApiProperty({ description: "Admin operation reason", maxLength: 500 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  notes: string;
}

/** POST /admin/orders/:id/cancel — kargo öncesi platform iptali (tam iade). */
export class AdminCancelOrderDto {
  @ApiProperty({
    description:
      "İptal gerekçesi — denetim kaydına yazılır ve iptal e-postasında alıcıya/satıcıya iletilir",
    maxLength: 500,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}

export class AddOrderTrackingDto {
  @ApiProperty({ description: "Carrier tracking number", maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/^[A-Za-z0-9_-]+$/)
  trackingNumber: string;

  @ApiProperty({ enum: ["surat"] })
  @IsIn(["surat"])
  carrier: "surat";

  @ApiProperty({ description: "Admin operation reason", maxLength: 500 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  notes: string;
}

/**
 * `from`/`to` coherence for a custom dashboard period. The rule itself lives in
 * `@tarodan/types` (`dashboardRangeIssue`) so the admin filter, this DTO and the
 * range resolver all agree on what a valid range is.
 */
@ValidatorConstraint({ name: "dashboardRange", async: false })
export class DashboardRangeConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    return dashboardRangeIssue(args.object as DashboardPeriodQuery) === null;
  }

  defaultMessage(args: ValidationArguments): string {
    const issue = dashboardRangeIssue(args.object as DashboardPeriodQuery);
    return issue === "reversed"
      ? "`from` must be on or before `to`"
      : "`period=custom` needs a valid `from` and `to`";
  }
}

/**
 * Query for `GET /admin/dashboard`. The allowed periods come from
 * `@tarodan/types`, so the admin UI and this DTO cannot drift.
 */
export class DashboardStatsQueryDto implements DashboardPeriodQuery {
  @ApiPropertyOptional({
    enum: DASHBOARD_PERIODS,
    default: DEFAULT_DASHBOARD_PERIOD,
    description: "Window the headline figures are measured over",
  })
  @IsOptional()
  @IsIn(DASHBOARD_PERIODS)
  // Anchored on `period`, not on `from`/`to`: `@IsOptional()` skips every
  // validator on an absent property, so a custom range missing one end would
  // otherwise never be checked.
  @Validate(DashboardRangeConstraint)
  period?: DashboardPeriod = DEFAULT_DASHBOARD_PERIOD;

  @ApiPropertyOptional({
    description: "Inclusive range start (ISO date) — period=custom only",
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    description: "Inclusive range end (ISO date) — period=custom only",
  })
  @IsOptional()
  @IsDateString()
  to?: string;
}

/**
 * Aralığın tutarlılığı. Kural `@tarodan/types`ta (`analyticsRangeIssue`) durur;
 * DTO, aralık çözücü ve admin filtresi aynı tanıma bakar.
 */
@ValidatorConstraint({ name: "analyticsRange", async: false })
export class AnalyticsRangeConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    return analyticsRangeIssue(args.object as AnalyticsRangeQuery) === null;
  }

  defaultMessage(args: ValidationArguments): string {
    const issue = analyticsRangeIssue(args.object as AnalyticsRangeQuery);
    if (issue === "reversed") return "`from` must be on or before `to`";
    if (issue === "tooLong") return "the range is longer than the maximum";
    return "`from` and `to` must be given together, as valid dates";
  }
}

/**
 * Her `GET /admin/analytics/*` ucunun sorgusu.
 *
 * Aralık kuralı `groupBy`a ÇAPALANIR, `from`/`to`ya değil: `@IsOptional()`
 * eksik bir alanın TÜM doğrulayıcılarını atlar, yani tek ucu verilmiş bir
 * aralık hiç denetlenmezdi. `groupBy`ın varsayılanı olduğu için kural her
 * istekte çalışır.
 */
export class AnalyticsRangeQueryDto implements AnalyticsRangeQuery {
  @ApiPropertyOptional({
    enum: ANALYTICS_GROUP_BYS,
    default: DEFAULT_ANALYTICS_GROUP_BY,
    description: "Bucket size of the time series",
  })
  @IsOptional()
  @IsIn(ANALYTICS_GROUP_BYS)
  @Validate(AnalyticsRangeConstraint)
  groupBy?: AnalyticsGroupBy = DEFAULT_ANALYTICS_GROUP_BY;

  @ApiPropertyOptional({ description: "Inclusive range start (ISO date)" })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: "Inclusive range end (ISO date)" })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    description: "Also measure the preceding window of equal length",
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === "true")
  @IsBoolean()
  compare?: boolean;
}

/** Dışa aktarım sorgusu — ekranla AYNI aralık, artı dosya biçimi. */
export class AnalyticsExportQueryDto extends AnalyticsRangeQueryDto {
  @ApiPropertyOptional({
    enum: ANALYTICS_EXPORT_FORMATS,
    default: "csv",
  })
  @IsOptional()
  @IsIn(ANALYTICS_EXPORT_FORMATS)
  format?: AnalyticsExportFormat = "csv";
}
