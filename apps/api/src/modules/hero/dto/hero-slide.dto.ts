import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsUrl,
  MaxLength,
  Min,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { ContentPlatform, HeroImageSide, HeroPlacement } from "@prisma/client";
import {
  CLIENT_PLATFORMS,
  HERO_DEFAULT_CLIENT_PLATFORM,
  HERO_TEXT_LIMITS,
  type ClientPlatform,
  type LocalizedText,
} from "@tarodan/types";
import { BlankToNull } from "../../../common/transforms";
import { IsLocalizedText } from "../../../common/validators/localized-text";
import { IsOptionalNotNull } from "../../../common/validators/optional-not-null";
import {
  AD_LINK_URL_MAX_LENGTH,
  IsAdLinkUrl,
} from "../../advertisement/helpers/ad-link-url.validator";

/** Swagger şeması: `LocalizedText` (`{ tr, en? }`). */
export const LOCALIZED_TEXT_SCHEMA = {
  type: "object",
  properties: {
    tr: { type: "string" },
    en: { type: "string", nullable: true },
  },
};

// Yerleşim değerlerinin tek kaynağı Prisma enum'u; `HERO_PLACEMENTS`
// (@tarodan/types) aynı listedir — göç spec'i ikisini eşitler.

/** `GET /hero-slides?placement=&platform=` (public). */
export class HeroSlideQueryDto {
  @ApiProperty({ enum: HeroPlacement })
  @IsEnum(HeroPlacement)
  placement: HeroPlacement;

  @ApiPropertyOptional({
    enum: CLIENT_PLATFORMS,
    default: HERO_DEFAULT_CLIENT_PLATFORM,
    description:
      "Requesting client; sees slides targeted at it or at `all`. Absent = app (old mobile builds send no parameter)",
  })
  @IsOptional()
  @IsIn(CLIENT_PLATFORMS)
  platform?: ClientPlatform;
}

/** `GET /admin/hero-slides?placement=` — verilmezse tüm yerleşimler. */
export class AdminHeroSlideQueryDto {
  @ApiPropertyOptional({ enum: HeroPlacement })
  @IsOptional()
  @IsEnum(HeroPlacement)
  placement?: HeroPlacement;
}

/**
 * Oluşturma gövdesi. Güncelleme (`UpdateHeroSlideDto`) bunun kısmi halidir:
 * alan yok = dokunma, `null` = temizle (yalnız `@IsOptional()` taşıyan
 * alanlarda; zorunlu alanlara `null` 400'dür). Boş dize de temizleme sayılır
 * (`@BlankToNull`). Varsayılanlar servis içinde uygulanır — alan başlangıç
 * değeri PartialType ile kısmi sınıfa kopyalanıp PATCH'te alanı sıfırlardı.
 */
export class CreateHeroSlideDto {
  @ApiProperty({ enum: HeroPlacement })
  @IsEnum(HeroPlacement)
  placement: HeroPlacement;

  @ApiProperty({ description: "Wide image URL (https only)" })
  @IsUrl({ protocols: ["https"], require_protocol: true })
  @MaxLength(AD_LINK_URL_MAX_LENGTH)
  imageUrl: string;

  @ApiPropertyOptional({
    description: "Narrow/mobile image URL (https only); null = use imageUrl",
    nullable: true,
  })
  @IsOptional()
  @BlankToNull()
  @IsUrl({ protocols: ["https"], require_protocol: true })
  @MaxLength(AD_LINK_URL_MAX_LENGTH)
  mobileImageUrl?: string | null;

  @ApiPropertyOptional({ enum: HeroImageSide, default: HeroImageSide.right })
  @IsOptionalNotNull()
  @IsEnum(HeroImageSide)
  imageSide?: HeroImageSide;

  @ApiProperty({
    ...LOCALIZED_TEXT_SCHEMA,
    description: "{ tr, en? } — tr required",
  })
  @IsLocalizedText({ maxLength: HERO_TEXT_LIMITS.title, required: true })
  title: LocalizedText;

  @ApiPropertyOptional({ ...LOCALIZED_TEXT_SCHEMA, nullable: true })
  @IsOptional()
  @IsLocalizedText({ maxLength: HERO_TEXT_LIMITS.subtitle, required: false })
  subtitle?: LocalizedText | null;

  @ApiPropertyOptional({ ...LOCALIZED_TEXT_SCHEMA, nullable: true })
  @IsOptional()
  @IsLocalizedText({ maxLength: HERO_TEXT_LIMITS.imageAlt, required: false })
  imageAlt?: LocalizedText | null;

  @ApiPropertyOptional({
    ...LOCALIZED_TEXT_SCHEMA,
    nullable: true,
    description: "Button 1 label; needs cta1Href (both or neither)",
  })
  @IsOptional()
  @IsLocalizedText({ maxLength: HERO_TEXT_LIMITS.ctaLabel, required: false })
  cta1Label?: LocalizedText | null;

  @ApiPropertyOptional({
    description:
      'Button 1 target: http(s) URL or a site path starting with a single "/"',
    nullable: true,
  })
  @IsOptional()
  @BlankToNull()
  @IsAdLinkUrl()
  cta1Href?: string | null;

  @ApiPropertyOptional({
    ...LOCALIZED_TEXT_SCHEMA,
    nullable: true,
    description: "Button 2 label; needs cta2Href (both or neither)",
  })
  @IsOptional()
  @IsLocalizedText({ maxLength: HERO_TEXT_LIMITS.ctaLabel, required: false })
  cta2Label?: LocalizedText | null;

  @ApiPropertyOptional({
    description:
      'Button 2 target: http(s) URL or a site path starting with a single "/"',
    nullable: true,
  })
  @IsOptional()
  @BlankToNull()
  @IsAdLinkUrl()
  cta2Href?: string | null;

  @ApiPropertyOptional({
    description: "Mobile app hides this slide on iOS; web ignores it",
    default: false,
  })
  @IsOptionalNotNull()
  @IsBoolean()
  hideOnIos?: boolean;

  @ApiPropertyOptional({
    enum: ContentPlatform,
    default: ContentPlatform.all,
    description: "Target client: web (site), app (mobile app), all (both)",
  })
  @IsOptionalNotNull()
  @IsEnum(ContentPlatform)
  platform?: ContentPlatform;

  @ApiPropertyOptional({ description: "Is active", default: true })
  @IsOptionalNotNull()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: "Order within the placement (lower first); default = last",
  })
  @IsOptionalNotNull()
  @IsInt()
  @Min(0)
  displayOrder?: number;

  @ApiPropertyOptional({
    description: "Start instant, ISO 8601 with offset; null = unbounded",
    nullable: true,
  })
  @IsOptional()
  @BlankToNull()
  @IsDateString()
  startDate?: string | null;

  @ApiPropertyOptional({
    description: "End instant, ISO 8601 with offset; null = unbounded",
    nullable: true,
  })
  @IsOptional()
  @BlankToNull()
  @IsDateString()
  endDate?: string | null;
}

/** Kısmi güncelleme — `null` yalnız temizlenebilir alanlarda geçer. */
export class UpdateHeroSlideDto extends PartialType(CreateHeroSlideDto, {
  skipNullProperties: false,
}) {}
