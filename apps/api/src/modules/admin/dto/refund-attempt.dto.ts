import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { RefundAttemptStatus } from "@prisma/client";
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MaxLength,
} from "class-validator";
import { Type } from "class-transformer";

export class ManualRefundDto {
  @ApiPropertyOptional({ minimum: 0.01 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  idempotencyKey: string;
}

export class RefundAttemptQueryDto {
  @ApiPropertyOptional({
    enum: RefundAttemptStatus,
    default: RefundAttemptStatus.manual_review,
  })
  @IsOptional()
  @IsEnum(RefundAttemptStatus)
  status?: RefundAttemptStatus;
}

export enum RefundAttemptResolution {
  provider_succeeded = "provider_succeeded",
  provider_not_processed = "provider_not_processed",
}

export class ResolveRefundAttemptDto {
  @ApiProperty({ enum: RefundAttemptResolution })
  @IsEnum(RefundAttemptResolution)
  resolution: RefundAttemptResolution;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  providerRefundId?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  note: string;
}
