import { IsOptional, IsString, MaxLength, IsEnum, IsIn, IsNumber, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ShipmentStatus } from '@prisma/client';

export class ApproveWarehouseTradeDto {
  @ApiPropertyOptional({
    example: 'Her iki ürün de sağlıklı durumda, gönderim onaylandı',
    description: 'Optional approval notes',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class RejectWarehouseTradeDto {
  @ApiProperty({
    example: 'Ürünlerden biri hasarlı geldi, iade sürecine alındı',
    description: 'Rejection reason (required)',
  })
  @IsString()
  @MaxLength(500)
  reason: string;
}

export class MarkShipmentDto {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'ID of the TradeShipment to mark',
  })
  @IsString()
  shipmentId: string;
}

export class TradeShipmentQueryDto {
  @ApiPropertyOptional({ enum: ShipmentStatus, example: 'in_transit' })
  @IsOptional()
  @IsEnum(ShipmentStatus)
  status?: ShipmentStatus;

  @ApiPropertyOptional({
    enum: ['to_warehouse', 'from_warehouse', 'return'],
    example: 'to_warehouse',
  })
  @IsOptional()
  @IsIn(['to_warehouse', 'from_warehouse', 'return'])
  leg?: 'to_warehouse' | 'from_warehouse' | 'return';

  @ApiPropertyOptional({ example: 'TR-12345' })
  @IsOptional()
  @IsString()
  tradeNumber?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  limit?: number;
}
