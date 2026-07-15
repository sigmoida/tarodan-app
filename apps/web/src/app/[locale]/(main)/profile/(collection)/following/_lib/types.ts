/** @format */

export interface FollowedUser {
  id: string;
  followingId: string;
  createdAt: string;
  following: {
    id: string;
    displayName: string;
    avatarUrl?: string;
    bio?: string;
    _count?: {
      products: number;
    };
  };
}
