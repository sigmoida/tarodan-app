// User types
export * from "./user";

// Product types
export * from "./product";

// Order types
export * from "./order";

// Offer types
export * from "./offer";

// Trade types
export * from "./trade";

// Message types
export * from "./message";

// WebSocket types
export * from "./websocket";

// Wishlist & Collection types
export * from "./wishlist";

// Rating types
export * from "./rating";

// Support types
export * from "./support";

// Admin types
export * from "./admin";

// Phone rules (shared by API validators, web schemas and the PhoneInput control)
export * from "./phone";

// Common types
export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface ApiError {
  statusCode: number;
  message: string;
  error?: string;
  details?: Record<string, any>;
}
