import 'server-only';

import { cache } from 'react';
import { apiFetch, type AdminUser } from './session';

/**
 * A user's resolved permission set. `keys` is the flat list of permission
 * anahtarları for the user's role; super_admin bypasses the matrix entirely.
 */
export interface Permissions {
  isSuperAdmin: boolean;
  keys: string[];
}

/** Dashboard is always reachable — it's the guard's redirect/home target. */
const HOME_PERMISSION = 'dashboard';

/**
 * Resolve the current admin's permissions server-side.
 *
 * Wrapped in React `cache()` so it is **request-scoped**: within one render
 * tree the role→permission matrix is fetched at most once (multiple callers
 * dedupe), and it re-resolves on every full page load so it never goes stale.
 * `cache()` is NOT a global/module cache — nothing leaks across requests or
 * users, which is the whole security point.
 *
 * Fail-closed: if the matrix can't be fetched we fall back to
 * dashboard-only (option A) — a transient API error must never lock a
 * legitimate admin out of the home screen, and the API itself still
 * authorizes every endpoint regardless of what the nav shows.
 */
export const getPermissions = cache(async (user: AdminUser): Promise<Permissions> => {
  if (user.role === 'super_admin') {
    return { isSuperAdmin: true, keys: [] };
  }

  try {
    const res = await apiFetch('/admin/staff/role-permissions');
    if (!res.ok) return { isSuperAdmin: false, keys: [HOME_PERMISSION] };

    const matrix = (await res.json().catch(() => null)) as Record<string, string[]> | null;
    const roleKeys = Array.isArray(matrix?.[user.role]) ? matrix![user.role] : [];
    return { isSuperAdmin: false, keys: withHome(roleKeys) };
  } catch {
    return { isSuperAdmin: false, keys: [HOME_PERMISSION] };
  }
});

/** Guarantee the home permission is present without duplicating it. */
function withHome(keys: string[]): string[] {
  return keys.includes(HOME_PERMISSION) ? keys : [HOME_PERMISSION, ...keys];
}
