import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  Min,
  ValidateIf,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import {
  TRUST_BADGE_ICONS,
  TRUST_BADGE_LIMITS,
  type LocalizedText,
  type TrustBadgeIcon,
} from "@tarodan/types";
import { IsLocalizedText } from "../../../common/validators/localized-text";
import { LOCALIZED_TEXT_SCHEMA } from "./hero-slide.dto";

/** Yalnız `undefined` iken doğrulamayı atlar: null'ı REDDETMEK için. */
const IsOptionalNotNull = () => ValidateIf((_, value) => value !== undefined);

/**
 * Güven rozeti oluşturma gövdesi; güncelleme kısmi halidir (`null` yalnız
 * `description`'da geçer = temizle). Metin herkese açık süre belirteci
 * taşıyabilir: `{returnWindowDays}` vitrinde güncel değerle dolar.
 */
export class CreateTrustBadgeDto {
  @ApiProperty({ enum: TRUST_BADGE_ICONS })
  @IsIn([...TRUST_BADGE_ICONS])
  icon: TrustBadgeIcon;

  @ApiProperty({
    ...LOCALIZED_TEXT_SCHEMA,
    description: "{ tr, en? } — tr required; may contain {returnWindowDays}",
  })
  @IsLocalizedText({ maxLength: TRUST_BADGE_LIMITS.title, required: true })
  title: LocalizedText;

  @ApiPropertyOptional({ ...LOCALIZED_TEXT_SCHEMA, nullable: true })
  @IsOptional()
  @IsLocalizedText({
    maxLength: TRUST_BADGE_LIMITS.description,
    required: false,
  })
  description?: LocalizedText | null;

  @ApiPropertyOptional({ description: "Is active", default: true })
  @IsOptionalNotNull()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: "Order (lower first); default = last" })
  @IsOptionalNotNull()
  @IsInt()
  @Min(0)
  displayOrder?: number;
}

export class UpdateTrustBadgeDto extends PartialType(CreateTrustBadgeDto, {
  skipNullProperties: false,
}) {}
