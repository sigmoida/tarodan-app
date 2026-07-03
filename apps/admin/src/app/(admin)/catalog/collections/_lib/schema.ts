import { z } from 'zod';

export const collectionSchema = z.object({
  name: z.string().trim().min(1, 'Koleksiyon adı zorunlu').max(120, 'En fazla 120 karakter'),
  description: z.string().trim().max(1000).optional().or(z.literal('')),
  coverImageUrl: z.string().trim().optional().or(z.literal('')),
  isPublic: z.boolean(),
  isFeatured: z.boolean(),
});

export type CollectionFormValues = z.infer<typeof collectionSchema>;
