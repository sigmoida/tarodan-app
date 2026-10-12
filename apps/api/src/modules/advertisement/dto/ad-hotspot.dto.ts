import {
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { AD_HOTSPOT_LABEL_MAX } from "@tarodan/types";
import { IsAdLinkUrl } from "../helpers/ad-link-url.validator";

const FINITE = { allowNaN: false, allowInfinity: false } as const;

/**
 * Görsel üzerindeki tek tıklanabilir alan. DTO yalnız biçimi denetler; sınır,
 * en küçük boyut, çakışma ve en çok alan sayısı listeyi bir bütün olarak
 * isteyen kurallardır — serviste `validateAdHotspots` (@tarodan/types) ile,
 * admin formuyla AYNI fonksiyondan, yerelleştirilmiş hatayla denetlenir.
 */
export class AdHotspotDto {
  @ApiPropertyOptional({
    description:
      "Kayıtlı alanın kimliği: verilirse alan (tık sayacıyla) korunur, yoksa yeni alan",
    format: "uuid",
  })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty({ description: "Sol kenar, görsel eninin kesri (0–1)" })
  @IsNumber(FINITE)
  x: number;

  @ApiProperty({ description: "Üst kenar, görsel boyunun kesri (0–1)" })
  @IsNumber(FINITE)
  y: number;

  @ApiProperty({ description: "En, görsel eninin kesri (0–1)" })
  @IsNumber(FINITE)
  width: number;

  @ApiProperty({ description: "Boy, görsel boyunun kesri (0–1)" })
  @IsNumber(FINITE)
  height: number;

  @ApiProperty({
    description: "Alanın adı (istatistik + ekran okuyucu etiketi)",
    maxLength: AD_HOTSPOT_LABEL_MAX,
  })
  @IsString()
  @MaxLength(AD_HOTSPOT_LABEL_MAX)
  label: string;

  @ApiProperty({
    description:
      'Tıklama hedefi: mutlak http(s) URL ya da tek "/" ile başlayan site içi yol',
  })
  @IsAdLinkUrl()
  linkUrl: string;
}
