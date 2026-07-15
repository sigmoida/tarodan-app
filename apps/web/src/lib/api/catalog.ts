import { api } from "./client";

// Categories
export const categoriesApi = {
  findAll: (params?: Record<string, any>) => api.get("/categories", { params }),
  findOne: (id: string) => api.get(`/categories/${id}`),
  findBySlug: (slug: string) => api.get(`/categories/slug/${slug}`),
};

// Manufacturers
export const manufacturersApi = {
  findAll: () => api.get("/manufacturers"),
  findOne: (id: string) => api.get(`/manufacturers/${id}`),
  findBySlug: (slug: string) => api.get(`/manufacturers/slug/${slug}`),
};

// Brands
export const brandsApi = {
  findAll: () => api.get("/brands"),
  findBySlug: (slug: string) => api.get(`/brands/${slug}`),
};
