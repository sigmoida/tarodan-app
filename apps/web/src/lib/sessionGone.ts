/**
 * Session signals shared by the API client and the auth store, kept out of
 * both so the client never imports the store (which imports the API layer).
 */
let handler: (() => void) | undefined;

/** Registered once by the auth store. */
export function setSessionGoneHandler(next: () => void): void {
  handler = next;
}

/**
 * Called by the API client on a 401 after the gateway expired the
 * `tarodan_authed` marker. The store verifies with the server before it
 * signs out, because the marker can be missing for a moment while two
 * refreshes race.
 */
export function reportSessionGone(): void {
  handler?.();
}

/** Route segments of the checkout, cart and payment flows (any locale). */
const PRESERVED_SEGMENTS = new Set([
  "checkout",
  "cart",
  "payment",
  "payment-options",
]);

/**
 * Checkout, cart and payment pages keep their session through a 401 or a
 * missing marker: dropping it would break the PayTR return and the
 * `/payments/status` check that follows it. Matches whole path segments,
 * so `/profile/payments` or a listing slug starting with "cart" do not.
 */
export function isSessionPreservedPath(pathname: string): boolean {
  return pathname.split("/").some((segment) => PRESERVED_SEGMENTS.has(segment));
}
