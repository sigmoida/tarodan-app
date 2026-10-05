import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsBoolean, IsIn, IsOptional, IsString } from "class-validator";
import {
  GIB_LISTING_STATUSES,
  GIB_SELLER_KINDS,
  type GibListingStatus,
  type GibSellerKind,
} from "@tarodan/types";

import { AdminListQueryDto } from "../../../common/list";

/**
 * GİB ilan / satıcı raporu ve Excel dökümü — ikisi AYNI filtreyi alır (döküm
 * ekranda görüleni indirir). Tarih aralığı İLANIN YAYIN tarihi (`publishedAt`)
 * üzerindendir; hiç yayınlanmamış ilan aralık verilince dışarıda kalır.
 */
export class GibReportQueryDto extends AdminListQueryDto {
  @ApiPropertyOptional({
    example: "ahmet",
    description:
      "İlan başlığı / kodu, satıcı adı, kullanıcı adı, firma adı, vergi no, " +
      "banka hesabı sahibi (silinmiş hesapta arşivdeki ad)",
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: GIB_LISTING_STATUSES })
  @IsOptional()
  @IsIn(GIB_LISTING_STATUSES)
  status?: GibListingStatus;

  @ApiPropertyOptional({ enum: GIB_SELLER_KINDS })
  @IsOptional()
  @IsIn(GIB_SELLER_KINDS)
  sellerKind?: GibSellerKind;

  /** Yalnız TCKN / vergi numarası hiçbir kaynakta bulunmayan satıcıların ilanları. */
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  identityIncomplete?: boolean;
}
