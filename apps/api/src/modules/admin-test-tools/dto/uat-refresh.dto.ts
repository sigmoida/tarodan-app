import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  Equals,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import {
  UAT_REFRESH_CONFIRM_PHRASE,
  type UatRefreshReport,
  type StartUatRefreshRequest,
} from "@tarodan/types";

/** `POST /admin/test-tools/uat-refresh` — süper admin "STAGING" yazarak onaylar. */
export class StartUatRefreshDto implements StartUatRefreshRequest {
  @ApiProperty({ enum: [UAT_REFRESH_CONFIRM_PHRASE] })
  @Equals(UAT_REFRESH_CONFIRM_PHRASE)
  confirm!: typeof UAT_REFRESH_CONFIRM_PHRASE;

  @ApiPropertyOptional({
    description: "Yalnız keşif + guard + döküm boyutu tahmini; veri değişmez",
  })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

export class UatRefreshMaskedCountDto {
  @ApiProperty()
  @IsString()
  @MaxLength(63)
  table!: string;

  @ApiProperty()
  @IsInt()
  @Min(0)
  rows!: number;
}

const REPORT_STATES = ["running", "succeeded", "failed"] as const;

/**
 * `POST /internal/uat-refresh/:runId/report` — workflow'un aşama raporu.
 * Bilinmeyen alan whitelist ile düşer; her alan sınırlı (makineden makineye
 * ama token sızarsa bile tabloyu şişiremesin).
 */
export class UatRefreshReportDto implements UatRefreshReport {
  @ApiProperty({ enum: REPORT_STATES })
  @IsIn(REPORT_STATES)
  state!: (typeof REPORT_STATES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  startedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  finishedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  sourceSnapshotAt?: string;

  @ApiPropertyOptional({ type: [UatRefreshMaskedCountDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => UatRefreshMaskedCountDto)
  masked?: UatRefreshMaskedCountDto[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @MaxLength(255, { each: true })
  migrationsApplied?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  backupFile?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  error?: string;

  /** Yalnız GitHub koşu bağlantısı: panel bu bağlantıyı tıklanabilir gösterir. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(/^https:\/\/github\.com\/[^\s]+$/)
  workflowRunUrl?: string;
}
