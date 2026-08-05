import { api } from "./client";

type CatalogListParams = {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  sortType?: "text" | "number" | "date";
};

/**
 * Catalog domain: products & their moderation (reviews/ratings), taxonomy
 * (categories, brands, manufacturers, car-models), collections, and attributes.
 */
export const catalogApi = {
  // Products
  getProducts: (params?: any) => api.get("/admin/products", { params }),
  getProduct: (id: string) => api.get(`/admin/products/${id}`),
  updateProduct: (id: string, data: any) =>
    api.patch(`/admin/products/${id}`, data),
  approveProduct: (id: string, note?: string) => {
    const body = note ? { note } : {};
    return api.post(`/admin/products/${id}/approve`, body);
  },
  rejectProduct: (id: string, reason: string) =>
    api.post(`/admin/products/${id}/reject`, { reason }),
  bulkApproveProducts: (ids: string[], note?: string) =>
    api.post("/admin/products/bulk-approve", { ids, note }),
  bulkRejectProducts: (ids: string[], reason: string) =>
    api.post("/admin/products/bulk-reject", { ids, reason }),
  deleteProduct: (id: string) => api.delete(`/admin/products/${id}`),
  restoreProduct: (id: string) => api.post(`/admin/products/${id}/restore`),
  exportProducts: (params?: {
    status?: string;
    categoryId?: string;
    sellerId?: string;
  }) => api.get("/admin/products-export", { params, responseType: "blob" }),
  getProductImportSellers: (search?: string) =>
    api.get("/admin/products/bulk-import/sellers", {
      params: search ? { search } : undefined,
    }),
  getProductImportBatch: (batchId: string) =>
    api.get(`/admin/products/bulk-import/batches/${batchId}`),
  bulkImportProducts: (data: {
    batchId: string;
    sellerId: string;
    workbook: File;
    images: File[];
    onUploadProgress?: (progress: number) => void;
  }) => {
    const formData = new FormData();
    formData.append("sellerId", data.sellerId);
    formData.append("workbook", data.workbook);
    data.images.forEach((image) => formData.append("images", image));
    return api.post("/admin/products/bulk-import", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
        "Idempotency-Key": data.batchId,
      },
      onUploadProgress: (event) => {
        const ratio =
          event.total && event.total > 0
            ? event.loaded / event.total
            : event.progress;
        if (ratio != null) {
          data.onUploadProgress?.(
            Math.min(100, Math.max(0, Math.round(ratio * 100))),
          );
        }
      },
    });
  },

  // Reviews
  getReviews: (params?: any) => api.get("/admin/reviews", { params }),
  updateReviewStatus: (id: string, status: string) =>
    api.patch(`/admin/reviews/${id}/status`, { status }),
  getUserRatings: (params?: any) => api.get("/admin/user-ratings", { params }),
  updateUserRatingStatus: (id: string, status: string) =>
    api.patch(`/admin/user-ratings/${id}/status`, { status }),

  // Categories
  getCategories: (
    params?: CatalogListParams & {
      search?: string;
    },
  ) => api.get("/admin/categories", { params: params ?? {} }),
  createCategory: (data: any) => api.post("/admin/categories", data),
  updateCategory: (id: string, data: any) =>
    api.patch(`/admin/categories/${id}`, data),
  deleteCategory: (id: string) => api.delete(`/admin/categories/${id}`),

  // Brands
  getBrands: (
    params?: CatalogListParams & {
      search?: string;
      status?: string;
    },
  ) => api.get("/admin/brands", { params: params ?? {} }),
  createBrand: (data: any) => api.post("/admin/brands", data),
  updateBrand: (id: string, data: any) =>
    api.patch(`/admin/brands/${id}`, data),
  deleteBrand: (id: string) => api.delete(`/admin/brands/${id}`),

  // Manufacturers
  getManufacturers: (
    params?: CatalogListParams & {
      search?: string;
    },
  ) => api.get("/admin/manufacturers", { params: params ?? {} }),
  createManufacturer: (data: any) => api.post("/admin/manufacturers", data),
  updateManufacturer: (id: string, data: any) =>
    api.patch(`/admin/manufacturers/${id}`, data),
  deleteManufacturer: (id: string) => api.delete(`/admin/manufacturers/${id}`),
  /** Single media upload used by all image fields (FormImageUpload). Returns { url, key }. */
  uploadMedia: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return api.post<{ url: string; key: string }>(
      "/admin/media/upload",
      formData,
      {
        headers: { "Content-Type": "multipart/form-data" },
      },
    );
  },

  // Car Models
  getCarModels: (
    params?: CatalogListParams & {
      brandId?: string;
      search?: string;
    },
  ) => api.get("/admin/car-models", { params: params ?? {} }),
  createCarModel: (data: any) => api.post("/admin/car-models", data),
  updateCarModel: (id: string, data: any) =>
    api.patch(`/admin/car-models/${id}`, data),
  deleteCarModel: (id: string) => api.delete(`/admin/car-models/${id}`),

  // Collections
  getCollections: (params?: {
    search?: string;
    userId?: string;
    isPublic?: boolean;
    isFeatured?: boolean;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: string;
    sortType?: "text" | "number" | "date";
  }) => api.get("/admin/collections", { params }),
  getCollection: (id: string) => api.get(`/admin/collections/${id}`),
  createCollection: (data: {
    name: string;
    description?: string;
    isPublic?: boolean;
    isFeatured?: boolean;
    coverImageUrl?: string;
    userId?: string;
  }) => api.post("/admin/collections", data),
  updateCollection: (
    id: string,
    data: {
      name?: string;
      description?: string;
      isPublic?: boolean;
      isFeatured?: boolean;
      coverImageUrl?: string;
    },
  ) => api.patch(`/admin/collections/${id}`, data),
  deleteCollection: (id: string) => api.delete(`/admin/collections/${id}`),
  addItemsToCollection: (id: string, productIds: string[]) =>
    api.post(`/admin/collections/${id}/items`, { productIds }),
  removeItemFromCollection: (collectionId: string, itemId: string) =>
    api.delete(`/admin/collections/${collectionId}/items/${itemId}`),
  setCollectionVisibility: (id: string, isPublic: boolean) =>
    api.patch(`/admin/collections/${id}/visibility`, { isPublic }),
  setCollectionFeatured: (id: string, isFeatured: boolean) =>
    api.patch(`/admin/collections/${id}/featured`, { isFeatured }),

  // Attribute Groups
  getAttributeGroups: (
    params?: CatalogListParams & {
      search?: string;
      isActive?: boolean;
    },
  ) => api.get("/admin/attribute-groups", { params }),
  getAttributeGroup: (id: string) => api.get(`/admin/attribute-groups/${id}`),
  createAttributeGroup: (data: {
    name: string;
    description?: string;
    isRequired?: boolean;
    isActive?: boolean;
    sortOrder?: number;
  }) => api.post("/admin/attribute-groups", data),
  updateAttributeGroup: (
    id: string,
    data: {
      name?: string;
      description?: string;
      isRequired?: boolean;
      isActive?: boolean;
      sortOrder?: number;
    },
  ) => api.patch(`/admin/attribute-groups/${id}`, data),
  deleteAttributeGroup: (id: string) =>
    api.delete(`/admin/attribute-groups/${id}`),

  // Attributes
  getAttributes: (
    params?: CatalogListParams & {
      groupId?: string;
      search?: string;
      isActive?: boolean;
    },
  ) => api.get("/admin/attributes", { params }),
  createAttribute: (data: {
    groupId: string;
    value: string;
    displayValue?: string;
    color?: string;
    sortOrder?: number;
    isActive?: boolean;
  }) => api.post("/admin/attributes", data),
  updateAttribute: (
    id: string,
    data: {
      value?: string;
      displayValue?: string;
      color?: string;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) => api.patch(`/admin/attributes/${id}`, data),
  deleteAttribute: (id: string) => api.delete(`/admin/attributes/${id}`),
};
