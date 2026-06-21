import { IsUUID, IsEnum, IsOptional, IsString, IsNumber, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum ShippingProvider {
  surat = 'surat',
}

export class CreateShipmentDto {
  @ApiProperty({
    example: 'uuid-order-id',
    description: 'Order ID to create shipment for',
  })
  @IsUUID('4', { message: 'Geçerli bir sipariş ID giriniz' })
  orderId: string;

  @ApiProperty({
    enum: ShippingProvider,
    example: 'surat',
    description: 'Shipping provider',
  })
  @IsEnum(ShippingProvider, { message: 'Geçerli bir kargo firması seçiniz' })
  provider: ShippingProvider;
}

export class CalculateShippingDto {
  @ApiProperty({
    example: 'uuid-from-address-id',
    description: 'Origin address ID',
  })
  @IsUUID('4')
  fromAddressId: string;

  @ApiProperty({
    example: 'uuid-to-address-id',
    description: 'Destination address ID',
  })
  @IsUUID('4')
  toAddressId: string;

  @ApiPropertyOptional({
    example: 0.5,
    description: 'Package weight in kg',
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0.1)
  weight?: number;

  @ApiPropertyOptional({
    example: 'surat',
    description: 'Specific provider to calculate (omit for all)',
    enum: ShippingProvider,
  })
  @IsOptional()
  @IsEnum(ShippingProvider)
  provider?: ShippingProvider;
}

export class UpdateTrackingDto {
  @ApiProperty({
    example: '1234567890',
    description: 'Tracking number from cargo provider',
  })
  @IsString({ message: 'Takip numarası zorunludur' })
  trackingNumber: string;
}
