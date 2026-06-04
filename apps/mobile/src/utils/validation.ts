/**
 * Web `apps/web/src/app/register/page.tsx` paritesinde Zod helper'ları.
 * Şifre kuralı: 8+ karakter, en az 1 büyük harf, 1 küçük harf, 1 rakam.
 *
 * Mobile'daki bütün form ekranları (register, register-business, reset-password,
 * settings/security'deki şifre değiştirme) bu yardımcıları kullanır ki kurallar
 * tek noktadan değişebilsin ve web ile birebir aynı kalsın.
 */

import { z } from 'zod';

/** Tek noktada güçlü şifre Zod schema'sı. */
export const strongPasswordSchema = z
  .string()
  .min(8, 'Şifre en az 8 karakter olmalı')
  .regex(/[A-Z]/, 'En az 1 büyük harf içermeli')
  .regex(/[a-z]/, 'En az 1 küçük harf içermeli')
  .regex(/\d/, 'En az 1 rakam içermeli');

/** Telefon (TR formatı esnek, opsiyonel). */
export const trPhoneSchema = z
  .string()
  .trim()
  .optional()
  .refine(
    (val) => !val || /^(\+?90)?\s?5\d{2}[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}$/.test(val),
    'Geçerli bir cep telefonu girin (ör. +90 5XX XXX XX XX)',
  );

/** Vergi numarası (10) veya T.C. Kimlik (11) — yalnızca rakam. */
export const taxIdSchema = z
  .string()
  .trim()
  .regex(/^\d{10,11}$/, 'Vergi / T.C. kimlik 10 veya 11 hane olmalı');

/** Email: hem .email() hem trim — basit. */
export const emailSchema = z.string().trim().email('Geçerli bir e-posta girin');

/** Display name (web ile aynı: 2-30 char). */
export const displayNameSchema = z
  .string()
  .trim()
  .min(2, 'Ad en az 2 karakter olmalı')
  .max(30, 'Ad en fazla 30 karakter olabilir');

/** Şartları kabul (zorunlu boolean). */
export const acceptTermsSchema = z
  .boolean()
  .refine((val) => val === true, 'Sözleşmeleri kabul etmelisiniz');
