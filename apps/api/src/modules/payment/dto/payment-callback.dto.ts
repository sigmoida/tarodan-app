import { IsString, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class IyzicoCallbackDto {
  @ApiProperty({ description: 'Iyzico token' })
  @IsString()
  token: string;

  @ApiPropertyOptional({ description: 'Conversation ID' })
  @IsOptional()
  @IsString()
  conversationId?: string;

  @ApiPropertyOptional({ description: 'Payment ID from iyzico' })
  @IsOptional()
  @IsString()
  paymentId?: string;

  @ApiPropertyOptional({ description: 'Status' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Conversation Data (for 3D auth)' })
  @IsOptional()
  @IsString()
  conversationData?: string;

  @ApiPropertyOptional({ description: 'MD Status' })
  @IsOptional()
  @IsString()
  mdStatus?: string;
}

export class PayTRCallbackDto {
  @ApiProperty({ description: 'Merchant order ID' })
  @IsString()
  merchant_oid: string;

  @ApiProperty({ description: 'Status' })
  @IsString()
  status: string;

  @ApiProperty({ description: 'Total amount' })
  @IsString()
  total_amount: string;

  @ApiProperty({ description: 'Hash' })
  @IsString()
  hash: string;

  @ApiPropertyOptional({ description: 'Failed reason code' })
  @IsOptional()
  @IsString()
  failed_reason_code?: string;

  @ApiPropertyOptional({ description: 'Failed reason message' })
  @IsOptional()
  @IsString()
  failed_reason_msg?: string;
}
