import axios from 'axios';

/**
 * Client API instance. Every call goes to the same-origin BFF proxy
 * (`/api/*` → src/app/api/[...path]/route.ts), which attaches the Bearer
 * token server-side and refreshes it on 401. The browser never holds or sees
 * the API tokens — auth lives in src/lib/server/session.ts.
 */
export const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

// On 401, retry the request up to TWICE before giving up. A transient 401 happens
// when the access token just expired: a sibling call (or middleware) refreshes the
// session in parallel. A brief pause before later attempts lets that refresh land
// its rotated cookie, so refresh-token rotation doesn't cause a false logout. Only
// a 401 that survives the retries means the session is genuinely gone → login.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config as (typeof error.config & { _retryCount?: number }) | undefined;
    const isAuthError = error.response?.status === 401;

    if (isAuthError && config) {
      config._retryCount = (config._retryCount ?? 0) + 1;
      if (config._retryCount <= 2) {
        if (config._retryCount > 1) {
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
        return api(config);
      }
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.href = '/login?expired=session';
      }
    }

    if (!error.response) {
      error.message = 'Sunucuya bağlanılamadı. Lütfen internet bağlantınızı kontrol edin.';
    }
    return Promise.reject(error);
  },
);

export default api;
