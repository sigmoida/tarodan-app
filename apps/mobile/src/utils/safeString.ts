/**
 * Safely extract a display string from a value that might be
 * a plain string OR an object like { id, name, slug }.
 */
export function safeString(val: any, fallback = ''): string {
  if (val == null) return fallback;
  if (typeof val === 'string') return val || fallback;
  if (typeof val === 'object') return val.name || val.slug || fallback;
  return String(val);
}
