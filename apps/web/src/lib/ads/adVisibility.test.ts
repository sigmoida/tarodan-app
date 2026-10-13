/** @format */

import { describe, expect, it } from "vitest";
import { shouldShowBanner } from "./adVisibility";

const base = {
  isAuthLoading: false,
  isAuthenticated: true,
  limitsStatus: "success" as const,
  isAdFree: false,
};

describe("shouldShowBanner", () => {
  it("misafire banner gösterilir (limit sorgusu beklenmez)", () => {
    expect(
      shouldShowBanner({
        ...base,
        isAuthenticated: false,
        limitsStatus: "pending",
      }),
    ).toBe(true);
  });

  it("reklamsız katmanda banner çizilmez", () => {
    expect(shouldShowBanner({ ...base, isAdFree: true })).toBe(false);
  });

  it("reklamlı katmanda (free/basic) banner gösterilir", () => {
    expect(shouldShowBanner({ ...base, isAdFree: false })).toBe(true);
  });

  it("oturum durumu belli olana kadar bekler (reklamsız üyeye flaş yok)", () => {
    expect(shouldShowBanner({ ...base, isAuthLoading: true })).toBe(false);
  });

  it("giriş yapmış kullanıcının limitleri gelene kadar bekler", () => {
    expect(shouldShowBanner({ ...base, limitsStatus: "pending" })).toBe(false);
  });

  it("limitler okunamazsa banner gösterilir (belirsizlikte reklamsız sayılmaz)", () => {
    expect(
      shouldShowBanner({ ...base, limitsStatus: "error", isAdFree: true }),
    ).toBe(true);
  });
});
