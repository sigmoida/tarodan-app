import { IsString, IsOptional, IsEnum, IsNumber, IsBoolean, IsArray, IsDateString, Min, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { DiscountType, DiscountScope } from '@prisma/client';

export class CreateDiscountDto {
  @ApiPropertyOptional({ description: 'Kupon kodu (boş bırakılırsa otomatik kampanya olur)' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiProperty({ description: 'Kampanya adı' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'Kampanya açıklaması' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: DiscountType, description: 'İndirim türü: percentage veya fixed_amount' })
  @IsEnum(DiscountType)
  type: DiscountType;

  @ApiProperty({ description: 'İndirim değeri (yüzde veya tutar)', example: 10 })
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  value: number;

  @ApiProperty({ enum: DiscountScope, description: 'İndirim kapsamı: global, category, product, seller' })
  @IsEnum(DiscountScope)
  scope: DiscountScope;

  @ApiPropertyOptional({ description: 'Kategori ID (scope=category için)' })
  @ValidateIf((o) => o.scope === 'category')
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Hedef ürün ID\'leri (scope=product için)', type: [String] })
  @ValidateIf((o) => o.scope === 'product')
  @IsArray()
  @IsString({ each: true })
  targetProductIds?: string[];

  @ApiPropertyOptional({ description: 'Minimum sepet tutarı (TL)', example: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minCartValue?: number;

  @ApiPropertyOptional({ description: 'Maksimum indirim tutarı (TL)', example: 500 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  maxDiscountAmount?: number;

  @ApiPropertyOptional({ description: 'Toplam kullanım limiti' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  usageLimitTotal?: number;

  @ApiPropertyOptional({ description: 'Kullanıcı başı kullanım limiti', default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  usageLimitPerUser?: number;

  @ApiPropertyOptional({ description: 'Diğer indirimlerle birleştirilebilir mi?', default: false })
  @IsOptional()
  @IsBoolean()
  isStackable?: boolean;

  @ApiPropertyOptional({ description: 'Öncelik (düşük değer = önce uygulanır)', default: 0 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  priority?: number;

  @ApiProperty({ description: 'Başlangıç tarihi', example: '2026-01-01T00:00:00Z' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ description: 'Bitiş tarihi', example: '2026-12-31T23:59:59Z' })
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({ description: 'Aktif mi?', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
