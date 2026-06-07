import { IsIn, IsEnum, IsOptional, IsInt, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentProvider } from '../../payment/dto';

/** Geçerli boost süreleri (gün) */
export const BOOST_DURATIONS = [3, 7, 30] as const;

export class InitiateBoostDto {
  @ApiProperty({
    enum: BOOST_DURATIONS,
    example: 7,
    description: 'Boost süresi (gün): 3, 7 veya 30',
  })
  @Type(() => Number)
  @IsInt({ message: 'Süre tam sayı olmalıdır' })
  @IsIn(BOOST_DURATIONS as unknown as number[], {
    message: 'Geçerli bir boost süresi seçiniz (3, 7 veya 30 gün)',
  })
  durationDays: number;

  @ApiPropertyOptional({
    enum: PaymentProvider,
    example: 'paytr',
    description: 'Ödeme sağlayıcı (varsayılan: paytr)',
  })
  @IsOptional()
  @IsEnum(PaymentProvider, { message: 'Geçerli bir ödeme sağlayıcı seçiniz' })
  provider?: PaymentProvider;

  @ApiPropertyOptional({
    example: false,
    description: 'Süre bitince otomatik yenileme hatırlatması (sadece premium üyeler)',
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
