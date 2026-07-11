import { api } from './client';

/**
 * Medya yükleme. React Native için dosyalar şu formatta iletilir:
 *   { uri: string; name: string; type: string }
 * (Web'deki File ile eşdeğer davranır.)
 */
export type RNFile = { uri: string; name: string; type: string };

const appendRNFile = (formData: FormData, field: string, file: RNFile) => {
  // RN'in kendine özel FormData implementasyonu dosya objesini aşağıdaki şekilde kabul eder.
  // as any cast'i TS'in React Native FormData tiplerinin olmadığı durumlar için gerekli.
  formData.append(field, file as any);
};

export const mediaApi = {
  uploadProductImages: (files: RNFile[]) => {
    const formData = new FormData();
    files.forEach(file => appendRNFile(formData, 'images', file));
    return api.post('/media/upload/product', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  uploadAvatar: (file: RNFile) => {
    const formData = new FormData();
    appendRNFile(formData, 'avatar', file);
    return api.post('/media/upload/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  uploadMessageImage: (file: RNFile) => {
    const formData = new FormData();
    appendRNFile(formData, 'file', file);
    return api.post<{ url: string; key?: string }>(
      '/media/upload',
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        params: { folder: 'messages' },
      },
    );
  },
  /** İade talebi kanıt fotoğrafı — web ile parite: POST /media/upload?folder=reviews */
  uploadRefundEvidence: (file: RNFile) => {
    const formData = new FormData();
    appendRNFile(formData, 'file', file);
    return api.post<{ url: string; key?: string }>(
      '/media/upload',
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        params: { folder: 'reviews' },
      },
    );
  },
  deleteFile: (key: string) => api.delete(`/media/file/${key}`),
};

// Upload API — backend `/media` modülüne yönlendirilmiş eski uyumluluk katmanı.
// Yeni kod `mediaApi` kullanmalı; bu wrapper geriye dönük çağrı dosyaları için bırakıldı.
export const uploadApi = {
  /** Tek resim yükle (genel — backend: POST /media/upload). */
  image: (formData: FormData) =>
    api.post('/media/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(res => res.data),
  /** Çoklu resim yükle (backend: POST /media/upload/multiple). */
  images: (formData: FormData) =>
    api.post('/media/upload/multiple', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(res => res.data),
};
