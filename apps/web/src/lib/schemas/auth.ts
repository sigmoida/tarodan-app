import { z } from 'zod';

/**
 * Auth form schemas — the single source of truth for validation AND types.
 *
 * The marketplace UI is bilingual (tr/en), and zod messages are baked in at
 * schema-build time, so schemas are **locale-aware factories**: pass the active
 * `locale` and get a schema whose messages match the UI language. Types come
 * from `z.infer` on the tr build (message text doesn't affect the value type).
 */

type Locale = string;
const tr = (locale: Locale) => locale === 'tr';

export const loginSchema = (locale: Locale) =>
  z.object({
    email: z
      .string()
      .min(1, tr(locale) ? 'E-posta adresi gerekli' : 'Email is required')
      .email(tr(locale) ? 'Geçerli bir e-posta adresi girin' : 'Enter a valid email address'),
    password: z.string().min(1, tr(locale) ? 'Şifre gerekli' : 'Password is required'),
  });
export type LoginValues = z.infer<ReturnType<typeof loginSchema>>;

/** Just an e-mail — the verify-email "resend" mini-form. */
export const resendEmailSchema = (locale: Locale) =>
  z.object({
    email: z
      .string()
      .min(1, tr(locale) ? 'E-posta adresi gerekli' : 'Email is required')
      .email(tr(locale) ? 'Geçerli bir e-posta adresi girin' : 'Enter a valid email address'),
  });
export type ResendEmailValues = z.infer<ReturnType<typeof resendEmailSchema>>;

export const forgotPasswordSchema = (locale: Locale) =>
  z.object({
    email: z
      .string()
      .min(1, tr(locale) ? 'E-posta adresi gerekli' : 'Email is required')
      .email(tr(locale) ? 'Geçerli bir e-posta adresi girin' : 'Enter a valid email address'),
  });
export type ForgotPasswordValues = z.infer<ReturnType<typeof forgotPasswordSchema>>;

export const resetPasswordSchema = (locale: Locale) =>
  z
    .object({
      password: z
        .string()
        .min(8, tr(locale) ? 'En az 8 karakter' : 'At least 8 characters')
        .regex(/[A-Z]/, tr(locale) ? 'Büyük harf gerekli' : 'Uppercase required')
        .regex(/[a-z]/, tr(locale) ? 'Küçük harf gerekli' : 'Lowercase required')
        .regex(/\d/, tr(locale) ? 'Rakam gerekli' : 'Number required'),
      confirmPassword: z.string().min(1, tr(locale) ? 'Şifreyi onaylayın' : 'Confirm your password'),
    })
    .refine((d) => d.password === d.confirmPassword, {
      message: tr(locale) ? 'Şifreler eşleşmiyor' : 'Passwords do not match',
      path: ['confirmPassword'],
    });
export type ResetPasswordValues = z.infer<ReturnType<typeof resetPasswordSchema>>;

/** Age in whole years for `birthDate` (YYYY-MM-DD), matching the register form. */
function ageFromBirthDate(birthDate: string): number {
  const birthDateObj = new Date(birthDate);
  const today = new Date();
  let age = today.getFullYear() - birthDateObj.getFullYear();
  const monthDiff = today.getMonth() - birthDateObj.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDateObj.getDate())) {
    age--;
  }
  return age;
}

export const registerSchema = (locale: Locale) =>
  z
    .object({
      displayName: z
        .string()
        .trim()
        .min(1, tr(locale) ? 'Tüm alanları doldurun' : 'Please fill in all fields'),
      email: z
        .string()
        .trim()
        .min(1, tr(locale) ? 'Tüm alanları doldurun' : 'Please fill in all fields')
        .email(tr(locale) ? 'Geçerli bir e-posta adresi girin' : 'Enter a valid email address'),
      phone: z.string().optional(),
      birthDate: z
        .string()
        .min(1, tr(locale) ? 'Lütfen doğum tarihinizi girin' : 'Please enter your birth date'),
      password: z
        .string()
        .min(8, tr(locale) ? 'Şifre en az 8 karakter olmalıdır' : 'Password must be at least 8 characters')
        .regex(
          /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
          tr(locale)
            ? 'Şifre en az bir büyük harf, bir küçük harf ve bir rakam içermelidir'
            : 'Password must contain at least one uppercase, one lowercase, and one number',
        ),
      confirmPassword: z.string(),
      agreeTerms: z.boolean(),
      acceptsMarketingEmails: z.boolean(),
    })
    .refine((d) => d.password === d.confirmPassword, {
      message: tr(locale) ? 'Şifreler eşleşmiyor' : 'Passwords do not match',
      path: ['confirmPassword'],
    })
    .refine((d) => ageFromBirthDate(d.birthDate) >= 18, {
      message: tr(locale)
        ? 'Kayıt olmak için 18 yaşından büyük olmalısınız.'
        : 'You must be at least 18 years old to register.',
      path: ['birthDate'],
    })
    .refine((d) => d.agreeTerms === true, {
      message: tr(locale)
        ? 'Kullanım şartlarını kabul etmelisiniz'
        : 'You must accept the terms of service',
      path: ['agreeTerms'],
    });
export type RegisterValues = z.infer<ReturnType<typeof registerSchema>>;

export const businessRegisterSchema = (locale: Locale) =>
  z
    .object({
      companyName: z
        .string()
        .trim()
        .min(1, tr(locale) ? 'Lütfen tüm zorunlu alanları doldurun' : 'Please fill in all required fields'),
      email: z
        .string()
        .trim()
        .min(1, tr(locale) ? 'Lütfen tüm zorunlu alanları doldurun' : 'Please fill in all required fields')
        .email(tr(locale) ? 'Geçerli bir e-posta adresi girin' : 'Enter a valid email address'),
      phone: z
        .string()
        .trim()
        .min(1, tr(locale) ? 'Lütfen tüm zorunlu alanları doldurun' : 'Please fill in all required fields'),
      companyType: z.string().optional(),
      taxId: z
        .string()
        .trim()
        .min(1, tr(locale) ? 'Lütfen tüm zorunlu alanları doldurun' : 'Please fill in all required fields'),
      city: z
        .string()
        .trim()
        .min(1, tr(locale) ? 'Lütfen tüm zorunlu alanları doldurun' : 'Please fill in all required fields'),
      district: z.string().optional(),
      password: z
        .string()
        .min(8, tr(locale) ? 'Şifre en az 8 karakter olmalıdır' : 'Password must be at least 8 characters')
        .regex(
          /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
          tr(locale)
            ? 'Şifre en az bir büyük harf, bir küçük harf ve bir rakam içermelidir'
            : 'Password must contain at least one uppercase, one lowercase, and one number',
        ),
      confirmPassword: z.string(),
      agreeTerms: z.boolean(),
    })
    .refine((d) => d.password === d.confirmPassword, {
      message: tr(locale) ? 'Şifreler eşleşmiyor' : 'Passwords do not match',
      path: ['confirmPassword'],
    })
    .refine((d) => d.agreeTerms === true, {
      message: tr(locale)
        ? 'Kullanım şartlarını kabul etmelisiniz'
        : 'You must accept the terms of service',
      path: ['agreeTerms'],
    });
export type BusinessRegisterValues = z.infer<ReturnType<typeof businessRegisterSchema>>;
