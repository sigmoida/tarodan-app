import { NextResponse, type NextRequest } from "next/server";
import { SITE_UNLOCK_COOKIE, safeEqual } from "@/lib/siteLock";
import {
  UnlockRateLimiter,
  resolvePublicOrigin,
} from "@/lib/siteLockPolicy.mjs";
import {
  UNLOCK_COOKIE_MAX_AGE_SECONDS,
  signUnlockCookie,
} from "@/lib/siteUnlockCookie.mjs";
import { getServerApiOrigin } from "@/lib/api/origin";

const unlockLimiter = new UnlockRateLimiter({
  maxAttempts: 5,
  windowMs: 15 * 60 * 1000,
});

/**
 * Access-code unlock endpoint for the pre-launch storefront gate (#398).
 *
 * Codes are admin-managed invite pins verified against the API
 * (`POST /api/site-access/verify`); `SITE_UNLOCK_PIN` remains an optional
 * API-independent emergency fallback. On success we set an httpOnly
 * `site_unlock` cookie signed with `SITE_UNLOCK_SECRET` — the middleware
 * verifies it locally, so revoking a pin stops NEW unlocks while existing
 * cookies live out their 10-day TTL.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.SITE_UNLOCK_SECRET;
  if (!secret) {
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

  if (!pin) {
    return recordFailedAttempt(request, clientKey);
  }

  const fallbackPin = process.env.SITE_UNLOCK_PIN;
  if (fallbackPin && safeEqual(pin, fallbackPin)) {
    return unlockSuccessResponse(request, clientKey, secret);
  }

  let verified = false;
  try {
    const response = await fetch(
      `${getServerApiOrigin()}/api/site-access/verify`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          // Forward the visitor IP so the API's throttler sees the real
          // client instead of the web server's egress address.
          "x-forwarded-for": clientKey,
        },
        body: JSON.stringify({ code: pin }),
        cache: "no-store",
      },
    );
    if (response.ok) {
      verified = true;
    } else if (response.status !== 401) {
      // API unhealthy — surface a neutral error, don't burn an attempt.
      return unlockErrorRedirect(request, "error");
    }
  } catch {
    return unlockErrorRedirect(request, "error");
  }

  if (!verified) {
    return recordFailedAttempt(request, clientKey);
  }
  return unlockSuccessResponse(request, clientKey, secret);
}

async function unlockSuccessResponse(
  request: NextRequest,
  clientKey: string,
  secret: string,
) {
  unlockLimiter.clear(clientKey);
  const expEpochSeconds =
    Math.floor(Date.now() / 1000) + UNLOCK_COOKIE_MAX_AGE_SECONDS;
  const response = NextResponse.redirect(publicUrl(request, "/"), 303);
  response.cookies.set({
    name: SITE_UNLOCK_COOKIE,
    value: await signUnlockCookie(secret, expEpochSeconds),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: UNLOCK_COOKIE_MAX_AGE_SECONDS,
    priority: "high",
  });
  return response;
}

function recordFailedAttempt(request: NextRequest, clientKey: string) {
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

/** Return a visible form error without exposing the submitted code. */
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
