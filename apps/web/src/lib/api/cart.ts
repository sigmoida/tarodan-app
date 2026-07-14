import { api } from "./client";

// ── Cart domain types (shared by the cart hooks, the offline-cart store and
// every consumer) ──────────────────────────────────────────────────────────

/** A line in the authenticated (server) cart. */
export interface CartItem {
  id: string;
  productId: string;
  productTitle: string;
  productImage: string | null;
  sellerId: string;
  sellerName: string;
  quantity: number;
  originalPrice: number;
  salePrice?: number;
  effectivePrice: number;
  lineTotal: number;
  productDiscount?: number;
  isAvailable: boolean;
  stockWarning?: string;
  maxQuantity?: number;
}

/** An applied coupon/campaign discount in the server cart calculation. */
export interface AppliedDiscount {
  discountId: string;
  discountName: string;
  discountCode?: string;
  type: string;
  value: number;
  scope: string;
  appliedAmount: number;
  affectedProductIds?: string[];
}

/** The backend cart calculation (totals + line items). */
export interface CartCalculation {
  items: CartItem[];
  itemCount: number;
  subtotal: number;
  productDiscountTotal: number;
  couponDiscountTotal: number;
  campaignDiscountTotal: number;
  totalDiscount: number;
  shippingCost: number;
  amountToFreeShipping: number;
  grandTotal: number;
  appliedCouponCode?: string;
  appliedDiscounts: AppliedDiscount[];
  warnings: string[];
}

/** Full backend cart response. */
export interface CartResponse {
  id: string;
  userId: string;
  couponCode?: string;
  expiresAt: string;
  calculation: CartCalculation;
}

/** A guest/offline cart line — kept client-side (localStorage) until login. */
export interface OfflineCartItem {
  id: string;
  productId: string;
  title: string;
  price: number;
  quantity: number;
  imageUrl: string;
  seller: {
    id: string;
    displayName: string;
  };
}

/**
 * Cart domain. Goes through the same `/gateway` proxy as every other authenticated
 * call — the server injects the Bearer from the Next-owned `web_at` cookie and
 * refreshes on 401. The `:id` path param is the PRODUCT id (backend keys cart
 * items by product). All mutating endpoints return the recalculated cart.
 */
export const cartApi = {
  get: () => api.get("/cart"),
  addItem: (productId: string, quantity = 1) =>
    api.post("/cart/items", { productId, quantity }),
  updateItem: (productId: string, quantity: number) =>
    api.patch(`/cart/items/${productId}`, { quantity }),
  removeItem: (productId: string) => api.delete(`/cart/items/${productId}`),
  applyCoupon: (code: string) => api.post("/cart/coupon", { code }),
  removeCoupon: () => api.delete("/cart/coupon"),
  clear: () => api.delete("/cart"),
};
