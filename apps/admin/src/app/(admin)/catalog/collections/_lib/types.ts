export interface Collection {
  id: string;
  name: string;
  slug: string;
  description?: string;
  coverImageUrl?: string;
  isPublic: boolean;
  isFeatured: boolean;
  viewCount: number;
  likeCount: number;
  itemCount: number;
  owner: {
    id: string;
    displayName: string;
    email: string;
    avatarUrl?: string;
    membershipTier?: string | null;
  };
  createdAt: string;
  updatedAt: string;
}
