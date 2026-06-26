import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RefundReason } from '@prisma/client';
import { IsArray, IsEnum, IsInt, IsOptional, IsString, IsUrl, MaxLength, Min } from 'class-validator';

export class CreateRefundRequestDto {
  @ApiProperty({ enum: RefundReason })
  @IsEnum(RefundReason)
  reason!: RefundReason;

  @ApiPropertyOptional({
    description: 'Adet bazlı kısmi iade: kaç adet iade edilecek (verilmezse siparişin tüm adedi).',
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  refundQuantity?: number;

  @ApiPropertyOptional({ description: 'Açıklama (sebepsiz cayma için opsiyonel, dispute için zorunlu)' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({
    description: 'Kanıt fotoğraf URL listesi (hasarlı/yanlış ürün için)',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true })
  evidencePhotoUrls?: string[];
}
