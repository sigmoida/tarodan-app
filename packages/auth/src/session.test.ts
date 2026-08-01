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
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => undefined,
    set: () => undefined,
    delete: () => undefined,
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
  return createSession(config, () => null);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
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
