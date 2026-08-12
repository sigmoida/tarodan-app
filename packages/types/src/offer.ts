import type { PublicIdentity } from "./user";

export enum OfferStatus {
  PENDING = "PENDING",
  ACCEPTED = "ACCEPTED",
  REJECTED = "REJECTED",
  COUNTERED = "COUNTERED",
  EXPIRED = "EXPIRED",
  CANCELLED = "CANCELLED",
}

export interface Offer {
  id: string;
  productId: string;
  buyerId: string;
  sellerId: string;
  amount: number;
  message?: string;
  status: OfferStatus;
  parentOfferId?: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface OfferWithDetails extends Offer {
  product: {
    id: string;
    name: string;
    price: number;
    images: string[];
  };
  buyer: PublicIdentity;
  seller: PublicIdentity;
  counterOffer?: Offer;
}

export interface CreateOfferDto {
  productId: string;
  amount: number;
  message?: string;
}

export interface OfferResponseDto {
  action: "accept" | "reject" | "counter";
  counterAmount?: number;
  message?: string;
}
