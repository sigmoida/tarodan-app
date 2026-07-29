import { IsEnum, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentProvider } from '../../payment/dto';

export class InitiateMembershipPaymentDto {
  @ApiProperty({
    enum: PaymentProvider,
    example: 'paytr',
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

  @ApiPropertyOptional({ example: 'uuid', description: 'Üyelik sipariş ID — Direct API (direct-form) için' })
  orderId?: string;

  @ApiProperty({ example: 'paytr' })
  provider: string;

  @ApiProperty({ example: 300 })
  expiresIn: number;

  @ApiPropertyOptional({ example: true, description: 'Dev/test bypass mode flag — client must call POST /payments/:id/bypass-complete' })
  useBypass?: boolean;
}
