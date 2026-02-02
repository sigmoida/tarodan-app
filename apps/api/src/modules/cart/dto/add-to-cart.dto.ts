import { IsString, IsNumber, Min, Max, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class AddToCartDto {
  @ApiProperty({ description: 'Ürün ID' })
  @IsString()
  productId: string;

  @ApiPropertyOptional({ description: 'Miktar', default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(99)
  @Type(() => Number)
  quantity?: number = 1;
}

export class UpdateCartItemDto {
  @ApiProperty({ description: 'Yeni miktar' })
  @IsNumber()
  @Min(0)
  @Max(99)
  @Type(() => Number)
  quantity: number;
}
