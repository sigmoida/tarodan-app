import { api } from "./client";

// Products (was Listings - endpoint is /products in backend)
export const listingsApi = {
  getFilters: (params?: { manufacturer?: string }) =>
    api.get("/products/filters", { params }),
  getAttributeGroups: (params?: { manufacturer?: string }) =>
    api.get("/products/attribute-groups", { params }),
  getPopular: (params?: { limit?: number; page?: number }) =>
    api.get("/products/popular", {
      params: { limit: 20, page: 1, ...params },
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    }),
  getAll: (params?: Record<string, any>) =>
    api.get("/products", {
      params,
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    }),
  getOne: (id: string | number) => api.get(`/products/${id}`),
  getById: (id: string | number) => api.get(`/products/${id}`),
  getSimilar: (id: string, limit = 12) =>
    api.get(`/products/${id}/similar`, { params: { limit } }),
  create: (data: Record<string, any>) => api.post("/products", data),
  update: (id: string | number, data: Record<string, any>) =>
    api.patch(`/products/${id}`, data),
  delete: (id: string | number) => api.delete(`/products/${id}`),
};

// Search (ElasticSearch)
export const searchApi = {
  products: (q: string, params?: Record<string, any>) =>
    api.get("/search/products", { params: { q, ...params } }),
  autocomplete: (q: string) =>
    api.get("/search/autocomplete", { params: { q } }),
  autocompleteRich: (q: string) =>
    api.get<{
      products: Array<{
        id: string;
        title: string;
        imageUrl?: string;
        price: number;
        brandName?: string;
      }>;
      brands: Array<{
        id: string;
        name: string;
        slug: string;
        logo?: string | null;
      }>;
      categories: Array<{ id: string; name: string; slug: string }>;
      manufacturers: Array<{
        id: string;
        name: string;
        slug: string;
        logo?: string | null;
      }>;
      carModels?: Array<{
        id: string;
        name: string;
        slug: string;
        brandId: string;
      }>;
      scales?: string[];
      materials?: Array<{ slug: string; label: string }>;
      conditions?: Array<{ value: string; label: string }>;
      suggestions: string[];
    }>("/search/autocomplete-rich", { params: { q } }),
};
