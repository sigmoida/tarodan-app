import { IsUUID, IsNumber, IsOptional, IsString, Min, Max, MaxLength, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateOfferDto {
  @ApiProperty({
    example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    description: 'Product ID (UUID format) to make offer on',
  })
  @IsNotEmpty({ message: 'Ürün ID gereklidir' })
  @IsUUID('4', { message: 'Geçerli bir ürün ID giriniz (UUID formatında olmalıdır)' })
  productId: string;

  @ApiProperty({
    example: 250.0,
    description: 'Offer amount in TRY. Must be at least 50% of product price.',
  })
  @IsNotEmpty({ message: 'Teklif tutarı gereklidir' })
  @IsNumber({}, { message: 'Teklif tutarı sayı olmalıdır' })
  @Type(() => Number)
  @Min(1, { message: 'Teklif en az 1 TL olmalıdır' })
  @Max(9999999, { message: 'Teklif en fazla 9,999,999 TL olabilir' })
  amount: number;

  @ApiPropertyOptional({ example: 'Bu fiyata alabilir miyim?', description: 'Optional message with the offer' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}
