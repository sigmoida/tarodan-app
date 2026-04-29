import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RefundReason } from '@prisma/client';
import { IsArray, IsEnum, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class CreateRefundRequestDto {
  @ApiProperty({ enum: RefundReason })
  @IsEnum(RefundReason)
  reason!: RefundReason;

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
