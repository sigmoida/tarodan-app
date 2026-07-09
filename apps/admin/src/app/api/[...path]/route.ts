import { createBffProxy } from "@tarodan/auth";
import {
  apiFetch,
  attachSessionCookies,
  clearSessionCookies,
} from "@/lib/server/session";

/**
 * BFF proxy. Every client data call goes to same-origin `/api/*` (no CORS) and
 * is forwarded to the NestJS API with a server-side `Authorization: Bearer`
 * header. Access tokens are refreshed transparently on 401. The browser never
 * holds or sees the API tokens. The proxy logic lives in the shared
 * `@tarodan/auth` engine; this handler just binds it to the admin session.
 *
 * Auth flows (login / forgot-password / logout) are Server Actions, not this
 * proxy — so this handler only ever carries already-authenticated traffic.
 */
export const dynamic = "force-dynamic";

export const { GET, POST, PUT, PATCH, DELETE } = createBffProxy({
  apiFetch,
  attachSessionCookies,
  clearSessionCookies,
});
