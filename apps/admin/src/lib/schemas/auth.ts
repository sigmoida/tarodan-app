import { z } from 'zod';
import { useTranslations } from 'next-intl';

/**
 * Auth form schemas — the single source of truth for validation AND types.
 * Imported by the client forms (via useZodForm, with `t = useTranslations()`)
 * and by the Server Actions (which re-validate with `safeParse` using
 * `getTranslations()`, never trusting the client). Validation messages are
 * translated, so the schemas are `t`-parameterized factories rather than
 * static objects.
 */

type T = ReturnType<typeof useTranslations<never>>;

export function loginSchema(t: T) {
  return z.object({
    email: z.string().min(1, t('admin.auth.validation.emailRequired')).email(t('admin.auth.validation.emailInvalid')),
    password: z.string().min(6, t('admin.auth.validation.passwordMin')),
    // Only present on the 2FA step; empty on the first submit.
    twoFactorCode: z
      .string()
      .regex(
        /^(?:\d{6}|[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4})$/,
        t('admin.auth.validation.codeInvalid'),
      )
      .optional()
      .or(z.literal('')),
  });
}
export type LoginValues = z.infer<ReturnType<typeof loginSchema>>;

export function forgotPasswordSchema(t: T) {
  return z.object({
    email: z.string().min(1, t('admin.auth.validation.emailRequired')).email(t('admin.auth.validation.emailInvalid')),
  });
}
export type ForgotPasswordValues = z.infer<ReturnType<typeof forgotPasswordSchema>>;
