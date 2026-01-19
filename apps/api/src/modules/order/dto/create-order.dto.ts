import { IsUUID, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class CreateOrderDto {
  @ApiProperty({
    example: 'uuid-offer-id',
    description: 'Accepted offer ID to create order from',
  })
  @IsUUID('4', { message: 'Geçerli bir teklif ID giriniz' })
  offerId: string;

  @ApiProperty({
    example: 'uuid-shipping-address-id',
    description: 'Shipping address ID',
  })
  @IsUUID('4', { message: 'Geçerli bir teslimat adresi ID giriniz' })
  shippingAddressId: string;

  @ApiPropertyOptional({
    example: 'uuid-billing-address-id',
    description: 'Billing address ID (defaults to shipping address if not provided)',
  })
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null ? undefined : value))
  @IsUUID('4', { message: 'Geçerli bir fatura adresi ID giriniz' })
  billingAddressId?: string;
}
