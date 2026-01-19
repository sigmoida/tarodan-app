import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  Matches,
  IsBoolean,
  IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'User email address',
  })
  @IsEmail({}, { message: 'Geçerli bir email adresi giriniz' })
  email: string;

  @ApiPropertyOptional({
    example: '+905551234567',
    description: 'User phone number (Turkish format)',
  })
  @IsOptional()
  @IsString()
  phone?: string;

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

  @ApiProperty({
    example: 'John Doe',
    description: 'Display name',
  })
  @IsString()
  @MinLength(2, { message: 'İsim en az 2 karakter olmalıdır' })
  @MaxLength(100, { message: 'İsim en fazla 100 karakter olabilir' })
  displayName: string;

  @ApiPropertyOptional({
    example: '1990-01-15',
    description: 'Birth date (YYYY-MM-DD)',
  })
  @IsOptional()
  @IsDateString({}, { message: 'Geçerli bir tarih giriniz (YYYY-MM-DD)' })
  birthDate?: string;

  @ApiPropertyOptional({
    example: false,
    description: 'Whether the user wants to be a seller',
  })
  @IsOptional()
  @IsBoolean()
  isSeller?: boolean;
}
