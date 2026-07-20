import { api } from "./client";

// User API - Web ile aynı endpoint'ler
export const userApi = {
  getProfile: () => api.get("/users/me"),
  updateProfile: (
    data:
      | {
          displayName?: string;
          phone?: string;
          bio?: string;
          birthDate?: string;
          avatarUrl?: string;
          companyName?: string;
          taxId?: string;
          taxOffice?: string;
          isCorporateSeller?: boolean;
          showTrustScore?: boolean;
        }
      | FormData,
  ) =>
    api.patch(
      "/users/me",
      data,
      data instanceof FormData
        ? { headers: { "Content-Type": "multipart/form-data" } }
        : undefined,
    ),
  /** Hesabı sil (kullanıcının kendi). Backend: DELETE /users/me */
  deleteAccount: () => api.delete("/users/me"),
  /** Genel istatistikler (satıcı analitik dahil). Backend: GET /users/me/business-stats */
  getStats: () => api.get("/users/me/business-stats"),
  /** İlanlarım için ürün-bazlı istatistik (backend: GET /products/my/stats) */
  getMyProductStats: () => api.get("/products/my/stats"),
  /** Analitik raporu (timeRange ile) — backend: GET /users/me/analytics */
  getAnalytics: (params?: { timeRange?: "7d" | "30d" | "90d" | "all" }) =>
    api.get("/users/me/analytics", { params }),
  /** Kullanıcının public profili — backend: GET /users/:id/profile */
  getPublicProfile: (userId: string) => api.get(`/users/${userId}/profile`),
  /** Kullanıcının takip durumu (sen onu takip ediyor musun?) — GET /users/:id/follow */
  getFollowStatus: (userId: string) => api.get(`/users/${userId}/follow`),
  /** Takip ettiklerim — GET /users/me/following */
  getMyFollowing: () => api.get("/users/me/following"),
  block: (userId: string) => api.post(`/users/${userId}/block`),
  unblock: (userId: string) => api.delete(`/users/${userId}/block`),
  /** Bloke ettiğim kullanıcılar */
  getBlockedUsers: () => api.get("/users/me/blocked"),
  follow: (userId: string) => api.post(`/users/${userId}/follow`),
  unfollow: (userId: string) => api.delete(`/users/${userId}/follow`),
  /** Satıcı vitrin görüntülenmesini artır — backend: POST /users/:id/view. Vitrin başına 1 kez çağrılmalı. */
  incrementStoreView: (userId: string) => api.post(`/users/${userId}/view`),
  /** İşletme satıcısına yükselt — backend: POST /users/me/seller */
  upgradeToSeller: (data: {
    companyName?: string;
    taxId?: string;
    taxOffice?: string;
  }) => api.post("/users/me/seller", data),
  /** Anasayfa "Haftanın Şirketi" — backend: GET /users/featured-business */
  getFeaturedBusiness: () => api.get("/users/featured-business"),
  /** Anasayfa "Haftanın Koleksiyoneri" */
  getFeaturedCollector: () => api.get("/users/featured-collector"),
  /** Top sellers (anasayfa fallback) */
  getTopSellers: (params?: { limit?: number }) =>
    api.get("/users/top-sellers", { params }),
  /** Top collections */
  getTopCollections: (params?: { limit?: number }) =>
    api.get("/users/top-collections", { params }),
};

// Seller Bank Account (IBAN) — backend: GET/PATCH/DELETE /users/me/bank-account
export const bankAccountApi = {
  get: () => api.get("/users/me/bank-account"),
  upsert: (data: {
    accountHolder: string;
    iban: string;
    tcKimlikNo?: string;
    taxId?: string;
  }) => api.patch("/users/me/bank-account", data),
  remove: () => api.delete("/users/me/bank-account"),
};

// User Reports API - İçerik raporlama
export const userReportsApi = {
  create: (data: {
    type: "product" | "user" | "collection" | "message";
    targetId: string;
    reason:
      | "spam"
      | "inappropriate_content"
      | "fake_product"
      | "scam"
      | "harassment"
      | "hate_speech"
      | "counterfeit"
      | "wrong_category"
      | "misleading_info"
      | "other";
    description?: string;
  }) => api.post("/user-reports", data),
  getMyReports: () => api.get("/user-reports/me"),
};
