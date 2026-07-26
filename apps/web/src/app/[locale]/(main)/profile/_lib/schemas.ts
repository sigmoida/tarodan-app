/** @format */

import { z } from "zod";
import { isValidIban } from "@tarodan/ui";

/**
 * Zod schemas for the profile dashboard forms. One source of truth for both
 * validation and the inferred form types (via `useZodForm`). Messages are in
 * Turkish (the primary locale).
 */

export const profileInfoSchema = z.object({
  displayName: z.string().trim().min(2, "Görünen isim en az 2 karakter olmalı"),
  phone: z.string().trim().optional().or(z.literal("")),
  birthDate: z.string().optional().or(z.literal("")),
  bio: z
    .string()
    .max(500, "En fazla 500 karakter")
    .optional()
    .or(z.literal("")),
  // Business tier only
  companyName: z.string().trim().optional().or(z.literal("")),
  taxId: z.string().optional().or(z.literal("")),
  taxOffice: z.string().trim().optional().or(z.literal("")),
});
export type ProfileInfoValues = z.infer<typeof profileInfoSchema>;

export const addressSchema = z.object({
  title: z.string().trim().optional().or(z.literal("")),
  fullName: z.string().trim().min(2, "Ad soyad zorunludur"),
  // Stored as +90XXXXXXXXXX → 12 digits total.
  phone: z
    .string()
    .refine(
      (v) => v.replace(/\D/g, "").length >= 12,
      "Geçerli bir telefon giriniz",
    ),
  city: z.string().min(1, "Şehir seçiniz"),
  district: z.string().min(1, "İlçe seçiniz"),
  address: z.string().trim().min(10, "Adres en az 10 karakter olmalı"),
  zipCode: z.string().trim().optional().or(z.literal("")),
  isDefault: z.boolean(),
});
export type AddressValues = z.infer<typeof addressSchema>;

export const bankAccountSchema = z.object({
  accountHolder: z
    .string()
    .trim()
    .min(2, "Hesap sahibi en az 2 karakter olmalı"),
  iban: z
    .string()
    .refine(isValidIban, "Geçerli bir TR IBAN giriniz (TR + 24 rakam)"),
  tcKimlikNo: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || /^\d{11}$/.test(v), "TC Kimlik No 11 rakam olmalıdır"),
  taxId: z.string().trim().optional().or(z.literal("")),
});
export type BankAccountValues = z.infer<typeof bankAccountSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Mevcut şifrenizi girin"),
    newPassword: z
      .string()
      .min(8, "En az 8 karakter")
      .regex(/[A-Z]/, "Bir büyük harf içermeli")
      .regex(/[a-z]/, "Bir küçük harf içermeli")
      .regex(/\d/, "Bir rakam içermeli"),
    confirmPassword: z.string().min(1, "Yeni şifreyi tekrar girin"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Şifreler eşleşmiyor",
    path: ["confirmPassword"],
  });
export type ChangePasswordValues = z.infer<typeof changePasswordSchema>;
