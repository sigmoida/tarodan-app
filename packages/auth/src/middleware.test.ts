import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { AuthConfig } from "./config";
import { createAuthMiddleware } from "./middleware";

const config: AuthConfig = {
  cookies: { access: "admin_at", refresh: "admin_rt" },
  apiBaseUrl: "https://api.example.test/api",
  endpoints: {
    login: "/auth/admin/login",
    refresh: "/auth/admin/refresh",
    profile: "/auth/admin/profile",
    logout: "/auth/admin/logout",
    forgotPassword: "/auth/forgot-password",
  },
  upstreamRefreshCookie: "admin_refresh_token",
  ttls: { accessMaxAge: 1_800, refreshMaxAge: 604_800 },
  isProd: true,
};

const middleware = createAuthMiddleware(config, {
  publicPaths: [],
  guestOnlyPaths: ["/login"],
  authedHome: "/dashboard",
  expiredSessionReason: "session",
});

function jwt(exp: number): string {
  const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url");
  return `header.${payload}.signature`;
}

function request(path: string, cookies: Record<string, string> = {}) {
  const cookie = Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
  return new NextRequest(`https://admin.example.test${path}`, {
    headers: cookie ? { cookie } : undefined,
  });
}

function expectAuthCookiesCleared(response: Response) {
  const setCookie = response.headers.get("set-cookie");
  expect(setCookie).toContain("admin_at=");
  expect(setCookie).toContain("admin_rt=");
  expect(setCookie).toMatch(/admin_at=; Path=\/; Max-Age=0/);
  expect(setCookie).toMatch(/admin_rt=; Path=\/; Max-Age=0/);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createAuthMiddleware", () => {
  it("does not treat a refresh cookie alone as an authenticated session", async () => {
    const response = await middleware(
      request("/login", { admin_rt: "stale-refresh" }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("clears a session explicitly rejected by a protected layout", async () => {
    const response = await middleware(
      request("/login?expired=session&redirect=%2Fdashboard", {
        admin_at: jwt(Math.floor(Date.now() / 1000) + 600),
        admin_rt: "stale-refresh",
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expectAuthCookiesCleared(response);
  });

  it("clears both auth cookies when the refresh token is rejected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
    );

    const response = await middleware(
      request("/dashboard", {
        admin_at: jwt(Math.floor(Date.now() / 1000) - 600),
        admin_rt: "rejected-refresh",
      }),
    );

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("redirect")).toBe("/dashboard");
    expect(location.searchParams.get("expired")).toBe("session");
    expectAuthCookiesCleared(response);
  });

  it("still redirects a valid session away from login", async () => {
    const response = await middleware(
      request("/login", {
        admin_at: jwt(Math.floor(Date.now() / 1000) + 600),
        admin_rt: "valid-refresh",
      }),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://admin.example.test/dashboard",
    );
  });
});
