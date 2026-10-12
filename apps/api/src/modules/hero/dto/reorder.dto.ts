import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

/**
 * Sıralama gövdesi (`PATCH /admin/hero-slides/reorder`,
 * `PATCH /admin/trust-badges/reorder`): dizi sırası = `displayOrder`.
 * Kimlikler uuid şartı taşımaz — seed satırları sabit, okunur kimlik taşır.
 */
export class ReorderHeroItemsDto {
  @ApiProperty({ description: "Ordered ids", type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  ids: string[];
}
