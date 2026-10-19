import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";

const run = (pathname: string, cookie?: string) =>
  middleware(
    new NextRequest(new URL(pathname, "https://tarodan.test"), {
      headers: cookie ? { cookie } : undefined,
    }),
  );

const rewrite = (res: Response) => res.headers.get("x-middleware-rewrite");

/** Unexpired access JWT, refresh token and marker: a usable web session. */
function sessionCookie(): string {
  const exp = Math.floor(Date.now() / 1000) + 600;
  const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url");
  return `web_at=header.${payload}.signature; web_rt=refresh; tarodan_authed=1`;
}

describe("middleware: site lock (SITE_LOCKED) and /app/**", () => {
  beforeEach(() => {
    vi.stubEnv("SITE_LOCKED", "true");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rewrites a normal page to coming-soon while locked", async () => {
    expect(rewrite(await run("/terms"))).toBe(
      "https://tarodan.test/tr/coming-soon",
    );
  });

  it("exempts /app/** from the lock (the app and App Review see the legal pages)", async () => {
    expect(rewrite(await run("/app/terms"))).toBe(
      "https://tarodan.test/tr/app/terms",
    );
    expect(rewrite(await run("/en/app/privacy"))).toBe(
      "https://tarodan.test/en/app/privacy",
    );
  });
});

describe("middleware: mail-link pages with a signed-in visitor", () => {
  it.each([
    [
      "/reset-password?token=x",
      "https://tarodan.test/tr/reset-password?token=x",
    ],
    [
      "/en/reset-password?token=x",
      "https://tarodan.test/en/reset-password?token=x",
    ],
    ["/verify-email?token=x", "https://tarodan.test/tr/verify-email?token=x"],
    [
      "/en/verify-email?token=x",
      "https://tarodan.test/en/verify-email?token=x",
    ],
  ])("lets %s through to the page", async (path, target) => {
    const res = await run(path, sessionCookie());

    expect(res.headers.get("location")).toBeNull();
    expect(rewrite(res)).toBe(target);
  });

  it.each([
    ["/forgot-password", "https://tarodan.test/"],
    ["/en/forgot-password", "https://tarodan.test/en"],
  ])("still bounces %s home (guest-only)", async (path, home) => {
    const res = await run(path, sessionCookie());

    expect(res.headers.get("location")).toBe(home);
  });
});
