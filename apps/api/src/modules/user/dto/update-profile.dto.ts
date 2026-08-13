import {
  IsString,
  IsOptional,
  MinLength,
  MaxLength,
  Matches,
  IsDateString,
  IsBoolean,
  IsIn,
  ValidateIf,
} from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { locales, type Locale } from "@tarodan/i18n";
import { IsTrPhone } from "../../../common/validators/tr-phone";

export class UpdateProfileDto {
  @ApiPropertyOptional({
    example: "John Doe",
    description: "Display name",
  })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: "İsim en az 2 karakter olmalıdır" })
  @MaxLength(100, { message: "İsim en fazla 100 karakter olabilir" })
  displayName?: string;

  @ApiPropertyOptional({
    example: "+905551234567",
    description: "Phone number",
  })
  @IsOptional()
  @ValidateIf(
    (o, value) => value !== null && value !== undefined && value !== "",
  )
  @IsTrPhone()
  phone?: string;

  @ApiPropertyOptional({
    example: "Koleksiyoncu hakkında bilgi",
    description: "User bio",
  })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: "Bio en fazla 500 karakter olabilir" })
  bio?: string;

  @ApiPropertyOptional({
    example: "1990-01-01",
    description: "Birth date",
  })
  @IsOptional()
  @IsDateString(
    {},
    { message: "Geçerli bir tarih formatı giriniz (YYYY-MM-DD)" },
  )
  birthDate?: string;

  @ApiPropertyOptional({
    example: "ABC Ltd. Şti.",
    description: "Company name for business accounts",
  })
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: "Şirket adı en fazla 200 karakter olabilir" })
  companyName?: string;

  @ApiPropertyOptional({
    example: "1234567890",
    description: "Tax ID number",
  })
  @IsOptional()
  @ValidateIf(
    (o, value) => value !== null && value !== undefined && value !== "",
  )
  @IsString()
  @Matches(/^[0-9]{10,11}$/, {
    message: "Vergi kimlik numarası 10-11 haneli olmalıdır",
  })
  taxId?: string;

  @ApiPropertyOptional({
    example: "Kadıköy VD",
    description: "Tax office",
  })
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: "Vergi dairesi en fazla 100 karakter olabilir" })
  taxOffice?: string;

  @ApiPropertyOptional({
    example: false,
    description: "Is corporate seller",
  })
  @IsOptional()
  @IsBoolean()
  isCorporateSeller?: boolean;

  @ApiPropertyOptional({
    example: "dev/avatars/user-id/abc123.jpg",
    description: "Avatar URL or S3 key",
  })
  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @ApiPropertyOptional({
    example: true,
    description:
      "Güven skorunun herkese açık profilde gösterilip gösterilmeyeceği",
  })
  @IsOptional()
  @IsBoolean()
  showTrustScore?: boolean;

  @ApiPropertyOptional({
    example: "tr",
    enum: locales,
    description:
      "Preferred language for API messages, emails and notifications (#224)",
  })
  @IsOptional()
  @IsIn(locales)
  preferredLanguage?: Locale;
}
