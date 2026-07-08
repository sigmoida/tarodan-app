import { z } from 'zod';

/**
 * Make-offer form. `amount` stays the raw input string (the `<input type=number>`
 * value) and is validated against the listing's price bounds: at least 50% of the
 * current price and strictly below it. Bounds are runtime values, so this is a
 * factory (like the auth / track-order schemas).
 */
export const offerSchema = (min: number, max: number, locale: string) =>
	z.object({
		amount: z
			.string()
			.trim()
			.min(1, locale === 'en' ? 'Enter an amount' : 'Bir tutar girin')
			.refine(
				(v) => !isNaN(parseFloat(v)) && parseFloat(v) > 0,
				locale === 'en' ? 'Enter a valid amount' : 'Geçerli bir tutar girin',
			)
			.refine((v) => parseFloat(v) >= min, `Min: ${min.toFixed(2)} TL (50%)`)
			.refine(
				(v) => parseFloat(v) < max,
				locale === 'en'
					? 'Offer must be lower than the price'
					: 'Teklif fiyattan düşük olmalı',
			),
		message: z
			.string()
			.trim()
			.max(
				500,
				locale === 'en' ? 'Max 500 characters' : 'En fazla 500 karakter',
			)
			.optional(),
	});

export type OfferValues = z.infer<ReturnType<typeof offerSchema>>;
