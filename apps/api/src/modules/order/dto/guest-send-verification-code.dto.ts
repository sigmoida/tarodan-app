import { IsEmail, IsInt, IsNotEmpty, IsOptional, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class GuestSendVerificationCodeDto {
  @ApiProperty({ example: 'guest@example.com' })
  @IsEmail({}, { message: 'Geçerli bir e-posta adresi girin' })
  @IsNotEmpty()
  email: string;

  /** How many guest checkout calls this OTP may authorize (e.g. cart line count). Default 1. */
  @ApiPropertyOptional({ description: 'Guest cart line count; each successful guest checkout consumes one', minimum: 1, maximum: 20, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  expectedCheckoutCount?: number;
}
