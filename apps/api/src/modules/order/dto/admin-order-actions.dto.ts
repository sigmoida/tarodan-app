import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ForceCompleteOrderDto {
  @ApiProperty({ description: 'Admin gerekçesi', maxLength: 500 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}

export class ExtendConfirmationDto {
  @ApiProperty({
    description: 'Eklenecek saat (1-168 = max 7 gün)',
    minimum: 1,
    maximum: 168,
  })
  @IsInt()
  @Min(1)
  @Max(168)
  hours!: number;

  @ApiPropertyOptional({ description: 'Admin gerekçesi', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
