/** @format */

/**
 * Both sides of a trade change outside the page that picks products: the user's
 * own listings (created, edited, approved by a moderator with no client
 * mutation) and the other side's listings (edited, sold, deactivated). The
 * global 60 s `staleTime` would serve a cached, possibly empty or outdated,
 * list, so the pickers refetch on every open and whenever the tab regains focus.
 * Same rule as the mobile pickers.
 */
export const TRADE_PICKER_QUERY_OPTIONS = {
  staleTime: 0,
  refetchOnMount: "always",
  refetchOnWindowFocus: true,
} as const;

/** Page size of the paged trade pickers ("Show more" loads this many). */
export const TRADE_PICKER_PAGE_SIZE = 20;
