/** @format */

/**
 * Storefront category bar visibility.
 *
 * The category bar is the browse navigation (Tüm İlanlar / İndirimler /
 * Koleksiyonlar / kategoriler). It renders only on the public catalog surfaces
 * where browsing makes sense — the home page and the catalog sections below.
 * Everywhere else (account, auth, transactional, content, seller, support) has
 * no browse bar.
 *
 * This is an allowlist (opt-in): the visible set is small and explicit, so a new
 * route defaults to NO bar unless it is deliberately added here. The idiomatic
 * long-term home is a storefront route-group layout that renders the bar for
 * that group only; until then this list is the one place to edit.
 */
export const CATEGORY_BAR_VISIBLE_PREFIXES = [
  "/cart",
  "/collections",
  "/listings",
  "/manufacturers",
] as const;

/**
 * Whether the storefront category bar should render for a pathname. Shows on the
 * home page (exact `/`) and on the catalog sections above plus their sub-routes
 * (`/listings`, `/listings/[id]`, …). Segment-aware: a coincidental prefix such
 * as `/listings-foo` does NOT match.
 */
export function shouldShowCategoryBar(pathname: string): boolean {
  if (pathname === "/") return true;
  return CATEGORY_BAR_VISIBLE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
