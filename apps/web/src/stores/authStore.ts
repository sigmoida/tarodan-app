import { create } from "zustand";
import { persist } from "zustand/middleware";
import { authApi, userApi } from "@/lib/api";
import {
  loginAction,
  googleLoginAction,
  logoutAction,
} from "@/lib/server/auth-actions";
import { hasAuthMarker, clearAuthMarker } from "@/lib/authMarker";

// Membership tier types
export type MembershipTier = "free" | "basic" | "premium" | "business";

interface User {
  id: string;
  email: string;
  phone?: string;
  displayName: string;
  isVerified: boolean;
  isEmailVerified?: boolean;
  isPhoneVerified?: boolean;
  isSeller: boolean;
  sellerType?: string;
  createdAt: Date;
  isAdmin?: boolean;
  role?: string;

  // Business account fields
  companyName?: string;
  taxId?: string;
  businessStatus?: "pending" | "approved" | "rejected";

  // Membership
  membershipTier: MembershipTier;
  membership?: {
    tier:
      | {
          type: string;
          name: string;
          maxTotalListings?: number;
          maxImagesPerListing?: number;
          canTrade?: boolean;
          canCreateCollections?: boolean;
        }
      | string;
    expiresAt?: string;
  };

  // Stats
  listingCount?: number;
  totalSales?: number;
  totalPurchases?: number;
  rating?: number;
  totalRatings?: number;

  // Profile
  avatarUrl?: string;
  bio?: string;
  birthDate?: string;
  preferredLanguage?: "tr" | "en";
  homeTourVersion?: number;
}

// Membership limits per tier
export interface MembershipLimits {
  maxListings: number;
  maxImagesPerListing: number;
  canTrade: boolean;
  canCreateCollections: boolean;
}

const TIER_LIMITS: Record<MembershipTier, MembershipLimits> = {
  free: {
    maxListings: 10,
    maxImagesPerListing: 3,
    canTrade: false,
    canCreateCollections: false,
  },
  basic: {
    maxListings: 50,
    maxImagesPerListing: 6,
    canTrade: true,
    canCreateCollections: true,
  },
  premium: {
    maxListings: 200,
    maxImagesPerListing: 10,
    canTrade: true,
    canCreateCollections: true,
  },
  business: {
    maxListings: 1000,
    maxImagesPerListing: 15,
    canTrade: true,
    canCreateCollections: true,
  },
};

/**
 * The profile endpoint includes the tier limits used by the API to authorize
 * uploads and listings. Prefer those values so UI guards never drift from the
 * backend. A missing membership is treated as the API's free-tier default.
 */
const getMembershipLimitsForUser = (
  user: User | null | undefined,
): MembershipLimits => {
  const tier = user?.membership?.tier;
  const apiTier = typeof tier === "object" ? tier : undefined;
  const freeTier = TIER_LIMITS.free;

  return {
    maxListings: apiTier?.maxTotalListings ?? freeTier.maxListings,
    maxImagesPerListing:
      apiTier?.maxImagesPerListing ?? freeTier.maxImagesPerListing,
    canTrade: apiTier?.canTrade ?? freeTier.canTrade,
    canCreateCollections:
      apiTier?.canCreateCollections ?? freeTier.canCreateCollections,
  };
};

const extractMembershipTier = (user: any): MembershipTier => {
  const tier =
    user.membership?.tier?.type ||
    user.membership?.tier?.name ||
    user.membership?.tier ||
    user.membership?.name ||
    user.membershipTier ||
    user.membership_tier ||
    "free";

  const normalizedTier = String(tier).toLowerCase();

  if (normalizedTier.includes("business")) return "business";
  if (normalizedTier.includes("premium")) return "premium";
  if (normalizedTier.includes("basic") || normalizedTier.includes("temel"))
    return "basic";
  return "free";
};

// Map API user to store user
const mapApiUser = (apiUser: any): User => ({
  id: apiUser.id,
  email: apiUser.email,
  phone: apiUser.phone,
  displayName: apiUser.displayName || apiUser.display_name || "",
  isVerified: apiUser.isVerified || apiUser.is_verified || false,
  isEmailVerified:
    apiUser.isEmailVerified || apiUser.is_email_verified || false,
  isPhoneVerified:
    apiUser.isPhoneVerified || apiUser.is_phone_verified || false,
  isSeller: apiUser.isSeller || apiUser.is_seller || false,
  sellerType: apiUser.sellerType || apiUser.seller_type,
  createdAt: apiUser.createdAt || apiUser.created_at,
  isAdmin: apiUser.isAdmin || apiUser.is_admin || apiUser.role === "admin",
  role: apiUser.role,
  companyName: apiUser.companyName || apiUser.company_name,
  taxId: apiUser.taxId || apiUser.tax_id,
  businessStatus: apiUser.businessStatus || apiUser.business_status,
  membershipTier: extractMembershipTier(apiUser),
  membership: apiUser.membership,
  listingCount:
    apiUser.listingCount ||
    apiUser.listing_count ||
    apiUser._count?.products ||
    0,
  totalSales: apiUser.totalSales || apiUser.total_sales || 0,
  totalPurchases: apiUser.totalPurchases || apiUser.total_purchases || 0,
  rating: apiUser.rating,
  totalRatings: apiUser.totalRatings || apiUser.total_ratings || 0,
  avatarUrl: apiUser.avatarUrl || apiUser.avatar_url,
  bio: apiUser.bio,
  birthDate: apiUser.birthDate || apiUser.birth_date || null,
  preferredLanguage:
    apiUser.preferredLanguage || apiUser.preferred_language || undefined,
  homeTourVersion:
    apiUser.homeTourVersion ?? apiUser.home_tour_version ?? undefined,
});

/**
 * Non-sensitive profile snapshot for INSTANT header render on hard reload.
 * Read inside checkAuth (post-mount, so hydration-safe) to show the account
 * without waiting for the network — the "Giriş yap" flash drops from a round-trip
 * to a single frame. Never holds tokens; strips the most sensitive PII
 * (phone / taxId). checkAuth refreshes the full user right after.
 */
const USER_SNAPSHOT_KEY = "tarodan_user_snapshot";
function readUserSnapshot(): User | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(USER_SNAPSHOT_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}
function writeUserSnapshot(user: User) {
  if (typeof window === "undefined") return;
  try {
    const safe: User = { ...user, phone: undefined, taxId: undefined };
    localStorage.setItem(USER_SNAPSHOT_KEY, JSON.stringify(safe));
  } catch {
    /* ignore quota / serialization errors */
  }
}
function clearUserSnapshot() {
  if (typeof window !== "undefined") localStorage.removeItem(USER_SNAPSHOT_KEY);
}

interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  limits: MembershipLimits | null;

  login: (
    email: string,
    password: string,
    twoFactorCode?: string,
  ) => Promise<void>;
  loginWithGoogle: (code: string) => Promise<void>;
  loginWithApple: (idToken: string, fullName?: string) => Promise<void>;
  register: (
    username: string,
    email: string,
    password: string,
    phone?: string,
    birthDate?: string,
    acceptMarketing?: boolean,
  ) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  setUser: (user: User | null) => void;
  refreshUser: () => Promise<void>;
  refreshUserData: () => Promise<void>; // Alias for refreshUser

  // Helper methods
  canCreateListing: () => boolean;
  getRemainingListings: () => number;
  getMembershipLimits: () => MembershipLimits;
}

// Always start with isAuthenticated=false so server and client first-paint match (prevents hydration error).
// Tokens are read from localStorage but auth state is only set after checkAuth() runs post-mount.
function getInitialAuthFromStorage(): Pick<
  AuthState,
  "token" | "refreshToken" | "isAuthenticated" | "isLoading"
> {
  if (typeof window === "undefined") {
    return {
      token: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: true,
    };
  }
  // Token artık JS'te tutulmuyor (httpOnly cookie). Girişli olabileceğimizi, server'ın
  // session ile birlikte yazdığı JS-okunabilir `tarodan_authed` COOKIE'sinden tahmin et
  // (client artık kendi yazmıyor → cookie ile kayma olmaz). Kesin karar checkAuth()'ta.
  const maybeAuthed = hasAuthMarker();
  return {
    token: null,
    refreshToken: null,
    isAuthenticated: false,
    isLoading: maybeAuthed,
  };
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => {
      const initial = getInitialAuthFromStorage();
      return {
        user: null,
        token: initial.token,
        refreshToken: initial.refreshToken,
        isAuthenticated: initial.isAuthenticated,
        isLoading: initial.isLoading,
        limits: null,

        login: async (
          email: string,
          password: string,
          twoFactorCode?: string,
        ) => {
          // BFF: kimlik doğrulama Server Action'da yapılır, token'lar Next'in httpOnly
          // cookie'lerine (web_at/web_rt) yazılır — JS token'ı hiç görmez. Zengin
          // kullanıcı objesi ardından checkAuth (proxy üzerinden /users/me) ile dolar.
          const result = await loginAction({
            email,
            password,
            twoFactorCode,
          });
          if (result.status === "error") {
            const error = new Error(result.message) as Error & {
              code: string;
            };
            error.code = result.reason;
            throw error;
          }
          if (result.status === "2fa") {
            const error = new Error("İki adımlı doğrulama gerekli") as Error & {
              code: string;
            };
            error.code = "2fa";
            throw error;
          }
          // loginAction (server) yazdı: web_at/web_rt + tarodan_authed. Client yazmaz.
          await get().checkAuth();
        },

        loginWithGoogle: async (code: string) => {
          const result = await googleLoginAction(code);
          if (result.status === "error") {
            const error = new Error(result.message) as Error & {
              code: string;
            };
            error.code = result.reason;
            throw error;
          }
          if (result.status === "2fa")
            throw new Error("İki adımlı doğrulama gerekli");
          await get().checkAuth();
        },

        // NOTE: Apple sign-in is not wired end-to-end yet — there is no client/BFF
        // apple action (unlike googleLogin's `googleLoginAction`) and no
        // `authApi.loginWithApple`. Fail gracefully instead of referencing a
        // non-existent method (which broke the production build).
        loginWithApple: async () => {
          throw new Error("Apple ile giriş şu anda kullanılamıyor.");
        },

        register: async (
          displayName: string,
          email: string,
          password: string,
          phone?: string,
          birthDate?: string,
          acceptMarketing?: boolean,
        ) => {
          await authApi.register({
            displayName,
            email,
            password,
            phone,
            birthDate,
            acceptsMarketingEmails: acceptMarketing,
          });
          // Don't auto-login after registration - user must verify email first
          // await get().login(email, password);
        },

        logout: async () => {
          try {
            await logoutAction(); // Server Action: API'de revoke + web_at/web_rt temizle
          } catch (e) {
            // Ignore logout errors
          }

          if (typeof window !== "undefined") {
            // tarodan_authed cookie'sini logoutAction (server) sildi; yine de yerel
            // olarak da süresini geçir ki bir sonraki okuma anında misafir görsün.
            clearAuthMarker();
            // Eski anahtarların tek seferlik temizliği (token artık cookie'de).
            localStorage.removeItem("auth_token");
            localStorage.removeItem("refresh_token");
          }
          clearUserSnapshot();

          set({
            user: null,
            token: null,
            refreshToken: null,
            isAuthenticated: false,
            limits: null,
            isLoading: false,
          });
        },

        checkAuth: async () => {
          // Eski (güvensiz) token anahtarlarının tek seferlik temizliği — artık httpOnly cookie kullanıyoruz.
          if (typeof window !== "undefined") {
            localStorage.removeItem("auth_token");
            localStorage.removeItem("refresh_token");
          }
          // Girişli olabilir miyiz? Server'ın yazdığı JS-okunabilir cookie. Yoksa profil
          // çağrısı yapmadan misafir say.
          const maybeAuthed = hasAuthMarker();

          if (!maybeAuthed) {
            clearUserSnapshot();
            set({
              user: null,
              token: null,
              refreshToken: null,
              isAuthenticated: false,
              limits: null,
              isLoading: false,
            });
            return;
          }

          // FAST PATH: hydrate the account from the cached snapshot instantly (no
          // network) so the header renders authed within one frame; the request
          // below then refreshes the full, live user.
          const snapshot = readUserSnapshot();
          if (snapshot) {
            set({
              user: snapshot,
              isAuthenticated: true,
              limits: getMembershipLimitsForUser(snapshot),
              isLoading: false,
            });
          } else {
            set({ isLoading: true });
          }

          try {
            // /users/me — 401 olursa api interceptor'ı cookie ile sessiz refresh deneyip tekrarlar.
            const response = await userApi.getProfile();
            const apiUser = response.data.user || response.data;
            const user = mapApiUser(apiUser);
            const limits = getMembershipLimitsForUser(user);
            // tarodan_authed cookie'sini server yönetir; client yazmaz.
            writeUserSnapshot(user);
            set({
              user,
              token: null,
              refreshToken: null,
              isAuthenticated: true,
              limits,
            });
          } catch (error: unknown) {
            const status = (error as { response?: { status?: number } })
              ?.response?.status;
            const isUnauthorized = status === 401 || status === 403;
            // The BFF proxy expires the `tarodan_authed` marker ONLY when the session
            // is genuinely dead (refresh token rejected). So a 401 whose marker is
            // now gone is a real logout; a 401 whose marker SURVIVED was a transient
            // refresh failure (API redeploy / 5xx) — don't eject the user. The server
            // owns marker clearing now, so we no longer clear it here.
            if (isUnauthorized && !hasAuthMarker()) {
              clearUserSnapshot();
              set({
                user: null,
                token: null,
                refreshToken: null,
                isAuthenticated: false,
                limits: null,
              });
            } else {
              // Transient error (API unreachable / 5xx / network, or a 401 that didn't
              // kill the session) — the token may still be valid. Stay authenticated
              // (user data fills on the next refreshUser/checkAuth). Otherwise an API
              // hiccup — notably on the payment return refresh — ejected the user.
              set({ isAuthenticated: true });
            }
          } finally {
            set({ isLoading: false });
          }
        },

        setUser: (user) => {
          const limits = user ? getMembershipLimitsForUser(user) : null;
          if (user) writeUserSnapshot(user);
          else clearUserSnapshot();
          set({ user, isAuthenticated: !!user, limits });
        },

        refreshUser: async () => {
          try {
            // Use /users/me for more complete profile data
            const response = await userApi.getProfile();
            const apiUser = response.data.user || response.data;
            const user = mapApiUser(apiUser);
            const limits = getMembershipLimitsForUser(user);
            writeUserSnapshot(user);
            set({ user, limits });
          } catch (error) {
            if (process.env.NODE_ENV === "development") {
              console.error("Failed to refresh user:", error);
            }
          }
        },

        // Alias for refreshUser
        refreshUserData: async () => {
          return get().refreshUser();
        },

        // Helper methods
        canCreateListing: () => {
          const { user, limits } = get();
          if (!user || !limits) return false;
          if (limits.maxListings === -1) return true;
          return (user.listingCount || 0) < limits.maxListings;
        },

        getRemainingListings: () => {
          const { user, limits } = get();
          if (!user || !limits) return 0;
          if (limits.maxListings === -1) return -1;
          return Math.max(0, limits.maxListings - (user.listingCount || 0));
        },

        getMembershipLimits: () => {
          const { user } = get();
          return getMembershipLimitsForUser(user);
        },
      };
    },
    {
      name: "auth-storage",
      // Token'lar VE auth durumu persist EDİLMEZ: isAuthenticated/user'ı zustand
      // persist ile geri yüklersek client ilk-render'da authed olur ama SSR guest
      // render etti → mounted-gate'i olmayan tüketicilerde hydration mismatch. Bu
      // yüzden ilk render hep guest kalır; hızlı (ağsız) header render'ı ayrı bir
      // snapshot'la checkAuth İÇİNDE, post-mount yapılır (aşağı bkz.).
      partialize: () => ({}),
    },
  ),
);

export default useAuthStore;
