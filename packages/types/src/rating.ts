import type { PublicIdentity } from "./user";

export interface Rating {
  id: string;
  orderId: string;
  reviewerId: string;
  revieweeId: string;
  productId: string;
  score: number;
  comment?: string;
  isAnonymous: boolean;
  response?: string;
  responseAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface RatingWithDetails extends Rating {
  reviewer: PublicIdentity;
  reviewee: PublicIdentity;
  product: {
    id: string;
    name: string;
    images: string[];
  };
}

export interface RatingSummary {
  averageRating: number;
  totalRatings: number;
  distribution: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
}

export interface CreateRatingDto {
  orderId: string;
  score: number;
  comment?: string;
  isAnonymous?: boolean;
}

export interface RespondToRatingDto {
  response: string;
}
