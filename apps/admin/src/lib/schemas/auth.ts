import { z } from 'zod';

/**
 * Auth form schemas — the single source of truth for validation AND types.
 * Imported by the client forms (via useZodForm) and by the Server Actions
 * (which re-validate with `safeParse`, never trusting the client).
 */

export const loginSchema = z.object({
  email: z.string().min(1, 'E-posta gerekli').email('Geçerli bir e-posta girin'),
  password: z.string().min(6, 'Şifre en az 6 karakter olmalı'),
  // Only present on the 2FA step; empty on the first submit.
  twoFactorCode: z
    .string()
    .regex(/^\d{6}$/, '6 haneli kod girin')
    .optional()
    .or(z.literal('')),
});
export type LoginValues = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().min(1, 'E-posta gerekli').email('Geçerli bir e-posta girin'),
});
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;
