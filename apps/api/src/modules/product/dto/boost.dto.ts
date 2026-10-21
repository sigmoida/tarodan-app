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
}
