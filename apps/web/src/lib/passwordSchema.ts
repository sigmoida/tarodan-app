import { z } from "zod";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@tarodan/types";

type PasswordMessageKey =
  | "validation.passwordMin8"
  | "validation.passwordMax"
  | "validation.passwordUppercase"
  | "validation.passwordLowercase"
  | "validation.passwordNumber";

/** Dar anahtar kümesi: next-intl'in jenerik `t`'si buna atanabilir. */
type TranslateKey = (key: PasswordMessageKey) => string;

/**
 * Yeni şifre alanı için TEK zod şeması (kayıt, sıfırlama, şifre değiştirme,
 * kurumsal davet). Kural `@tarodan/types` `password-policy`'de; API aynı
 * kuralı `@IsPassword()` ile uygular — UI'nin "geçerli" dediği şifre 400 almaz.
 */
export const newPasswordSchema = (t: TranslateKey) =>
  z
    .string()
    .min(PASSWORD_MIN_LENGTH, t("validation.passwordMin8"))
    .max(PASSWORD_MAX_LENGTH, t("validation.passwordMax"))
    .regex(/\p{Lu}/u, t("validation.passwordUppercase"))
    .regex(/\p{Ll}/u, t("validation.passwordLowercase"))
    .regex(/\p{Nd}/u, t("validation.passwordNumber"));
