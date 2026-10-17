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

describe("apiFetch proactive refresh (access cookie expired)", () => {
  // web_at'ın ömrü 15 dk; süresi dolunca tarayıcı onu siler. Eskiden apiFetch
  // Bearer'sız gidip yalnız 401'de yeniliyordu — opsiyonel-yetkili uçlar
  // (ör. /payments/direct-form) kimliksiz isteği MİSAFİR sayıp kullanıcıyı
  // düşürüyordu (kart saklama atlanıyordu).
  const tokenPair = () =>
    new Response(JSON.stringify({ accessToken: "a2", refreshToken: "r2" }), {
      status: 200,
    });
  const authOf = (call: unknown[]) =>
    new Headers((call[1] as RequestInit).headers).get("authorization");

  it("missing access + present refresh → refreshes first, then sends with Bearer", async () => {
    cookieStore["web_rt"] = "r1";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenPair())
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const toolkit = await makeToolkit();

    const result = await toolkit.apiFetch("/payments/direct-form", {
      method: "POST",
      headers: { "x-payment-capability": "cap" },
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.example.test/api/auth/refresh",
    );
    expect(fetchMock.mock.calls[1][0]).toBe(
      "https://api.example.test/api/payments/direct-form",
    );
    expect(authOf(fetchMock.mock.calls[1])).toBe("Bearer a2");
    expect(
      new Headers((fetchMock.mock.calls[1][1] as RequestInit).headers).get(
        "x-payment-capability",
      ),
    ).toBe("cap");
    expect(result.refreshed).toEqual({ access: "a2", refresh: "r2" });
    expect(cookieStore["web_at"]).toBe("a2");
    expect(cookieStore["web_rt"]).toBe("r2");
  });

  it("parallel calls with the same refresh cookie rotate it once (single-flight)", async () => {
    cookieStore["web_rt"] = "r1";
    const fetchMock = vi.fn(async (url: string) =>
      url.endsWith("/auth/refresh")
        ? tokenPair()
        : new Response("{}", { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const toolkit = await makeToolkit();

    await Promise.all([toolkit.apiFetch("/a"), toolkit.apiFetch("/b")]);

    const refreshCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith("/auth/refresh"),
    );
    expect(refreshCalls).toHaveLength(1);
  });

  it("no cookies at all → no refresh, request goes out as guest", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const toolkit = await makeToolkit();

    const result = await toolkit.apiFetch("/payments/direct-form");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(authOf(fetchMock.mock.calls[0])).toBeNull();
    expect(result).toEqual({ res: expect.any(Response) });
  });

  it("access present → no refresh, sends the existing Bearer", async () => {
    cookieStore["web_at"] = "a1";
    cookieStore["web_rt"] = "r1";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const toolkit = await makeToolkit();

    const result = await toolkit.apiFetch("/x");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(authOf(fetchMock.mock.calls[0])).toBe("Bearer a1");
    expect(result.refreshed).toBeUndefined();
  });

  it("refresh rejected (4xx) → request goes out as guest, flagged sessionDead, no second refresh on its 401", async () => {
    cookieStore["web_rt"] = "revoked";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 401 })) // refresh
      .mockResolvedValueOnce(new Response("", { status: 401 })); // request
    vi.stubGlobal("fetch", fetchMock);
    const toolkit = await makeToolkit();

    const result = await toolkit.apiFetch("/profile");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(authOf(fetchMock.mock.calls[1])).toBeNull();
    expect(result.res.status).toBe(401);
    expect(result.sessionDead).toBe(true);
    expect(result.refreshed).toBeUndefined();
  });

  it("refresh fails transiently (5xx) → guest request, flagged transient (cookies kept)", async () => {
    cookieStore["web_rt"] = "r1";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 503 })) // refresh
      .mockResolvedValueOnce(new Response("[]", { status: 200 })); // public read
    vi.stubGlobal("fetch", fetchMock);
    const toolkit = await makeToolkit();

    const result = await toolkit.apiFetch("/products");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(authOf(fetchMock.mock.calls[1])).toBeNull();
    expect(result.res.status).toBe(200);
    expect(result.transient).toBe(true);
    expect(result.sessionDead).toBeUndefined();
    expect(cookieStore["web_rt"]).toBe("r1");
  });

  it("access present but rejected → still refreshes on 401 and retries once", async () => {
    cookieStore["web_at"] = "expired";
    cookieStore["web_rt"] = "r1";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 401 }))
      .mockResolvedValueOnce(tokenPair())
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const toolkit = await makeToolkit();

    const result = await toolkit.apiFetch("/x");

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(authOf(fetchMock.mock.calls[2])).toBe("Bearer a2");
    expect(result.refreshed).toEqual({ access: "a2", refresh: "r2" });
  });
});
