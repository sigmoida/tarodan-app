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
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ProductCondition } from '@prisma/client';

export class ImageVariantDto {
  @IsString()
  cardKey: string;

  @IsString()
  detailKey: string;
}

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
  // Max validation is handled by platform settings (min_product_price, max_product_price)
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
    example: [{ cardKey: 'dev/products/product-images/abc/uuid-card.webp', detailKey: 'dev/products/product-images/abc/uuid-detail.webp' }],
    description: 'Array of image variants (cardKey, detailKey from upload)',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImageVariantDto)
  @ArrayMaxSize(10, { message: 'En fazla 10 resim yüklenebilir' })
  images?: Array<{ cardKey: string; detailKey: string }>;

  @ApiPropertyOptional({
    example: false,
    description: 'Whether the product is available for trade (requires premium membership)',
  })
  @IsOptional()
  @IsBoolean({ message: 'Takas durumu boolean olmalıdır' })
  isTradeEnabled?: boolean;

  @ApiPropertyOptional({
    example: false,
    description: 'Whether this is a pre-order listing (product not yet in stock, will ship later)',
  })
  @IsOptional()
  @IsBoolean({ message: 'Ön sipariş boolean olmalıdır' })
  isPreorder?: boolean;

  @ApiPropertyOptional({
    example: false,
    description: 'Whether this is a set/bundle (multi-pack, multiple models in one listing)',
  })
  @IsOptional()
  @IsBoolean({ message: 'Set/paket boolean olmalıdır' })
  isSet?: boolean;

  @ApiPropertyOptional({
    example: 'uuid-brand-id',
    description: 'Brand ID',
  })
  @IsOptional()
  @IsUUID('4', { message: 'Geçerli bir marka ID giriniz' })
  brandId?: string;

  @ApiPropertyOptional({
    example: 'uuid-car-model-id',
    description: 'Car Model ID',
  })
  @IsOptional()
  @IsUUID('4', { message: 'Geçerli bir model ID giriniz' })
  carModelId?: string;

  @ApiPropertyOptional({
    example: 'uuid-manufacturer-id',
    description: 'Manufacturer ID (e.g. Hot Wheels, Matchbox)',
  })
  @IsOptional()
  @IsUUID('4', { message: 'Geçerli bir üretici ID giriniz' })
  manufacturerId?: string;

  @ApiPropertyOptional({
    example: 5,
    description: 'Stock quantity (null for unlimited stock)',
  })
  @IsOptional()
  @IsNumber({}, { message: 'Stok miktarı sayı olmalıdır' })
  @Type(() => Number)
  @Min(1, { message: 'Stok miktarı en az 1 olmalıdır' })
  quantity?: number | null;

  @ApiPropertyOptional({
    example: '1:64',
    description: 'Scale (e.g. 1:64, 1/43). Stored as ProductAttribute in group "scale".',
  })
  @IsOptional()
  @IsString()
  scale?: string;

  @ApiPropertyOptional({
    example: 'diecast',
    description: 'Material slug (diecast, resin, composite, plastic). Stored as ProductAttribute in group "material".',
  })
  @IsOptional()
  @IsString()
  material?: string;

  @ApiPropertyOptional({
    example: 2023,
    description: 'Release year of the model (e.g. 2023). Stored as releaseDate (Jan 1 of that year).',
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1900, { message: 'Yıl 1900 veya sonrası olmalıdır' })
  @Max(2100, { message: 'Yıl 2100 veya öncesi olmalıdır' })
  year?: number;

  @ApiPropertyOptional({
    example: ['uuid-attr-id'],
    description: 'Additional attribute IDs. Use material slug for material instead.',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  attributeIds?: string[];

  @ApiPropertyOptional({
    example: ['treasure-hunt', 'mainline', 'red'],
    description:
      'Additional attribute slugs (e.g. Hot Wheels Segment/Assortment/Rarity selections). ' +
      'Resolved server-side to ProductAttribute rows via Attribute.slug lookup.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attributes?: string[];
}
