import { create } from "zustand";
import { persist } from "zustand/middleware";
import { authApi, userApi } from "@/lib/api";
import {
  loginAction,
  googleLoginAction,
  appleLoginAction,
  logoutAction,
  type WebLoginResult,
} from "@/lib/server/auth-actions";
import { hasAuthMarker, clearAuthMarker } from "@/lib/authMarker";
import { getQueryClient } from "@/lib/query/getQueryClient";
import {
  isSignedIn,
  syncQueryCacheWithSession,
} from "@/lib/query/sessionCache";
import {
  isSessionPreservedPath,
  setSessionGoneHandler,
} from "@/lib/sessionGone";

// Membership tier types
export type MembershipTier = "free" | "basic" | "premium" | "business";

interface User {
  id: string;
  adminCode: string;
  username: string;
  usernameClaimed: boolean;
  email: string;
  phone?: string;
  displayName: string;
  isVerified: boolean;
  isEmailVerified?: boolean;
  isPhoneVerified?: boolean;
  isSeller: boolean;
  sellerType?: string;
  createdAt: Date;
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
  listingTourVersion?: number;
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
  adminCode: apiUser.adminCode || apiUser.admin_code || "",
  username: apiUser.username || "",
  usernameClaimed:
    apiUser.usernameClaimed ??
    apiUser.username_claimed ??
    Boolean(apiUser.usernameClaimedAt || apiUser.username_claimed_at),
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
  listingTourVersion:
    apiUser.listingTourVersion ?? apiUser.listing_tour_version ?? undefined,
});

/**
 * Non-sensitive profile snapshot for INSTANT header render on hard reload.
 * Read inside checkAuth (post-mount, so hydration-safe) to show the account
 * without waiting for the network — the "Giriş yap" flash drops from a round-trip
 * to a single frame. Never holds tokens; strips the most sensitive PII
 * (phone / taxId). checkAuth refreshes the full user right after.
 */
const USER_SNAPSHOT_KEY = "tarodan_user_snapshot";

/** Bumped by `clearSession`; a check of an older session never writes. */
let sessionGeneration = 0;
/** The pending `checkAuth` run, if any (single flight). */
let activeCheck: Promise<void> | null = null;
/** Set while a check is pending to ask for one more run after it. */
let rerunCheck = false;
/** Tags the pending check's own `/users/me` request (see the 401 report). */
let checkSignal: AbortSignal | null = null;
/** A hung `/users/me` must not hold the single flight forever. */
const PROFILE_TIMEOUT_MS = 15_000;
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
/**
 * Best-effort removal: `localStorage` throws (SecurityError) when site storage
 * is blocked, and a sign-out must still reset the store after that.
 */
function removeStoredKeys(...keys: string[]) {
  if (typeof window === "undefined") return;
  try {
    for (const key of keys) localStorage.removeItem(key);
  } catch {
    /* storage unavailable: nothing was stored either */
  }
}
function clearUserSnapshot() {
  removeStoredKeys(USER_SNAPSHOT_KEY);
}
/** One-time cleanup of the legacy token keys (tokens now live in cookies). */
function clearLegacyTokenKeys() {
  removeStoredKeys("auth_token", "refresh_token");
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
    displayName: string,
    username: string,
    email: string,
    password: string,
    phone?: string,
    birthDate?: string,
    acceptMarketing?: boolean,
  ) => Promise<void>;
  logout: () => Promise<void>;
  /**
   * Resets the store to a guest without calling the server, for a session
   * the server already ended (expired, or signed out in another tab).
   */
  clearSession: () => void;
  checkAuth: () => Promise<void>;
  /**
   * Re-runs `checkAuth` when the store disagrees with the session another
   * tab or the server may have changed: the marker appeared or disappeared,
   * or the stored snapshot belongs to another user.
   */
  reconcileSession: () => void;
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

/**
 * 2FA akış işareti — MESAJI ekrana basılmaz, çağıran `error.code`'a bakar
 * (bkz. useLogin). Store global bir zustand deposudur, React bağlamı yoktur;
 * bu yüzden burada çeviri yapılmaz, gösterilecek metni arayüz katalogdan seçer.
 */
const twoFactorRequired = () => {
  const error = new Error("TWO_FACTOR_REQUIRED") as Error & { code: string };
  error.code = "2fa";
  return error;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => {
      const initial = getInitialAuthFromStorage();

      /**
       * One session check: the marker, the snapshot fast path, then
       * `/users/me`. Its answer is dropped when the session ended meanwhile
       * (`clearSession`) or another run was asked for (`rerunCheck`), which
       * then answers with the current cookies.
       */
      const runSessionCheck = async () => {
        const generation = sessionGeneration;
        const superseded = () => generation !== sessionGeneration || rerunCheck;
        clearLegacyTokenKeys();
        // Could we be signed in? The server writes a JS-readable marker
        // cookie with the session. Without it a guest stays a guest with no
        // profile call; a signed-in store asks the server first, because
        // the marker can be missing for a moment while two refreshes race.
        if (!hasAuthMarker() && !isSignedIn(get())) {
          get().clearSession();
          return;
        }

        // FAST PATH: hydrate the account from the cached snapshot instantly (no
        // network) so the header renders authed within one frame; the request
        // below then refreshes the full, live user. Skipped when the store
        // already holds that user: the snapshot lacks phone and taxId.
        const snapshot = readUserSnapshot();
        const current = get().user;
        if (snapshot && snapshot.id !== current?.id) {
          set({
            user: snapshot,
            isAuthenticated: true,
            limits: getMembershipLimitsForUser(snapshot),
            isLoading: false,
          });
        } else if (!current && !get().isAuthenticated) {
          // Only an unresolved visitor shows the loading state: a signed-in
          // store retrying its profile must not unmount the page's forms.
          set({ isLoading: true });
        }

        try {
          // /users/me: on a 401 the gateway proxy first tries a silent
          // refresh from the session cookie.
          const request = new AbortController();
          checkSignal = request.signal;
          const response = await userApi.getProfile({
            timeout: PROFILE_TIMEOUT_MS,
            signal: request.signal,
          });
          if (superseded()) return;
          const apiUser = response.data.user || response.data;
          const user = mapApiUser(apiUser);
          const limits = getMembershipLimitsForUser(user);
          // The server owns the tarodan_authed marker; the client never writes it.
          writeUserSnapshot(user);
          set({
            user,
            token: null,
            refreshToken: null,
            isAuthenticated: true,
            limits,
          });
        } catch (error: unknown) {
          if (superseded()) return;
          const status = (error as { response?: { status?: number } })?.response
            ?.status;
          const isUnauthorized = status === 401 || status === 403;
          // The BFF proxy expires the `tarodan_authed` marker ONLY when the session
          // is genuinely dead (refresh token rejected). So a 401 whose marker is
          // now gone is a real logout; a 401 whose marker SURVIVED was a transient
          // refresh failure (API redeploy / 5xx) — don't eject the user. The server
          // owns marker clearing now, so we no longer clear it here.
          if (isUnauthorized && !hasAuthMarker()) {
            get().clearSession();
          } else {
            // Transient error (API unreachable / 5xx / network / timeout, or a
            // 401 that didn't kill the session) — the session may still be
            // valid. Stay authenticated (user data fills on the next
            // refreshUser/checkAuth). Otherwise an API hiccup — notably on the
            // payment return refresh — ejected the user.
            set({ isAuthenticated: true });
          }
        } finally {
          if (!superseded()) set({ isLoading: false });
        }
      };

      /**
       * Shared tail of every sign-in action. The server action already wrote
       * the httpOnly session cookies and the `tarodan_authed` marker; the
       * client never writes them. The guest cache is dropped by the session
       * listener below once checkAuth sets the user.
       */
      const completeSignIn = async (result: WebLoginResult) => {
        if (result.status === "error") {
          const error = new Error(result.message) as Error & { code: string };
          error.code = result.reason;
          throw error;
        }
        if (result.status === "2fa") throw twoFactorRequired();
        await get().checkAuth();
      };

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
          await completeSignIn(result);
        },

        loginWithGoogle: async (code: string) => {
          const result = await googleLoginAction(code);
          await completeSignIn(result);
        },

        loginWithApple: async (idToken: string, fullName?: string) => {
          const result = await appleLoginAction(idToken, fullName);
          await completeSignIn(result);
        },

        register: async (
          displayName: string,
          username: string,
          email: string,
          password: string,
          phone?: string,
          birthDate?: string,
          acceptMarketing?: boolean,
        ) => {
          await authApi.register({
            displayName,
            username,
            email,
            password,
            phone,
            birthDate,
            acceptsMarketingEmails: acceptMarketing,
          });
          // Don't auto-login after registration - user must verify email first
          // await get().login(email, password);
        },

        // Never throws: callers (reset password, banned, delete account, ...)
        // rely on the local session always being reset.
        logout: async () => {
          try {
            await logoutAction(); // Server Action: revoke on the API + clear web_at/web_rt
          } catch {
            // Ignore logout errors
          }

          // logoutAction (server) already deleted the tarodan_authed cookie;
          // expire it locally too so the very next read sees a guest.
          clearAuthMarker();
          clearLegacyTokenKeys();
          get().clearSession();
        },

        clearSession: () => {
          // Answers of checks started before this point belong to the ended
          // session and must not write it back (see runSessionCheck).
          sessionGeneration++;
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

        // Single flight: a call while a check is pending asks for one more run
        // and resolves after it, so `await checkAuth()` (e.g. after a sign-in)
        // always sees an answer for the cookies set before the call.
        checkAuth: () => {
          if (activeCheck) {
            rerunCheck = true;
            return activeCheck;
          }
          activeCheck = (async () => {
            do {
              rerunCheck = false;
              await runSessionCheck();
            } while (rerunCheck);
          })().finally(() => {
            activeCheck = null;
          });
          return activeCheck;
        },

        reconcileSession: () => {
          const state = get();
          const marker = hasAuthMarker();
          const pending = activeCheck !== null;
          let stale: boolean;
          if (!isSignedIn(state)) {
            // A pending check already answers a guest store with a marker.
            stale = marker && !pending;
          } else {
            const snapshotId = readUserSnapshot()?.id;
            const otherUser =
              !!state.user && !!snapshotId && snapshotId !== state.user.id;
            // A missing marker on checkout and payment pages keeps the
            // session, as on a 401 there; another account taking over never
            // does.
            const markerGone =
              !marker && !isSessionPreservedPath(window.location.pathname);
            // Signed in without a profile (a failed or timed-out check):
            // retry, except on checkout and payment pages.
            const noProfile =
              !state.user &&
              !pending &&
              !isSessionPreservedPath(window.location.pathname);
            stale = otherUser || markerGone || noProfile;
          }
          if (!stale) return;
          // A pending check may be answering for the old session: it is
          // dropped and runs once more with the current cookies.
          if (pending) rerunCheck = true;
          else void get().checkAuth();
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

// User-scoped cache: on sign-in, sign-out or an account change the previous
// visitor's queries must not stay in the tab-wide QueryClient
// (see lib/query/sessionCache).
if (typeof window !== "undefined") {
  useAuthStore.subscribe(
    syncQueryCacheWithSession(getQueryClient, useAuthStore.getState()),
  );
  // The API client saw a 401 with the marker gone: re-check with the server
  // and drop to a guest if the session really ended, also on the public
  // pages the client does not redirect away from.
  // A pending check meets its own /users/me 401 itself (recognised by its
  // request's abort signal); queueing a re-run for it would loop. A 401 of
  // any other request is reconciled, so a check answered just before the
  // session ended does not keep its user.
  setSessionGoneHandler((requestSignal) => {
    if (activeCheck && requestSignal && requestSignal === checkSignal) return;
    useAuthStore.getState().reconcileSession();
  });
  // Another tab signed in, signed out or switched account: it wrote or
  // removed the user snapshot. Covers every route, with or without Header.
  // A pending check may be answering for the previous account whatever the
  // store shows, so it always runs once more.
  window.addEventListener("storage", (event) => {
    if (event.key !== USER_SNAPSHOT_KEY && event.key !== null) return;
    if (activeCheck) rerunCheck = true;
    else useAuthStore.getState().reconcileSession();
  });
}

export default useAuthStore;
