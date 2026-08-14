import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  Matches,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsTrPhone } from "../../../common/validators/tr-phone";
import {
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
} from "../utils/username.util";

export class BusinessRegisterDto {
  @ApiProperty({ example: "Ayşe Yılmaz" })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  authorizedFullName: string;

  @ApiProperty({ example: "Tarodan Otomotiv Ticaret Limited Şirketi" })
  @IsString()
  @MinLength(2)
  @MaxLength(240)
  companyLegalName: string;

  @ApiProperty({ example: "Tarodan Otomotiv" })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  companyTitle: string;

  @ApiProperty({ example: "Maslak Mah. Büyükdere Cad. No:1 Sarıyer/İstanbul" })
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  companyAddress: string;

  @ApiProperty({ example: "kurumsal@firma.com" })
  @IsEmail()
  companyEmail: string;

  @ApiPropertyOptional({ example: "firma@hs01.kep.tr" })
  @IsOptional()
  @IsEmail()
  kepAddress?: string;

  @ApiProperty({ example: "+905551234567" })
  @IsTrPhone()
  phone: string;

  @ApiPropertyOptional({ example: "+905559876543" })
  @IsOptional()
  @IsTrPhone()
  contactPhone?: string;
}

export class CorporateInvitationDto {
  @ApiProperty()
  @IsString()
  token: string;

  @ApiProperty({ example: "tarodan.kurumsal" })
  @IsString()
  @MinLength(USERNAME_MIN_LENGTH)
  @MaxLength(USERNAME_MAX_LENGTH)
  @Matches(USERNAME_PATTERN)
  username: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
  password: string;
}
