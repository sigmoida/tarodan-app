/**
 * Edge-safe (no `server-only`): shared by the session core and the middleware so
 * both classify a failed refresh the same way.
 *
 * Does a non-2xx response from the refresh endpoint PROVE the refresh token is
 * dead? Only a real rejection does (401/403/400…). 5xx (API redeploying), 429
 * (throttled) and 408 (timeout) mean the API could not answer — the session may
 * well be valid, so they are transient and must never log the user out.
 */
export function isRefreshRejected(status: number): boolean {
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}
