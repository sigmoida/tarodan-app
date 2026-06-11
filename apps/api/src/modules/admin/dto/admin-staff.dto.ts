import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsString,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AdminRole } from '@prisma/client';

/** Bir e-postaya admin rolü ata. E-posta kayıtlı değilse hesabı sistem oluşturur. */
export class AssignAdminStaffDto {
  @ApiProperty({
    example: 'admin@tarodan.com',
    description: 'Yetki verilecek e-posta. Kayıtlı değilse hesap otomatik oluşturulur.',
  })
  @IsEmail({}, { message: 'Geçerli bir e-posta adresi girin' })
  email: string;

  @ApiProperty({
    enum: AdminRole,
    example: AdminRole.moderator,
    description: 'Atanacak admin rolü',
  })
  @IsEnum(AdminRole, { message: 'Geçersiz rol' })
  role: AdminRole;

  @ApiPropertyOptional({
    description:
      'Yeni hesap için başlangıç şifresi (opsiyonel). Verilmezse sistem geçici şifre üretip döndürür.',
  })
  @IsOptional()
  @IsString()
  @MinLength(6, { message: 'Şifre en az 6 karakter olmalı' })
  password?: string;

  @ApiPropertyOptional({ description: 'Yeni hesap için görünen ad (opsiyonel)' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;
}

/** Bir admin personelin rolünü/aktifliğini güncelle. */
export class UpdateAdminStaffDto {
  @ApiPropertyOptional({ enum: AdminRole })
  @IsOptional()
  @IsEnum(AdminRole, { message: 'Geçersiz rol' })
  role?: AdminRole;

  @ApiPropertyOptional({ example: true, description: 'Hesabı aktif/pasif yap' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/** Rol atama yetki ayarı: yöneticiler de atayabilsin mi. */
export class UpdateStaffSettingsDto {
  @ApiProperty({
    example: true,
    description: 'true ise yöneticiler (admin) de rol atayabilir (süper_admin rolü hariç)',
  })
  @IsBoolean()
  allowAdminAssign: boolean;
}
