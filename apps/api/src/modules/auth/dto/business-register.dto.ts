import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  Matches,
  IsBoolean,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BusinessRegisterDto {
  @ApiProperty({
    example: 'ABC Ltd. Şti.',
    description: 'Company name',
  })
  @IsString()
  @MinLength(2, { message: 'Şirket adı en az 2 karakter olmalıdır' })
  @MaxLength(200, { message: 'Şirket adı en fazla 200 karakter olabilir' })
  companyName: string;

  @ApiProperty({
    example: 'user@example.com',
    description: 'User email address',
  })
  @IsEmail({}, { message: 'Geçerli bir email adresi giriniz' })
  email: string;

  @ApiProperty({
    example: '+905551234567',
    description: 'User phone number (Turkish format)',
  })
  @IsString()
  @Matches(/^\+90[0-9]{10}$/, {
    message: 'Geçerli bir Türkiye telefon numarası giriniz (+905XXXXXXXXX)',
  })
  phone: string;

  @ApiProperty({
    example: 'SecurePass123!',
    description: 'Password (min 8 chars, 1 uppercase, 1 lowercase, 1 number)',
  })
  @IsString()
  @MinLength(8, { message: 'Şifre en az 8 karakter olmalıdır' })
  @MaxLength(50, { message: 'Şifre en fazla 50 karakter olabilir' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'Şifre en az bir büyük harf, bir küçük harf ve bir rakam içermelidir',
  })
  password: string;

  @ApiPropertyOptional({
    example: 'Limited Şirket',
    description: 'Company type',
  })
  @IsOptional()
  @IsString()
  companyType?: string;

  @ApiProperty({
    example: '1234567890',
    description: 'Tax ID number (10-11 digits)',
  })
  @IsString()
  @Matches(/^[0-9]{10,11}$/, {
    message: 'Vergi kimlik numarası 10-11 haneli olmalıdır',
  })
  taxId: string;

  @ApiProperty({
    example: 'İstanbul',
    description: 'City',
  })
  @IsString()
  @MinLength(2, { message: 'İl adı en az 2 karakter olmalıdır' })
  city: string;

  @ApiPropertyOptional({
    example: 'Kadıköy',
    description: 'District',
  })
  @IsOptional()
  @IsString()
  district?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Consent for marketing emails',
  })
  @IsOptional()
  @IsBoolean()
  acceptsMarketingEmails?: boolean;
}
