import { IsUUID, IsOptional, IsNumber, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RefundPaymentDto {
  @ApiProperty({
    example: 'uuid-order-id',
    description: 'Order ID to refund payment for',
  })
  @IsUUID('4', { message: 'Geçerli bir sipariş ID giriniz' })
  orderId: string;

  @ApiPropertyOptional({
    example: 100.0,
    description: 'Partial refund amount (if not provided, full refund)',
    minimum: 0.01,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Geçerli bir tutar giriniz' })
  @Min(0.01, { message: 'İade tutarı en az 0.01 olmalıdır' })
  refundAmount?: number;
}

export class RefundPaymentResponseDto {
  @ApiProperty({ example: 'uuid' })
  paymentId: string;

  @ApiProperty({ example: 100.0 })
  refundAmount: number;

  @ApiProperty({ example: 'txn_123456789' })
  providerRefundId: string;

  @ApiProperty({ example: true })
  success: boolean;
}
