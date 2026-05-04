import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class RejectRefundRequestDto {
  @ApiProperty({ description: 'Reddedilme gerekçesi (zorunlu)' })
  @IsString()
  @MinLength(10, { message: 'Red gerekçesi en az 10 karakter olmalıdır' })
  @MaxLength(2000)
  response!: string;
}
