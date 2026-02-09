import { IsOptional, IsString, IsIn, IsNumber, Min, Max, IsDateString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class PayoutTransactionsQueryDto {
  @ApiPropertyOptional({ description: 'Filter by seller ID' })
  @IsOptional()
  @IsString()
  sellerId?: string;

  @ApiPropertyOptional({ enum: ['held', 'released', 'cancelled'] })
  @IsOptional()
  @IsIn(['held', 'released', 'cancelled'])
  status?: string;

  @ApiPropertyOptional({ example: '2024-01-01' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2024-12-31' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class PayoutExportQueryDto {
  @ApiPropertyOptional({ description: 'Filter by seller ID' })
  @IsOptional()
  @IsString()
  sellerId?: string;

  @ApiPropertyOptional({ enum: ['held', 'released', 'cancelled'] })
  @IsOptional()
  @IsIn(['held', 'released', 'cancelled'])
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
