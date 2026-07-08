import { z } from 'zod';

/** Guest order-tracking lookup form — locale-aware messages (like the auth schemas). */
export const trackOrderSchema = (locale: string) =>
	z.object({
		orderNumber: z
			.string()
			.trim()
			.min(
				1,
				locale === 'en' ? 'Enter order number' : 'Sipariş numarası girin',
			),
		email: z
			.string()
			.trim()
			.min(
				1,
				locale === 'en'
					? 'Enter a valid email address'
					: 'Geçerli bir e-posta adresi girin',
			)
			.email(
				locale === 'en'
					? 'Enter a valid email address'
					: 'Geçerli bir e-posta adresi girin',
			),
	});

export type TrackOrderValues = z.infer<ReturnType<typeof trackOrderSchema>>;
