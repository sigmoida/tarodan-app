/**
 * Unwrap a list-shaped API response into a plain array. The backend returns
 * either a bare array or an envelope (`{ data }` / `{ products }`); this collapses
 * both to `T[]` (and `[]` for anything else), so callers stop re-implementing the
 * `Array.isArray(raw) ? raw : (raw?.data ?? raw?.products ?? [])` dance. Runs on
 * both server (route fetchers) and client (query hooks).
 */
export function unwrapList<T = unknown>(raw: unknown): T[] {
	if (Array.isArray(raw)) return raw as T[];
	const inner = (raw as any)?.data ?? (raw as any)?.products;
	return Array.isArray(inner) ? (inner as T[]) : [];
}
