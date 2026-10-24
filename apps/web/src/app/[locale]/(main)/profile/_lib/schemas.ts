/** @format */

import { z } from "zod";
import { isValidIban } from "@tarodan/ui";
import { newPasswordSchema, trPhone, trPhoneOptional } from "@tarodan/ui/form";
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
    // The TCKN is NOT asked here: its one source is the member's legal
    // identity (the identity gate / "Identity details" on the profile). The
    // bank form keeps no second copy that could disagree, and the server
    // leaves a number that is not sent untouched.
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
      newPassword: newPasswordSchema(t),
      confirmPassword: z.string().min(1, t("validation.repeatNewPassword")),
    })
    .refine((d) => d.newPassword === d.confirmPassword, {
      message: t("validation.passwordMatch"),
      path: ["confirmPassword"],
    });
export type ChangePasswordValues = z.infer<
  ReturnType<typeof changePasswordSchema>
>;

/** The first password of an account without one (no current password). */
export const setPasswordSchema = (t: Translate) =>
  z
    .object({
      newPassword: newPasswordSchema(t),
      confirmPassword: z.string().min(1, t("validation.repeatNewPassword")),
    })
    .refine((d) => d.newPassword === d.confirmPassword, {
      message: t("validation.passwordMatch"),
      path: ["confirmPassword"],
    });
export type SetPasswordValues = z.infer<ReturnType<typeof setPasswordSchema>>;

/** The step-up password proof: sent as typed (the API compares it with bcrypt). */
export const reauthPasswordSchema = (t: Translate) =>
  z.object({
    password: z.string().min(1, t("validation.passwordRequired")),
  });
export type ReauthPasswordValues = z.infer<
  ReturnType<typeof reauthPasswordSchema>
>;
