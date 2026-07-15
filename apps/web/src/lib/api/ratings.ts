import { api } from "./client";

// Ratings
export const ratingsApi = {
  // User ratings
  getUserRatings: (userId: string, params?: Record<string, any>) =>
    api.get(`/ratings/users/${userId}`, { params }),
  getUserStats: (userId: string) => api.get(`/ratings/users/${userId}/stats`),
  createUserRating: (data: {
    receiverId: string;
    orderId?: string;
    tradeId?: string;
    score: number;
    comment?: string;
  }) => api.post("/ratings/users", data),

  // Product ratings
  getProductRatings: (productId: string, params?: Record<string, any>) =>
    api.get(`/ratings/products/${productId}`, { params }),
  getProductStats: (productId: string) =>
    api.get(`/ratings/products/${productId}/stats`),
  createProductRating: (data: {
    productId: string;
    orderId: string;
    score: number;
    title?: string;
    review?: string;
    images?: string[];
  }) => api.post("/ratings/products", data),
  markHelpful: (ratingId: string) =>
    api.post(`/ratings/products/${ratingId}/helpful`),
};
