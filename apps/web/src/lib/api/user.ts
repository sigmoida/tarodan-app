import { api } from "./client";

// User Profile
export const userApi = {
  getProfile: () => api.get("/users/me"),
  updateProfile: (data: {
    displayName?: string;
    phone?: string;
    bio?: string;
  }) => api.patch("/users/me", data),
  getMyProducts: (params?: Record<string, any>) =>
    api.get("/products/my", { params }),
  getMyProductById: (id: string) => api.get(`/products/my/${id}`),
  getStats: () => api.get("/users/me/stats"),
  // Public home-page spotlights
  getTopCollections: (limit = 20) =>
    api.get("/users/top-collections", { params: { limit } }),
  getFeaturedCollector: () => api.get("/users/featured-collector"),
  getFeaturedBusiness: () => api.get("/users/featured-business"),
};

// Addresses
export const addressesApi = {
  getAll: () => api.get("/users/me/addresses"),
  getOne: (id: string) => api.get(`/users/me/addresses/${id}`),
  create: (data: {
    title?: string;
    fullName: string;
    phone: string;
    city: string;
    district: string;
    address: string;
    zipCode?: string;
    isDefault?: boolean;
  }) => api.post("/users/me/addresses", data),
  update: (
    id: string,
    data: {
      title?: string;
      fullName?: string;
      phone?: string;
      city?: string;
      district?: string;
      address?: string;
      zipCode?: string;
      isDefault?: boolean;
    },
  ) => api.patch(`/users/me/addresses/${id}`, data),
  delete: (id: string) => api.delete(`/users/me/addresses/${id}`),
  setDefault: (id: string) =>
    api.patch(`/users/me/addresses/${id}`, { isDefault: true }),
};

// Seller Bank Account (IBAN) — backend: user.controller.ts GET/PATCH/DELETE /users/me/bank-account
export const bankAccountApi = {
  get: () => api.get("/users/me/bank-account"),
  upsert: (data: {
    accountHolder: string;
    iban: string;
    tcKimlikNo?: string;
    taxId?: string;
  }) => api.patch("/users/me/bank-account", data),
  delete: () => api.delete("/users/me/bank-account"),
};
