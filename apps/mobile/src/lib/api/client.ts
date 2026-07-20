import { axios, createApiClient, singleFlight } from "@tarodan/api-client";
import * as SecureStore from "expo-secure-store";
import { router } from "expo-router";
import { Platform } from "react-native";
import Constants from "expo-constants";

// API URL çözümleme sırası:
// 1) EXPO_PUBLIC_API_URL (production / preview / staging build'leri için zorunlu)
// 2) Expo Go LAN host (lokal geliştirme)
// 3) Platform fallback'i (emülatör)
const getApiUrl = () => {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl && envUrl.length > 0) {
    return envUrl.replace(/\/$/, "");
  }

  const expoHost = Constants.expoConfig?.hostUri?.split(":")[0];
  if (expoHost) {
    return `http://${expoHost}:3001/api`;
  }

  if (Platform.OS === "android") {
    return "http://10.0.2.2:3001/api";
  }

  return "http://localhost:3001/api";
};

const API_URL = getApiUrl();

/** Çözümlenmiş API base URL'i (örn. http://host:3001/api). socket.ts gibi
 *  modüller buradan okur; URL çözümleme davranışını değiştirmez. */
export function getApiBaseUrl(): string {
  return API_URL;
}

/**
 * Stabil avatar URL'i. Backend `GET /users/:id/avatar` taze bir presigned URL'e
 * 302 redirect eder; URL hep aynı kaldığı için 24s'lik presigned expiry'sinden
 * etkilenmez (persist edilmiş/uzun cache'lenmiş veride bayatlamaz).
 *
 * `versionHint` (mevcut presigned avatar URL'i) verilirse, S3 obje yolundan
 * türetilen bir `?v` eki eklenir: foto değişince <Image> cache'i busts, aynı
 * dosyada cache hit kalır.
 */
export const buildAvatarUrl = (
  userId: string,
  versionHint?: string | null,
): string => {
  const base = `${API_URL}/users/${userId}/avatar`;
  if (!versionHint) return base;
  const filename = versionHint.split("?")[0].split("/").pop() || "";
  return filename ? `${base}?v=${encodeURIComponent(filename)}` : base;
};

console.log("📡 API URL:", API_URL);
console.log("📱 Platform:", Platform.OS);
console.log("🌐 Expo Host:", Constants.expoConfig?.hostUri);

export const api = createApiClient({
  baseURL: API_URL,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

/**
 * Guest (unauthenticated) axios instance — token eklemez.
 * Kullanım: guest checkout, guest payment, guest order track, guest contact.
 */
export const guestApi = createApiClient({
  baseURL: API_URL,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor - add auth token
api.interceptors.request.use(
  async (config) => {
    try {
      const token = await SecureStore.getItemAsync("accessToken");
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (error) {
      console.error("Error getting token:", error);
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

// Banlı kullanıcı yönlendirmesi: aynı anda dönen birden çok USER_BANNED 403'ünde
// /banned ekranına tekrar tekrar replace yapmamak için flag. Çıkışta sıfırlanır.
let bannedRedirectActive = false;
export const resetBannedRedirect = () => {
  bannedRedirectActive = false;
};

async function performTokenRefresh(): Promise<string | null> {
  const refreshToken = await SecureStore.getItemAsync("refreshToken");
  if (!refreshToken) return null;
  const response = await axios.post(`${API_URL}/auth/refresh`, {
    refreshToken,
  });
  const data: any = response.data;
  const newAccess: string | undefined =
    data?.tokens?.accessToken ?? data?.accessToken;
  const newRefresh: string | undefined =
    data?.tokens?.refreshToken ?? data?.refreshToken;
  if (!newAccess) return null;
  await SecureStore.setItemAsync("accessToken", newAccess);
  // ROTATED refresh token'ı da kaydet (asıl bug buydu).
  if (newRefresh) await SecureStore.setItemAsync("refreshToken", newRefresh);
  return newAccess;
}

// Tek-uçuş refresh: eşzamanlı 401'ler tek refresh paylaşır (rotated token + storm önlenir).
const refreshAccessToken = singleFlight(performTokenRefresh);

async function handleAuthFailure(): Promise<void> {
  // Merkezi çıkış: SecureStore + Zustand + query cache + socket + push temizlenir.
  // require ile lazy import → api.ts ↔ authStore döngüsü (cycle) önlenir.
  try {
    const { useAuthStore } = require("../../stores/authStore");
    await useAuthStore.getState().logout();
  } catch {
    await SecureStore.deleteItemAsync("accessToken");
    await SecureStore.deleteItemAsync("refreshToken");
  }
  router.replace("/(auth)/login");
}

// Response interceptor - handle token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Banlı kullanıcı: backend BannedUserGuard tüm istekleri 403 + USER_BANNED
    // ile bloklar (logout ve destek talebi hariç). Kullanıcıyı tam ekran
    // /banned ekranına kilitle.
    const errData = error.response?.data;
    if (
      error.response?.status === 403 &&
      errData?.errorCode === "USER_BANNED"
    ) {
      if (!bannedRedirectActive) {
        bannedRedirectActive = true;
        router.replace({
          pathname: "/banned",
          params: errData.bannedReason
            ? { reason: errData.bannedReason }
            : undefined,
        });
      }
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const newAccess = await refreshAccessToken();
        if (newAccess) {
          originalRequest.headers.Authorization = `Bearer ${newAccess}`;
          return api(originalRequest);
        }
        await handleAuthFailure();
      } catch (refreshError) {
        await handleAuthFailure();
      }
    }

    return Promise.reject(error);
  },
);

// Helper: Response parsing (web ile aynı)
export const parseResponse = (response: any) => {
  return response.data?.data || response.data?.products || response.data || [];
};

export default api;
