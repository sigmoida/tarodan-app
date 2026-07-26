import {
  IsEnum,
  IsOptional,
  IsInt,
  IsBoolean,
  IsString,
  Min,
} from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { PaymentProvider } from "../../payment/dto";

/** Eski (paket öncesi) düz-fiyat boost süreleri — geçiş dönemi geriye-dönük uyum. */
export const BOOST_DURATIONS = [3, 7, 30] as const;

export class InitiateBoostDto {
  @ApiPropertyOptional({
    description:
      "Reklam paketi id (yeni model). Verilmezse eski düz-fiyat akışı kullanılır.",
  })
  @IsOptional()
  @IsString()
  packageId?: string;

  @ApiProperty({
    example: 7,
    description:
      "Boost süresi (gün). Paket seçildiyse pakette tanımlı bir süre olmalı.",
  })
  @Type(() => Number)
  @IsInt({ message: "Süre tam sayı olmalıdır" })
  @Min(1, { message: "Geçerli bir süre seçiniz" })
  durationDays: number;

  @ApiPropertyOptional({
    enum: PaymentProvider,
    example: "paytr",
    description: "Ödeme sağlayıcı (varsayılan: paytr)",
  })
  @IsOptional()
  @IsEnum(PaymentProvider, { message: "Geçerli bir ödeme sağlayıcı seçiniz" })
  provider?: PaymentProvider;

  @ApiPropertyOptional({
    example: false,
    description:
      "Süre bitince otomatik yenileme hatırlatması (sadece premium üyeler)",
  })
  @IsOptional()
  @IsBoolean()
  autoRenew?: boolean;
}

export interface BoostPricingOption {
  durationDays: number;
  price: number;
  label: string;
}
