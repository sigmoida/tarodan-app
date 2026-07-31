/**
 * Type definitions for Diecast Marketplace
 */

export interface User {
  id: number;
  username: string;
  email: string;
  role: "user" | "admin" | "product_manager" | "sales_manager";
  membership_type: "free" | "premium" | "pro";
  avatar_url?: string;
  rating?: number;
  listings_count?: number;
  created_at: string;
}

export interface Listing {
  id: number;
  title: string;
  description: string;
  price: number;
  images: string[];
  brand: string;
  scale: string;
  year?: number;
  condition: string;
  category?: string;
  trade_available: boolean;
  status:
    | "pending"
    | "active"
    | "sold"
    | "inactive"
    | "reserved"
    | "rejected"
    | "deleted";
  seller: User;
  created_at: string;
  updated_at: string;
}

export type TradeStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "initiator_shipped"
  | "receiver_shipped"
  | "initiator_delivered"
  | "receiver_delivered"
  | "confirmed"
  | "cancelled";

export interface Trade {
  id: number;
  status: TradeStatus;
  initiator: User;
  receiver: User;
  initiator_listings: Listing[];
  receiver_listings: Listing[];
  cash_amount: number;
  cash_direction: "none" | "initiator_to_receiver" | "receiver_to_initiator";
  initiator_tracking?: string;
  receiver_tracking?: string;
  countdown_expires_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CartItem {
  id: number;
  listing_id: number;
  title: string;
  price: number;
  quantity: number;
  image?: string;
  seller: {
    id: number;
    username: string;
  };
}

export interface OrderItem {
  id: number;
  listing_id: number;
  title: string;
  price: number;
  quantity: number;
  image?: string;
}

export interface ShippingAddress {
  full_name: string;
  phone: string;
  city: string;
  district: string;
  address_line: string;
  zip_code?: string;
}

export interface Message {
  id: number;
  sender_id: number;
  receiver_id: number;
  content: string;
  listing_id?: number;
  trade_id?: number;
  is_read: boolean;
  created_at: string;
}

export interface Collection {
  id: number;
  name: string;
  description?: string;
  is_public: boolean;
  user: User;
  items: Listing[];
  item_count: number;
  preview_images?: string[];
  created_at: string;
}

export interface Rating {
  id: number;
  rating: number;
  comment?: string;
  reviewer: User;
  created_at: string;
}

export interface Commission {
  id: number;
  rate: number;
  type: "buyer" | "seller" | "split";
  min_amount?: number;
  max_amount?: number;
}

export interface Membership {
  id: string;
  name: string;
  price: number;
  period: "monthly" | "yearly";
  features: MembershipFeature[];
}

export interface MembershipFeature {
  text: string;
  included: boolean;
}

// API Response types
export interface ApiResponse<T> {
  data: T;
  message?: string;
  success: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

export interface ListingsResponse {
  listings: Listing[];
  total: number;
  page: number;
}

export interface TradesResponse {
  trades: Trade[];
  total: number;
}

export interface AuthResponse {
  user: User;
  token: string;
}
