import type { CollectionItem } from "../../_lib/types";

export interface Collection {
  id: string;
  /** Every item the API returns to the owner, hidden and deleted listings too. */
  items?: CollectionItem[];
  userId: string;
  userName: string;
  name: string;
  slug: string;
  description?: string;
  coverImageUrl?: string;
  isPublic: boolean;
  viewCount: number;
  likeCount: number;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
  categoryId?: string | null;
  category?: { id: string; name: string; slug: string } | null;
}
