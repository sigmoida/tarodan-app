import { IsString, IsOptional, IsBoolean, IsUUID } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

export class DirectPaymentDto {
  @ApiPropertyOptional({
    description:
      "Payment ID returned by the initiate endpoint. Required for guest payments.",
  })
  @IsOptional()
  @IsUUID()
  paymentId?: string;

  @ApiPropertyOptional({ description: "Order ID (tekil sipariş ödemesi)" })
  @IsOptional()
  @IsUUID()
  orderId?: string;

  @ApiPropertyOptional({ description: "Checkout Group ID (sepet ödemesi)" })
  @IsOptional()
  @IsUUID()
  checkoutGroupId?: string;

  @ApiPropertyOptional({ description: "Trade ID (takas nakit farkı ödemesi)" })
  @IsOptional()
  @IsUUID()
  tradeId?: string;

  @ApiPropertyOptional({ description: "Payment Provider (default: paytr)" })
  @IsOptional()
  @IsString()
  provider?: string;

  @ApiPropertyOptional({
    description: "Kayıtlı kart ID (SavedCard.id) ile PayTR formu hazırla",
  })
  @IsOptional()
  @IsUUID()
  savedCardId?: string;

  @ApiPropertyOptional({
    description: "Yeni kartı PayTR kasasında sakla (store_card)",
  })
  @IsOptional()
  @IsBoolean()
  saveCard?: boolean;
}
