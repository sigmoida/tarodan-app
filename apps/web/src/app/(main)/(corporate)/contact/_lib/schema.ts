import { z } from 'zod';

/** Guest contact form — locale-aware messages (like the auth / track-order schemas). */
export const contactSchema = (locale: string) =>
	z.object({
		name: z
			.string()
			.trim()
			.min(1, locale === 'en' ? 'Name is required' : 'Ad soyad gerekli'),
		email: z
			.string()
			.trim()
			.min(1, locale === 'en' ? 'Email is required' : 'E-posta gerekli')
			.email(
				locale === 'en'
					? 'Enter a valid email address'
					: 'Geçerli bir e-posta adresi girin',
			),
		subject: z
			.string()
			.trim()
			.min(1, locale === 'en' ? 'Subject is required' : 'Konu gerekli'),
		message: z
			.string()
			.trim()
			.min(
				10,
				locale === 'en'
					? 'Message must be at least 10 characters'
					: 'Mesaj en az 10 karakter olmalıdır',
			),
	});

export type ContactValues = z.infer<ReturnType<typeof contactSchema>>;
