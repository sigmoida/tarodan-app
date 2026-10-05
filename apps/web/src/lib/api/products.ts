import { api } from "./client";

export interface RichAutocompleteResults {
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
}

/**
 * Why the seller takes a listing down — the optional body of
 * `DELETE /products/:id` and the extra fields of the deactivate PATCH. The API
 * records it for Tarodan only; it never appears on the storefront.
 */
export interface ListingRemovalPayload {
  removalReason?: string;
  removalPlatform?: string;
  removalDetail?: string;
}

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
  /** Delete a listing; the removal reason travels as the request body. */
  delete: (id: string | number, removal?: ListingRemovalPayload) =>
    api.delete(`/products/${id}`, removal ? { data: removal } : undefined),
  /** Take a listing off the storefront (seller pause) with its reason. */
  deactivate: (id: string | number, removal: ListingRemovalPayload) =>
    api.patch(`/products/${id}`, { status: "inactive", ...removal }),
  /** Renew one expired listing (live again, or sent for approval if its content changed). */
  renew: (id: string) => api.post(`/products/${id}/renew`),
  /** Renew several expired listings; every listing comes back with its own result. */
  renewMany: (ids: string[]) => api.post("/products/my/renew", { ids }),
};

// Search (ElasticSearch)
export const searchApi = {
  products: (q: string, params?: Record<string, any>) =>
    api.get("/search/products", { params: { q, ...params } }),
  autocomplete: (q: string) =>
    api.get("/search/autocomplete", { params: { q } }),
  autocompleteRich: (q: string) =>
    api.get<RichAutocompleteResults>("/search/autocomplete-rich", {
      params: { q },
    }),
};
