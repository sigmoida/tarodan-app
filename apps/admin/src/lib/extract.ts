/**
 * Extracts an array from a list API response. The backend sometimes returns
 * `{ data: [...] }` and sometimes a plain `[...]`; this helper normalizes both
 * shapes in one place. `res` can be an axios response or `res.data` directly.
 */
export function extractList<T = any>(res: any): T[] {
  const d = res?.data ?? res;
  const list = d?.data ?? d ?? [];
  return Array.isArray(list) ? list : [];
}
