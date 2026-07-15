import { PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsNumber, IsDateString, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ProductStatus } from '@prisma/client';
import { CreateProductDto } from './create-product.dto';

export class UpdateProductDto extends PartialType(CreateProductDto) {
  @ApiPropertyOptional({
    enum: ProductStatus,
    example: 'active',
    description: 'Product status (seller can only set to active or inactive)',
  })
  @IsOptional()
  @IsEnum(ProductStatus, { message: 'Geçerli bir durum seçiniz' })
  status?: ProductStatus;

  // Güncellemede stok 0'a çekilebilir (create'te @Min(1) → yeni ilan 0 olamaz).
  // Stok 0 → ilan otomatik pasif (resolveUpdatedStatus) ve "yeniden satışa açma"
  // guard'ı service'te 0'ı ele alır. create-dto'nun @Min(1)'i PartialType ile miras
  // kalıp bu meşru yolları ("stok 0 → pasif", nazik reopen mesajı) 400 "Stok miktarı
  // en az 1" ile engelliyordu (#58). quantity'yi @Min(0) ile ez; null = sınırsız.
  @ApiPropertyOptional({
    example: 0,
    description: 'Stock quantity (0 allowed on update → auto-inactive; null for unlimited)',
  })
  @IsOptional()
  @IsNumber({}, { message: 'Stok miktarı sayı olmalıdır' })
  @Type(() => Number)
  @Min(0, { message: 'Stok miktarı negatif olamaz' })
  quantity?: number | null;

  @ApiPropertyOptional({ example: 299.99, description: 'Original price before sale (strike-through)' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  @Max(9999999)
  originalPrice?: number | null;

  @ApiPropertyOptional({ example: 249.99, description: 'Sale price (discounted)' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  @Max(9999999)
  salePrice?: number | null;

  @ApiPropertyOptional({ example: '2025-01-01T00:00:00.000Z', description: 'Sale start date' })
  @IsOptional()
  @IsDateString()
  saleStartDate?: string | null;

  @ApiPropertyOptional({ example: '2025-01-31T23:59:59.000Z', description: 'Sale end date' })
  @IsOptional()
  @IsDateString()
  saleEndDate?: string | null;

  @ApiPropertyOptional({ example: 'uuid-brand-id', description: 'Brand ID' })
  @IsOptional()
  brandId?: string;

  @ApiPropertyOptional({ example: 'uuid-car-model-id', description: 'Car Model ID' })
  @IsOptional()
  carModelId?: string;
}
