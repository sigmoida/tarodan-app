import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class ShipmentEventDto {
  @ApiProperty({ example: "uuid" })
  id: string;

  @ApiProperty({ example: "picked_up" })
  status: string;

  @ApiProperty({ example: "İstanbul Dağıtım Merkezi" })
  location: string;

  @ApiPropertyOptional({ example: "Kargo teslim alındı", nullable: true })
  description?: string | null;

  @ApiProperty({ example: "2024-01-15T10:30:00.000Z" })
  occurredAt: Date;
}

export class ShipmentResponseDto {
  @ApiProperty({ example: "uuid" })
  id: string;

  @ApiProperty({ example: "uuid-order-id" })
  orderId: string;

  @ApiProperty({ example: "surat" })
  provider: string;

  @ApiPropertyOptional({ example: "ORD-20260728-001", nullable: true })
  trackingNumber?: string | null;

  @ApiPropertyOptional({
    example: "1234567890",
    description: "Carrier-issued tracking code (Sürat KargoTakipNo)",
    nullable: true,
  })
  providerTrackingId?: string | null;

  @ApiPropertyOptional({
    example:
      "https://www.suratkargo.com.tr/KargoTakip/?kargotakipno=1234567890",
    nullable: true,
  })
  trackingUrl?: string | null;

  @ApiProperty({ example: "pending" })
  status: string;

  @ApiPropertyOptional({ example: 25.5 })
  cost?: number;

  @ApiPropertyOptional({
    example: "2024-01-18T10:30:00.000Z",
    nullable: true,
  })
  estimatedDelivery?: Date | null;

  @ApiProperty({ type: [ShipmentEventDto] })
  events: ShipmentEventDto[];

  @ApiProperty({ example: "2024-01-15T10:30:00.000Z" })
  createdAt: Date;

  @ApiProperty({ example: "2024-01-15T10:30:00.000Z" })
  updatedAt: Date;
}

export class ShippingRateDto {
  @ApiProperty({ example: "surat" })
  provider: string;

  @ApiProperty({ example: "Sürat Kargo" })
  providerName: string;

  @ApiProperty({ example: 25.5 })
  cost: number;

  @ApiProperty({ example: "TRY" })
  currency: string;

  @ApiProperty({ example: "2-3 iş günü" })
  estimatedDelivery: string;
}

export class ShippingRatesResponseDto {
  @ApiProperty({ type: [ShippingRateDto] })
  rates: ShippingRateDto[];
}
