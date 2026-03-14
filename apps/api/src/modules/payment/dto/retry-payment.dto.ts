import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RetryPaymentResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 'uuid-payment-id' })
  paymentId: string;

  @ApiProperty({ example: 'uuid-new-payment-id' })
  newPaymentId: string;

  @ApiPropertyOptional({ example: 'uuid-order-id' })
  orderId?: string;

  @ApiPropertyOptional({ example: 'https://paytr.com/...' })
  paymentUrl?: string;

  @ApiPropertyOptional({ example: '<script>...</script>' })
  paymentHtml?: string;

  @ApiProperty({ example: 'paytr' })
  provider: string;

  @ApiProperty({ example: 300 })
  expiresIn: number;

  @ApiPropertyOptional({ example: true })
  useBypass?: boolean;
}
