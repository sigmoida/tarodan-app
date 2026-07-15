export interface LikedCollection {
  id: string;
  name: string;
  description?: string;
  coverImageUrl?: string;
  itemCount: number;
  likeCount: number;
  viewCount: number;
  isPublic: boolean;
  userId?: string;
  userName?: string;
}
