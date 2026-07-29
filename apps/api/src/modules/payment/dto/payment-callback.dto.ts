import { IsString, IsOptional, IsEnum } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class IyzicoCallbackDto {
  @ApiProperty({ description: "Iyzico token" })
  @IsOptional()
  @IsString()
  token?: string;

  @ApiPropertyOptional({ description: "Conversation ID" })
  @IsOptional()
  @IsString()
  conversationId?: string;

  @ApiPropertyOptional({ description: "Payment ID from iyzico" })
  @IsOptional()
  @IsString()
  paymentId?: string;

  @ApiPropertyOptional({ description: "Status" })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: "Conversation Data (for 3D auth)" })
  @IsOptional()
  @IsString()
  conversationData?: string;

  /** Form field name from bank redirect (snake_case) */
  @ApiPropertyOptional({
    description: "Conversation data (3D auth) - form field name",
  })
  @IsOptional()
  @IsString()
  conversation_data?: string;

  @ApiPropertyOptional({ description: "MD Status" })
  @IsOptional()
  @IsString()
  mdStatus?: string;
}

export class PayTRCallbackDto {
  // PayTR webhook protocol requires us to always reply "OK" — if we 4xx,
  // PayTR retries the callback and the user stays stuck on the secure page.
  // So all fields are optional at the DTO layer; the service validates the
  // hash and required fields and decides what to do.
  @ApiPropertyOptional({ description: "Merchant order ID" })
  @IsOptional()
  @IsString()
  merchant_oid?: string;

  @ApiPropertyOptional({ description: "Status" })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: "Total amount" })
  @IsOptional()
  @IsString()
  total_amount?: string;

  @ApiPropertyOptional({ description: "Hash" })
  @IsOptional()
  @IsString()
  hash?: string;

  @ApiPropertyOptional({ description: "Failed reason code" })
  @IsOptional()
  @IsString()
  failed_reason_code?: string;

  @ApiPropertyOptional({ description: "Failed reason message" })
  @IsOptional()
  @IsString()
  failed_reason_msg?: string;

  // CAPI kart saklama: store_card ile yapılan ödemede PayTR bildirimle utoken döner.
  @ApiPropertyOptional({
    description: "CAPI user token (store_card ödemelerinde)",
  })
  @IsOptional()
  @IsString()
  utoken?: string;

  // Direkt API 2. adım (bildirim) dokümanı: PayTR bu zengin alanları da POST'lar.
  // whitelist:true bunları DTO'da tanımlı değilse siliyordu → gözlemlenebilirlik için
  // kabul edip kaydediyoruz (payment_type/taksit/currency/tutar/test_mode).
  @ApiPropertyOptional({ description: "Ödeme yöntemi: card | eft" })
  @IsOptional()
  @IsString()
  payment_type?: string;

  @ApiPropertyOptional({ description: "Taksit sayısı (0/1 = tek çekim)" })
  @IsOptional()
  @IsString()
  installment_count?: string;

  @ApiPropertyOptional({ description: "Para birimi (TL/USD/EUR/GBP/RUB)" })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ description: "Sipariş tutarı (payment_amount)" })
  @IsOptional()
  @IsString()
  payment_amount?: string;

  @ApiPropertyOptional({ description: "Test modu (1 = test)" })
  @IsOptional()
  @IsString()
  test_mode?: string;
}
