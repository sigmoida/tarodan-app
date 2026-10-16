/** @format */

import { describe, expect, it } from "vitest";
import {
  loginHref,
  readsReturnToHeader,
  safeReturnTo,
  withReturnTo,
} from "./returnTo";

describe("safeReturnTo", () => {
  it("kabul eder: site içi yollar", () => {
    expect(safeReturnTo("/listings/new")).toBe("/listings/new");
    expect(safeReturnTo("/profile?tab=1#bank")).toBe("/profile?tab=1#bank");
    expect(safeReturnTo("/")).toBe("/");
  });

  it("reddeder: boş, mutlak, protokol-göreli ve kaçış denemeleri", () => {
    expect(safeReturnTo(null)).toBeNull();
    expect(safeReturnTo(undefined)).toBeNull();
    expect(safeReturnTo("")).toBeNull();
    expect(safeReturnTo("listings/new")).toBeNull();
    expect(safeReturnTo("https://evil.com")).toBeNull();
    expect(safeReturnTo("//evil.com")).toBeNull();
    expect(safeReturnTo("/\\evil.com")).toBeNull();
    expect(safeReturnTo("/a\\b")).toBeNull();
    expect(safeReturnTo("/a\nb")).toBeNull();
    expect(safeReturnTo("/a\tb")).toBeNull();
    expect(safeReturnTo("/a\u007fb")).toBeNull();
    expect(safeReturnTo("javascript:alert(1)")).toBeNull();
  });

  it("locale önekini atar (next-intl router öneki kendisi ekler)", () => {
    expect(safeReturnTo("/en/listings/new")).toBe("/listings/new");
    expect(safeReturnTo("/tr/listings/new")).toBe("/listings/new");
    expect(safeReturnTo("/en/profile?returnTo=%2Fx#bank")).toBe(
      "/profile?returnTo=%2Fx#bank",
    );
    expect(safeReturnTo("/en")).toBe("/");
    expect(safeReturnTo("/en/")).toBe("/");
    expect(safeReturnTo("/en?a=1")).toBe("/?a=1");
    expect(safeReturnTo("/en#x")).toBe("/#x");
    expect(safeReturnTo("/en/en/x")).toBe("/x");
  });

  it("locale benzeri ama locale olmayan segmentlere dokunmaz", () => {
    expect(safeReturnTo("/english")).toBe("/english");
    expect(safeReturnTo("/entry/1")).toBe("/entry/1");
    expect(safeReturnTo("/trade/1")).toBe("/trade/1");
  });

  it("önek atıldıktan SONRA doğrular: /en//evil.com açık yönlendirme olmaz", () => {
    expect(safeReturnTo("/en//evil.com")).toBeNull();
    expect(safeReturnTo("/en/\\evil.com")).toBeNull();
    expect(safeReturnTo("/tr/en//evil.com")).toBeNull();
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

describe("loginHref", () => {
  it("tam yolu (query dahil) kodlayarak taşır", () => {
    const href = loginHref("/profile?returnTo=%2Flistings%2Fnew");
    expect(href).toBe(
      `/login?redirect=${encodeURIComponent("/profile?returnTo=%2Flistings%2Fnew")}`,
    );
    // Round-trip: login sayfası `redirect`'i aynen geri okur.
    const back = new URL(href, "https://x.test").searchParams.get("redirect");
    expect(back).toBe("/profile?returnTo=%2Flistings%2Fnew");
  });

  it("locale önekini atar", () => {
    expect(loginHref("/en/profile")).toBe(
      `/login?redirect=${encodeURIComponent("/profile")}`,
    );
  });

  it("güvensiz ya da boş hedefte redirect eklemez", () => {
    expect(loginHref("//evil.com")).toBe("/login");
    expect(loginHref("https://evil.com")).toBe("/login");
    expect(loginHref(null)).toBe("/login");
    expect(loginHref(undefined)).toBe("/login");
  });
});

describe("readsReturnToHeader", () => {
  it("yalnız profil yollarında", () => {
    expect(readsReturnToHeader("/profile")).toBe(true);
    expect(readsReturnToHeader("/profile/orders/1")).toBe(true);
    expect(readsReturnToHeader("/profiles")).toBe(false);
    expect(readsReturnToHeader("/listings/new")).toBe(false);
    expect(readsReturnToHeader("/")).toBe(false);
  });
});
