import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsOptional,
  IsInt,
  IsBoolean,
  IsNotEmpty,
  IsString,
  IsUUID,
  Max,
  Min,
} from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  BOOST_OFFER_MAX,
  MY_BOOST_STATES,
  MY_BOOSTS_DEFAULT_LIMIT,
  MY_BOOSTS_MAX_LIMIT,
  type MyBoostState,
} from "@tarodan/types";
import { PaymentProvider } from "../../payment/dto";
import { JsonBoolean } from "../../../common/transforms";

export class InitiateBoostDto {
  @ApiProperty({
    description:
      "Ad package id. Required: the price comes from the package tier for the listing's price (the legacy flat 3/7/30-day price is retired).",
  })
  @IsString()
  @IsNotEmpty()
  packageId: string;

  @ApiProperty({
    example: 7,
    description: "Boost duration in days; must be a duration of the package.",
  })
  @Type(() => Number)
  @IsInt({ message: "Süre tam sayı olmalıdır" })
  @Min(1, { message: "Geçerli bir süre seçiniz" })
  durationDays: number;

  @ApiPropertyOptional({
    enum: PaymentProvider,
    example: "paytr",
    description: "Payment provider (default: paytr)",
  })
  @IsOptional()
  @IsEnum(PaymentProvider, { message: "Geçerli bir ödeme sağlayıcı seçiniz" })
  provider?: PaymentProvider;

  @ApiPropertyOptional({
    example: false,
    description:
      "Remind 24 hours before the boost ends (premium members only; no automatic charge)",
  })
  @IsOptional()
  @IsBoolean()
  autoRenew?: boolean;

  // The two consents are declared here (the global pipe drops undeclared
  // fields) but decided by the service: anything but `true` gets 400
  // `server.product.boostConsentRequired`, a catalog key the dialog can show,
  // before any row is written. Only a JSON boolean passes (`JsonBoolean`):
  // implicit conversion would read the text "false" as `true`.
  @ApiProperty({
    example: true,
    description:
      "Must be true: the seller accepted the pre-contract information form and the distance service contract (consent document `platform_service_sales`).",
  })
  @IsOptional()
  @JsonBoolean()
  @IsBoolean()
  preInformationAccepted?: boolean;

  @ApiProperty({
    example: true,
    description:
      "Must be true: the seller accepted that the service starts at once, so the right of withdrawal does not apply (consent document `withdrawal_waiver`).",
  })
  @IsOptional()
  @JsonBoolean()
  @IsBoolean()
  withdrawalWaiverAccepted?: boolean;
}

/** `GET /products/boost/my` query: the section and its page. */
export class MyBoostsQueryDto {
  @ApiPropertyOptional({
    enum: MY_BOOST_STATES,
    default: "current",
    description:
      "current: active and paused boosts; history: expired and cancelled. Pending and failed (abandoned checkouts) are never returned.",
  })
  @IsOptional()
  @IsIn(MY_BOOST_STATES)
  state?: MyBoostState;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: MY_BOOSTS_MAX_LIMIT,
    description: `Default ${MY_BOOSTS_DEFAULT_LIMIT.current} for current, ${MY_BOOSTS_DEFAULT_LIMIT.history} for history`,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MY_BOOSTS_MAX_LIMIT)
  limit?: number;
}

/** `PATCH /products/:id/boost/reminder` body. */
export class BoostReminderDto {
  @ApiProperty({
    example: true,
    description:
      "The ending-soon reminder for the listing's running and paused boosts (premium to turn on; no automatic charge)",
  })
  // A JSON boolean only: implicit conversion would read "false" as true.
  @JsonBoolean()
  @IsBoolean()
  enabled: boolean;
}

/** `POST /products/boost/offers/dismiss` body. */
export class DismissBoostOffersDto {
  @ApiProperty({
    type: [String],
    description:
      "Listing ids of the offers shown; only the caller's own listings are recorded",
    minItems: 1,
    maxItems: BOOST_OFFER_MAX,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(BOOST_OFFER_MAX)
  @IsUUID("all", { each: true })
  productIds: string[];
}
