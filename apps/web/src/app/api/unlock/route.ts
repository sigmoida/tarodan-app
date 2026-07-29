import { NextResponse, type NextRequest } from "next/server";
import { SITE_UNLOCK_COOKIE, safeEqual, siteUnlockToken } from "@/lib/siteLock";
import {
  UnlockRateLimiter,
  resolvePublicOrigin,
} from "@/lib/siteLockPolicy.mjs";

const unlockLimiter = new UnlockRateLimiter({
  maxAttempts: 5,
  windowMs: 15 * 60 * 1000,
});

/**
 * PIN-unlock endpoint for the pre-launch storefront gate (#398).
 *
 * The submitted PIN is compared to `SITE_UNLOCK_PIN` on the server; on match
 * we set an httpOnly `site_unlock` cookie whose value is a SHA-256 digest of
 * the PIN (not the PIN itself) so the client bundle and the browser never see
 * the raw secret. The matching middleware recomputes the same digest and
 * bypasses the gate when the cookie matches.
 */
export async function POST(request: NextRequest) {
  const expected = process.env.SITE_UNLOCK_PIN;
  if (!expected) {
    return unlockErrorRedirect(request, "error");
  }
  const clientKey = unlockClientKey(request);
  const currentLimit = unlockLimiter.status(clientKey);
  if (currentLimit.blocked) {
    return unlockErrorRedirect(
      request,
      "rate-limited",
      currentLimit.retryAfterSeconds,
    );
  }

  const contentType = request.headers.get("content-type") ?? "";
  let pin: string | undefined;
  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as {
      pin?: unknown;
    } | null;
    if (typeof body?.pin === "string") pin = body.pin;
  } else {
    const form = await request.formData().catch(() => null);
    const value = form?.get("pin");
    if (typeof value === "string") pin = value;
  }

  if (!pin || !safeEqual(pin, expected)) {
    unlockLimiter.recordFailure(clientKey);
    const failedLimit = unlockLimiter.status(clientKey);
    if (failedLimit.blocked) {
      return unlockErrorRedirect(
        request,
        "rate-limited",
        failedLimit.retryAfterSeconds,
      );
    }
    return unlockErrorRedirect(request, "invalid");
  }

  unlockLimiter.clear(clientKey);
  const response = NextResponse.redirect(publicUrl(request, "/"), 303);
  response.cookies.set({
    name: SITE_UNLOCK_COOKIE,
    value: await siteUnlockToken(expected),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
    priority: "high",
  });
  return response;
}

/** Return a visible form error without exposing the submitted PIN or secret. */
function unlockErrorRedirect(
  request: NextRequest,
  error: "invalid" | "error" | "rate-limited",
  retryAfterSeconds = 0,
) {
  const destination = publicUrl(request, "/coming-soon");
  destination.searchParams.set("unlock", error);
  const response = NextResponse.redirect(destination, 303);
  if (retryAfterSeconds > 0) {
    response.headers.set("Retry-After", String(retryAfterSeconds));
  }
  return response;
}

function publicUrl(request: NextRequest, pathname: string): URL {
  return new URL(
    pathname,
    resolvePublicOrigin(
      process.env.NEXT_PUBLIC_APP_URL,
      request.nextUrl.origin,
    ),
  );
}

function unlockClientKey(request: NextRequest): string {
  const forwardedFor = request.headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    forwardedFor?.at(-1) ||
    "unknown"
  );
}
