import { z } from 'zod';

export const collectionSchema = z.object({
  name: z.string().min(3, 'Koleksiyon adı en az 3 karakter olmalı').max(100),
  description: z.string().max(500, 'Açıklama en fazla 500 karakter olabilir').optional(),
  isPublic: z.boolean(),
});

export type CollectionForm = z.infer<typeof collectionSchema>;

export interface Collection {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  coverImageUrl: string | null;
  isPublic: boolean;
  viewCount: number;
  likeCount: number;
  userId?: string;
  ownerId?: string;
  items: Array<{
    id: string;
    productId?: string;
    productTitle: string;
    productImage?: string;
  }>;
  createdAt: string;
}
