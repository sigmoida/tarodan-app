import {
  IsOptional,
  IsDateString,
  IsEnum,
  IsString,
  IsNotEmpty,
  IsIn,
  Matches,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { OrderStatus } from '@prisma/client';

export enum AnalyticsGroupBy {
  day = 'day',
  week = 'week',
  month = 'month',
}

export class AnalyticsQueryDto {
  @ApiPropertyOptional({ description: 'Start date (ISO format)' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date (ISO format)' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    enum: AnalyticsGroupBy,
    default: AnalyticsGroupBy.day,
  })
  @IsOptional()
  @IsEnum(AnalyticsGroupBy)
  groupBy?: AnalyticsGroupBy = AnalyticsGroupBy.day;
}

export class SalesAnalyticsResponseDto {
  @ApiProperty({ description: 'Date label' })
  date: string;

  @ApiProperty({ description: 'Total sales amount' })
  totalSales: number;

  @ApiProperty({ description: 'Number of orders' })
  orderCount: number;

  @ApiProperty({ description: 'Average order value' })
  averageOrderValue: number;
}

export class RevenueAnalyticsResponseDto {
  @ApiProperty({ description: 'Date label' })
  date: string;

  @ApiProperty({ description: 'Gross revenue' })
  grossRevenue: number;

  @ApiProperty({ description: 'Commission earned' })
  commissionRevenue: number;

  @ApiProperty({ description: 'Net revenue (after refunds)' })
  netRevenue: number;
}

export class UserAnalyticsResponseDto {
  @ApiProperty({ description: 'Date label' })
  date: string;

  @ApiProperty({ description: 'New user registrations' })
  newUsers: number;

  @ApiProperty({ description: 'Active users (made a purchase or listing)' })
  activeUsers: number;

  @ApiProperty({ description: 'New sellers registered' })
  newSellers: number;
}

export class ReportQueryDto {
  @ApiPropertyOptional({
    description: 'Report format',
    enum: ['pdf', 'csv', 'json'],
  })
  @IsOptional()
  @IsString()
  format?: 'pdf' | 'csv' | 'json' = 'json';

  @ApiPropertyOptional({ description: 'Start date (ISO format)' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date (ISO format)' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class UpdateOrderStatusDto {
  @ApiProperty({ description: 'New order status', enum: OrderStatus })
  @IsEnum(OrderStatus)
  status: OrderStatus;

  @ApiProperty({ description: 'Admin operation reason', maxLength: 500 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  notes: string;
}

export class AddOrderTrackingDto {
  @ApiProperty({ description: 'Carrier tracking number', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/^[A-Za-z0-9_-]+$/)
  trackingNumber: string;

  @ApiProperty({ enum: ['surat'] })
  @IsIn(['surat'])
  carrier: 'surat';

  @ApiProperty({ description: 'Admin operation reason', maxLength: 500 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  notes: string;
}
