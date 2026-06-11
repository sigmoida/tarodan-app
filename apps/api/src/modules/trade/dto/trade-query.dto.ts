import {
  IsOptional,
  IsEnum,
  IsNumber,
  IsString,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TradeStatus } from '@prisma/client';

export class TradeQueryDto {
  @IsOptional()
  @IsEnum(TradeStatus)
  status?: TradeStatus;

  // Çoklu-statü grubu (tek enum status yetmediğinde). 'shipping' = depo-escrow
  // akışındaki kargo statüleri. status ile birlikte gönderilirse statusGroup önceliklidir.
  @IsOptional()
  @IsString()
  statusGroup?: 'shipping';

  @IsOptional()
  @IsString()
  role?: 'initiator' | 'receiver' | 'all';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;

  @IsOptional()
  @IsString()
  sortBy?: 'createdAt' | 'updatedAt' | 'responseDeadline';

  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';
}
