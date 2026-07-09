import { api } from "./client";

// Collections
export const collectionsApi = {
  updateCover: (id: string | number, file: File) => {
    const formData = new FormData();
    formData.append("cover", file);
    return api.patch(`/collections/${id}/cover`, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
  },
  browse: (params?: Record<string, any>) =>
    api.get("/collections/browse", { params }),
  getUserCollections: (userId: string, params?: Record<string, any>) =>
    api.get(`/collections/user/${userId}`, { params }),
  getMyCollections: (params?: Record<string, any>) =>
    api.get("/collections/me", { params }),
  getLiked: (params?: Record<string, any>) =>
    api.get("/collections/liked", { params }),
  getOne: (id: string) => api.get(`/collections/${id}`),
  getBySlug: (slug: string) => api.get(`/collections/slug/${slug}`),
  create: (data: {
    name: string;
    description?: string;
    coverImageKey?: string;
    isPublic?: boolean;
    categoryId?: string;
  }) => api.post("/collections", data),
  update: (
    id: string,
    data: {
      name?: string;
      description?: string;
      coverImageKey?: string;
      isPublic?: boolean;
      categoryId?: string | null;
    },
  ) => api.patch(`/collections/${id}`, data),
  delete: (id: string) => api.delete(`/collections/${id}`),
  addItem: (
    id: string,
    data: {
      productId?: string;
      customTitle?: string;
      customDescription?: string;
      customBrand?: string;
      customModel?: string;
      customYear?: number;
      customScale?: string;
      customManufacturer?: string;
      customMaterial?: string;
      customImageUrl?: string;
      sortOrder?: number;
      isFeatured?: boolean;
      imageFile?: File;
    },
  ) => {
    const formData = new FormData();

    // Add all data fields to FormData
    if (data.productId) formData.append("productId", data.productId);
    if (data.customTitle) formData.append("customTitle", data.customTitle);
    if (data.customDescription)
      formData.append("customDescription", data.customDescription);
    if (data.customBrand) formData.append("customBrand", data.customBrand);
    if (data.customModel) formData.append("customModel", data.customModel);
    if (data.customYear !== undefined)
      formData.append("customYear", data.customYear.toString());
    if (data.customScale) formData.append("customScale", data.customScale);
    if (data.customManufacturer)
      formData.append("customManufacturer", data.customManufacturer);
    if (data.customMaterial)
      formData.append("customMaterial", data.customMaterial);
    if (data.customImageUrl)
      formData.append("customImageUrl", data.customImageUrl);
    if (data.sortOrder !== undefined)
      formData.append("sortOrder", data.sortOrder.toString());
    if (data.isFeatured !== undefined)
      formData.append("isFeatured", data.isFeatured.toString());

    // Add image file if provided
    if (data.imageFile) {
      formData.append("image", data.imageFile);
    }

    return api.post(`/collections/${id}/items`, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
  },
  removeItem: (id: string, itemId: string) =>
    api.delete(`/collections/${id}/items/${itemId}`),
  like: (id: string) => api.post(`/collections/${id}/like`),
  unlike: (id: string) => api.delete(`/collections/${id}/like`),
};
