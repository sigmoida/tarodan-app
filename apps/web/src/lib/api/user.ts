import { api } from "./client";

// User Profile
export const userApi = {
  getProfile: () => api.get("/users/me"),
  updateProfile: (data: {
    displayName?: string;
    phone?: string;
    bio?: string;
    preferredLanguage?: "tr" | "en";
  }) => api.patch("/users/me", data),
  claimUsername: (username: string) =>
    api.patch<{ username: string; usernameClaimed: true }>(
      "/users/me/username",
      { username },
    ),
  completeHomeTour: (version: number) =>
    api.patch("/users/me/onboarding/home-tour", { version }),
  getMyProducts: (params?: Record<string, any>) =>
    api.get("/products/my", { params }),
  getMyProductById: (id: string) => api.get(`/products/my/${id}`),
  getStats: () => api.get("/users/me/stats"),
  // Public home-page spotlights
  getTopCollections: (limit = 20) =>
    api.get("/users/top-collections", { params: { limit } }),
  getFeaturedCollector: () => api.get("/users/featured-collector"),
  getFeaturedBusiness: () => api.get("/users/featured-business"),
};

export type CorporateDocumentStatus =
  "pending" | "approved" | "rejected" | "revision_requested" | "appealed";

export interface CorporateApplication {
  id: string;
  status: string;
  authorizedFullName: string;
  companyLegalName: string;
  companyTitle: string;
  companyAddress: string;
  companyEmail: string;
  kepAddress?: string;
  phone: string;
  contactPhone?: string;
  taxId?: string;
  companyType?: string;
  taxOffice?: string;
  companyCity?: string;
  companyDistrict?: string;
  bankAccountHolder?: string;
  iban?: string;
  reviewNote?: string;
  documents: Array<{
    id: string;
    documentType: string;
    stakeholderId?: string;
    fileName: string;
    status: CorporateDocumentStatus;
    reviewNote?: string;
    appealNote?: string;
    version: number;
  }>;
  stakeholders: Array<{
    id: string;
    fullName: string;
    identityType: "tckn" | "passport";
    identityNumber?: string;
    documents: Array<{
      id: string;
      documentType: string;
      stakeholderId?: string;
      fileName: string;
      status: CorporateDocumentStatus;
      reviewNote?: string;
      appealNote?: string;
      version: number;
    }>;
  }>;
}

export const corporateApplicationApi = {
  getMine: () =>
    api.get<CorporateApplication>("/users/me/seller-documents/application"),
  update: (data: Record<string, string>) =>
    api.patch("/users/me/seller-documents/application", data),
  addStakeholder: (data: {
    fullName: string;
    identityType: "tckn" | "passport";
    identityNumber?: string;
  }) => api.post("/users/me/seller-documents/application/stakeholders", data),
  uploadDocument: (
    documentType: string,
    file: File,
    stakeholderId?: string,
  ) => {
    const body = new FormData();
    body.append("documentType", documentType);
    if (stakeholderId) body.append("stakeholderId", stakeholderId);
    body.append("file", file);
    return api.post("/users/me/seller-documents", body, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  appealDocument: (documentId: string, note: string) =>
    api.post(`/users/me/seller-documents/${documentId}/appeal`, { note }),
  submit: () => api.post("/users/me/seller-documents/application/submit"),
};

// Addresses
export const addressesApi = {
  getAll: () => api.get("/users/me/addresses"),
  getOne: (id: string) => api.get(`/users/me/addresses/${id}`),
  create: (data: {
    title?: string;
    fullName: string;
    phone: string;
    city: string;
    district: string;
    address: string;
    zipCode?: string;
    isDefault?: boolean;
  }) => api.post("/users/me/addresses", data),
  update: (
    id: string,
    data: {
      title?: string;
      fullName?: string;
      phone?: string;
      city?: string;
      district?: string;
      address?: string;
      zipCode?: string;
      isDefault?: boolean;
    },
  ) => api.patch(`/users/me/addresses/${id}`, data),
  delete: (id: string) => api.delete(`/users/me/addresses/${id}`),
  setDefault: (id: string) =>
    api.patch(`/users/me/addresses/${id}`, { isDefault: true }),
};

// Seller Bank Account (IBAN) — backend: user.controller.ts GET/PATCH/DELETE /users/me/bank-account
export const bankAccountApi = {
  get: () => api.get("/users/me/bank-account"),
  upsert: (data: {
    accountHolder: string;
    iban: string;
    tcKimlikNo?: string;
    taxId?: string;
  }) => api.patch("/users/me/bank-account", data),
  delete: () => api.delete("/users/me/bank-account"),
};
