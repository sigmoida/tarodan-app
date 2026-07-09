import { api, guestApi } from './client';

// Auth API - Web ile aynı endpoint'ler
export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  loginWithGoogle: (idToken: string) =>
    api.post('/auth/google', { idToken }),
  loginWithApple: (identityToken: string, fullName?: string) =>
    api.post('/auth/apple', { identityToken, fullName }),
  register: (data: {
    displayName: string;
    email: string;
    password: string;
    phone?: string;
    birthDate?: string;
    acceptsMarketingEmails?: boolean;
  }) => api.post('/auth/register', data),
  /** İşletme hesabı olarak kayıt. Web /auth/register/business ile eşleşir. */
  registerBusiness: (data: {
    companyName: string;
    email: string;
    password: string;
    phone: string; // BusinessRegisterDto zorunlu: /^\+90[0-9]{10}$/
    taxId: string;
    city: string; // BusinessRegisterDto zorunlu (min 2)
    district?: string;
    companyType?: string;
    birthDate?: string;
    acceptsMarketingEmails?: boolean;
  }) => api.post('/auth/register/business', data),
  logout: () => api.post('/auth/logout'),
  getProfile: () => api.get('/users/me'),
  refresh: (refreshToken: string) => api.post('/auth/refresh', { refreshToken }),
  // Geriye uyumluluk için eski ad korunur
  refreshToken: (refreshToken: string) => api.post('/auth/refresh', { refreshToken }),
  // Şifre sıfırlama / e-posta doğrulama akışı
  forgotPassword: (email: string) =>
    guestApi.post('/auth/forgot-password', { email }),
  resetPassword: (token: string, newPassword: string) =>
    guestApi.post('/auth/reset-password', { token, newPassword }),
  verifyEmail: (token: string) =>
    guestApi.post('/auth/verify-email', { token }),
  resendVerification: (email: string) => api.post('/auth/resend-verification', { email }),
  /** Şifre değiştirme — backend `security` modülüne taşındı. */
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post('/security/password/change', { currentPassword, newPassword }),
  // ---- 2FA / Güvenlik (backend: /security/2fa/*) ----
  getTwoFactorStatus: () => api.get('/security/2fa/status'),
  /** 2FA'yı etkinleştir; secret + qrCode + backupCodes döner */
  setupTwoFactor: () =>
    api.post<{ secret: string; qrCode: string; backupCodes?: string[] }>('/security/2fa/enable'),
  // Backend Verify2FADto/Disable2FADto hepsi `code` alanı bekliyor (TOTP 6 hane).
  verifyTwoFactor: (code: string) =>
    api.post('/security/2fa/verify', { code }),
  disableTwoFactor: (code: string) =>
    api.post('/security/2fa/disable', { code }),
  regenerateBackupCodes: (code: string) =>
    api.post<{ backupCodes?: string[] } | string[]>('/security/2fa/backup-codes', { code }),
  /** Tüm cihazlardan çıkış — backend: DELETE /security/tokens */
  logoutAll: () => api.delete('/security/tokens'),
  /** SMS telefon doğrulama kodu gönder */
  sendPhoneCode: (phone: string) => api.post('/auth/phone/send-code', { phone }),
  /** SMS doğrulama kodunu doğrula */
  verifyPhone: (code: string) => api.post('/auth/phone/verify', { code }),
};
