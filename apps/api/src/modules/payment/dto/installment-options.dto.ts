import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from "class-validator";
import type { InstallmentOptionsRequest } from "@tarodan/types";
import { JsonNumber } from "../../../common/transforms";

/**
 * `POST /payments/installment-options`. Exactly one of `bin` | `savedCardId`
 * and exactly one of `paymentId` | `amount` (checked by the service, 400
 * `server.payment.installmentOptionsInvalidRequest`). PCI: the API takes at
 * most the first 8 card digits; a longer value is refused here, and raw card
 * fields anywhere in the body by `assertNoRawCardData`.
 */
export class InstallmentOptionsDto implements InstallmentOptionsRequest {
  @ApiPropertyOptional({
    description: "First 6 to 8 card digits (digits only, never more)",
    example: "45467112",
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{6,8}$/)
  bin?: string;

  @ApiPropertyOptional({ description: "SavedCard.id of the signed-in buyer" })
  @IsOptional()
  @IsUUID()
  savedCardId?: string;

  @ApiPropertyOptional({
    description:
      "Payment to price (payment page). Owner or x-payment-capability, as for direct-form.",
  })
  @IsOptional()
  @IsUUID()
  paymentId?: string;

  @ApiPropertyOptional({
    description:
      "Goods total T in TL, web single-page checkout before the order exists. Display only: direct-form signs from the payment row.",
    example: 1000,
  })
  @IsOptional()
  @JsonNumber()
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1_000_000)
  amount?: number;
}
