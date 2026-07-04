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

// On 401, retry the request ONCE before giving up. A transient 401 can happen
// when the access token just expired: a sibling call (or middleware) refreshes
// the session in parallel, so the retry — which re-reads the now-fresh token via
// the BFF proxy — succeeds. Only a 401 that survives the retry means the session
// is genuinely gone → send the user to login.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config as (typeof error.config & { _retry?: boolean }) | undefined;
    const isAuthError = error.response?.status === 401;

    if (isAuthError && config && !config._retry) {
      config._retry = true;
      try {
        return await api(config);
      } catch (retryError: any) {
        if (
          retryError.response?.status === 401 &&
          typeof window !== 'undefined' &&
          window.location.pathname !== '/login'
        ) {
          window.location.href = '/login';
        }
        if (!retryError.response) {
          retryError.message = 'Sunucuya bağlanılamadı. Lütfen internet bağlantınızı kontrol edin.';
        }
        return Promise.reject(retryError);
      }
    }

    if (!error.response) {
      error.message = 'Sunucuya bağlanılamadı. Lütfen internet bağlantınızı kontrol edin.';
    }
    return Promise.reject(error);
  },
);

export default api;
