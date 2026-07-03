import { z } from 'zod';

/** Product approve — optional admin note. */
export const productApproveSchema = z.object({
  note: z.string().trim().max(500, 'En fazla 500 karakter').optional().or(z.literal('')),
});
export type ProductApproveValues = z.infer<typeof productApproveSchema>;

/** Product reject — required reason. */
export const productRejectSchema = z.object({
  reason: z.string().trim().min(1, 'Red nedeni gereklidir').max(500, 'En fazla 500 karakter'),
});
export type ProductRejectValues = z.infer<typeof productRejectSchema>;
