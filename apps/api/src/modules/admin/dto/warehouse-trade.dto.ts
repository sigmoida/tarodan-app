import { IsOptional, IsString, MaxLength, IsEnum, IsIn } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ShipmentStatus } from "@prisma/client";
import { AdminListQueryDto } from "../../../common/list";

/**
 * Depo kontrolünün kusur ataması. Red her iki tarafın ürününü de geri
 * gönderdiği için "kimin yüzünden" sorusunun cevabı yalnız serbest metinde
 * kalıyordu; artık yapısal olarak kaydedilir (denetim kaydı + operasyon
 * raporlaması). Mali sonucu BUGÜN değiştirmez — iade matrisi her iki tarafa
 * aynı uygulanır (bkz. docs/IDENTITY.md kardeşi docs/TAKAS.md) — ama ayrımı
 * yapmadan o kararı vermek de mümkün değildi.
 */
export const TRADE_INSPECTION_FAULT_SIDES = [
  "initiator",
  "receiver",
  "both",
  "neither",
] as const;
export type TradeInspectionFaultSide =
  (typeof TRADE_INSPECTION_FAULT_SIDES)[number];

export class ApproveWarehouseTradeDto {
  @ApiPropertyOptional({
    example: "Her iki ürün de sağlıklı durumda, gönderim onaylandı",
    description: "Optional approval notes",
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class RejectWarehouseTradeDto {
  @ApiProperty({
    example: "Ürünlerden biri hasarlı geldi, iade sürecine alındı",
    description: "Rejection reason (required)",
  })
  @IsString()
  @MaxLength(500)
  reason: string;

  @ApiProperty({
    enum: TRADE_INSPECTION_FAULT_SIDES,
    example: "initiator",
    description:
      "Which side's item failed inspection — recorded on the audit trail",
  })
  @IsIn(TRADE_INSPECTION_FAULT_SIDES)
  faultySide: TradeInspectionFaultSide;
}

export class MarkShipmentDto {
  @ApiProperty({
    example: "550e8400-e29b-41d4-a716-446655440000",
    description: "ID of the TradeShipment to mark",
  })
  @IsString()
  shipmentId: string;

  @ApiPropertyOptional({
    description:
      "How the delivery was verified (carrier call, user statement) — audit note",
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class MarkReturnLostDto {
  @ApiProperty({
    example: "550e8400-e29b-41d4-a716-446655440000",
    description: "ID of the return TradeShipment declared lost",
  })
  @IsString()
  shipmentId: string;

  @ApiProperty({
    example:
      "Kargo şubeden çıktıktan sonra teslim edilemedi, sürat takibinde kayıp",
    description: "Reason for declaring the return shipment lost (≥10 chars)",
  })
  @IsString()
  @MaxLength(500)
  reason: string;

  @ApiPropertyOptional({
    example: "550e8400-e29b-41d4-a716-446655440000",
    description:
      "Override the user owed compensation (defaults to the lost shipment recipient)",
  })
  @IsOptional()
  @IsString()
  compensateUserId?: string;
}

export class ForceCancelStuckDto {
  @ApiProperty({
    example:
      "Karşı tarafın kargosu 14 gündür sürat şubesinde sıkıştı, gelen ürünü sahibine geri yolluyoruz",
    description: "Reason for force-cancelling a stuck warehouse-bound trade",
  })
  @IsString()
  @MaxLength(500)
  reason: string;

  @ApiPropertyOptional({
    example: true,
    description:
      "When true, opens a return shipment for the arrived item so it goes back to its owner",
  })
  @IsOptional()
  sendArrivedItemBack?: boolean;
}

export class TradeShipmentQueryDto extends AdminListQueryDto {
  @ApiPropertyOptional({ enum: ShipmentStatus, example: "in_transit" })
  @IsOptional()
  @IsEnum(ShipmentStatus)
  status?: ShipmentStatus;

  @ApiPropertyOptional({
    enum: ["to_warehouse", "from_warehouse", "return"],
    example: "to_warehouse",
  })
  @IsOptional()
  @IsIn(["to_warehouse", "from_warehouse", "return"])
  leg?: "to_warehouse" | "from_warehouse" | "return";

  @ApiPropertyOptional({ example: "TR-12345" })
  @IsOptional()
  @IsString()
  tradeNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}
