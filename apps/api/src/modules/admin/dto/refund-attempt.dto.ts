import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { RefundAttemptStatus } from "@prisma/client";
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  MaxLength,
} from "class-validator";
import { Type } from "class-transformer";
import { IsTlAmount } from "../../../common/validators/tl-amount";

export class ManualRefundDto {
  // TL with at most two decimals. `@IsNumber({ maxDecimalPlaces })` threw on
  // an exponent form (1e-7) and the pipe answered 500; `IsTlAmount` refuses it
  // with a 400. The service bounds it by what is refundable. Text is still
  // converted (`@Type`): the admin form sends a number.
  @ApiPropertyOptional({ minimum: 0.01 })
  @IsOptional()
  @Type(() => Number)
  @IsTlAmount()
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
