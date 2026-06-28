import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { RefundRequestStatus } from '@prisma/client';

export class RefundRequestQueryDto {
  @ApiPropertyOptional({
    isArray: true,
    enum: RefundRequestStatus,
    example: ['approved', 'return_in_transit'],
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
