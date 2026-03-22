import { IsNumber, Min, Max, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CounterOfferDto {
  @ApiProperty({
    example: 275.0,
    description: 'Counter-offer amount in TRY',
  })
  @IsNumber({}, { message: 'Karşı teklif tutarı sayı olmalıdır' })
  @Type(() => Number)
  @Min(1, { message: 'Karşı teklif en az 1 TL olmalıdır' })
  @Max(9999999, { message: 'Karşı teklif en fazla 9,999,999 TL olabilir' })
  amount: number;

  @ApiPropertyOptional({ description: 'İsteğe bağlı mesaj' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}
