/** @format */

/**
 * Fold a string into a canonical form for forgiving, locale-aware substring
 * search — Turkish-correct and diacritic-insensitive.
 *
 * The naive `text.toLowerCase().includes(query.toLowerCase())` breaks for
 * Turkish: `"İstanbul".toLowerCase()` yields `"i̇stanbul"` — a plain `i`
 * followed by a **combining dot above** (U+0307) — so `.includes("istan")`
 * fails on the stray combining mark. We avoid that by:
 *
 *   1. Unifying every dotted/dotless i variant (`İ`, `I`, `ı`) to `i` BEFORE
 *      lowercasing, so the problematic capital-İ never reaches `toLowerCase()`.
 *   2. Decomposing the rest with NFD and stripping combining marks, which folds
 *      `ş→s`, `ç→c`, `ö→o`, `ü→u`, `ğ→g` (and any other accent) to their base
 *      letters — making search accent-insensitive as a bonus.
 *
 * The result is only meant for matching, never for display.
 */
export function foldForSearch(input: string): string {
  return input
    .replace(/[İIı]/g, "i") // İ, I, ı → i
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritical marks
    .toLowerCase();
}

/**
 * True when `query` matches `text` under the forgiving fold above. An empty (or
 * whitespace-only) query matches everything.
 */
export function matchesSearch(text: string, query: string): boolean {
  const q = foldForSearch(query).trim();
  if (!q) return true;
  return foldForSearch(text).includes(q);
}
