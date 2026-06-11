import { IsUUID, IsEnum, IsOptional, IsString, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum PaymentProvider {
  paytr = 'paytr',
}

export class InitiatePaymentDto {
  @ApiPropertyOptional({
    example: 'uuid-order-id',
    description: 'Order ID to pay for (orderId veya checkoutGroupId zorunlu)',
  })
  @ValidateIf((o) => !o.checkoutGroupId)
  @IsUUID('4', { message: 'Geçerli bir sipariş ID giriniz' })
  orderId?: string;

  @ApiPropertyOptional({
    example: 'uuid-checkout-group-id',
    description: 'Checkout group ID: tek ödeme gruptaki tüm siparişleri kapsar',
  })
  @ValidateIf((o) => !o.orderId)
  @IsUUID('4', { message: 'Geçerli bir sipariş grubu ID giriniz' })
  checkoutGroupId?: string;

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
