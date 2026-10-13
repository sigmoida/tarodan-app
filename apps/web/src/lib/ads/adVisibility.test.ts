/** @format */

import { describe, expect, it } from "vitest";
import { resolveBannerVisibility } from "./adVisibility";

const member = {
  isAuthLoading: false,
  isAuthenticated: true,
  limitsStatus: "success" as const,
  isAdFree: false as boolean | undefined,
};

describe("resolveBannerVisibility", () => {
  it("misafire görünür (limit sorgusu beklenmez)", () => {
    expect(
      resolveBannerVisibility({
        ...member,
        isAuthenticated: false,
        limitsStatus: "pending",
        isAdFree: undefined,
      }),
    ).toBe("visible");
  });

  it("reklamsız katmanda gizli", () => {
    expect(resolveBannerVisibility({ ...member, isAdFree: true })).toBe(
      "hidden",
    );
  });

  it("reklamlı katmanda (free/basic) görünür", () => {
    expect(resolveBannerVisibility({ ...member, isAdFree: false })).toBe(
      "visible",
    );
  });

  it("giriş yapmış üyenin limitleri gelene kadar beklemede (afiş paralel çekilir, çizilmez)", () => {
    expect(
      resolveBannerVisibility({
        ...member,
        limitsStatus: "pending",
        isAdFree: undefined,
      }),
    ).toBe("pending");
  });

  it("oturum durumu henüz belli değilken ve değer bilinmiyorsa beklemede", () => {
    expect(
      resolveBannerVisibility({
        isAuthLoading: true,
        isAuthenticated: false,
        limitsStatus: "pending",
        isAdFree: undefined,
      }),
    ).toBe("pending");
  });

  it("checkAuth isLoading=true'ya dönünce son bilinen görünürlük korunur (titreme yok)", () => {
    const refreshing = { ...member, isAuthLoading: true };
    expect(resolveBannerVisibility({ ...refreshing, isAdFree: true })).toBe(
      "hidden",
    );
    expect(resolveBannerVisibility({ ...refreshing, isAdFree: false })).toBe(
      "visible",
    );
  });

  it("limitler okunamazsa görünür (belirsizlikte reklamsız sayılmaz)", () => {
    expect(
      resolveBannerVisibility({
        ...member,
        limitsStatus: "error",
        isAdFree: undefined,
      }),
    ).toBe("visible");
  });

  it("çıkış yapmış (misafir) kullanıcıda önceki üyenin önbelleği gizlemez", () => {
    expect(
      resolveBannerVisibility({
        isAuthLoading: false,
        isAuthenticated: false,
        limitsStatus: "success",
        isAdFree: true,
      }),
    ).toBe("visible");
  });
});
