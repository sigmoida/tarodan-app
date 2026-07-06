/** @format */

import { z } from 'zod';

/**
 * Checkout validation — single source of truth for which fields gate each step.
 * Locale-aware factories (tr/en) like the auth schemas, so messages match the UI.
 * The field sets mirror the flow's original gating exactly:
 *  - auth manual shipping address needs a phone; guest shipping does not (guest
 *    phone is a separate contact field);
 *  - billing (when different) only needs fullName + city + address.
 */

type Locale = string;
const tr = (locale: Locale) => locale !== 'en';
const req = (locale: Locale) => (tr(locale) ? 'Zorunlu alan' : 'Required');

/** Shipping address without phone — the guest shipping requirement. */
export const shippingAddressSchema = (locale: Locale) =>
	z.object({
		fullName: z.string().trim().min(1, req(locale)),
		city: z.string().trim().min(1, req(locale)),
		district: z.string().trim().min(1, req(locale)),
		address: z.string().trim().min(1, req(locale)),
	});

/** Shipping address WITH phone — the authenticated manual-address requirement. */
export const shippingAddressWithPhoneSchema = (locale: Locale) =>
	shippingAddressSchema(locale).extend({
		phone: z.string().trim().min(1, req(locale)),
	});

/** Billing address when it differs from shipping — fullName + city + address. */
export const billingAddressSchema = (locale: Locale) =>
	z.object({
		fullName: z.string().trim().min(1, req(locale)),
		city: z.string().trim().min(1, req(locale)),
		address: z.string().trim().min(1, req(locale)),
	});

/** Guest contact block — name + email + phone. */
export const guestContactSchema = (locale: Locale) =>
	z.object({
		guestName: z.string().trim().min(1, req(locale)),
		guestEmail: z
			.string()
			.trim()
			.min(1, req(locale))
			.email(tr(locale) ? 'Geçerli bir e-posta girin' : 'Enter a valid email'),
		guestPhone: z.string().trim().min(1, req(locale)),
	});

/** Full-address form used when saving a new address (title required too). */
export const savedAddressSchema = (locale: Locale) =>
	shippingAddressWithPhoneSchema(locale).extend({
		title: z.string().trim().min(1, req(locale)),
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
