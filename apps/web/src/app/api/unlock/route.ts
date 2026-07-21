import { NextResponse, type NextRequest } from "next/server";
import { SITE_UNLOCK_COOKIE, siteUnlockToken } from "@/lib/siteLock";

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

  if (!pin || pin !== expected) {
    return unlockErrorRedirect(request, "invalid");
  }

  const response = NextResponse.redirect(new URL("/", request.url), 303);
  response.cookies.set({
    name: SITE_UNLOCK_COOKIE,
    value: await siteUnlockToken(expected),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}

/** Return a visible form error without exposing the submitted PIN or secret. */
function unlockErrorRedirect(request: NextRequest, error: "invalid" | "error") {
  const destination = new URL("/coming-soon", request.url);
  destination.searchParams.set("unlock", error);
  return NextResponse.redirect(destination, 303);
}
