// @vitest-environment jsdom
/** @format */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  POPUP_AD_INTERVAL_MS,
  POPUP_AD_STORAGE_KEY,
  canShowPopupAd,
  isPopupBlockedByOverlay,
  markPopupAdShown,
} from "./popupFrequency";

const NOW = 1_800_000_000_000;

describe("popup frequency cap", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("hiç gösterilmediyse gösterir", () => {
    expect(canShowPopupAd(NOW)).toBe(true);
  });

  it("gösterimden sonra 24 saat dolmadan göstermez", () => {
    markPopupAdShown(NOW);
    expect(window.localStorage.getItem(POPUP_AD_STORAGE_KEY)).toBe(String(NOW));
    expect(canShowPopupAd(NOW + POPUP_AD_INTERVAL_MS - 1)).toBe(false);
  });

  it("24 saat dolunca yeniden gösterir", () => {
    markPopupAdShown(NOW);
    expect(canShowPopupAd(NOW + POPUP_AD_INTERVAL_MS)).toBe(true);
  });

  it("bozuk değer ya da geleceğe yazılmış damga kilitlemez", () => {
    window.localStorage.setItem(POPUP_AD_STORAGE_KEY, "abc");
    expect(canShowPopupAd(NOW)).toBe(true);
    window.localStorage.setItem(POPUP_AD_STORAGE_KEY, String(NOW + 10_000));
    expect(canShowPopupAd(NOW)).toBe(true);
  });

  it("depolama hata verirse okuma 'göster', yazma sessiz geçer", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(canShowPopupAd(NOW)).toBe(true);
    expect(() => markPopupAdShown(NOW)).not.toThrow();
  });
});

describe("isPopupBlockedByOverlay", () => {
  const clear = {
    requiredStepsOutstanding: false,
    cookieBannerOpen: false,
    tourRunning: false,
  };

  it("hiçbir katman açık değilse engellemez", () => {
    expect(isPopupBlockedByOverlay(clear)).toBe(false);
  });

  it.each(["requiredStepsOutstanding", "cookieBannerOpen", "tourRunning"] as const)(
    "%s engeller",
    (key) => {
      expect(isPopupBlockedByOverlay({ ...clear, [key]: true })).toBe(true);
    },
  );
});
