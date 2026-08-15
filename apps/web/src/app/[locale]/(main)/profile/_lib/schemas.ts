/** @format */

import { z } from "zod";
import { isValidIban } from "@tarodan/ui";
import { trPhone, trPhoneOptional } from "@tarodan/ui/form";
import type { Translate } from "@/types/i18n";

/**
 * Zod schemas for the profile dashboard forms. One source of truth for both
 * validation and the inferred form types (via `useZodForm`).
 *
 * Each schema is a `t`-taking factory: the messages come from the shared
 * catalog, and a module-level constant would have to call the hook outside a
 * component. Call them as `useZodForm(profileInfoSchema(t), …)`.
 */

export const profileInfoSchema = (t: Translate) =>
  z.object({
    displayName: z.string().trim().min(2, t("validation.displayNameMin2")),
    phone: trPhoneOptional(t("validation.trPhoneOnly")),
    birthDate: z.string().optional().or(z.literal("")),
    bio: z
      .string()
      .max(500, t("validation.max500Chars"))
      .optional()
      .or(z.literal("")),
    // Business tier only
    companyName: z.string().trim().optional().or(z.literal("")),
    taxId: z.string().optional().or(z.literal("")),
    taxOffice: z.string().trim().optional().or(z.literal("")),
  });
export type ProfileInfoValues = z.infer<ReturnType<typeof profileInfoSchema>>;

export const addressSchema = (t: Translate) =>
  z.object({
    title: z.string().trim().optional().or(z.literal("")),
    fullName: z.string().trim().min(2, t("validation.fullNameRequired")),
    phone: trPhone(t("validation.trPhoneOnly")),
    city: z.string().min(1, t("validation.selectCity")),
    district: z.string().min(1, t("validation.selectDistrict")),
    address: z.string().trim().min(10, t("validation.addressMin10")),
    zipCode: z.string().trim().optional().or(z.literal("")),
    isDefault: z.boolean(),
  });
export type AddressValues = z.infer<ReturnType<typeof addressSchema>>;

export const bankAccountSchema = (t: Translate) =>
  z.object({
    accountHolder: z.string().trim().min(2, t("validation.accountHolderMin2")),
    iban: z.string().refine(isValidIban, t("validation.ibanInvalid")),
    tcKimlikNo: z
      .string()
      .optional()
      .or(z.literal(""))
      .refine((v) => !v || /^\d{11}$/.test(v), t("validation.tcKimlik11")),
    taxId: z
      .string()
      .trim()
      .optional()
      .or(z.literal(""))
      .refine((v) => !v || /^\d{10}$/.test(v), t("validation.taxId10")),
  });
export type BankAccountValues = z.infer<ReturnType<typeof bankAccountSchema>>;

export const changePasswordSchema = (t: Translate) =>
  z
    .object({
      currentPassword: z
        .string()
        .min(1, t("validation.currentPasswordRequired")),
      newPassword: z
        .string()
        .min(8, t("validation.min8Chars"))
        .regex(/[A-Z]/, t("validation.passwordNeedsUppercase"))
        .regex(/[a-z]/, t("validation.passwordNeedsLowercase"))
        .regex(/\d/, t("validation.passwordNeedsDigit")),
      confirmPassword: z.string().min(1, t("validation.repeatNewPassword")),
    })
    .refine((d) => d.newPassword === d.confirmPassword, {
      message: t("validation.passwordMatch"),
      path: ["confirmPassword"],
    });
export type ChangePasswordValues = z.infer<
  ReturnType<typeof changePasswordSchema>
>;
