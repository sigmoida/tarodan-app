import { api } from "./client";

// Discounts
export const discountsApi = {
  getAll: (params?: Record<string, any>) => api.get("/discounts", { params }),
  getOne: (id: string) => api.get(`/discounts/${id}`),
  create: (data: {
    code?: string;
    name: string;
    description?: string;
    type: "percentage" | "fixed_amount";
    value: number;
    scope: "global" | "category" | "product" | "seller";
    categoryId?: string;
    targetProductIds?: string[];
    minCartValue?: number;
    maxDiscountAmount?: number;
    usageLimitTotal?: number;
    usageLimitPerUser?: number;
    isStackable?: boolean;
    priority?: number;
    isActive?: boolean;
    startDate: string;
    endDate: string;
  }) => api.post("/discounts", data),
  update: (id: string, data: Record<string, any>) =>
    api.patch(`/discounts/${id}`, data),
  delete: (id: string) => api.delete(`/discounts/${id}`),
  validate: (data: {
    code: string;
    cartItems: Array<{ productId: string; quantity: number; price: number }>;
  }) => api.post("/discounts/validate", data),
  getActiveCampaigns: () => api.get("/discounts/active"),
};
