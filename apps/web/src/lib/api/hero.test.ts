/** @format */

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./origin", () => ({ getServerApiOrigin: () => "http://api.test" }));

import { fetchHeroSlides, heroSlidesPath } from "./hero";

describe("hero slides fetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each(["home", "auth_default", "auth_register"] as const)(
    "%s isteği kendini web olarak tanıtır",
    (placement) => {
      expect(heroSlidesPath(placement)).toBe(
        `/hero-slides?placement=${placement}&platform=web`,
      );
    },
  );

  it("ana sayfa ve auth okuması platform=web ile, yerleşim etiketiyle gider", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: "s1" }],
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchHeroSlides("home")).resolves.toEqual([{ id: "s1" }]);
    await fetchHeroSlides("auth_register");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://api.test/api/hero-slides?placement=home&platform=web",
      { next: { revalidate: 60, tags: ["home:hero"] } },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://api.test/api/hero-slides?placement=auth_register&platform=web",
      { next: { revalidate: 60, tags: ["auth:hero"] } },
    );
  });

  it("boş yanıt (anahtar kapalı / slayt yok) ve hata boş liste döner", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        .mockResolvedValueOnce({ ok: false, json: async () => ({}) }),
    );
    await expect(fetchHeroSlides("home")).resolves.toEqual([]);
    await expect(fetchHeroSlides("home")).resolves.toEqual([]);
  });
});
