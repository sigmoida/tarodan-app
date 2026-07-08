import { z } from 'zod';

/** Newsletter signup — email + preference toggles, locale-aware messages. */
export const newsletterSchema = (locale: string) =>
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
		newsletter: z.boolean(),
		promotions: z.boolean(),
	});

export type NewsletterValues = z.infer<ReturnType<typeof newsletterSchema>>;
