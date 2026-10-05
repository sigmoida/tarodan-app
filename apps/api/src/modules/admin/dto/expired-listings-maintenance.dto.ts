import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";

export const EXPIRED_LISTING_MODES = ["mark", "reactivate"] as const;
export type ExpiredListingMode = (typeof EXPIRED_LISTING_MODES)[number];

/**
 * Süresi dolmuş ilanları (işaretsiz eski kayıtlar) bulup işaretleyen/yeniden
 * açan tek seferlik bakım işleminin gövdesi. Varsayılanlar en güvenli seçimdir:
 * kuru çalıştırma + yalnız işaretleme.
 */
export class ExpiredListingsMaintenanceDto {
  @ApiPropertyOptional({
    enum: EXPIRED_LISTING_MODES,
    default: "mark",
    description:
      "mark = yalnız 'süresi doldu' işareti (satıcı tek tıkla yeniler); reactivate = işaretle ve yönetici onayıyla yeniden yayına al",
  })
  @IsOptional()
  @IsIn(EXPIRED_LISTING_MODES)
  mode?: ExpiredListingMode;

  @ApiPropertyOptional({
    default: true,
    description:
      "true (varsayılan) = hiçbir şey yazmaz, yalnız eşleşenleri raporlar",
  })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  @ApiPropertyOptional({
    description:
      "Seçimde kullanılacak ilan ömrü (gün). Verilmezse bugünkü Süreler ve Kurallar değeri.",
    minimum: 7,
    maximum: 365,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(7)
  @Max(365)
  ttlDays?: number;

  @ApiPropertyOptional({
    default: 3,
    description:
      "Dolum anından sonra kabul edilen tolerans (gün): gece işi bu kadar gecikmiş olabilir.",
    minimum: 1,
    maximum: 30,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  graceDays?: number;

  @ApiPropertyOptional({
    default: 200,
    description:
      "Bir çalıştırmada işlenecek en çok ilan (kalanlar için tekrar çalıştırın).",
    minimum: 1,
    maximum: 1000,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number;

  @ApiPropertyOptional({
    default: false,
    description:
      "mark modunda: güncel içeriği 'onaylı içerik' say (yönetici kararı) → satıcı yenilemesi moderasyona girmeden yayına döner. Kapalıysa yenileme normal onay kuralından geçer.",
  })
  @IsOptional()
  @IsBoolean()
  stampBaseline?: boolean;
}
