import { api } from "./client";

// Media / File Upload
export const mediaApi = {
  uploadProductImages: (files: File[]) => {
    const formData = new FormData();
    files.forEach((file) => {
      formData.append("images", file);
    });
    return api.post("/media/upload/product", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
  },
  uploadAvatar: (file: File) => {
    const formData = new FormData();
    formData.append("avatar", file);
    return api.post("/media/upload/avatar", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
  },
  uploadMessageImage: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return api.post<{ url: string; key?: string }>(
      "/media/upload?folder=messages",
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      },
    );
  },
  uploadReviewImage: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return api.post<{ url: string; key?: string }>(
      "/media/upload?folder=reviews",
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      },
    );
  },
  uploadCollectionImage: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return api.post<{ url: string; key?: string }>(
      "/media/upload?folder=collections",
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      },
    );
  },
  // Public asset (ürün/koleksiyon/avatar) için doğrudan görüntüleme URL'i.
  // key tam yol olmalı: {env}/{bucket}/... — bucket key'den türetilir.
  getPublicUrl: (key: string) =>
    api.get<{ url: string }>(`/media/public-url/${key}`),
  deleteFile: (key: string) => api.delete(`/media/file/${key}`),
};
