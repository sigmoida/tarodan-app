import { IsEmail, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'User email address',
  })
  @IsEmail({}, { message: 'Geçerli bir email adresi giriniz' })
  email: string;

  @ApiProperty({
    example: 'SecurePass123!',
    description: 'User password',
  })
  @IsString()
  @MinLength(1, { message: 'Şifre gereklidir' })
  password: string;

  @ApiProperty({
    required: false,
    example: '123456',
    description: 'Etkin 2FA için TOTP veya tek kullanımlık yedek kod',
  })
  @IsOptional()
  @IsString()
  @Matches(/^(?:\d{6}|[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4})$/, {
    message: 'Geçerli bir doğrulama kodu giriniz',
  })
  twoFactorCode?: string;
}

export class AdminLoginDto extends LoginDto {
  // Admin login uses same fields but different authentication logic
}
