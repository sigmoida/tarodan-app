import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  Matches,
  IsBoolean,
  IsDateString,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
  IsArray,
  ArrayMaxSize,
  IsIn,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ACCOUNT_REQUIRED_CONSENTS,
  CONSENT_DOCUMENT_KEYS,
} from "@tarodan/types";
import { IsTrPhone } from "../../../common/validators/tr-phone";
import {
  IsLegalName,
  IsTckn,
  NormalizeLegalName,
  NormalizeTckn,
} from "../../../common/validators/legal-identity";
import {
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
} from "../utils/username.util";

// Custom validator for 18+ age check
@ValidatorConstraint({ name: "isAdult", async: false })
export class IsAdultConstraint implements ValidatorConstraintInterface {
  validate(birthDate: string, args: ValidationArguments) {
    if (!birthDate) return true; // Optional field, let other validators handle required check

    const birth = new Date(birthDate);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();

    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birth.getDate())
    ) {
      age--;
    }

    return age >= 18;
  }

  defaultMessage(args: ValidationArguments) {
    return "Kayıt olmak için en az 18 yaşında olmanız gerekmektedir";
  }
}

export class RegisterDto {
  @ApiProperty({
    example: "kaan.merakli",
    description:
      "Immutable public username (3-30 chars, lowercase letters, numbers, dot or underscore)",
  })
  @IsString()
  @MinLength(USERNAME_MIN_LENGTH, {
    message: "Kullanıcı adı en az 3 karakter olmalıdır",
  })
  @MaxLength(USERNAME_MAX_LENGTH, {
    message: "Kullanıcı adı en fazla 30 karakter olabilir",
  })
  @Matches(USERNAME_PATTERN, {
    message: "Kullanıcı adı küçük harf, rakam, nokta veya alt çizgi içerebilir",
  })
  username: string;

  @ApiProperty({
    example: "user@example.com",
    description: "User email address",
  })
  @IsEmail({}, { message: "Geçerli bir email adresi giriniz" })
  email: string;

  @ApiPropertyOptional({
    example: "+905551234567",
    description: "User phone number (Turkish format)",
  })
  @IsOptional()
  @IsString()
  @IsTrPhone()
  phone?: string;

  @ApiProperty({
    example: "SecurePass123!",
    description: "Password (min 8 chars, 1 uppercase, 1 lowercase, 1 number)",
  })
  @IsString()
  @MinLength(8, { message: "Şifre en az 8 karakter olmalıdır" })
  @MaxLength(50, { message: "Şifre en fazla 50 karakter olabilir" })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message:
      "Şifre en az bir büyük harf, bir küçük harf ve bir rakam içermelidir",
  })
  password: string;

  @ApiProperty({
    example: "John Doe",
    description: "Display name",
  })
  @IsString()
  @MinLength(2, { message: "İsim en az 2 karakter olmalıdır" })
  @MaxLength(100, { message: "İsim en fazla 100 karakter olabilir" })
  displayName: string;

  // YASAL KİMLİK — OPSİYONEL (DTO'da). Web kayıt formu üçünü de zorunlu ister;
  // bugünkü mobil sürümler göndermediği için sunucu zorunlu tutmaz: alanları
  // göndermeden açılan hesap kimlik kapısına ilk girişte düşer (bkz.
  // docs/IDENTITY.md). Gönderilen alan ortak kuralla doğrulanır; TCKN başka
  // bir hesaptaysa kayıt reddedilir (o hesap hakkında bilgi verilmeden).
  @ApiPropertyOptional({ example: "Ayşe Nur", description: "Yasal ad" })
  @IsOptional()
  @IsString()
  @NormalizeLegalName()
  @IsLegalName()
  legalFirstName?: string;

  @ApiPropertyOptional({ example: "Yılmaz", description: "Yasal soyad" })
  @IsOptional()
  @IsString()
  @NormalizeLegalName()
  @IsLegalName()
  legalLastName?: string;

  @ApiPropertyOptional({
    example: "10000000146",
    description: "T.C. Kimlik Numarası (11 hane, checksum'lı)",
  })
  @IsOptional()
  @IsString()
  @NormalizeTckn()
  @IsTckn()
  nationalId?: string;

  // OPSİYONEL — App Store Review 5.1.1(v) (16 Tem 2026): pazar yerinin çekirdek
  // işlevi için gerekli olmayan kişisel veri kayıtta zorunlu tutulamaz. Alan
  // gönderilirse hâlâ geçerli bir tarih ve 18+ olmak zorunda; hiç gönderilmezse
  // kayıt kabul edilir ve birthDate null kalır (Prisma: DateTime?).
  @ApiPropertyOptional({
    example: "1990-01-15",
    description: "Birth date (YYYY-MM-DD) - if provided, must be 18 or older",
  })
  @IsOptional()
  @IsDateString({}, { message: "Geçerli bir tarih giriniz (YYYY-MM-DD)" })
  @Validate(IsAdultConstraint)
  birthDate?: string;

  @ApiPropertyOptional({
    example: false,
    description: "Whether the user wants to be a seller",
  })
  @IsOptional()
  @IsBoolean()
  isSeller?: boolean;

  @ApiPropertyOptional({
    example: true,
    description: "Consent for marketing emails",
  })
  @IsOptional()
  @IsBoolean()
  marketingConsent?: boolean;

  @ApiPropertyOptional({
    example: true,
    description: "Consent for marketing emails (alternative field name)",
  })
  @IsOptional()
  @IsBoolean()
  acceptsMarketingEmails?: boolean;

  @ApiPropertyOptional({
    example: true,
    description: "Consent for push notifications",
  })
  @IsOptional()
  @IsBoolean()
  notificationConsent?: boolean;

  // OPSİYONEL — onay kutularını göndermeyen eski mobil sürümler kayıt
  // olabilmeye devam eder; eksik kalan zorunlu belgeyi yeniden-onay kapısı
  // ilk girişte ister. Sürüm sunucuda damgalanır (bkz. docs/CONSENTS.md).
  @ApiPropertyOptional({
    enum: ACCOUNT_REQUIRED_CONSENTS,
    isArray: true,
    example: ["terms", "privacy", "kvkk"],
    description:
      "Kayıt formunda onaylanan zorunlu belgeler (terms, privacy, kvkk). " +
      "Her biri ayrı bir onay kaydı olur.",
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(CONSENT_DOCUMENT_KEYS.length)
  @IsIn(CONSENT_DOCUMENT_KEYS, { each: true })
  acceptedConsents?: string[];
}
