import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { Transform, Type } from "class-transformer";
import { ApiPropertyOptional, ApiProperty } from "@nestjs/swagger";
import { PaytrMatchStatus } from "@prisma/client";
import { BlankToUndefined } from "../../../../common/transforms";

/** GET admin/finance/psp/reconciliation */
export class PspReconciliationQueryDto {
  @ApiPropertyOptional({ example: 7, minimum: 1, maximum: 31 })
  @IsOptional()
  @BlankToUndefined()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(31)
  days?: number;
}

export const PSP_LINE_FILTERS = [
  "problem",
  "all",
  ...Object.values(PaytrMatchStatus),
] as const;
export type PspLineFilter = (typeof PSP_LINE_FILTERS)[number];

/** GET admin/finance/psp/statement-lines */
export class PspStatementLinesQueryDto {
  @ApiPropertyOptional({ enum: PSP_LINE_FILTERS, example: "problem" })
  @IsOptional()
  @BlankToUndefined()
  @IsIn(PSP_LINE_FILTERS)
  status?: PspLineFilter;

  @ApiPropertyOptional({ example: 1, minimum: 1 })
  @IsOptional()
  @BlankToUndefined()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @BlankToUndefined()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  /** Çözümlenmiş (admin kapattı) satırlar varsayılan listede görünmez. */
  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @BlankToUndefined()
  @Transform(({ value }) => value === true || value === "true")
  @IsBoolean()
  includeResolved?: boolean;
}

/** GET admin/finance/psp/missing-payments?date=YYYY-MM-DD */
export class PspMissingPaymentsQueryDto {
  @ApiProperty({
    example: "2026-09-01",
    description: "İstanbul günü (YYYY-MM-DD)",
  })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;
}

/** GET admin/finance/psp/settlements */
export class PspSettlementsQueryDto {
  @ApiPropertyOptional({ example: 60, minimum: 1, maximum: 200 })
  @IsOptional()
  @BlankToUndefined()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @ApiPropertyOptional({ example: 31, minimum: 1, maximum: 366 })
  @IsOptional()
  @BlankToUndefined()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(366)
  days?: number;
}

/** POST admin/finance/psp/statement-lines/:id/resolve */
export class ResolveStatementLineDto {
  @ApiProperty({ example: "PayTR panelinden teyit edildi; test işlemi." })
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  note!: string;
}
