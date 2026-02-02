import { IsOptional, IsString, IsEnum, IsBoolean, IsNumber, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import { DiscountScope } from '@prisma/client';

export class DiscountQueryDto {
  @ApiPropertyOptional({ description: 'Sayfa numarası', default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Sayfa başına kayıt', default: 20 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Arama (isim veya kod)' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: DiscountScope, description: 'Kapsam filtresi' })
  @IsOptional()
  @IsEnum(DiscountScope)
  scope?: DiscountScope;

  @ApiPropertyOptional({ description: 'Aktif durumu filtresi' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Satıcı ID filtresi (admin için)' })
  @IsOptional()
  @IsString()
  sellerId?: string;

  @ApiPropertyOptional({ description: 'Sadece kupon kodları', default: false })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  couponsOnly?: boolean;

  @ApiPropertyOptional({ description: 'Sadece otomatik kampanyalar', default: false })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  autoOnly?: boolean;

  @ApiPropertyOptional({ description: 'Sıralama: created_asc, created_desc, name_asc, name_desc, priority_asc', default: 'created_desc' })
  @IsOptional()
  @IsString()
  sortBy?: string = 'created_desc';
}
