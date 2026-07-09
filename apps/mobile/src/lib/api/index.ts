import { api } from './client';
import { authApi } from './auth';
import { productsApi } from './products';
import { categoriesApi, collectionsApi } from './catalog';
import { ordersApi, shippingApi } from './orders';
import { messagesApi, notificationsApi } from './messaging';
import { tradesApi, offersApi, ratingsApi } from './trades';
import { userApi, userReportsApi } from './user';
import { addressesApi, paymentsApi } from './checkout';
import { membershipApi, discountsApi } from './membership';
import { wishlistApi } from './listings';
import { brandsApi, manufacturersApi, carModelsApi, searchApi } from './products';
import { pagesApi, supportApi } from './catalog';
import { mediaApi, uploadApi } from './media';

export * from './client';
export * from './auth';
export * from './products';
export * from './catalog';
export * from './listings';
export * from './orders';
export * from './checkout';
export * from './membership';
export * from './messaging';
export * from './trades';
export * from './user';
export * from './media';

// =============================================================================
// ENDPOINTS OBJECT - Unified API access
// =============================================================================
export const endpoints = {
  auth: authApi,
  products: {
    ...productsApi,
    create: (data: Record<string, any>) => api.post('/products', data).then(res => res.data),
    getAll: (params?: Record<string, any>) => api.get('/products', { params }).then(res => res.data),
    getOne: (id: string | number) => api.get(`/products/${id}`).then(res => res.data),
  },
  categories: {
    getAll: () => api.get('/categories').then(res => res.data),
    getOne: (id: string) => api.get(`/categories/${id}`).then(res => res.data),
  },
  orders: ordersApi,
  messages: messagesApi,
  collections: collectionsApi,
  trades: tradesApi,
  offers: offersApi,
  ratings: ratingsApi,
  user: userApi,
  addresses: addressesApi,
  payments: paymentsApi,
  membership: membershipApi,
  notifications: notificationsApi,
  shipping: shippingApi,
  search: searchApi,
  upload: uploadApi,
  wishlist: wishlistApi,
  // Yeni modüller
  brands: brandsApi,
  manufacturers: manufacturersApi,
  pages: pagesApi,
  support: supportApi,
  discounts: discountsApi,
  media: mediaApi,
  userReports: userReportsApi,
  carModels: carModelsApi,
};

export { default } from './client';
