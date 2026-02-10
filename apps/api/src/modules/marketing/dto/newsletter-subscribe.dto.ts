import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsBoolean, IsOptional } from 'class-validator';

export class NewsletterSubscribeDto {
  @ApiPropertyOptional({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ description: 'Haftalık bülten', default: true })
  @IsOptional()
  @IsBoolean()
  newsletter?: boolean;

  @ApiPropertyOptional({ description: 'Kampanya ve fırsatlar', default: true })
  @IsOptional()
  @IsBoolean()
  promotions?: boolean;
}
