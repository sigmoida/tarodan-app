export type SessionExpiryReason = "session" | "idle";

const AUTH_PATHS = ["/login", "/forgot-password", "/reset-password"];

/** Accept only same-origin admin paths before using a query param as a redirect. */
export function safeAdminReturnPath(value: string | null | undefined): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  ) {
    return "/dashboard";
  }

  const pathname = value.split(/[?#]/, 1)[0];
  if (
    AUTH_PATHS.some(
      (path) => pathname === path || pathname.startsWith(`${path}/`),
    )
  ) {
    return "/dashboard";
  }

  return value;
}

export function expiredLoginHref(
  reason: SessionExpiryReason,
  returnPath: string,
): string {
  const params = new URLSearchParams({
    expired: reason,
    redirect: safeAdminReturnPath(returnPath),
  });
  return `/login?${params.toString()}`;
}
