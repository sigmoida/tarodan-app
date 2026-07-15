import { api } from "./client";

// Wishlist (no cart in backend - use wishlist for favorites)
export const wishlistApi = {
  get: () => api.get("/wishlist"),
  add: (productId: string) => api.post("/wishlist", { productId }),
  remove: (productId: string) => api.delete(`/wishlist/${productId}`),
  check: (productId: string) => api.get(`/wishlist/check/${productId}`),
  clear: () => api.delete("/wishlist"),
};
