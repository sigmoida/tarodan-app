import { api } from './client';
import { dashboardApi } from './dashboard';
import { usersApi } from './users';
import { catalogApi } from './catalog';
import { operationsApi } from './operations';
import { financeApi } from './finance';
import { marketingApi } from './marketing';
import { systemApi } from './system';

/**
 * The single admin API surface, recomposed from the per-domain modules. Kept as
 * one flat object so every existing `adminApi.getX(...)` call site is untouched.
 *
 * Domain modules (`./dashboard`, `./catalog`, …) can also be imported directly
 * when you only need one slice. The generic `get/post/patch/delete` passthroughs
 * are for custom/ad-hoc paths; prefer a named method where one exists.
 *
 * Method names are unique across modules (spread order would otherwise let a
 * later module shadow an earlier one). This is guarded by a build-time check —
 * see `scripts/check-api-collisions.mjs`.
 */
export const adminApi = {
  get: (url: string, config?: any) => api.get(url, config),
  post: (url: string, data?: any, config?: any) => api.post(url, data, config),
  patch: (url: string, data?: any, config?: any) => api.patch(url, data, config),
  delete: (url: string, config?: any) => api.delete(url, config),

  ...dashboardApi,
  ...usersApi,
  ...catalogApi,
  ...operationsApi,
  ...financeApi,
  ...marketingApi,
  ...systemApi,
};

export { api };
export default api;
