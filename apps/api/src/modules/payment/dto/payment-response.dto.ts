import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PaymentResponseDto {
  @ApiProperty({ example: 'uuid' })
  id: string;

  @ApiProperty({ example: 'uuid-order-id' })
  orderId: string;

  @ApiProperty({ example: 250.0 })
  amount: number;

  @ApiProperty({ example: 'TRY' })
  currency: string;

  @ApiProperty({ example: 'iyzico' })
  provider: string;

  @ApiProperty({ example: 'pending' })
  status: string;

  @ApiPropertyOptional({ example: 'txn_123456789' })
  providerTransactionId?: string | null; // Alias for providerPaymentId or providerConversationId

  @ApiProperty({ example: '2024-01-15T10:30:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2024-01-15T10:30:00.000Z' })
  updatedAt: Date;
}

export class PaymentInitResponseDto {
  @ApiProperty({ example: 'uuid' })
  paymentId: string;

  @ApiPropertyOptional({ example: 'uuid-order-id' })
  orderId?: string;

  @ApiPropertyOptional({ example: 340.64 })
  amount?: number;

  @ApiPropertyOptional({ example: 'https://paytr.com/...' })
  paymentUrl?: string;

  @ApiPropertyOptional({ example: '<script>...</script>' })
  paymentHtml?: string;

  @ApiPropertyOptional({ example: 'PGh0bWw...' })
  htmlContent?: string;

  @ApiPropertyOptional({ example: true })
  isBase64?: boolean;

  @ApiProperty({ example: 'paytr' })
  provider: string;

  @ApiProperty({ example: 300 })
  expiresIn: number;
}

export class PaymentHoldResponseDto {
  @ApiProperty({ example: 'uuid' })
  id: string;

  @ApiProperty({ example: 'uuid-order-id' })
  orderId: string;

  @ApiProperty({ example: 'uuid-seller-id' })
  sellerId: string;

  @ApiProperty({ example: 237.5 })
  amount: number;

  @ApiProperty({ example: 'held' })
  status: string;

  @ApiPropertyOptional({ example: '2024-01-22T10:30:00.000Z' })
  releaseAt?: Date;

  @ApiProperty({ example: '2024-01-15T10:30:00.000Z' })
  createdAt: Date;
}
