/** @format */

import { z } from 'zod';

/**
 * Shared building blocks for the new/edit listing form schemas. Numeric fields
 * (`price`, `quantity`, `year`, `bundleSize`) are bound to text/`<select>` inputs
 * as strings and coerced to numbers at submit time.
 */

export const listingFieldMessages = (locale: string) => {
	const tr = locale !== 'en';
	return {
		required: tr
			? 'Lütfen tüm zorunlu alanları doldurun'
			: 'Please fill in all required fields',
		validPrice: tr ? 'Geçerli bir fiyat giriniz' : 'Please enter a valid price',
		setSize: tr ? 'Set için en az 2 parça girin' : 'A set needs at least 2 pieces',
		photo: tr ? 'En az bir fotoğraf ekleyin' : 'Please add at least one photo',
	};
};

export type ListingFieldMessages = ReturnType<typeof listingFieldMessages>;

/** One uploaded image = its card + detail storage keys. */
export const listingImageSchema = z.object({
	cardKey: z.string(),
	detailKey: z.string(),
});

/** Fields common to both forms. Spread into each form's `z.object({...})`. */
export function baseListingFields(msg: ListingFieldMessages) {
	return {
		title: z.string().trim().min(1, msg.required).max(200),
		description: z.string().max(5000),
		categoryId: z.string().min(1, msg.required),
		condition: z.string().min(1, msg.required),
		brandId: z.string(),
		carModelId: z.string(),
		scale: z.string(),
		material: z.string(),
		manufacturerId: z.string(),
		year: z.string(),
		isTradeEnabled: z.boolean(),
		isSet: z.boolean(),
		bundleSize: z.string(),
		quantity: z.string(),
		price: z
			.string()
			.min(1, msg.required)
			.refine((v) => !isNaN(Number(v)) && Number(v) >= 1, msg.validPrice),
	};
}

/** superRefine: when it's a set, require bundleSize >= 2. */
export function bundleSizeRefine(setSizeMsg: string) {
	return (val: { isSet: boolean; bundleSize: string }, ctx: z.RefinementCtx) => {
		if (val.isSet) {
			const n = Number(val.bundleSize);
			if (!val.bundleSize || Number.isNaN(n) || n < 2) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['bundleSize'],
					message: setSizeMsg,
				});
			}
		}
	};
}

/** Default values for the shared base fields (each form adds its own extras). */
export const emptyBaseListingValues = {
	title: '',
	description: '',
	categoryId: '',
	condition: 'very_good',
	brandId: '',
	carModelId: '',
	scale: '1:64',
	material: '',
	manufacturerId: '',
	year: '',
	isTradeEnabled: false,
	isSet: false,
	bundleSize: '',
	quantity: '',
	price: '',
};
