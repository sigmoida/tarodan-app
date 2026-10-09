import { PartialType } from "@nestjs/swagger";
import { CreateAdvertisementDto } from "./create-advertisement.dto";

/**
 * Kısmi güncelleme. `skipNullProperties: false`: varsayılan PartialType her
 * alana `@IsOptional()` ekler ve `null`'ı her alanda geçirirdi — `title: null`
 * ya da `position: null` doğrulamadan geçip Prisma'da 500 olurdu. Böylece
 * `null` yalnız oluşturma DTO'sunda `@IsOptional()` taşıyan (temizlenebilir)
 * alanlarda kabul edilir; zorunlu alanlarda 400'dür.
 */
export class UpdateAdvertisementDto extends PartialType(
  CreateAdvertisementDto,
  { skipNullProperties: false },
) {}
