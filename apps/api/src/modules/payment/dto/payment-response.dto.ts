import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import type { BoostPaymentSummary } from "@tarodan/types";

/** The boost behind a boost payment (`BoostPaymentSummary`). */
export class BoostPaymentSummaryDto implements BoostPaymentSummary {
  @ApiProperty({ example: "uuid", description: "ProductBoost id" })
  id: string;

  @ApiProperty({ example: "uuid", description: "The boosted listing" })
  productId: string;

  @ApiProperty({ example: "Model car" })
  productTitle: string;

  @ApiProperty({
    example: "2026-10-28T10:30:00.000Z",
    nullable: true,
    description: "When the boost ends; null until the payment activates it",
  })
  endsAt: string | null;
}

export class PaymentResponseDto {
  @ApiProperty({ example: "uuid" })
  id: string;

  @ApiPropertyOptional({ example: "uuid-order-id", nullable: true })
  orderId: string | null;

  @ApiProperty({ example: 250.0 })
  amount: number;

  @ApiProperty({ example: "TRY" })
  currency: string;

  @ApiProperty({ example: "paytr" })
  provider: string;

  @ApiProperty({ example: "pending" })
  status: string;

  @ApiPropertyOptional({ example: "txn_123456789" })
  providerTransactionId?: string | null; // Alias for providerPaymentId or providerConversationId

  @ApiProperty({ example: "2024-01-15T10:30:00.000Z" })
  createdAt: Date;

  @ApiProperty({ example: "2024-01-15T10:30:00.000Z" })
  updatedAt: Date;

  @ApiPropertyOptional({
    example: true,
    description: "Present (true) only for a membership payment",
  })
  isMembershipOrder?: true;

  @ApiPropertyOptional({
    example: true,
    description: "Present (true) only for a boost payment",
  })
  isBoostOrder?: true;

  @ApiPropertyOptional({
    type: BoostPaymentSummaryDto,
    nullable: true,
    description: "The boost of a boost payment",
  })
  boost?: BoostPaymentSummaryDto | null;
}

export class PaymentInitResponseDto {
  @ApiProperty({ example: "uuid" })
  paymentId: string;

  @ApiPropertyOptional({ example: "uuid-order-id" })
  orderId?: string;

  @ApiPropertyOptional({ example: 340.64 })
  amount?: number;

  @ApiPropertyOptional({ example: "https://paytr.com/..." })
  paymentUrl?: string;

  @ApiPropertyOptional({ example: "<script>...</script>" })
  paymentHtml?: string;

  @ApiPropertyOptional({ example: "PGh0bWw..." })
  htmlContent?: string;

  @ApiPropertyOptional({ example: true })
  isBase64?: boolean;

  @ApiProperty({ example: "paytr" })
  provider: string;

  @ApiProperty({ example: 300 })
  expiresIn: number;

  @ApiPropertyOptional({ example: true })
  useBypass?: boolean;

  @ApiProperty({
    description:
      "Short-lived bearer capability scoped to this payment. Send it in X-Payment-Capability on public payment endpoints.",
  })
  paymentAccessToken: string;
}

export class PaymentHoldResponseDto {
  @ApiProperty({ example: "uuid" })
  id: string;

  @ApiProperty({ example: "uuid-order-id" })
  orderId: string;

  @ApiProperty({ example: "uuid-seller-id" })
  sellerId: string;

  @ApiProperty({ example: 237.5 })
  amount: number;

  @ApiProperty({ example: "held" })
  status: string;

  @ApiPropertyOptional({ example: "2024-01-22T10:30:00.000Z" })
  releaseAt?: Date;

  @ApiProperty({ example: "2024-01-15T10:30:00.000Z" })
  createdAt: Date;
}
