import { api } from "./client";

// Media / File Upload
export const mediaApi = {
  /**
   * TEK ürün görseli — dosya bazlı ilerleme ve iptal için.
   *
   * Toplu uç (`uploadProductImages`) hâlâ duruyor ama ilan formu bunu kullanır:
   * tek istekte gönderilen partide bir dosyanın hatası hepsini düşürüyor,
   * dosya başına ilerleme/iptal/tekrar deneme mümkün olmuyordu.
   */
  uploadProductImage: (
    file: File,
    options?: {
      signal?: AbortSignal;
      onProgress?: (percent: number) => void;
    },
  ) => {
    const formData = new FormData();
    formData.append("images", file);
    return api.post("/media/upload/product", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      signal: options?.signal,
      onUploadProgress: (event) => {
        if (!options?.onProgress) return;
        // `total` bilinmiyorsa yüzde uydurulmaz; kullanıcı belirsiz durumda
        // sahte bir ilerleme görmemeli.
        if (!event.total) return;
        options.onProgress((event.loaded / event.total) * 100);
      },
    });
  },
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
