import { api } from "./client";

// Categories
export const categoriesApi = {
  findAll: (params?: Record<string, any>) => api.get("/categories", { params }),
  findOne: (id: string) => api.get(`/categories/${id}`),
  findBySlug: (slug: string) => api.get(`/categories/slug/${slug}`),
};

/**
 * Vitrindeki üretici listesi — TEK kaynak. Aktif ilanı olmayan üretici web'de
 * gösterilmez; süzme API'de (`hasListings`, mağaza sayacıyla aynı predikat)
 * yapılır. Sunucu (ISR) fetch'leri de bu yolu kullanır.
 */
export const MANUFACTURERS_WITH_LISTINGS_PATH =
  "/manufacturers?hasListings=true";

// Manufacturers
export const manufacturersApi = {
  /** Yalnız aktif ilanı olan üreticiler (bkz. MANUFACTURERS_WITH_LISTINGS_PATH). */
  findAll: () => api.get(MANUFACTURERS_WITH_LISTINGS_PATH),
  findOne: (id: string) => api.get(`/manufacturers/${id}`),
  findBySlug: (slug: string) => api.get(`/manufacturers/slug/${slug}`),
};

// Brands
export const brandsApi = {
  findAll: () => api.get("/brands"),
  findBySlug: (slug: string) => api.get(`/brands/${slug}`),
};
