import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  TIMING_EXPIRY_ACTIONS,
  TIMING_RULE_IDS,
  type TimingRuleId,
} from "@tarodan/types";

/**
 * Tek kaydın değişikliği. Şekil burada, iş kuralları (tam sayı, sınırlar,
 * alanlar arası değişmezler, açık eylem) `TimingRulesService`te ve kaydın
 * kendisinde (`@tarodan/types`) denetlenir — admin ekranı aynı kuralları okur.
 */
export class TimingRuleChangeDto {
  @ApiProperty({ enum: TIMING_RULE_IDS, example: "returnWindowDays" })
  @IsString()
  @IsIn(TIMING_RULE_IDS)
  id: TimingRuleId;

  @ApiPropertyOptional({ example: 14, description: "Kaydın biriminde süre" })
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  value?: number;

  @ApiPropertyOptional({ enum: TIMING_EXPIRY_ACTIONS })
  @IsOptional()
  @IsString()
  action?: string;
}

/** `PATCH /admin/timing-rules` — birden çok kayıt tek seferde, atomik. */
export class UpdateTimingRulesDto {
  @ApiProperty({ type: [TimingRuleChangeDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(TIMING_RULE_IDS.length)
  @ValidateNested({ each: true })
  @Type(() => TimingRuleChangeDto)
  changes: TimingRuleChangeDto[];
}
