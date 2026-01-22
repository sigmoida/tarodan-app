import { IsString, IsOptional, MinLength, MaxLength, Matches, IsDateString, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiPropertyOptional({
    example: 'John Doe',
    description: 'Display name',
  })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'İsim en az 2 karakter olmalıdır' })
  @MaxLength(100, { message: 'İsim en fazla 100 karakter olabilir' })
  displayName?: string;

  @ApiPropertyOptional({
    example: '+905551234567',
    description: 'Phone number',
  })
  @IsOptional()
  @Matches(/^\+90[0-9]{10}$/, {
    message: 'Geçerli bir Türkiye telefon numarası giriniz (+905XXXXXXXXX)',
  })
  phone?: string;

  @ApiPropertyOptional({
    example: 'Koleksiyoncu hakkında bilgi',
    description: 'User bio',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Bio en fazla 500 karakter olabilir' })
  bio?: string;

  @ApiPropertyOptional({
    example: '1990-01-01',
    description: 'Birth date',
  })
  @IsOptional()
  @IsDateString({}, { message: 'Geçerli bir tarih formatı giriniz (YYYY-MM-DD)' })
  birthDate?: string;

  @ApiPropertyOptional({
    example: 'ABC Ltd. Şti.',
    description: 'Company name for business accounts',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'Şirket adı en fazla 200 karakter olabilir' })
  companyName?: string;

  @ApiPropertyOptional({
    example: '1234567890',
    description: 'Tax ID number',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{10,11}$/, {
    message: 'Vergi kimlik numarası 10-11 haneli olmalıdır',
  })
  taxId?: string;

  @ApiPropertyOptional({
    example: 'Kadıköy VD',
    description: 'Tax office',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Vergi dairesi en fazla 100 karakter olabilir' })
  taxOffice?: string;

  @ApiPropertyOptional({
    example: false,
    description: 'Is corporate seller',
  })
  @IsOptional()
  @IsBoolean()
  isCorporateSeller?: boolean;
}
