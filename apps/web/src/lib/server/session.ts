import 'server-only';

import { getSession as bffGetSession } from './bff-session';
import type { WebUser } from '@/lib/auth.config';

/**
 * Server-only session reader for the marketplace.
 *
 * Now backed by the shared `@tarodan/auth` BFF engine: it reads the Next-owned
 * `web_at` cookie and validates it against NestJS `/auth/profile` (with a
 * server-side refresh on expiry via `bff-session`). Safe to call from Server
 * Components / layouts — it never writes cookies. The export surface is
 * preserved (`getSession`, `AuthUser`) so the `(auth)` and `profile` layout
 * guards need no changes.
 */

/** Server-resolved user. Alias of the engine's `WebUser`. */
export type AuthUser = WebUser;

export async function getSession(): Promise<AuthUser | null> {
  return bffGetSession();
}
