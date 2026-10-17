import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthConfig } from "./config";

/**
 * Rotasyon sonucu cache'i: refresh token tek kullanımlık. Rotasyon bittikten
 * hemen sonra ESKİ token'la gelen geç istek (paralel sekme/istek, ya da cookie
 * yazamayan RSC render'ının yaktığı rotasyon) upstream'e gidip "revoked" yer ve
 * oturumu öldürürdü. Başarılı rotasyonun sonucu kısa süre eski token anahtarıyla
 * hatırlanır → geç gelen aynı YENİ çifti alır. Başarısız denemeler cache'lenmez.
 */

vi.mock("server-only", () => ({}));

// Test başına doldurulabilir cookie deposu (varsayılan: boş — misafir).
const cookieStore: Record<string, string> = {};
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieStore[name] !== undefined
        ? { name, value: cookieStore[name] }
        : undefined,
    set: (name: string, value: string) => {
      cookieStore[name] = value;
    },
    delete: (name: string) => {
      delete cookieStore[name];
    },
  }),
}));

const config: AuthConfig = {
  cookies: { access: "web_at", refresh: "web_rt" },
  apiBaseUrl: "https://api.example.test/api",
  endpoints: {
    login: "/auth/login",
    refresh: "/auth/refresh",
    profile: "/auth/profile",
    logout: "/auth/logout",
    forgotPassword: "/auth/forgot-password",
  },
  ttls: { accessMaxAge: 900, refreshMaxAge: 604_800 },
  isProd: true,
};

async function makeToolkit() {
  const { createSession } = await import("./session");
  return createSession(config, (raw) => raw as { id: string } | null);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  for (const key of Object.keys(cookieStore)) delete cookieStore[key];
});

describe("refresh rotation result cache", () => {
  it("serves a late refresh of the SAME old token from cache (no second upstream call)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ accessToken: "a2", refreshToken: "r2" }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const toolkit = await makeToolkit();

    const first = await toolkit.refreshTokens("r1");
    expect(first).toEqual({ access: "a2", refresh: "r2" });

    // İlk rotasyon TAMAMLANDIKTAN sonra gelen geç istek — eskiden upstream'e
    // gidip revoked yerdi; artık cache'ten aynı yeni çifti almalı.
    const late = await toolkit.refreshTokens("r1");
    expect(late).toEqual({ access: "a2", refresh: "r2" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("getSession refreshes an expired access token instead of ejecting", async () => {
    // Admin layout'un guard'ı: getSession null dönerse kullanıcı login'e atılır.
    // Eskiden getSession çıplak fetch yapıyordu — access süresi dolduysa (veya
    // API anlık 401 verdiyse) refresh DENEMEDEN null dönüyor ve canlı oturum
    // "expired=session" ile düşüyordu.
    cookieStore["web_at"] = "expired-access";
    cookieStore["web_rt"] = "r1";
    const user = { id: "u1", email: "a@example.test" };
    const fetchMock = vi
      .fn()
      // 1) profil, süresi dolmuş access ile → 401
      .mockResolvedValueOnce(new Response("", { status: 401 }))
      // 2) refresh → yeni çift
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ accessToken: "a2", refreshToken: "r2" }),
          { status: 200 },
        ),
      )
      // 3) profil, taze access ile → kullanıcı
      .mockResolvedValueOnce(
        new Response(JSON.stringify(user), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const toolkit = await makeToolkit();

    await expect(toolkit.getSession()).resolves.toEqual(user);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("getSession still returns null for a genuinely dead session", async () => {
    cookieStore["web_at"] = "expired-access";
    cookieStore["web_rt"] = "revoked";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 401 }))
      .mockResolvedValueOnce(new Response("", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    const toolkit = await makeToolkit();

    await expect(toolkit.getSession()).resolves.toBeNull();
  });

  it("does NOT cache a rejected refresh (retry stays possible)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 401 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ accessToken: "a2", refreshToken: "r2" }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const toolkit = await makeToolkit();

    expect(await toolkit.refreshTokens("r1")).toBeNull();
    expect(await toolkit.refreshTokens("r1")).toEqual({
      access: "a2",
      refresh: "r2",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("apiFetch up-front refresh for mutations (access cookie expired)", () => {
  // web_at'ın ömrü 15 dk; süresi dolunca tarayıcı onu siler. Eskiden apiFetch
  // Bearer'sız gidip yalnız 401'de yeniliyordu — opsiyonel-yetkili uçlar
  // (ör. POST /payments/direct-form) kimliksiz isteği MİSAFİR sayıp kullanıcıyı
  // düşürüyordu (kart saklama atlanıyordu).
  const tokenPair = () =>
    new Response(JSON.stringify({ accessToken: "a2", refreshToken: "r2" }), {
      status: 200,
    });
  const headersOf = (call: unknown[]) =>
    new Headers((call[1] as RequestInit).headers);
  const authOf = (call: unknown[]) => headersOf(call).get("authorization");
  const jwt = (expSecondsFromNow: number) =>
    `h.${Buffer.from(
      JSON.stringify({
        exp: Math.floor(Date.now() / 1000) + expSecondsFromNow,
      }),
    ).toString("base64url")}.s`;
  const isRefreshCall = (call: unknown[]) =>
    String(call[0]).endsWith("/auth/refresh");

  it("POST, missing access + present refresh → refreshes first, then sends with Bearer", async () => {
    cookieStore["web_rt"] = "r1";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenPair())
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const toolkit = await makeToolkit();

    const result = await toolkit.apiFetch("/payments/direct-form", {
      method: "POST",
      headers: {
        "x-payment-capability": "cap",
        "x-tarodan-client-ip": "85.105.10.20",
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.example.test/api/auth/refresh",
    );
    // Refresh çağrısı tarayıcının IP'sini taşır (BFF tek kova olmasın).
    expect(headersOf(fetchMock.mock.calls[0]).get("x-tarodan-client-ip")).toBe(
      "85.105.10.20",
    );
    expect(fetchMock.mock.calls[1][0]).toBe(
      "https://api.example.test/api/payments/direct-form",
    );
    expect(authOf(fetchMock.mock.calls[1])).toBe("Bearer a2");
    expect(headersOf(fetchMock.mock.calls[1]).get("x-payment-capability")).toBe(
      "cap",
    );
    expect(result.refreshed).toEqual({ access: "a2", refresh: "r2" });
    expect(cookieStore["web_at"]).toBe("a2");
    expect(cookieStore["web_rt"]).toBe("r2");
  });

  it("POST with an access cookie whose JWT is expired → refreshes first (middleware expiry rule)", async () => {
    cookieStore["web_at"] = jwt(-60);
    cookieStore["web_rt"] = "r1";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenPair())
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const toolkit = await makeToolkit();

    const result = await toolkit.apiFetch("/x", { method: "POST" });

    expect(isRefreshCall(fetchMock.mock.calls[0])).toBe(true);
    expect(authOf(fetchMock.mock.calls[1])).toBe("Bearer a2");
    expect(result.refreshed).toEqual({ access: "a2", refresh: "r2" });
  });

  it("POST with a valid access → no refresh, sends the existing Bearer", async () => {
    const access = jwt(600);
    cookieStore["web_at"] = access;
    cookieStore["web_rt"] = "r1";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const toolkit = await makeToolkit();

    const result = await toolkit.apiFetch("/x", { method: "POST" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(authOf(fetchMock.mock.calls[0])).toBe(`Bearer ${access}`);
    expect(result.refreshed).toBeUndefined();
  });

  it("GET with a missing access keeps the old behaviour: no up-front refresh, guest request", async () => {
    cookieStore["web_rt"] = "r1";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("[]", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const toolkit = await makeToolkit();

    const result = await toolkit.apiFetch("/products");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(authOf(fetchMock.mock.calls[0])).toBeNull();
    expect(result).toEqual({ res: expect.any(Response) });
  });

  it("GET with a missing access still refreshes on 401 and retries once", async () => {
    cookieStore["web_rt"] = "r1";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 401 }))
      .mockResolvedValueOnce(tokenPair())
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const toolkit = await makeToolkit();

    const result = await toolkit.apiFetch("/orders");

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(authOf(fetchMock.mock.calls[2])).toBe("Bearer a2");
    expect(result.refreshed).toEqual({ access: "a2", refresh: "r2" });
  });

  it("parallel POSTs with the same refresh cookie rotate it once (single-flight)", async () => {
    cookieStore["web_rt"] = "r1";
    const fetchMock = vi.fn(async (url: string) =>
      url.endsWith("/auth/refresh")
        ? tokenPair()
        : new Response("{}", { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const toolkit = await makeToolkit();

    await Promise.all([
      toolkit.apiFetch("/a", { method: "POST" }),
      toolkit.apiFetch("/b", { method: "POST" }),
    ]);

    expect(fetchMock.mock.calls.filter(isRefreshCall)).toHaveLength(1);
  });

  it("no cookies at all → no refresh, POST goes out as guest", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const toolkit = await makeToolkit();

    const result = await toolkit.apiFetch("/payments/direct-form", {
      method: "POST",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(authOf(fetchMock.mock.calls[0])).toBeNull();
    expect(result).toEqual({ res: expect.any(Response) });
  });

  it("POST, refresh rejected (4xx) → sent as guest, flagged sessionDead, no second refresh on its 401", async () => {
    cookieStore["web_rt"] = "revoked";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 401 })) // refresh
      .mockResolvedValueOnce(new Response("", { status: 401 })); // request
    vi.stubGlobal("fetch", fetchMock);
    const toolkit = await makeToolkit();

    const result = await toolkit.apiFetch("/orders", { method: "POST" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(authOf(fetchMock.mock.calls[1])).toBeNull();
    expect(result.res.status).toBe(401);
    expect(result.sessionDead).toBe(true);
    expect(result.refreshed).toBeUndefined();
  });

  it.each([503, 429, 408])(
    "POST, refresh fails transiently (%i) → mutation NOT sent, synthetic 503, cookies kept",
    async (status) => {
      cookieStore["web_rt"] = "r1";
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(new Response("", { status })); // refresh only
      vi.stubGlobal("fetch", fetchMock);
      const toolkit = await makeToolkit();

      const result = await toolkit.apiFetch("/payments/direct-form", {
        method: "POST",
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(isRefreshCall(fetchMock.mock.calls[0])).toBe(true);
      expect(result.res.status).toBe(503);
      expect(result.transient).toBe(true);
      expect(result.sessionDead).toBeUndefined();
      expect(cookieStore["web_rt"]).toBe("r1");
    },
  );

  it.each([429, 408])(
    "401 path: a %i from refresh is transient, not dead (upstream 401 returned)",
    async (status) => {
      cookieStore["web_at"] = jwt(600);
      cookieStore["web_rt"] = "r1";
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(new Response("", { status: 401 }))
        .mockResolvedValueOnce(new Response("", { status }));
      vi.stubGlobal("fetch", fetchMock);
      const toolkit = await makeToolkit();

      const result = await toolkit.apiFetch("/x");

      expect(result.res.status).toBe(401);
      expect(result.transient).toBe(true);
      expect(result.sessionDead).toBeUndefined();
    },
  );

  it("access present but rejected → still refreshes on 401 and retries once", async () => {
    cookieStore["web_at"] = jwt(600);
    cookieStore["web_rt"] = "r1";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 401 }))
      .mockResolvedValueOnce(tokenPair())
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const toolkit = await makeToolkit();

    const result = await toolkit.apiFetch("/x", { method: "POST" });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(authOf(fetchMock.mock.calls[2])).toBe("Bearer a2");
    expect(result.refreshed).toEqual({ access: "a2", refresh: "r2" });
  });
});
