import {
  IsEnum,
  IsOptional,
  IsInt,
  IsBoolean,
  IsNotEmpty,
  IsString,
  Min,
} from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
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
