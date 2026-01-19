import { IsUUID, IsOptional, ValidateNested, IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';

class ShippingAddressDto {
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsNotEmpty()
  city: string;

  @IsString()
  @IsNotEmpty()
  district: string;

  @IsString()
  @IsNotEmpty()
  address: string;

  @IsString()
  @IsOptional()
  zipCode?: string;
}

/**
 * Direct Buy DTO - Purchase product directly without going through offer
 * Used for "Buy Now" button flow
 */
export class DirectBuyDto {
  @ApiProperty({
    example: 'uuid-product-id',
    description: 'Product ID to purchase directly',
  })
  @IsUUID('4', { message: 'Geçerli bir ürün ID giriniz' })
  productId: string;

  @ApiPropertyOptional({
    example: 'uuid-shipping-address-id',
    description: 'Shipping address ID (use either this or shippingAddress)',
  })
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null ? undefined : value))
  @IsUUID('4', { message: 'Geçerli bir teslimat adresi ID giriniz' })
  shippingAddressId?: string;

  @ApiPropertyOptional({
    description: 'Shipping address object (use either this or shippingAddressId)',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ShippingAddressDto)
  shippingAddress?: ShippingAddressDto;

  @ApiPropertyOptional({
    example: 'uuid-billing-address-id',
    description: 'Billing address ID (defaults to shipping address if not provided)',
  })
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null ? undefined : value))
  @IsUUID('4', { message: 'Geçerli bir fatura adresi ID giriniz' })
  billingAddressId?: string;
}

/**
 * Response for direct buy - includes payment URL for redirect
 */
export class DirectBuyResponseDto {
  @ApiProperty({ description: 'Created order ID' })
  orderId: string;

  @ApiProperty({ description: 'Order number for tracking' })
  orderNumber: string;

  @ApiProperty({ description: 'Total amount to pay' })
  totalAmount: number;

  @ApiProperty({ description: 'Payment URL to redirect user' })
  paymentUrl: string;

  @ApiProperty({ description: 'Payment provider being used' })
  provider: string;
}
