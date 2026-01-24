import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RetryPaymentResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 'uuid-payment-id' })
  paymentId: string;

  @ApiProperty({ example: 'uuid-new-payment-id' })
  newPaymentId: string;

  @ApiProperty({ example: 'https://www.iyzipay.com/payment/...' })
  paymentUrl: string;

  @ApiPropertyOptional({ example: '<script>...</script>' })
  paymentHtml?: string;

  @ApiProperty({ example: 'iyzico' })
  provider: string;

  @ApiProperty({ example: 300 })
  expiresIn: number;
}
