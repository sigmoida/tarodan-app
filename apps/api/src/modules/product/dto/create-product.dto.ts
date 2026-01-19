import {
  IsString,
  IsNumber,
  IsOptional,
  IsEnum,
  IsArray,
  IsUUID,
  IsBoolean,
  Min,
  Max,
  MinLength,
  MaxLength,
  ArrayMaxSize,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ProductCondition } from '@prisma/client';

export class CreateProductDto {
  @ApiProperty({
    example: 'Vintage Star Wars Action Figure',
    description: 'Product title',
  })
  @IsString()
  @MinLength(5, { message: 'Başlık en az 5 karakter olmalıdır' })
  @MaxLength(200, { message: 'Başlık en fazla 200 karakter olabilir' })
  title: string;

  @ApiPropertyOptional({
    example: 'Original 1977 Luke Skywalker figure in excellent condition...',
    description: 'Product description',
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000, { message: 'Açıklama en fazla 5000 karakter olabilir' })
  description?: string;

  @ApiProperty({
    example: 299.99,
    description: 'Product price in TRY',
  })
  @IsNumber({}, { message: 'Fiyat sayı olmalıdır' })
  @Type(() => Number)
  @Min(1, { message: 'Fiyat en az 1 TL olmalıdır' })
  @Max(9999999, { message: 'Fiyat en fazla 9,999,999 TL olabilir' })
  price: number;

  @ApiProperty({
    example: 'uuid-category-id',
    description: 'Category ID',
  })
  @IsUUID('4', { message: 'Geçerli bir kategori ID giriniz' })
  categoryId: string;

  @ApiProperty({
    enum: ProductCondition,
    example: 'very_good',
    description: 'Product condition',
  })
  @IsEnum(ProductCondition, { message: 'Geçerli bir durum seçiniz' })
  condition: ProductCondition;

  @ApiPropertyOptional({
    example: ['https://storage.example.com/image1.jpg'],
    description: 'Array of image URLs',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(10, { message: 'En fazla 10 resim yüklenebilir' })
  imageUrls?: string[];

  @ApiPropertyOptional({
    example: false,
    description: 'Whether the product is available for trade (requires premium membership)',
  })
  @IsOptional()
  @IsBoolean({ message: 'Takas durumu boolean olmalıdır' })
  isTradeEnabled?: boolean;
}
