import {
  IsString,
  IsOptional,
  Matches,
  Length,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpsertBankAccountDto {
  @ApiProperty({
    example: 'Ahmet Yılmaz',
    description: 'IBAN sahibinin ad soyadı veya şirket ünvanı',
  })
  @IsString()
  @Length(2, 150, { message: 'Hesap sahibi adı 2-150 karakter olmalıdır' })
  accountHolder: string;

  @ApiProperty({
    example: 'TR330006100519786457841326',
    description: 'Türk IBAN numarası (TR + 24 rakam)',
  })
  @IsString()
  @Matches(/^TR\d{24}$/, { message: 'Geçerli bir TR IBAN numarası giriniz (TR + 24 rakam)' })
  iban: string;

  @ApiPropertyOptional({
    example: '12345678901',
    description: 'TC Kimlik Numarası (bireysel satıcılar için)',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{11}$/, { message: 'TC Kimlik numarası 11 haneli olmalıdır' })
  tcKimlikNo?: string;

  @ApiPropertyOptional({
    example: '1234567890',
    description: 'Vergi numarası (kurumsal satıcılar için)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  taxId?: string;
}

export class BankAccountResponseDto {
  id: string;
  accountHolder: string;
  iban: string;
  tcKimlikNo?: string;
  taxId?: string;
  isVerified: boolean;
  verifiedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
