import {
  IsString,
  Min,
  Max,
  IsOptional,
  IsInt,
  IsNotEmpty,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class AddToCartDto {
  @ApiProperty({ description: 'Ürün ID' })
  @IsString()
  @IsNotEmpty()
  productId: string;

  /** Tarayıcı / istemci bazen quantity'yi string gönderir; ValidationPipe 400 vermesin. */
  @ApiPropertyOptional({ description: 'Miktar', default: 1 })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return 1;
    const n = Number(value);
    if (!Number.isFinite(n)) return 1;
    return Math.trunc(n);
  })
  @IsInt()
  @Min(1)
  @Max(99)
  quantity?: number;
}

export class UpdateCartItemDto {
  @ApiProperty({ description: 'Yeni miktar (0 = satırı kaldır)' })
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return 0;
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.trunc(n);
  })
  @IsInt()
  @Min(0)
  @Max(99)
  quantity: number;
}
