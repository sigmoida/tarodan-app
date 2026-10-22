import {
  IsUUID,
  IsOptional,
  IsString,
  Min,
  Max,
  MaxLength,
  IsNotEmpty,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsTlAmount } from "../../../common/validators/tl-amount";

export class CreateOfferDto {
  @ApiProperty({
    example: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    description: "Product ID (UUID format) to make offer on",
  })
  @IsNotEmpty({ message: "Ürün ID gereklidir" })
  @IsUUID("4", {
    message: "Geçerli bir ürün ID giriniz (UUID formatında olmalıdır)",
  })
  productId: string;

  @ApiProperty({
    example: 250.0,
    description:
      "Offer amount in TRY with at most two decimals. Must not be below the minimum offer percentage of the product price (MIN_OFFER_PERCENTAGE, default 50; published as min_offer_percentage in GET /admin/settings/public) and must be below the product's current sale price (400 `server.offer.offerMustBeBelowPrice`).",
  })
  @IsNotEmpty({ message: "Teklif tutarı gereklidir" })
  // Text such as "250" is still converted (`@Type`): no `JsonNumber`, the
  // conversion is the existing contract for released clients.
  @Type(() => Number)
  @IsTlAmount({
    message: "Teklif tutarı en fazla iki ondalık basamaklı bir sayı olmalıdır",
  })
  @Min(1, { message: "Teklif en az 1 TL olmalıdır" })
  @Max(9999999, { message: "Teklif en fazla 9,999,999 TL olabilir" })
  amount: number;

  @ApiPropertyOptional({
    example: "Bu fiyata alabilir miyim?",
    description: "Optional message with the offer",
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}
