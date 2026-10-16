/** @format */

import { describe, expect, it } from "vitest";
import { safeReturnTo, withReturnTo } from "./returnTo";

describe("safeReturnTo", () => {
  it("kabul eder: site içi yollar", () => {
    expect(safeReturnTo("/listings/new")).toBe("/listings/new");
    expect(safeReturnTo("/profile?tab=1#bank")).toBe("/profile?tab=1#bank");
  });

  it("reddeder: boş, mutlak, protokol-göreli ve kaçış denemeleri", () => {
    expect(safeReturnTo(null)).toBeNull();
    expect(safeReturnTo(undefined)).toBeNull();
    expect(safeReturnTo("")).toBeNull();
    expect(safeReturnTo("listings/new")).toBeNull();
    expect(safeReturnTo("https://evil.com")).toBeNull();
    expect(safeReturnTo("//evil.com")).toBeNull();
    expect(safeReturnTo("/\\evil.com")).toBeNull();
    expect(safeReturnTo("/a\nb")).toBeNull();
    expect(safeReturnTo("javascript:alert(1)")).toBeNull();
  });
});

describe("withReturnTo", () => {
  it("hedefi kodlayarak ekler", () => {
    expect(withReturnTo("/profile", "/listings/new")).toBe(
      "/profile?returnTo=%2Flistings%2Fnew",
    );
    expect(withReturnTo("/profile?a=1", "/x")).toBe(
      "/profile?a=1&returnTo=%2Fx",
    );
  });
});
