import type { PublicIdentity } from "./user";

export enum TradeStatus {
  PENDING = "PENDING",
  ACCEPTED = "ACCEPTED",
  REJECTED = "REJECTED",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
}

export interface Trade {
  id: string;
  initiatorId: string;
  receiverId: string;
  status: TradeStatus;
  message?: string;
  initiatorAgreed: boolean;
  receiverAgreed: boolean;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface TradeItem {
  id: string;
  tradeId: string;
  productId: string;
  ownerId: string;
  quantity: number;
}

export interface TradeWithDetails extends Trade {
  initiator: PublicIdentity;
  receiver: PublicIdentity;
  initiatorItems: TradeItemWithProduct[];
  receiverItems: TradeItemWithProduct[];
}

export interface TradeItemWithProduct extends TradeItem {
  product: {
    id: string;
    name: string;
    images: string[];
    price: number;
  };
}

export interface CreateTradeDto {
  receiverId: string;
  offeredProductIds: string[];
  requestedProductIds: string[];
  message?: string;
}

export interface TradeResponseDto {
  action: "accept" | "reject" | "counter";
  message?: string;
  counterOfferedProductIds?: string[];
  counterRequestedProductIds?: string[];
}
