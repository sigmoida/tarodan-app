import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";
import { IsPassword } from "../../../common/validators/password";
import { IsTrPhone } from "../../../common/validators/tr-phone";

/** Süper-admin'in açtığı test şeridi hesabı (mağaza incelemesi / mobil QA). */
export class CreateTestAccountDto {
  @ApiProperty({ example: "apple-review@tarodan.com.tr" })
  @IsEmail()
  email!: string;

  @ApiProperty({
    minLength: 8,
    description: "Ortak şifre politikası (@IsPassword)",
  })
  @IsPassword()
  password!: string;

  @ApiProperty({ example: "App Review Alıcı" })
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  displayName!: string;

  @ApiPropertyOptional({ description: "Satıcı olarak aç (ilan verebilir)" })
  @IsOptional()
  @IsBoolean()
  isSeller?: boolean;

  @ApiPropertyOptional({ example: "+905000000001" })
  @IsOptional()
  @IsTrPhone()
  phone?: string;
}
