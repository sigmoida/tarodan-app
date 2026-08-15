import { createApiClient } from "@tarodan/api-client";
import { defaultLocale, formatMessage, getMessages } from "@tarodan/i18n";
import { expiredLoginHref } from "@/lib/auth-redirect";

let isRedirectingToLogin = false;

/**
 * Client API instance. Every call goes to the same-origin gateway proxy
 * (`/gateway/*` → src/app/gateway/[...path]/route.ts), which attaches the Bearer
 * token server-side and refreshes it on 401. The browser never holds or sees
 * the API tokens — auth lives in src/lib/server/session.ts.
 */
export const api = createApiClient({
  baseURL: "/gateway",
  headers: { "Content-Type": "application/json" },
  // On 401, retry the request ONCE before giving up. A transient 401
  // happens when a sibling BFF call is rotating the session cookie.
  onResponseError: async (error, client) => {
    const config = error.config as
      (typeof error.config & { _retryCount?: number }) | undefined;
    const isAuthError = error.response?.status === 401;

    if (isAuthError && config) {
      config._retryCount = (config._retryCount ?? 0) + 1;
      if (config._retryCount <= 1 && !isRedirectingToLogin) {
        return client(config);
      }
      if (
        typeof window !== "undefined" &&
        window.location.pathname !== "/login" &&
        !isRedirectingToLogin
      ) {
        isRedirectingToLogin = true;
        const returnPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        window.location.replace(expiredLoginHref("session", returnPath));
      }
    }

    if (!error.response) {
      // Modül düzeyindeki interceptor'ın React bağlamı yoktur; mesaj yine de
      // katalogdan gelir — varsayılan dille, isteğin diliyle değil.
      error.message = formatMessage(
        getMessages(defaultLocale).server.common.connectionFailed,
      );
    }
    return Promise.reject(error);
  },
});

export default api;
