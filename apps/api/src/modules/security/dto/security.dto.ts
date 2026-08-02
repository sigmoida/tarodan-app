import {
  IsString,
  IsEmail,
  IsOptional,
  MinLength,
  MaxLength,
  Matches,
} from "class-validator";

// =============================================================================
// TWO-FACTOR AUTHENTICATION (GAP-004)
// =============================================================================

export class Enable2FAResponseDto {
  secret: string;
  /** `otpauth://...` sağlama URI'si — kimlik doğrulayıcıya derin bağlantı. */
  qrCodeUrl: string;
  /** Taranabilir QR görseli (`data:image/png;base64,...`) — doğrudan render edilir. */
  qrCodeImage: string;
  backupCodes: string[];
}

export class Verify2FADto {
  @IsString()
  @MinLength(6)
  @MaxLength(6)
  code: string;
}

export class Disable2FADto {
  @IsString()
  @MinLength(6)
  @MaxLength(6)
  code: string;
}

export class TwoFactorStatusDto {
  isEnabled: boolean;
  hasBackupCodes: boolean;
}

// =============================================================================
// PASSWORD RESET (GAP-005)
// =============================================================================

export class RequestPasswordResetDto {
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @IsString()
  token: string;

  @IsString()
  @MinLength(8)
  @MaxLength(100)
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
    {
      message:
        "Şifre en az 8 karakter, bir büyük harf, bir küçük harf, bir rakam ve bir özel karakter içermelidir",
    },
  )
  newPassword: string;
}

export class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  @IsString()
  @MinLength(8)
  @MaxLength(100)
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
    {
      message:
        "Şifre en az 8 karakter, bir büyük harf, bir küçük harf, bir rakam ve bir özel karakter içermelidir",
    },
  )
  newPassword: string;
}

// =============================================================================
// EMAIL VERIFICATION (GAP-006)
// =============================================================================

export class VerifyEmailDto {
  @IsString()
  token: string;
}

export class ResendVerificationDto {
  @IsOptional()
  @IsEmail()
  email?: string;
}

export class EmailVerificationStatusDto {
  isVerified: boolean;
  email: string;
  pendingVerification: boolean;
}

// =============================================================================
// CSRF PROTECTION (GAP-017)
// =============================================================================

export class CsrfTokenResponseDto {
  token: string;
  expiresAt: Date;
}

// =============================================================================
// ADMIN SESSION (GAP-018)
// =============================================================================

export class AdminSessionDto {
  id: string;
  ipAddress?: string;
  userAgent?: string;
  lastActiveAt: Date;
  expiresAt: Date;
  createdAt: Date;
}

export class AdminSessionListDto {
  sessions: AdminSessionDto[];
  currentSessionId: string;
}
