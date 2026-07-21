import { api } from "./client";

// Auth
export const authApi = {
  login: (email: string, password: string) =>
    api.post("/auth/login", { email, password }),
  /** Identifier-first: is this email registered, and does it have a password? */
  checkEmail: (email: string) =>
    api.post<{ exists: boolean; hasPassword: boolean }>("/auth/check-email", {
      email,
    }),
  /** Sends a password-reset / set-password link (used for Google-only accounts). */
  forgotPassword: (email: string) =>
    api.post("/auth/forgot-password", { email }),
  register: (data: {
    displayName: string;
    email: string;
    password: string;
    phone?: string;
    birthDate?: string;
    acceptsMarketingEmails?: boolean;
  }) => api.post("/auth/register", data),
  logout: () => api.post("/auth/logout"),
  getProfile: () => api.get("/auth/profile"),
  refresh: (refreshToken: string) =>
    api.post("/auth/refresh", { refreshToken }),
};
