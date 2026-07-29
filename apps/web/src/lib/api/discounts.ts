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
  /**
   * Validate a coupon for a GUEST cart (no auth). Per-user limit is not checked
   * (no identity); the final authoritative check happens server-side at checkout.
   */
  validateGuest: (data: {
    code: string;
    cartItems: Array<{ productId: string; quantity: number }>;
  }) => api.post("/discounts/validate-guest", data),
  getActiveCampaigns: () => api.get("/discounts/active"),
};

/** Shape returned by `/discounts/validate*` (ValidationResultDto). */
export interface CouponValidationResult {
  isValid: boolean;
  error?: string;
  discount?: {
    id: string;
    name: string;
    code: string;
    type: "percentage" | "fixed_amount" | "bogo" | "bulk_quantity";
    value: number;
    scope: "global" | "category" | "product" | "seller";
    estimatedDiscount: number;
  };
}
