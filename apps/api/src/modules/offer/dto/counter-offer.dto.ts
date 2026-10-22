import { Min, Max, IsOptional, IsString, MaxLength } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { TL_NEGOTIATED_AMOUNT_MAX } from "@tarodan/types";
import { IsTlAmount } from "../../../common/validators/tl-amount";

export class CounterOfferDto {
  @ApiProperty({
    example: 275.0,
    description:
      "Counter-offer amount in TRY with at most two decimals. The seller counter is above the offer and at most the product price; the buyer counter is below the seller counter.",
  })
  // Text such as "275" is still converted (`@Type`), as for the offer itself.
  @Type(() => Number)
  @IsTlAmount({
    message:
      "Karşı teklif tutarı en fazla iki ondalık basamaklı bir sayı olmalıdır",
  })
  @Min(1, { message: "Karşı teklif en az 1 TL olmalıdır" })
  @Max(TL_NEGOTIATED_AMOUNT_MAX, {
    message: "Karşı teklif en fazla 9,999,999 TL olabilir",
  })
  amount: number;

  @ApiPropertyOptional({ description: "İsteğe bağlı mesaj" })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}
