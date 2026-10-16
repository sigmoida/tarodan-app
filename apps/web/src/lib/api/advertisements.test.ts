// @vitest-environment jsdom
/** @format */

import { afterEach, describe, expect, it, vi } from "vitest";

const get = vi.hoisted(() => vi.fn());
vi.mock("./client", () => ({ api: { get }, GATEWAY_BASE: "/gateway" }));

import { advertisementsApi, adEventUrl, trackAdEvent } from "./advertisements";

describe("advertisementsApi.getActive", () => {
  afterEach(() => get.mockReset());

  it("platform=web gönderir; geçiş dönemi için eski device'ı da taşır", () => {
    advertisementsApi.getActive({ position: "popup", device: "mobile" });
    expect(get).toHaveBeenCalledWith("/ads/active", {
      params: { position: "popup", platform: "web", device: "mobile" },
    });
  });

  it("cihaz verilmezse yalnız platform gider", () => {
    advertisementsApi.getActive({ position: "header" });
    expect(get.mock.calls[0][1].params).toMatchObject({
      position: "header",
      platform: "web",
      device: undefined,
    });
  });
});

describe("ad event tracking", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sayaç adresini vekil kökünden kurar", () => {
    expect(adEventUrl("ad 1", "click")).toBe("/gateway/ads/ad%201/click");
    expect(adEventUrl("abc", "impression")).toBe("/gateway/ads/abc/impression");
  });

  it("hotspot kimliğini kodlayarak sorguya ekler", () => {
    expect(adEventUrl("abc", "click", "h 1")).toBe(
      "/gateway/ads/abc/click?hotspot=h%201",
    );
    expect(adEventUrl("abc", "click")).toBe("/gateway/ads/abc/click");
  });

  it("trackAdEvent hotspot kimliğini beacon adresine taşır", () => {
    const sendBeacon = vi.fn().mockReturnValue(true);
    vi.stubGlobal("navigator", { sendBeacon });

    trackAdEvent("abc", "click", "h1");

    expect(sendBeacon).toHaveBeenCalledWith(
      "/gateway/ads/abc/click?hotspot=h1",
    );
  });

  it("sendBeacon kabul ederse fetch kullanılmaz", () => {
    const sendBeacon = vi.fn().mockReturnValue(true);
    const fetchMock = vi.fn();
    vi.stubGlobal("navigator", { sendBeacon });
    vi.stubGlobal("fetch", fetchMock);

    trackAdEvent("abc", "click");

    expect(sendBeacon).toHaveBeenCalledWith("/gateway/ads/abc/click");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sendBeacon reddederse keepalive fetch'e düşer", () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response());
    vi.stubGlobal("navigator", { sendBeacon: vi.fn().mockReturnValue(false) });
    vi.stubGlobal("fetch", fetchMock);

    trackAdEvent("abc", "impression");

    expect(fetchMock).toHaveBeenCalledWith(
      "/gateway/ads/abc/impression",
      expect.objectContaining({ method: "POST", keepalive: true }),
    );
  });

  it("sendBeacon yoksa ya da fırlatırsa fetch'e düşer, hata sızmaz", () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("navigator", {
      sendBeacon: () => {
        throw new Error("nope");
      },
    });
    vi.stubGlobal("fetch", fetchMock);

    expect(() => trackAdEvent("abc", "click")).not.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
