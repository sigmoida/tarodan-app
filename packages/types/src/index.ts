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
export * from "./admin-orders-screen";

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

// Legal identity: TCKN + legal-name rules and the identity gate contract
// (API validators, web/admin schemas, identity gate)
export * from "./legal-identity";

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

// Legal consent records: document keys + current versions (API, web, admin)
export * from "./legal-consent";

// GIB listing/seller report: row contract + legal-name source catalog (API + admin)
export * from "./gib-report";

// Attribute group rules (dedicated/hidden/global-custom groups, selection mode)
export * from "./attribute-group";

// Admin invoice list: the process an invoice was issued for
export * from "./invoice";

// Early escrow release: planned vs actual release date, days early (API + admin)
export * from "./early-release";

// Admin broadcast e-mail: mailing type (announcement | marketing) + limits
export * from "./mailing-type";

// Durations & rules registry: every business duration, its bounds and expiry
// actions (API resolution + validation, admin screen, public policy endpoint)
export * from "./timing-rules";

// Client-side read of GET /timing-rules: fallback + tolerant parse + ICU values
export * from "./timing-policy";

// Durations quoted by legal texts: the statements + mismatch check (admin warning)
export * from "./timing-legal";

// Admin (platform) cancellation: shared reason catalog + request shape
export * from "./admin-cancellation";
// ...and the request's validity rule (reason code, note required for "other")
export * from "./admin-cancel-request";

// Admin (platform) trade cancellation: eligibility rule + preview/result shapes
export * from "./admin-trade-cancellation";
