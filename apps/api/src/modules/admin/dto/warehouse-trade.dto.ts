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

export class MarkReturnLostDto {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'ID of the return TradeShipment declared lost',
  })
  @IsString()
  shipmentId: string;

  @ApiProperty({
    example: 'Kargo şubeden çıktıktan sonra teslim edilemedi, sürat takibinde kayıp',
    description: 'Reason for declaring the return shipment lost (≥10 chars)',
  })
  @IsString()
  @MaxLength(500)
  reason: string;

  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description:
      'Override the user owed compensation (defaults to the lost shipment recipient)',
  })
  @IsOptional()
  @IsString()
  compensateUserId?: string;
}

export class ForceCancelStuckDto {
  @ApiProperty({
    example: 'Karşı tarafın kargosu 14 gündür sürat şubesinde sıkıştı, gelen ürünü sahibine geri yolluyoruz',
    description: 'Reason for force-cancelling a stuck warehouse-bound trade',
  })
  @IsString()
  @MaxLength(500)
  reason: string;

  @ApiPropertyOptional({
    example: true,
    description:
      'When true, opens a return shipment for the arrived item so it goes back to its owner',
  })
  @IsOptional()
  sendArrivedItemBack?: boolean;
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
