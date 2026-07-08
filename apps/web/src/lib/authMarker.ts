/**
 * Client-side session indicator.
 *
 * The real session is the httpOnly `web_at` / `web_rt` cookies (JS can't read
 * them). To let the client tell "there is a session" without a token AND without
 * drifting from the real session, the `@tarodan/auth` engine writes a JS-readable
 * `tarodan_authed` cookie (non-httpOnly) SERVER-SIDE, in lockstep with the
 * session cookies — on login, refresh (edge + proxy) and logout. See
 * `lib/auth.config.ts` (`indicatorCookie`).
 *
 * The client only READS it here; it never writes the marker (the server owns it),
 * which is exactly what fixes the old desync where a client-written localStorage
 * flag could disagree with the cookie and flash protected content before a
 * redirect. `clearAuthMarker` is a best-effort local expiry for the moment the
 * client detects a dead session (a genuine 401), so the very next read agrees
 * with the server before its own clear lands.
 */
const MARKER = 'tarodan_authed';

export function hasAuthMarker(): boolean {
	if (typeof document === 'undefined') return false;
	return document.cookie
		.split('; ')
		.some((c) => c === `${MARKER}=1` || c.startsWith(`${MARKER}=1;`));
}

export function clearAuthMarker(): void {
	if (typeof document === 'undefined') return;
	document.cookie = `${MARKER}=; path=/; max-age=0`;
}
