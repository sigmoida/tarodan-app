// @vitest-environment jsdom
/** @format */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdPopupFrequency } from "@tarodan/types";

type PopupFrequencyModule = typeof import("./popupFrequency");

/** Bellek içi yedek modül düzeyinde tutulur: her test temiz modülle başlar. */
async function load(): Promise<PopupFrequencyModule> {
  vi.resetModules();
  return import("./popupFrequency");
}

const ad = (
  over: Partial<{
    id: string;
    popupFrequency: AdPopupFrequency;
    popupVersion: number;
  }> = {},
) => ({
  id: "ad-1",
  popupFrequency: "until_dismissed" as AdPopupFrequency,
  popupVersion: 1,
  ...over,
});

describe("popup dismissal (reklam + sürüm başına)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("anahtar reklam kimliği ve sürümünden oluşur", async () => {
    const { popupAdDismissKey } = await load();
    expect(popupAdDismissKey(ad({ id: "x", popupVersion: 3 }))).toBe(
      "tarodan.popupAd.dismissed.x:3",
    );
  });

  it("until_dismissed: kapatılana kadar gösterilir; gösterim kayıt yazmaz", async () => {
    const { canShowPopupAd } = await load();
    expect(canShowPopupAd(ad())).toBe(true);
    // Yalnız okumak hiçbir şey yazmaz.
    expect(window.localStorage.length).toBe(0);
  });

  it("until_dismissed: kapatınca o sürüm bir daha gösterilmez", async () => {
    const { canShowPopupAd, markPopupAdDismissed } = await load();
    markPopupAdDismissed(ad());
    expect(
      window.localStorage.getItem("tarodan.popupAd.dismissed.ad-1:1"),
    ).not.toBeNull();
    expect(canShowPopupAd(ad())).toBe(false);
  });

  it("admin güncelleyince (yeni sürüm) yeniden gösterilir", async () => {
    const { canShowPopupAd, markPopupAdDismissed } = await load();
    markPopupAdDismissed(ad({ popupVersion: 1 }));
    expect(canShowPopupAd(ad({ popupVersion: 2 }))).toBe(true);
  });

  it("kapatma kaydı reklam başınadır, başka reklamı etkilemez", async () => {
    const { canShowPopupAd, markPopupAdDismissed } = await load();
    markPopupAdDismissed(ad({ id: "a" }));
    expect(canShowPopupAd(ad({ id: "b" }))).toBe(true);
  });

  it("every_visit: hiçbir şey yazılmaz, her seferinde gösterilir", async () => {
    const { canShowPopupAd, markPopupAdDismissed } = await load();
    const everyVisit = ad({ popupFrequency: "every_visit" });
    markPopupAdDismissed(everyVisit);
    expect(window.localStorage.length).toBe(0);
    expect(canShowPopupAd(everyVisit)).toBe(true);
  });

  it("every_visit: eski bir kapatma kaydı olsa da gösterilir", async () => {
    const { canShowPopupAd, markPopupAdDismissed } = await load();
    markPopupAdDismissed(ad());
    expect(canShowPopupAd(ad({ popupFrequency: "every_visit" }))).toBe(true);
  });

  it("localStorage yoksa kayıt bellekte tutulur (sayfa ömrünce)", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { canShowPopupAd, markPopupAdDismissed } = await load();
    expect(canShowPopupAd(ad())).toBe(true);
    expect(() => markPopupAdDismissed(ad())).not.toThrow();
    expect(canShowPopupAd(ad())).toBe(false);
    expect(canShowPopupAd(ad({ popupVersion: 2 }))).toBe(true);
  });
});

describe("isPopupBlockedByOverlay", () => {
  const clear = {
    requiredStepsOutstanding: false,
    cookieBannerOpen: false,
    tourRunning: false,
  };

  it("hiçbir katman açık değilse engellemez", async () => {
    const { isPopupBlockedByOverlay } = await load();
    expect(isPopupBlockedByOverlay(clear)).toBe(false);
  });

  it.each([
    "requiredStepsOutstanding",
    "cookieBannerOpen",
    "tourRunning",
  ] as const)("%s engeller", async (key) => {
    const { isPopupBlockedByOverlay } = await load();
    expect(isPopupBlockedByOverlay({ ...clear, [key]: true })).toBe(true);
  });
});
