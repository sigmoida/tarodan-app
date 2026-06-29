import { IsOptional, IsEnum, IsNumber, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import { OrderStatus } from '@prisma/client';

export class OrderQueryDto {
  @ApiPropertyOptional({
    enum: OrderStatus,
    example: 'paid',
    description:
      'Filter by order status. Tek değer ("paid") veya virgülle çoklu ("cancelled,refunded").',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.split(',').map((s) => s.trim()).filter(Boolean)
      : value,
  )
  @IsEnum(OrderStatus, { each: true })
  status?: OrderStatus | OrderStatus[];

  @ApiPropertyOptional({
    example: 'buyer',
    description: 'Filter by role (buyer = orders I placed, seller = orders I received)',
    enum: ['buyer', 'seller'],
  })
  @IsOptional()
  role?: 'buyer' | 'seller';

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
