import { IsOptional, IsString, MaxLength } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  LISTING_REMOVAL_DETAIL_MAX_LENGTH,
  LISTING_REMOVAL_PLATFORMS,
  LISTING_REMOVAL_REASON_OPTIONS,
} from "@tarodan/types";

/**
 * Satıcının silme/pasife alma nedeni — `DELETE /products/:id` gövdesi ve
 * `PATCH /products/:id` (status=inactive) alanları.
 *
 * Üçü de OPSİYONEL: yayındaki mobil sürümler göndermez; nedensiz istek kabul
 * edilir ve `not_given` kaydedilir. Hangi nedenin hangi eylemde seçilebildiği,
 * platformun ne zaman zorunlu olduğu ve uzunluk sınırı DTO'da değil
 * paylaşılan kuralda (`listingRemovalIssue`, @tarodan/types) — servis onu
 * uygular ve yerelleştirilmiş mesajla 400 döner. Buradaki `MaxLength` yalnız
 * aşırı büyük gövdeye karşı bir emniyet.
 */
export class ListingRemovalFieldsDto {
  @ApiPropertyOptional({
    enum: [
      ...new Set([
        ...(LISTING_REMOVAL_REASON_OPTIONS.seller.delete ?? []),
        ...(LISTING_REMOVAL_REASON_OPTIONS.seller.deactivate ?? []),
      ]),
    ],
    example: "sold_elsewhere",
    description:
      "Why the seller removes the listing. Delete: changed_mind | sold_elsewhere. Deactivate: also paused_temporarily. Omitted → recorded as not_given.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  removalReason?: string | null;

  @ApiPropertyOptional({
    enum: [...LISTING_REMOVAL_PLATFORMS],
    example: "dolap",
    description:
      "Required when removalReason = sold_elsewhere; `other` also requires removalDetail (the platform's name).",
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  removalPlatform?: string | null;

  @ApiPropertyOptional({
    example: "Bir koleksiyoncuya elden sattım",
    description: `Optional free text (max ${LISTING_REMOVAL_DETAIL_MAX_LENGTH}). Visible to Tarodan admins only, never on the storefront.`,
  })
  @IsOptional()
  @IsString()
  @MaxLength(LISTING_REMOVAL_DETAIL_MAX_LENGTH * 4)
  removalDetail?: string | null;
}

/** `DELETE /products/:id` gövdesi (tamamen opsiyonel). */
export class DeleteProductDto extends ListingRemovalFieldsDto {}

/** DTO alanlarını paylaşılan kuralın giriş şekline çevirir. */
export function removalInputOf(dto: ListingRemovalFieldsDto | undefined): {
  reason: string | null | undefined;
  platform: string | null | undefined;
  detail: string | null | undefined;
} {
  return {
    reason: dto?.removalReason,
    platform: dto?.removalPlatform,
    detail: dto?.removalDetail,
  };
}
