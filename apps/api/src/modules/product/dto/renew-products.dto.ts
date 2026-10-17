import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { MAX_RENEW_BATCH } from "../helpers/product-renewal";

/** `POST /products/my/renew` gövdesi — yenilenecek ilanlar. */
export class RenewProductsDto {
  @ApiProperty({
    type: [String],
    description: "Yenilenecek (süresi dolmuş) ilan UUID'leri",
    maxItems: MAX_RENEW_BATCH,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_RENEW_BATCH)
  @IsUUID("all", { each: true })
  ids: string[];
}
