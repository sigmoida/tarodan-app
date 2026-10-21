/**
 * Lets the API client tell the auth store that the server ended the session
 * (a 401 after the gateway expired the `tarodan_authed` marker) without
 * importing the store, which itself imports the API layer.
 */
let handler: (() => void) | undefined;

/** Registered once by the auth store. */
export function setSessionGoneHandler(next: () => void): void {
  handler = next;
}

/** Called by the API client's 401 handling. */
export function reportSessionGone(): void {
  handler?.();
}
