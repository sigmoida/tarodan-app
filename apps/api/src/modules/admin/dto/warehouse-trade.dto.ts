import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
