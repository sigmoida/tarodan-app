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

  @ApiPropertyOptional({
    description:
      "Whether the payer accepted the distance sales contract on this payment " +
      "screen. When the cart, order or trade cash payment has no consent " +
      "record yet (offer order, trade, a client that sent none at checkout), " +
      "it is recorded here. While `distance_sales_consent_required` is on, a " +
      "payment without a record and without this consent is refused with " +
      "400 server.consent.distanceSalesRequired.",
  })
  @IsOptional()
  @IsBoolean()
  distanceSalesAccepted?: boolean;
}
