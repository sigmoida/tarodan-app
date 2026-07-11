import { api } from './client';

// Products API - Web ile aynı endpoint'ler
export const productsApi = {
  getAll: (params?: Record<string, any>) =>
    api.get('/products', { params }),
  /** Dinamik filtre seçenekleri — web SidebarFilters ile aynı kaynak. Backend: GET /products/filters */
  getFilters: (params?: { manufacturer?: string }) =>
    api.get<{
      categories: Array<{ value: string; label: string; slug: string; parentId: string | null }>;
      brands: Array<{ id: string; name: string; slug: string }>;
      carModels: Array<{ id: string; name: string; slug: string; brandId: string }>;
      scales: string[];
      manufacturers: Array<{ id: string; name: string; slug: string }>;
      materials: Array<{ slug: string; label: string }>;
      // Yalnızca attribute-grubu olan bir üretici seçilince dolar (örn Hot Wheels).
      customAttributes?: Array<{
        slug: string;
        name: string;
        manufacturerSlug: string;
        attributes: Array<{ slug: string; label: string; color: string | null }>;
      }>;
    }>('/products/filters', { params }),
  getOne: (id: string | number) =>
    api.get(`/products/${id}`),
  /** Görüntülenme sayacını artır — web ile parite (POST /products/:id/view). Ekran başına 1 kez çağrılmalı. */
  incrementView: (id: string | number) =>
    api.post(`/products/${id}/view`),
  create: (data: Record<string, any>) =>
    api.post('/products', data),
  update: (id: string | number, data: Record<string, any>) =>
    api.patch(`/products/${id}`, data),
  delete: (id: string | number) =>
    api.delete(`/products/${id}`),
  /** Backend: GET /products/my (web ile aynı). Daha önce /products/my-listings kullanılıyordu — backend'de yok. */
  getMyListings: (params?: Record<string, any>) =>
    api.get('/products/my', { params }),
  /** İlanlarım istatistikleri (aktif, satıldı, görüntülenme vb.) */
  getMyStats: () => api.get('/products/my/stats'),
  /** Mevcut sahibinin ilanı — düzenleme için */
  getMyById: (id: string) => api.get(`/products/my/${id}`),
  /** Aynı kategoriden benzer ürünler — backend: GET /products/:id/similar */
  getSimilar: (id: string, limit = 12) =>
    api.get(`/products/${id}/similar`, { params: { limit } }),
  // ---- Boost / Öne Çıkarma ----
  /** Boost süre/fiyat paketleri. Backend: GET /products/boost/pricing */
  getBoostPricing: () =>
    api.get<{
      enabled?: boolean;
      options?: Array<{ durationDays: number; price: number; label: string }>;
    }>('/products/boost/pricing'),
  /** Kullanıcının boost'ları (en yeni önce). Backend: GET /products/boost/my */
  getMyBoosts: () => api.get('/products/boost/my'),
  /** İlanı öne çıkar — ödeme başlat (paymentId döner). Backend: POST /products/:id/boost/initiate */
  initiateBoost: (
    productId: string,
    data: { durationDays: number; autoRenew?: boolean; provider?: 'paytr' },
  ) => api.post(`/products/${productId}/boost/initiate`, data),
};

// Search API - Elasticsearch ile gerçek arama
export const searchApi = {
  // Elasticsearch ile ürün arama
  products: (params?: {
    q?: string;
    categoryId?: string;
    minPrice?: number;
    maxPrice?: number;
    condition?: string;
    page?: number;
    pageSize?: number;
    sortBy?: 'relevance' | 'price_asc' | 'price_desc' | 'newest';
  }) => api.get('/search/products', { params }),

  // Autocomplete önerileri (basit)
  autocomplete: (query: string) =>
    api.get('/search/autocomplete', { params: { q: query } }),

  /** Zenginleştirilmiş autocomplete: products + brands + categories + manufacturers + scales + suggestions */
  autocompleteRich: (query: string) =>
    api.get<{
      products: Array<{ id: string; title: string; imageUrl?: string; price: number; brandName?: string }>;
      brands: Array<{ id: string; name: string; slug: string; logo?: string | null }>;
      categories: Array<{ id: string; name: string; slug: string }>;
      manufacturers: Array<{ id: string; name: string; slug: string; logo?: string | null }>;
      carModels?: Array<{ id: string; name: string; slug: string; brandId: string }>;
      scales?: string[];
      materials?: Array<{ slug: string; label: string }>;
      conditions?: Array<{ value: string; label: string }>;
      suggestions: string[];
    }>('/search/autocomplete-rich', { params: { q: query } }),

  // İsimle satıcı arama (autocomplete)
  users: (query: string, limit?: number) =>
    api.get<Array<{ id: string; displayName: string; avatarUrl?: string; isVerified?: boolean; totalListings?: number }>>(
      '/users/search',
      { params: { q: query, limit } },
    ),
};

/** Markalar (örn. Porsche, Ferrari) */
export const brandsApi = {
  findAll: () => api.get('/brands'),
  findOne: (id: string) => api.get(`/brands/${id}`),
  findBySlug: (slug: string) => api.get(`/brands/${slug}`),
};

/** Üreticiler / producers (örn. Hot Wheels, Bburago) */
export const manufacturersApi = {
  findAll: () => api.get('/manufacturers'),
  findOne: (id: string) => api.get(`/manufacturers/${id}`),
  findBySlug: (slug: string) => api.get(`/manufacturers/slug/${slug}`),
};

// Car Models API — backend: /car-models (web ile aynı)
export const carModelsApi = {
  findAll: (params?: { brandId?: string; brandSlug?: string }) =>
    api.get('/car-models', { params }),
  findOne: (id: string) => api.get(`/car-models/${id}`),
  findBySlug: (slug: string) => api.get(`/car-models/${slug}`),
};
