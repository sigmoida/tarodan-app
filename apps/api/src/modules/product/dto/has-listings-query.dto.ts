import { IsBoolean, IsOptional } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { QueryBoolean } from "../../../common/transforms";

/**
 * Katalog taksonomisi listeleri (marka, üretici) için ortak filtre:
 * `?hasListings=true` yalnız vitrinde en az bir aktif ilanı olan kayıtları
 * döndürür (`publicListingWhere`). Gönderilmezse davranış değişmez.
 */
export class HasListingsQueryDto {
  @ApiPropertyOptional({
    example: true,
    description:
      "Only entries with at least one active, publicly visible listing",
  })
  @IsOptional()
  @QueryBoolean()
  @IsBoolean()
  hasListings?: boolean;
}
