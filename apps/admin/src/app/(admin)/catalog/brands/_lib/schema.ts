import { z } from 'zod';

/** Brand create/edit. Numeric/url fields kept as strings; shaped in the mutationFn. */
export const brandSchema = z.object({
  name: z.string().trim().min(1, 'Marka adı zorunlu').max(120, 'En fazla 120 karakter'),
  logo: z.string().trim().optional().or(z.literal('')),
  website: z.string().trim().optional().or(z.literal('')),
  description: z.string().trim().max(1000, 'En fazla 1000 karakter').optional().or(z.literal('')),
  country: z.string().trim().max(80).optional().or(z.literal('')),
  foundedYear: z.string().optional().or(z.literal('')),
  sortOrder: z.string().optional().or(z.literal('')),
  isActive: z.boolean(),
});

export type BrandFormValues = z.infer<typeof brandSchema>;
