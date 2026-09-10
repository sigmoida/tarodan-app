import { ApiPropertyOptional, ApiProperty } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";
import { IdentitySnapshotSource } from "@prisma/client";

import { AdminListQueryDto } from "../../../common/list";

/** Silinen hesap kimlik arşivi listesi. */
export class DeletedUserIdentityQueryDto extends AdminListQueryDto {
  @ApiPropertyOptional({ example: "ahmet" })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: IdentitySnapshotSource })
  @IsOptional()
  @IsIn(Object.values(IdentitySnapshotSource))
  source?: IdentitySnapshotSource;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  wasSeller?: boolean;

  /**
   * Saklama süresi (retainUntil) geçmiş kayıtlar. Otomatik imha bilinçli olarak
   * yok; bu filtre süresi dolanları GÖRÜNÜR bir manuel kuyruğa çevirir.
   */
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  retentionExpired?: boolean;
}

/**
 * Aylık bildirim dosyası. Dönem ZORUNLU: sınırsız bir tam-tablo dışa aktarımı,
 * tek istekle bütün kimlik havuzunu dışarı taşıyan bir uca dönüşürdü.
 *
 * Filtre HER ZAMAN `deletedAt` üzerinden — arşiv satırının `createdAt`'i değil:
 * backfill ile üretilen satırların hepsi aynı güne düşer ve dönem raporu makul
 * görünen bir biçimde yanlış çıkardı.
 */
export class DeletedUserIdentityExportQueryDto {
  @ApiProperty({ example: 2026, minimum: 2020, maximum: 2100 })
  @Type(() => Number)
  @IsInt()
  @Min(2020)
  @Max(2100)
  year!: number;

  @ApiProperty({ example: 9, minimum: 1, maximum: 12 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  wasSeller?: boolean;
}
