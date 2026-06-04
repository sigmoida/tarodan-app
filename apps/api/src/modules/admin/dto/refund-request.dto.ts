import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  Min,
} from 'class-validator';
import { RefundRequestStatus } from '@prisma/client';

export class ResolveRefundDisputeDto {
  @ApiProperty({ enum: ['approve', 'reject'], example: 'approve' })
  @IsIn(['approve', 'reject'])
  resolution: 'approve' | 'reject';

  @ApiProperty({
    example: 'Alıcı kanıt fotoğraflarına dayanılarak iade onaylandı',
    description: 'Resolution notes (min 10 characters)',
  })
  @IsString()
  @MaxLength(1000)
  notes: string;
}

export class RefundRequestQueryDto {
  @ApiPropertyOptional({
    isArray: true,
    enum: RefundRequestStatus,
    example: ['pending_review', 'disputed'],
  })
  @IsOptional()
  @IsArray()
  @IsEnum(RefundRequestStatus, { each: true })
  status?: RefundRequestStatus[];

  @ApiPropertyOptional({ example: 'ahmet@example.com' })
  @IsOptional()
  @IsString()
  userSearch?: string;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
