import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { OrderCancellationReason } from "@prisma/client";

/**
 * Misafir iptali: üyeliksiz alıcının kimliği, takip ucuyla AYNI yolla
 * doğrulanır (sipariş numarası + siparişte kayıtlı e-posta). Misafir siparişi
 * sentetik bir alıcıya bağlı olduğundan oturum tabanlı iptal ucu bu kullanıcı
 * için hiç çalışmıyordu — süreç dokümanının "alıcı, kargoya verilene kadar
 * iptal edebilir" taahhüdü misafirde karşılıksız kalıyordu.
 */
export class GuestOrderCancelDto {
  @ApiProperty({
    description: "Order / group / package number printed on the confirmation",
    example: "ORD-K7X9M2QF3N",
  })
  @IsString()
  orderNumber: string;

  @ApiProperty({
    description: "Email address used for the order",
    example: "guest@example.com",
  })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({
    enum: OrderCancellationReason,
    description: "Structured cancellation reason (required for paid orders)",
  })
  @IsOptional()
  @IsEnum(OrderCancellationReason)
  reasonCode?: OrderCancellationReason;

  @ApiPropertyOptional({
    example: "Yanlış ürün seçtim",
    description: "Free-text note (optional)",
  })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: "İptal nedeni en fazla 500 karakter olabilir" })
  reason?: string;
}
