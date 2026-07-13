import { api } from "./client";

// Offers
export const offersApi = {
  getAll: (params?: Record<string, any>) => api.get("/offers", { params }),
  getOne: (id: string) => api.get(`/offers/${id}`),
  create: (data: { productId: string; amount: number; message?: string }) =>
    api.post("/offers", data),
  accept: (id: string) => api.post(`/offers/${id}/accept`),
  reject: (id: string) => api.post(`/offers/${id}/reject`),
  counter: (id: string, amount: number, message?: string) =>
    api.post(`/offers/${id}/counter`, {
      amount,
      ...(message ? { message } : {}),
    }),
  buyerCounter: (id: string, amount: number, message?: string) =>
    api.post(`/offers/${id}/buyer-counter`, {
      amount,
      ...(message ? { message } : {}),
    }),
  cancel: (id: string) => api.post(`/offers/${id}/cancel`),
};
