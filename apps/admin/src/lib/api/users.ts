import { api } from "./client";

/** Toplu kullanıcı işlemi sonucu (API `runBulk` sözleşmesi). */
export interface BulkUserResult {
  succeeded: string[];
  failed: Array<{ id: string; error: string }>;
}

/** Users, admin staff & roles, and seller applications. */
export const usersApi = {
  // Users
  getUsers: (params?: any) => api.get("/admin/users", { params }),
  getUser: (id: string) => api.get(`/admin/users/${id}`),
  updateUser: (id: string, data: any) => api.patch(`/admin/users/${id}`, data),
  banUser: (id: string, reason: string) =>
    api.post(`/admin/users/${id}/ban`, { reason }),
  unbanUser: (id: string) => api.post(`/admin/users/${id}/unban`),
  // Hesap aktivasyonu (e-posta doğrulama) — tekil
  resendUserVerification: (id: string) =>
    api.post(`/admin/users/${id}/resend-verification`),
  verifyUserEmail: (id: string) => api.post(`/admin/users/${id}/verify-email`),
  // Toplu kullanıcı işlemleri — sonuç { succeeded: string[], failed: { id, error }[] }
  bulkBanUsers: (ids: string[], reason: string) =>
    api.post<BulkUserResult>("/admin/users/bulk/ban", { ids, reason }),
  bulkUnbanUsers: (ids: string[]) =>
    api.post<BulkUserResult>("/admin/users/bulk/unban", { ids }),
  bulkResendUserVerification: (ids: string[]) =>
    api.post<BulkUserResult>("/admin/users/bulk/resend-verification", { ids }),
  bulkVerifyUserEmail: (ids: string[]) =>
    api.post<BulkUserResult>("/admin/users/bulk/verify-email", { ids }),
  // Silme: yalnız hiç giriş yapmamış hesap (sunucu 400 ile korur).
  deleteUser: (id: string) => api.delete(`/admin/users/${id}`),
  bulkDeleteUsers: (ids: string[]) =>
    api.post<BulkUserResult>("/admin/users/bulk/delete", { ids }),
  cancelUserMembership: (id: string) =>
    api.post(`/admin/users/${id}/membership/cancel`),
  changeUserMembership: (
    id: string,
    tierType: string,
    billingPeriod: "monthly" | "yearly" = "monthly",
  ) => api.patch(`/admin/users/${id}/membership`, { tierType, billingPeriod }),

  // Admin Staff (roller & atamalar)
  getStaff: () => api.get("/admin/staff"),
  assignStaff: (data: {
    email: string;
    role: string;
    password?: string;
    displayName?: string;
  }) => api.post("/admin/staff", data),
  updateStaff: (id: string, data: { role?: string; isActive?: boolean }) =>
    api.patch(`/admin/staff/${id}`, data),
  removeStaff: (id: string) => api.delete(`/admin/staff/${id}`),
  getStaffSettings: () => api.get("/admin/staff/settings"),
  setStaffSettings: (allowAdminAssign: boolean) =>
    api.patch("/admin/staff/settings", { allowAdminAssign }),
  /** Fabrika varsayılanları — "Varsayılanlara sıfırla" tek kaynaktan okur. */
  getDefaultRolePermissions: () =>
    api.get<Record<string, string[]>>("/admin/staff/role-permissions/defaults"),
  getRolePermissions: () =>
    api.get<Record<string, string[]>>("/admin/staff/role-permissions"),
  setRolePermissions: (permissions: Record<string, string[]>) =>
    api.put<Record<string, string[]>>("/admin/staff/role-permissions", {
      permissions,
    }),

  // Seller Applications
  getSellerApplications: (params?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  }) => api.get("/admin/seller-applications", { params }),
  getSellerApplication: (id: string) =>
    api.get(`/admin/seller-applications/${id}`),
  approveSellerApplication: (id: string) =>
    api.post(`/admin/seller-applications/${id}/approve`),
  rejectSellerApplication: (id: string, reason: string) =>
    api.post(`/admin/seller-applications/${id}/reject`, { reason }),
  reviewSellerDocument: (
    applicationId: string,
    documentId: string,
    status: "approved" | "rejected" | "revision_requested",
    note?: string,
  ) =>
    api.patch(
      `/admin/seller-applications/${applicationId}/documents/${documentId}`,
      { status, note },
    ),
  finalApproveSellerApplication: (id: string) =>
    api.post(`/admin/seller-applications/${id}/final-approve`),
};
