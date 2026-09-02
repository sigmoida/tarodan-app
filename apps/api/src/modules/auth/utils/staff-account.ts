import { UnauthorizedException } from "@nestjs/common";
import { i18nMessage } from "../../i18n";

/**
 * Personel (AdminUser satırı olan) hesabın web/mobil oturumu YOKTUR; yalnız
 * yönetim paneline (AdminJwtStrategy, ayrı gizli anahtar) girer. Kural tek
 * yerde: şifreli giriş, sosyal giriş, refresh, JWT stratejisi ve websocket
 * hepsi buradan geçer — yeni bir oturum-üreten yol eklendiğinde de bu
 * yüklem çağrılmalı.
 */
export const STAFF_ACCOUNT_ERROR_CODE = "STAFF_ACCOUNT";

/** Personel kontrolü için gereken en dar ilişki seçimi. */
export const STAFF_ACCOUNT_SELECT = {
  adminUser: { select: { id: true } },
} as const;

export function isStaffAccount(user: { adminUser?: unknown }): boolean {
  return user.adminUser != null;
}

export function staffAccountCustomerLoginError(): UnauthorizedException {
  return new UnauthorizedException({
    ...i18nMessage("server.auth.staffAccountCustomerLogin"),
    errorCode: STAFF_ACCOUNT_ERROR_CODE,
  });
}

/** Personel hesabıysa 401 STAFF_ACCOUNT fırlatır. */
export function assertNotStaffAccount(user: { adminUser?: unknown }): void {
  if (isStaffAccount(user)) throw staffAccountCustomerLoginError();
}
