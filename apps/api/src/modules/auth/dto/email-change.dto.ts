import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from "class-validator";
import { REAUTH_TOKEN_MAX_LENGTH } from "../reauth/reauth.service";

/** `POST /auth/email/request-change`. */
export class RequestEmailChangeDto {
  @ApiProperty({
    example: "new@example.com",
    description: "The new e-mail address",
  })
  @IsEmail({}, { message: "Geçerli bir e-posta adresi girin" })
  newEmail!: string;

  /**
   * Checked by `ReauthGuard` before validation; declared so the contract
   * shows it. Optional while `auth_require_reauth_for_sensitive_actions` is
   * off.
   */
  @ApiPropertyOptional({
    description:
      "Step-up token from POST /auth/reauth (or the X-Reauth-Token header)",
  })
  @IsOptional()
  @IsString()
  @MaxLength(REAUTH_TOKEN_MAX_LENGTH)
  reauthToken?: string;
}

export class VerifyEmailChangeDto {
  @ApiProperty({ example: "123456", description: "6 haneli doğrulama kodu" })
  @IsString()
  @Length(6, 6, { message: "Kod 6 haneli olmalıdır" })
  @Matches(/^\d{6}$/, { message: "Kod yalnızca rakamlardan oluşmalıdır" })
  code!: string;
}
