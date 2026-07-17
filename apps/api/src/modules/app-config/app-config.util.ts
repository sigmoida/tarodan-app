/**
 * Minimal semver comparator for app-version gating (#232).
 *
 * App versions are simple dotted numerics (e.g. "1.2.10"); any pre-release /
 * build metadata (`-beta.1`, `+42`) is ignored for the comparison. Missing or
 * malformed numeric segments are treated as 0. Returns:
 *   -1  if a <  b
 *    0  if a == b
 *    1  if a >  b
 */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

/** True when `current` is strictly older than `minimum`. */
export function isBelowMinimum(current: string, minimum: string): boolean {
  return compareVersions(current, minimum) < 0;
}

function parseVersion(v: string): number[] {
  const core = String(v ?? "")
    .trim()
    .replace(/^v/i, "")
    .split(/[-+]/)[0]; // drop pre-release / build metadata
  return core.split(".").map((s) => {
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n : 0;
  });
}
