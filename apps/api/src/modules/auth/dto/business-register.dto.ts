import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  Matches,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

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
  @Matches(/^\+90[0-9]{10}$/)
  phone: string;

  @ApiPropertyOptional({ example: "+905559876543" })
  @IsOptional()
  @Matches(/^\+90[0-9]{10}$/)
  contactPhone?: string;
}

export class CorporateInvitationDto {
  @ApiProperty()
  @IsString()
  token: string;

  @ApiProperty({ example: "tarodan.kurumsal" })
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  @Matches(/^[a-z0-9](?:[a-z0-9._]*[a-z0-9])?$/)
  username: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
  password: string;
}
