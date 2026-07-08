import { z } from 'zod';

/** Category create/edit form — validation only; payload shaping stays in the mutationFn. */
export const categorySchema = z.object({
  name: z.string().trim().min(1, 'Kategori adı zorunlu').max(120, 'En fazla 120 karakter'),
  description: z.string().trim().max(500, 'En fazla 500 karakter').optional().or(z.literal('')),
  isActive: z.boolean(),
});

export type CategoryFormValues = z.infer<typeof categorySchema>;
