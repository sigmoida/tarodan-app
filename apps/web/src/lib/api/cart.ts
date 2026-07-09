import { api } from "./client";

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
