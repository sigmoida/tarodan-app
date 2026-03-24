import { IsEmail, IsNotEmpty, IsString, IsOptional, IsPhoneNumber, ValidateNested, IsUUID, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GuestAddressDto {
  @ApiProperty({ example: 'Ali Veli' })
  @IsNotEmpty()
  @IsString()
  fullName: string;

  @ApiProperty({ example: '+905551234567' })
  @IsNotEmpty()
  @IsString()
  phone: string;

  @ApiProperty({ example: 'İstanbul' })
  @IsNotEmpty()
  @IsString()
  city: string;

  @ApiProperty({ example: 'Kadıköy' })
  @IsNotEmpty()
  @IsString()
  district: string;

  @ApiProperty({ example: 'Caferağa Mah. Moda Cad. No:123' })
  @IsNotEmpty()
  @IsString()
  address: string;

  @ApiPropertyOptional({ example: '34710' })
  @IsOptional()
  @IsString()
  zipCode?: string;
}

export class GuestCheckoutDto {
  @ApiProperty({ description: 'Product ID to purchase' })
  @IsUUID()
  @IsNotEmpty()
  productId: string;

  @ApiProperty({ example: 'guest@example.com', description: 'Guest email for order tracking' })
  @IsEmail({}, { message: 'Geçerli bir e-posta adresi girin' })
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: '+905551234567', description: 'Guest phone number' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiProperty({ description: 'Full name of the guest' })
  @IsString()
  @IsNotEmpty()
  guestName: string;

  @ApiProperty({ type: GuestAddressDto })
  @ValidateNested()
  @Type(() => GuestAddressDto)
  shippingAddress: GuestAddressDto;

  @ApiPropertyOptional({ type: GuestAddressDto, description: 'Billing address (uses shipping if not provided)' })
  @ValidateNested()
  @Type(() => GuestAddressDto)
  @IsOptional()
  billingAddress?: GuestAddressDto;

  @ApiPropertyOptional({ description: 'Offer ID if purchasing with an accepted offer' })
  @IsUUID()
  @IsOptional()
  offerId?: string;

  @ApiPropertyOptional({ description: 'Override price (for direct buy)' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  price?: number;

  @ApiPropertyOptional({
    description: 'Idempotency key for carrier shipment when Sürat integration is enabled',
  })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class GuestOrderTrackDto {
  @ApiProperty({ description: 'Order number to track' })
  @IsString()
  @IsNotEmpty()
  orderNumber: string;

  @ApiProperty({ description: 'Email used for the order' })
  @IsEmail({}, { message: 'Geçerli bir e-posta adresi girin' })
  @IsNotEmpty()
  email: string;
}
