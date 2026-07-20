import { createApiClient } from "@tarodan/api-client";

/**
 * Client API instance. Every call goes to the same-origin gateway proxy
 * (`/gateway/*` → src/app/gateway/[...path]/route.ts), which attaches the Bearer
 * token server-side and refreshes it on 401. The browser never holds or sees
 * the API tokens — auth lives in src/lib/server/session.ts.
 */
export const api = createApiClient({
  baseURL: "/gateway",
  headers: { "Content-Type": "application/json" },
  // On 401, retry the request up to TWICE before giving up. A transient 401
  // happens when a sibling BFF call is rotating the session cookie.
  onResponseError: async (error, client) => {
    const config = error.config as
      (typeof error.config & { _retryCount?: number }) | undefined;
    const isAuthError = error.response?.status === 401;

    if (isAuthError && config) {
      config._retryCount = (config._retryCount ?? 0) + 1;
      if (config._retryCount <= 2) {
        if (config._retryCount > 1) {
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
        return client(config);
      }
      if (
        typeof window !== "undefined" &&
        window.location.pathname !== "/login"
      ) {
        window.location.href = "/login?expired=session";
      }
    }

    if (!error.response) {
      error.message =
        // eslint-disable-next-line @tarodan/no-hardcoded-turkish -- module-scope axios interceptor, no intl context; follow-up in #208
        "Sunucuya bağlanılamadı. Lütfen internet bağlantınızı kontrol edin.";
    }
    return Promise.reject(error);
  },
});

export default api;
