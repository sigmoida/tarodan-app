// User types
export * from "./user";

// Product types
export * from "./product";

// Order types
export * from "./order";

// Offer types
export * from "./offer";

// Real (Prisma-aligned) order / shipment / offer status values
export * from "./commerce-status";

// Carrier-handover definition + pre-shipment cancel eligibility (API + admin)
export * from "./order-cancellation";

// Admin orders screen: tabs, buckets and the list row contract
export * from "./order-buckets";
export * from "./admin-order-list";

// Admin "İptal & İade" screen: cancellation tabs/buckets, rows, refund kind
export * from "./admin-cancellations";

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

// Admin dashboard period filter + metric contract
export * from "./dashboard";

// Admin analytics screen — range/grouping controls and the per-tab contracts
export * from "./analytics";

// Account lifecycle status derived from deletedAt / isBanned / isEmailVerified
export * from "./account-status";

// Login state filter ("never logged in") — shared by the admin list and the API
export * from "./login-state";

// Phone rules (shared by API validators, web schemas and the PhoneInput control)
export * from "./phone";

// Province plate codes (carrier payloads address parcels by code, not name)
export * from "./province";

// Full-name splitting (carrier payloads need given/family name separately)
export * from "./person-name";

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

// Attribute group rules (dedicated/hidden/global-custom groups, selection mode)
export * from "./attribute-group";

// Admin invoice list: the process an invoice was issued for
export * from "./invoice";
