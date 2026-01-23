import { ApiProperty } from '@nestjs/swagger';

export class CancelPaymentResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 'uuid-payment-id' })
  paymentId: string;

  @ApiProperty({ example: 'Payment cancelled successfully' })
  message: string;
}
