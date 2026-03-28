import { IsUUID, IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum PaymentProvider {
  paytr = 'paytr',
}

export class InitiatePaymentDto {
  @ApiProperty({
    example: 'uuid-order-id',
    description: 'Order ID to pay for',
  })
  @IsUUID('4', { message: 'Geçerli bir sipariş ID giriniz' })
  orderId: string;

  @ApiProperty({
    enum: PaymentProvider,
    example: 'paytr',
    description: 'Payment provider to use',
  })
  @IsEnum(PaymentProvider, { message: 'Geçerli bir ödeme sağlayıcı seçiniz' })
  provider: PaymentProvider;

  @ApiPropertyOptional({
    example: 'https://example.com/payment/callback',
    description: 'Callback URL for payment result',
  })
  @IsOptional()
  @IsString()
  callbackUrl?: string;
}
