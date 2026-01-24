import { IsEnum, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentProvider } from '../../payment/dto';

export class InitiateMembershipPaymentDto {
  @ApiProperty({
    enum: PaymentProvider,
    example: 'iyzico',
    description: 'Payment provider to use',
  })
  @IsEnum(PaymentProvider, { message: 'Geçerli bir ödeme sağlayıcı seçiniz' })
  provider: PaymentProvider;
}

export class MembershipPaymentInitResponseDto {
  @ApiProperty({ example: 'uuid' })
  paymentId: string;

  @ApiProperty({ example: 'uuid' })
  membershipPaymentId: string;

  @ApiProperty({ example: 'https://www.iyzipay.com/payment/...' })
  paymentUrl: string;

  @ApiPropertyOptional({ example: '<script>...</script>' })
  paymentHtml?: string;

  @ApiProperty({ example: 'iyzico' })
  provider: string;

  @ApiProperty({ example: 300 })
  expiresIn: number;
}
