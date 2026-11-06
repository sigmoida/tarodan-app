import {
  IsString,
  IsOptional,
  IsBoolean,
  IsUUID,
  IsInt,
  Matches,
  Max,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  INSTALLMENT_COUNT_MAX,
  type DirectFormInstallmentSelection,
} from "@tarodan/types";
import { JsonNumber, RawObject } from "../../../common/transforms";
import {
  IsTlAmount,
  TL_AMOUNT_COLUMN_MAX,
} from "../../../common/validators/tl-amount";

/**
 * `direct-form` -> `installment` (ADR 0019). The shape is validated here, so
 * the PayTR client's own count and card checks stay programming guards: a
 * count outside 1..12, a BIN that is not 6-8 digits or a total that is not a
 * TL amount is a 400 before anything is priced. Whether the count is offered
 * for this card, payment and buyer is the server's call
 * (`InstallmentChargeService`).
 */
export class DirectFormInstallmentDto implements DirectFormInstallmentSelection {
  @ApiProperty({
    description: "1 = single payment, 2..12 installments",
    minimum: 1,
    maximum: INSTALLMENT_COUNT_MAX,
  })
  @JsonNumber()
  @IsInt()
  @Min(1)
  @Max(INSTALLMENT_COUNT_MAX)
  count!: number;

  @ApiPropertyOptional({
    description:
      "First 6 to 8 digits of a new card (digits only, never more). Required for a count above 1 without savedCardId; refused with it.",
    example: "45467112",
  })
  @IsOptional()
  @RawObject()
  @IsString()
  @Matches(/^\d{6,8}$/)
  bin?: string;

  @ApiProperty({
    description:
      "The option's totalAmount (C, TL) the client showed. A different server total is 409 server.payment.installmentPricingChanged.",
    example: 1066.38,
  })
  @JsonNumber()
  @IsTlAmount()
  @Min(0.01)
  @Max(TL_AMOUNT_COLUMN_MAX)
  expectedTotal!: number;
}

export class DirectPaymentDto {
  @ApiPropertyOptional({
    description:
      "Payment ID returned by the initiate endpoint. Required for guest payments.",
  })
  @IsOptional()
  @IsUUID()
  paymentId?: string;

  @ApiPropertyOptional({ description: "Order ID (tekil sipariş ödemesi)" })
  @IsOptional()
  @IsUUID()
  orderId?: string;

  @ApiPropertyOptional({ description: "Checkout Group ID (sepet ödemesi)" })
  @IsOptional()
  @IsUUID()
  checkoutGroupId?: string;

  @ApiPropertyOptional({ description: "Trade ID (takas nakit farkı ödemesi)" })
  @IsOptional()
  @IsUUID()
  tradeId?: string;

  @ApiPropertyOptional({ description: "Payment Provider (default: paytr)" })
  @IsOptional()
  @IsString()
  provider?: string;

  @ApiPropertyOptional({
    description: "Kayıtlı kart ID (SavedCard.id) ile PayTR formu hazırla",
  })
  @IsOptional()
  @IsUUID()
  savedCardId?: string;

  @ApiPropertyOptional({
    description: "Yeni kartı PayTR kasasında sakla (store_card)",
  })
  @IsOptional()
  @IsBoolean()
  saveCard?: boolean;

  @ApiPropertyOptional({
    description:
      "Whether the payer accepted the distance sales contract on this payment " +
      "screen. When the cart, order or trade cash payment has no consent " +
      "record yet (offer order, trade, a client that sent none at checkout), " +
      "it is recorded here. While `distance_sales_consent_required` is on, a " +
      "payment without a record and without this consent is refused with " +
      "400 server.consent.distanceSalesRequired.",
  })
  @IsOptional()
  @IsBoolean()
  distanceSalesAccepted?: boolean;

  @ApiPropertyOptional({
    type: DirectFormInstallmentDto,
    description:
      "The installment chosen from POST /payments/installment-options. Absent = single payment (old clients). 400 server.payment.installmentNotOffered, 409 installmentPricingChanged or installmentUnavailable.",
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => DirectFormInstallmentDto)
  installment?: DirectFormInstallmentDto;
}
