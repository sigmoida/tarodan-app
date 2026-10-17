import { ApiProperty } from "@nestjs/swagger";
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsUUID } from "class-validator";
import { MAX_RENEW_BATCH } from "../../product/helpers/product-renewal";

/** Süresi dolmuş ilanların toplu yeniden yayına alınması — gövde. */
export class BulkRenewListingsDto {
  @ApiProperty({
    type: [String],
    description: `Süresi dolmuş ilan kimlikleri (en çok ${MAX_RENEW_BATCH})`,
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_RENEW_BATCH)
  @IsUUID("4", { each: true })
  productIds: string[];
}
