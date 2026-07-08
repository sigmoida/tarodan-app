import { z } from 'zod';

/** Create-ticket form (Turkish-only support surface — no locale factory). */
export const ticketSchema = z.object({
	category: z.string().min(1, 'Lütfen bir kategori seçin'),
	subject: z
		.string()
		.trim()
		.min(5, 'Konu en az 5 karakter olmalıdır')
		.max(200, 'Konu en fazla 200 karakter olabilir'),
	message: z
		.string()
		.trim()
		.min(10, 'Mesajınız en az 10 karakter olmalıdır')
		.max(2000, 'Mesaj en fazla 2000 karakter olabilir'),
});
export type TicketValues = z.infer<typeof ticketSchema>;

/** Ticket reply form. */
export const replySchema = z.object({
	reply: z.string().trim().min(1).max(2000),
});
export type ReplyValues = z.infer<typeof replySchema>;
