/**
 * Edge-safe JWT expiry check — no dependencies, no `server-only`, so it can be
 * imported from middleware (Edge runtime). Decodes only the payload's `exp`;
 * never verifies the signature (that's the upstream API's job).
 */
export function isExpired(jwt: string | undefined, skewMs = 30_000): boolean {
	if (!jwt) return true;
	try {
		const payload = JSON.parse(atob(jwt.split('.')[1] ?? '')) as { exp?: number };
		return !payload.exp || payload.exp * 1000 < Date.now() + skewMs;
	} catch {
		return true;
	}
}
