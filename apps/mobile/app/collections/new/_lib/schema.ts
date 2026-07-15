import { z } from 'zod';

export const collectionSchema = z.object({
  name: z.string().min(3, 'Koleksiyon adı en az 3 karakter olmalı').max(100),
  description: z.string().max(500, 'Açıklama en fazla 500 karakter olabilir').optional(),
  isPublic: z.boolean(),
});

export type CollectionForm = z.infer<typeof collectionSchema>;
