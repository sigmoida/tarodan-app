import { IsOptional, IsEnum, IsNumber, Min, Max, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import { OrderStatus } from '@prisma/client';

export class OrderQueryDto {
  @ApiPropertyOptional({
    enum: OrderStatus,
    example: 'paid',
    description: 'Filter by order status',
  })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiPropertyOptional({
    example: 'buyer',
    description: 'Filter by role (buyer = orders I placed, seller = orders I received)',
    enum: ['buyer', 'seller'],
  })
  @IsOptional()
  role?: 'buyer' | 'seller';

  @ApiPropertyOptional({
    example: true,
    description:
      'Yalnız iade talebi olan siparişler (status filtresini geçersiz kılar; ' +
      'iade tamamlanınca sipariş cancelled olduğu için ayrı "İadeler" sekmesi için)',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  refundsOnly?: boolean;

  @ApiPropertyOptional({
    example: 1,
    description: 'Page number',
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    example: 20,
    description: 'Items per page',
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  limit?: number;
}
