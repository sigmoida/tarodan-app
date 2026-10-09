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
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { AdDeviceType, AdPosition } from "@prisma/client";
import { BlankToNull } from "../../../common/transforms";
import {
  AD_LINK_URL_MAX_LENGTH,
  IsAdLinkUrl,
} from "../helpers/ad-link-url.validator";

// Pozisyon/cihaz enum'larının tek kaynağı Prisma şemasıdır; DTO'lar ve
// servis aynı değerleri buradan okur.
export { AdDeviceType, AdPosition };

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
      'Click destination: absolute http(s) URL or a site path starting with a single "/"',
    maxLength: AD_LINK_URL_MAX_LENGTH,
    nullable: true,
  })
  @IsOptional()
  @BlankToNull()
  @IsAdLinkUrl()
  linkUrl?: string | null;

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

  @ApiPropertyOptional({
    description: "Device type: desktop, mobile, all",
    enum: AdDeviceType,
    default: AdDeviceType.all,
  })
  @IsOptionalNotNull()
  @IsEnum(AdDeviceType)
  deviceType?: AdDeviceType;

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
