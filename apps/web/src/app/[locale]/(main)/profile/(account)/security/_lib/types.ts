/** @format */

/** Current 2FA state for the signed-in user (`GET /security/2fa/status`). */
export interface TwoFactorStatus {
  isEnabled: boolean;
  backupCodesCount?: number;
}

/** Payload returned when starting 2FA setup (`POST /security/2fa/enable`). */
export interface SetupResponse {
  /** `otpauth://...` sağlama URI'si — GÖRSEL DEĞİL, kimlik doğrulayıcı bağlantısı. */
  qrCodeUrl: string;
  /** Taranabilir QR görseli (`data:image/png;base64,...`). */
  qrCodeImage?: string;
  secret: string;
  backupCodes: string[];
}

/**
 * 2FA açmadan önce gerekenler / neden önemli — metin DEĞİL katalog ANAHTARLARI:
 * bu liste modül düzeyinde sabittir ve orada hook çağrılamaz.
 */
export const REQUIREMENT_KEYS = [
  "profile.twoFactor.requirementApp",
  "profile.twoFactor.requirementPhone",
] as const;

export const WHY_2FA_MATTERS_KEYS = [
  "profile.twoFactor.whyStolenPassword",
  "profile.twoFactor.whyPhishing",
  "profile.twoFactor.whyExtraLayer",
] as const;
