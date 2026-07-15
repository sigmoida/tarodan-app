/** @format */

/** Current 2FA state for the signed-in user (`GET /security/2fa/status`). */
export interface TwoFactorStatus {
  isEnabled: boolean;
  backupCodesCount?: number;
}

/** Payload returned when starting 2FA setup (`POST /security/2fa/enable`). */
export interface SetupResponse {
  qrCodeUrl: string;
  secret: string;
  backupCodes: string[];
}

/** What the user needs before enabling 2FA. */
export const REQUIREMENTS: string[] = [
  "Google Authenticator veya benzer bir TOTP uygulaması",
  "Akıllı telefon (iOS veya Android)",
];

/** Why enabling 2FA matters — shown in the info section. */
export const WHY_2FA_MATTERS: string[] = [
  "Şifreniz çalınsa bile hesabınız güvende kalır",
  "Phishing saldırılarına karşı ek koruma sağlar",
  "Hesap erişiminde ek bir doğrulama katmanı ekler",
];
