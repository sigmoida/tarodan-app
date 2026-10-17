// @vitest-environment jsdom
/** @format */

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./client", () => ({ api: {}, GATEWAY_BASE: "/gateway" }));

import { heroEventUrl, trackHeroEvent } from "./heroTracking";

describe("hero event tracking", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("gösterim adresini vekil kökünden kurar", () => {
    expect(heroEventUrl("s 1", "impression")).toBe(
      "/gateway/hero-slides/s%201/impression",
    );
  });

  it("tıklamada cta indeksini sorguya ekler", () => {
    expect(heroEventUrl("abc", "click", 2)).toBe(
      "/gateway/hero-slides/abc/click?cta=2",
    );
    expect(heroEventUrl("abc", "click")).toBe("/gateway/hero-slides/abc/click");
  });

  it("gösterimde cta eklenmez", () => {
    expect(heroEventUrl("abc", "impression", 1)).toBe(
      "/gateway/hero-slides/abc/impression",
    );
  });

  it("beacon ile gönderir", () => {
    const sendBeacon = vi.fn().mockReturnValue(true);
    vi.stubGlobal("navigator", { sendBeacon });
    trackHeroEvent("abc", "click", 1);
    expect(sendBeacon).toHaveBeenCalledWith(
      "/gateway/hero-slides/abc/click?cta=1",
    );
  });

  it("beacon reddedilirse keepalive fetch'e düşer", () => {
    vi.stubGlobal("navigator", { sendBeacon: vi.fn().mockReturnValue(false) });
    const fetchMock = vi.fn().mockResolvedValue({});
    vi.stubGlobal("fetch", fetchMock);
    trackHeroEvent("abc", "impression");
    expect(fetchMock).toHaveBeenCalledWith(
      "/gateway/hero-slides/abc/impression",
      expect.objectContaining({ method: "POST", keepalive: true }),
    );
  });
});
