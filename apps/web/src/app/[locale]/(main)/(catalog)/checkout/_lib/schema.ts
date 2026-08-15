/** @format */

import { z } from "zod";
import { trPhone } from "@tarodan/ui/form";
import type { Translate } from "@/types/i18n";

/**
 * Checkout validation — single source of truth for which fields gate each step.
 * The field sets mirror the flow's original gating exactly:
 *  - auth manual shipping address needs a phone; guest shipping does not (guest
 *    phone is a separate contact field);
 *  - billing (when different) only needs fullName + city + address.
 *
 * Her şema `t` alır: mesajlar paylaşılan katalogtan gelir. Eskiden bu dosya
 * `locale !== "en"` diye kendi tr/en ayrımını yapıyor ve metinleri elle
 * taşıyordu — üçüncü bir dil sessizce İngilizce'ye düşecekti.
 */

const req = (t: Translate) => t("validation.required");
const phoneMsg = (t: Translate) => t("validation.trPhoneOnly");

/** Shipping address without phone — the guest shipping requirement. */
export const shippingAddressSchema = (t: Translate) =>
  z.object({
    fullName: z.string().trim().min(1, req(t)),
    city: z.string().trim().min(1, req(t)),
    district: z.string().trim().min(1, req(t)),
    address: z.string().trim().min(1, req(t)),
  });

/** Shipping address WITH phone — the authenticated manual-address requirement. */
export const shippingAddressWithPhoneSchema = (t: Translate) =>
  shippingAddressSchema(t).extend({
    phone: trPhone(phoneMsg(t)),
  });

/** Billing address when it differs from shipping — fullName + city + address. */
export const billingAddressSchema = (t: Translate) =>
  z.object({
    fullName: z.string().trim().min(1, req(t)),
    city: z.string().trim().min(1, req(t)),
    address: z.string().trim().min(1, req(t)),
  });

/** Guest contact block — name + email + phone. */
export const guestContactSchema = (t: Translate) =>
  z.object({
    guestName: z.string().trim().min(1, req(t)),
    guestEmail: z
      .string()
      .trim()
      .min(1, req(t))
      .email(t("validation.invalidEmail")),
    guestPhone: trPhone(phoneMsg(t)),
  });

/** Full-address form used when saving a new address (title required too). */
export const savedAddressSchema = (t: Translate) =>
  shippingAddressWithPhoneSchema(t).extend({
    title: z.string().trim().min(1, req(t)),
  });

export type ShippingAddressValues = z.infer<
  ReturnType<typeof shippingAddressWithPhoneSchema>
>;
export type GuestContactValues = z.infer<ReturnType<typeof guestContactSchema>>;

/** Convenience booleans mirroring the flow's inline field checks. */
export const isValid = <T extends z.ZodTypeAny>(
  schema: T,
  value: unknown,
): boolean => schema.safeParse(value).success;
