import { z } from 'zod';

/** Newsletter unsubscribe by email — optional feedback, locale-aware messages. */
export const unsubscribeSchema = (locale: string) =>
	z.object({
		email: z
			.string()
			.trim()
			.min(1, locale === 'en' ? 'Email is required' : 'E-posta gerekli')
			.email(
				locale === 'en'
					? 'Enter a valid email address'
					: 'Geçerli bir e-posta adresi girin',
			),
		feedback: z.string().trim().optional(),
	});

export type UnsubscribeValues = z.infer<ReturnType<typeof unsubscribeSchema>>;
