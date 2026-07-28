import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { OrderCancellationReason, OrderStatus } from "@prisma/client";

export class UpdateOrderStatusDto {
  @ApiProperty({
    enum: OrderStatus,
    example: "preparing",
    description: "New order status",
  })
  @IsEnum(OrderStatus, { message: "Geçersiz sipariş durumu" })
  status: OrderStatus;

  @ApiPropertyOptional({
    example: "Ürün hazırlanıyor",
    description: "Status change note",
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class CancelOrderDto {
  @ApiPropertyOptional({
    enum: OrderCancellationReason,
    description:
      "Paid orders require a structured cancellation reason. Pending payments may omit it.",
  })
  @IsOptional()
  @IsEnum(OrderCancellationReason)
  reasonCode?: OrderCancellationReason;

  @ApiPropertyOptional({
    example: "Kullanıcı talebi ile iptal",
    description: "Cancellation reason (optional; defaults to a generic reason)",
  })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: "İptal nedeni en fazla 500 karakter olabilir" })
  reason?: string;
}
