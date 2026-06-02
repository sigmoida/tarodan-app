import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ReturnShippingPayer } from '@prisma/client';

/**
 * Faz 4B.1 — Admin RefundRequest policy override DTO.
 */
export class OverrideRefundPolicyDto {
  @ApiPropertyOptional({ description: 'Ürün tutarı iade edilsin mi' })
  @IsOptional()
  @IsBoolean()
  refundProductAmount?: boolean;

  @ApiPropertyOptional({ description: 'Kargo bedeli iade edilsin mi' })
  @IsOptional()
  @IsBoolean()
  refundShippingFee?: boolean;

  @ApiPropertyOptional({ description: 'Alıcı %3 platform fee iade edilsin mi' })
  @IsOptional()
  @IsBoolean()
  refundBuyerFee?: boolean;

  @ApiPropertyOptional({ description: 'Satıcı komisyonu iade edilsin mi' })
  @IsOptional()
  @IsBoolean()
  refundSellerCommission?: boolean;
}

export class SetReturnShippingPayerDto {
  @ApiPropertyOptional({ enum: ReturnShippingPayer, description: 'İade kargosu kim öder' })
  @IsEnum(ReturnShippingPayer)
  payer!: ReturnShippingPayer;
}
