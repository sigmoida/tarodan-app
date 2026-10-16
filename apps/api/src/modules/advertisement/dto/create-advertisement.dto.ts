import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  IsDateString,
  IsUrl,
  Min,
  IsEnum,
  Max,
  MaxLength,
  ValidateIf,
  IsArray,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { AdPopupFrequency, AdPosition, ContentPlatform } from "@prisma/client";
import { BlankToNull } from "../../../common/transforms";
import {
  AD_LINK_URL_MAX_LENGTH,
  IsAdLinkUrl,
} from "../helpers/ad-link-url.validator";
import { AdHotspotDto } from "./ad-hotspot.dto";

// Pozisyon/platform/sıklık enum'larının tek kaynağı Prisma şemasıdır; DTO'lar
// ve servis aynı değerleri buradan okur.
export { AdPopupFrequency, AdPosition, ContentPlatform };

// IAB Standard Ad Sizes
export const IAB_STANDARD_SIZES = [
  { name: "Leaderboard", width: 728, height: 90 },
  { name: "Medium Rectangle", width: 300, height: 250 },
  { name: "Wide Skyscraper", width: 160, height: 600 },
  { name: "Half Page", width: 300, height: 600 },
  { name: "Billboard", width: 970, height: 250 },
  { name: "Mobile Leaderboard", width: 320, height: 50 },
  { name: "Mobile Banner", width: 320, height: 100 },
  { name: "Large Mobile Banner", width: 320, height: 480 },
  { name: "Square", width: 250, height: 250 },
  { name: "Small Square", width: 200, height: 200 },
] as const;

/** Banner piksel sınırı: retina masaüstü banner'ları (2×1920) sığsın. */
export const AD_DIMENSION_MAX = 4000;

/**
 * Yalnız `undefined` iken doğrulamayı atlar: null'ı REDDETMEK için. Şemada
 * null olamayan alanlarda (`position`, `isActive`…) `@IsOptional()` null'ı
 * sessizce geçirir ve hata Prisma'da 500 olarak patlardı.
 */
const IsOptionalNotNull = () => ValidateIf((_, value) => value !== undefined);

/**
 * Oluşturma gövdesi. Güncelleme (`UpdateAdvertisementDto`) bunun kısmi
 * halidir; temizlenebilir alanlar `@IsOptional()` taşır ve güncellemede
 * `null` = alanı temizle, alan yok = dokunma demektir. Boş dize de temizleme
 * sayılır (`@BlankToNull`): formlar boşaltılan alanı `""` olarak gönderir.
 *
 * Alan başlangıç değeri (`= AdPosition.header` gibi) BİLİNÇLİ olarak yok:
 * PartialType başlangıç değerlerini kısmi sınıfa da kopyalar, yani yalnız
 * `{ isActive: false }` gönderen bir PATCH pozisyonu `header`'a, sırayı 0'a
 * sıfırlıyordu. Varsayılanlar `create` içinde uygulanır.
 */
export class CreateAdvertisementDto {
  @ApiProperty({ description: "Ad title", maxLength: 200 })
  @IsString()
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional({
    description:
      "Duyurulan kampanya. Bağlanırsa şerit kampanyanın adını/kodunu okur ve kampanya bitince duyuru kendiliğinden düşer. Güncellemede null ya da boş dize bağı kaldırır.",
    nullable: true,
  })
  @IsOptional()
  @BlankToNull()
  @IsString()
  discountId?: string | null;

  @ApiPropertyOptional({
    description: "Image URL (https only)",
    maxLength: AD_LINK_URL_MAX_LENGTH,
    nullable: true,
  })
  @IsOptional()
  @BlankToNull()
  @IsUrl({ protocols: ["https"], require_protocol: true })
  @MaxLength(AD_LINK_URL_MAX_LENGTH)
  imageUrl?: string | null;

  @ApiPropertyOptional({
    description:
      'Click destination of a TEXT ad (no image): absolute http(s) URL or a site path starting with a single "/". Ignored on an image ad — stored as null; image ads are clickable only through `hotspots`.',
    maxLength: AD_LINK_URL_MAX_LENGTH,
    nullable: true,
  })
  @IsOptional()
  @BlankToNull()
  @IsAdLinkUrl()
  linkUrl?: string | null;

  /**
   * Görselli reklamın tıklanabilir alanları. Gönderilirse kümenin TAMAMINI
   * değiştirir (sıra = `sortOrder`); gönderilmezse dokunulmaz. `null` kabul
   * edilmez — temizlemek için `[]`.
   */
  @ApiPropertyOptional({
    description:
      "Clickable areas on the image (image ads only). When present, replaces the full set: items with a persisted `id` are kept (with their click count), missing ones are deleted, new ones created; array order = sortOrder. Absent = unchanged; `[]` clears.",
    type: [AdHotspotDto],
  })
  @IsOptionalNotNull()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdHotspotDto)
  hotspots?: AdHotspotDto[];

  @ApiPropertyOptional({
    description: "Plain text content",
    maxLength: 2000,
    nullable: true,
  })
  @IsOptional()
  @BlankToNull()
  @IsString()
  @MaxLength(2000)
  content?: string | null;

  @ApiPropertyOptional({
    description: "Alt text for accessibility",
    maxLength: 300,
    nullable: true,
  })
  @IsOptional()
  @BlankToNull()
  @IsString()
  @MaxLength(300)
  altText?: string | null;

  @ApiPropertyOptional({
    description: "Image width in pixels",
    maximum: AD_DIMENSION_MAX,
    nullable: true,
  })
  @IsOptional()
  @BlankToNull()
  @IsInt()
  @Min(1)
  @Max(AD_DIMENSION_MAX)
  width?: number | null;

  @ApiPropertyOptional({
    description: "Image height in pixels",
    maximum: AD_DIMENSION_MAX,
    nullable: true,
  })
  @IsOptional()
  @BlankToNull()
  @IsInt()
  @Min(1)
  @Max(AD_DIMENSION_MAX)
  height?: number | null;

  @ApiPropertyOptional({
    description: "Slot: topbar, header, footer, inline, popup",
    enum: AdPosition,
    default: AdPosition.header,
  })
  @IsOptionalNotNull()
  @IsEnum(AdPosition)
  position?: AdPosition;

  /**
   * Eski `deviceType` alanı gövdeden kalktı (whitelist sessizce düşürür);
   * kolon `platform`'dan türetilir.
   */
  @ApiPropertyOptional({
    description:
      "Client the ad is shown on: web (site), app (mobile app), all (both)",
    enum: ContentPlatform,
    default: ContentPlatform.all,
  })
  @IsOptionalNotNull()
  @IsEnum(ContentPlatform)
  platform?: ContentPlatform;

  @ApiPropertyOptional({
    description:
      "Popup slot only: until_dismissed (shown on every home visit until the visitor closes it) or every_visit (shown on every home visit)",
    enum: AdPopupFrequency,
    default: AdPopupFrequency.until_dismissed,
  })
  @IsOptionalNotNull()
  @IsEnum(AdPopupFrequency)
  popupFrequency?: AdPopupFrequency;

  @ApiPropertyOptional({
    description: "Display order (lower = first)",
    default: 0,
  })
  @IsOptionalNotNull()
  @IsInt()
  @Min(0)
  displayOrder?: number;

  @ApiPropertyOptional({ description: "Is active", default: true })
  @IsOptionalNotNull()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description:
      "Start instant, ISO 8601 with offset (admin sends Istanbul 00:00:00)",
    nullable: true,
  })
  @IsOptional()
  @BlankToNull()
  @IsDateString()
  startDate?: string | null;

  @ApiPropertyOptional({
    description:
      "End instant, ISO 8601 with offset (admin sends Istanbul 23:59:59.999)",
    nullable: true,
  })
  @IsOptional()
  @BlankToNull()
  @IsDateString()
  endDate?: string | null;
}
