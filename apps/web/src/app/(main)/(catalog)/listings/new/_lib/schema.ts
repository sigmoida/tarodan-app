/** @format */

import { z } from 'zod';

/**
 * New-listing validation — the single source of truth for the fields that gate
 * submission (title, category, price, at least one photo). Locale-aware factory
 * (tr/en) like the other form schemas; the field order matches the flow's
 * original inline checks so the first error message stays the same.
 */

type Locale = string;
const tr = (locale: Locale) => locale !== 'en';

export const newListingSchema = (locale: Locale) => {
	const required = tr(locale)
		? 'Lütfen tüm zorunlu alanları doldurun'
		: 'Please fill in all required fields';
	const validPrice = tr(locale)
		? 'Geçerli bir fiyat giriniz'
		: 'Please enter a valid price';
	const photo = tr(locale)
		? 'En az bir fotoğraf ekleyin'
		: 'Please add at least one photo';

	return z.object({
		title: z.string().trim().min(1, required),
		categoryId: z.string().min(1, required),
		price: z
			.string()
			.min(1, required)
			.refine((v) => !isNaN(Number(v)) && Number(v) >= 1, validPrice),
		images: z
			.array(z.object({ cardKey: z.string(), detailKey: z.string() }))
			.min(1, photo),
	});
};

export type NewListingValues = z.infer<ReturnType<typeof newListingSchema>>;
