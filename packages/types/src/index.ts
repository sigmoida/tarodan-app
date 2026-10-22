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

// Admin "İadeler" screen: tabs/buckets, the bucket rule and the refund row contract
export * from "./admin-refund-list";

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

// Why a listing left the storefront: reasons per actor, platforms, violation
// codes, the validation rule and the admin/dashboard contracts (API, web, admin)
export * from "./listing-removal";

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
  details?: Record<string, unknown>;
}

// Legal consent records: document keys + current versions (API, web, admin)
export * from "./legal-consent";
// On/off platform settings: the one "is it on" rule (API and admin toggles)
export * from "./platform-setting";

// GIB listing/seller report: row contract + legal-name source catalog (API + admin)
export * from "./gib-report";

// Attribute group rules (dedicated/hidden/global-custom groups, selection mode)
export * from "./attribute-group";

// Admin invoice list: the process an invoice was issued for
export * from "./invoice";

// Early escrow release: planned vs actual release date, days early (API + admin)
export * from "./early-release";

// Escrow hold releasability: why a hold cannot be released (API + admin badge)
export * from "./hold-release";

// Refund decision per-side totals (API computes, admin refund detail renders)
export * from "./refund-totals";

// Admin broadcast e-mail: mailing type (announcement | marketing) + limits
export * from "./mailing-type";

// Free notification link (admin broadcast `data.link`) safety rule
export * from "./notification-link";

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

// PayTR merchant_oid ("sipariş no"): build + parse a pasted id back to our numbers
export * from "./paytr-merchant-oid";
// Mail routing: areas, sender accounts, staff notification events + admin shapes
export * from "./mail-routing";
// Staging refresh from production (masked): run status shared by API + admin
export * from "./uat-refresh";

// Reklam tıklanabilir alanları — admin formu + API aynı kuralla denetler
export * from "./ad-hotspot";
export * from "./ad-popup";

// Admin Excel dökümleri: kaynak başına kolon kataloğu (API yazıcısı + admin)
export * from "./export-catalog";

// Admin'in iki dilde yazdığı içerik metni (tr zorunlu, en → tr düşer)
export * from "./localized-text";

// İçeriğin hedef istemcisi (web / app / all): hero slaytı ve reklam ortak
export * from "./content-platform";

// Vitrin hero'su + güven rozetleri: yerleşimler, sınırlar, public/admin şekiller
export * from "./hero";

// Password policy (API validators, web schemas and the live requirement list)
export * from "./password-policy";

// Sign-in methods and step-up: providers, the read model, the reauth token and
// its error codes (API, web, mobile)
export * from "./sign-in-methods";

// Seller trust score: formula version, levels, read shapes and the formatter
// (API, web, admin, mobile)
export * from "./seller-trust";

// Product search: the GET /products price filter bound (API, web, mobile)
export * from "./product-search";

// Saved searches: the allow-list, canonical query, default name, route params
// and error codes (API, web, mobile)
export * from "./saved-search";

// Listing boost: the boost_enabled rule, offer settings and the options and
// offers shapes (API, web, admin, mobile)
export * from "./boost";

// Virtual orders (membership, boost): the kinds, also the `type` query of the
// PayTR return URLs (API, web)
export * from "./virtual-order";

// The one action a listing card shows: boost own, add others to cart (web, mobile)
export * from "./product-card-action";
