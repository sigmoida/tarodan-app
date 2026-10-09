// @vitest-environment jsdom
/** @format */

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./client", () => ({ api: {}, GATEWAY_BASE: "/gateway" }));

import { adEventUrl, trackAdEvent } from "./advertisements";

describe("ad event tracking", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sayaç adresini vekil kökünden kurar", () => {
    expect(adEventUrl("ad 1", "click")).toBe("/gateway/ads/ad%201/click");
    expect(adEventUrl("abc", "impression")).toBe(
      "/gateway/ads/abc/impression",
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
