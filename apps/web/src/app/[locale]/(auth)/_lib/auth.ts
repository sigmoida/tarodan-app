import { z } from "zod";
import { createTranslator } from "next-intl";
import { getMessages, resolveLocale } from "@tarodan/i18n";

/**
 * Auth form schemas — the single source of truth for validation AND types.
 *
 * The marketplace UI is bilingual (tr/en), and zod messages are baked in at
 * schema-build time, so schemas are **locale-aware factories**: pass the active
 * `locale` and get a schema whose messages match the UI language. Messages come
 * from the shared `@tarodan/i18n` catalog via next-intl's non-React
 * `createTranslator` (the canonical way to translate outside a component).
 * Types come from `z.infer` (message text doesn't affect the value type).
 */

type Locale = string;

/** A root translator for `locale`, backed by the shared message catalog. */
const translator = (locale: Locale) =>
  createTranslator({ locale, messages: getMessages(resolveLocale(locale)) });

export const loginSchema = (locale: Locale) => {
  const t = translator(locale);
  return z.object({
    email: z
      .string()
      .min(1, t("validation.emailRequired"))
      .email(t("validation.invalidEmail")),
    password: z.string().min(1, t("validation.passwordRequired")),
  });
};
export type LoginValues = z.infer<ReturnType<typeof loginSchema>>;

/** Identifier-first step 1: just the e-mail. */
export const emailStepSchema = (locale: Locale) => {
  const t = translator(locale);
  return z.object({
    email: z
      .string()
      .min(1, t("validation.emailRequired"))
      .email(t("validation.invalidEmail")),
  });
};
export type EmailStepValues = z.infer<ReturnType<typeof emailStepSchema>>;

/** Identifier-first step 2: just the password (e-mail already resolved). */
export const passwordStepSchema = (locale: Locale) => {
  const t = translator(locale);
  return z.object({
    password: z.string().min(1, t("validation.passwordRequired")),
    twoFactorCode: z
      .string()
      .regex(
        /^(?:\d{6}|[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4})$/,
        t("admin.auth.validation.codeInvalid"),
      )
      .optional()
      .or(z.literal("")),
  });
};
export type PasswordStepValues = z.infer<ReturnType<typeof passwordStepSchema>>;

/** Just an e-mail — the verify-email "resend" mini-form. */
export const resendEmailSchema = (locale: Locale) => {
  const t = translator(locale);
  return z.object({
    email: z
      .string()
      .min(1, t("validation.emailRequired"))
      .email(t("validation.invalidEmail")),
  });
};
export type ResendEmailValues = z.infer<ReturnType<typeof resendEmailSchema>>;

export const forgotPasswordSchema = (locale: Locale) => {
  const t = translator(locale);
  return z.object({
    email: z
      .string()
      .min(1, t("validation.emailRequired"))
      .email(t("validation.invalidEmail")),
  });
};
export type ForgotPasswordValues = z.infer<
  ReturnType<typeof forgotPasswordSchema>
>;

export const resetPasswordSchema = (locale: Locale) => {
  const t = translator(locale);
  return z
    .object({
      password: z
        .string()
        .min(8, t("auth.pwReqMinLength"))
        .regex(/[A-Z]/, t("validation.passwordUppercase"))
        .regex(/[a-z]/, t("validation.passwordLowercase"))
        .regex(/\d/, t("validation.passwordNumber")),
      confirmPassword: z.string().min(1, t("validation.confirmPassword")),
    })
    .refine((d) => d.password === d.confirmPassword, {
      message: t("validation.passwordMatch"),
      path: ["confirmPassword"],
    });
};
export type ResetPasswordValues = z.infer<
  ReturnType<typeof resetPasswordSchema>
>;

/** Age in whole years for `birthDate` (YYYY-MM-DD), matching the register form. */
function ageFromBirthDate(birthDate: string): number {
  const birthDateObj = new Date(birthDate);
  const today = new Date();
  let age = today.getFullYear() - birthDateObj.getFullYear();
  const monthDiff = today.getMonth() - birthDateObj.getMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birthDateObj.getDate())
  ) {
    age--;
  }
  return age;
}

export const registerSchema = (locale: Locale) => {
  const t = translator(locale);
  return z
    .object({
      displayName: z.string().trim().min(1, t("common.fillAllFields")),
      username: z
        .string()
        .trim()
        .toLowerCase()
        .min(3, t("auth.usernameRules"))
        .max(30, t("auth.usernameRules"))
        .regex(/^[a-z0-9](?:[a-z0-9._]*[a-z0-9])?$/, t("auth.usernameRules")),
      email: z
        .string()
        .trim()
        .min(1, t("common.fillAllFields"))
        .email(t("validation.invalidEmail")),
      phone: z.string().optional(),
      birthDate: z.string().min(1, t("validation.birthDateRequired")),
      password: z
        .string()
        .min(8, t("validation.passwordMin8"))
        .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, t("auth.passwordComplexity")),
      confirmPassword: z.string(),
      agreeTerms: z.boolean(),
      acceptsMarketingEmails: z.boolean(),
    })
    .refine((d) => d.password === d.confirmPassword, {
      message: t("validation.passwordMatch"),
      path: ["confirmPassword"],
    })
    .refine((d) => ageFromBirthDate(d.birthDate) >= 18, {
      message: t("validation.minAge18"),
      path: ["birthDate"],
    })
    .refine((d) => d.agreeTerms === true, {
      message: t("auth.mustAcceptTerms"),
      path: ["agreeTerms"],
    });
};
export type RegisterValues = z.infer<ReturnType<typeof registerSchema>>;

export const businessRegisterSchema = (locale: Locale) => {
  const t = translator(locale);
  return z
    .object({
      authorizedFullName: z
        .string()
        .trim()
        .min(2, t("auth.fillRequiredFields")),
      companyLegalName: z.string().trim().min(2, t("auth.fillRequiredFields")),
      companyTitle: z.string().trim().min(2, t("auth.fillRequiredFields")),
      companyAddress: z.string().trim().min(10, t("auth.fillRequiredFields")),
      companyEmail: z
        .string()
        .trim()
        .min(1, t("auth.fillRequiredFields"))
        .email(t("validation.invalidEmail")),
      // KEP kurumsal tebligat adresi: başvurunun yasal iletişim kanalı, bu
      // yüzden zorunlu. İrtibat telefonu alanı kaldırıldı — şirket telefonu
      // zaten zorunlu ve ikincisi hiçbir akışta kullanılmıyordu.
      kepAddress: z
        .string()
        .trim()
        .min(1, t("auth.fillRequiredFields"))
        .email(t("validation.invalidEmail")),
      phone: z.string().trim().min(1, t("auth.fillRequiredFields")),
      agreeTerms: z.boolean(),
    })
    .refine((d) => d.agreeTerms === true, {
      message: t("auth.mustAcceptTerms"),
      path: ["agreeTerms"],
    });
};
export type BusinessRegisterValues = z.infer<
  ReturnType<typeof businessRegisterSchema>
>;
