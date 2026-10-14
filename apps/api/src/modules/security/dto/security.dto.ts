import {
  IsString,
  IsEmail,
  MinLength,
  MaxLength,
} from "class-validator";
import { IsPassword } from "../../../common/validators/password";

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

  @IsPassword()
  newPassword: string;
}

export class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  @IsPassword()
  newPassword: string;
}

// E-posta doğrulama DTO'ları buradaydı. Bu modülde ikinci bir doğrulama akışı
// vardı: token'ı HAM saklıyor, mail hiç göndermiyor ve çağrıldığında auth'un
// gönderdiği gerçek token'ı kullanılmış işaretliyordu. Tek doğrulama yolu artık
// auth (`POST /auth/verify-email`, `POST /auth/resend-verification`).

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
