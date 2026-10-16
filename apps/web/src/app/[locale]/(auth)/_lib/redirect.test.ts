/** @format */

import { describe, expect, it } from "vitest";
import { pickLoginRedirect } from "./redirect";

describe("pickLoginRedirect", () => {
  it("sessionStorage ipucu ?redirect'ten önce gelir", () => {
    expect(pickLoginRedirect("/cart/payment", "/profile")).toBe(
      "/cart/payment",
    );
  });

  it("ipucu yoksa ?redirect kullanılır (query dahil)", () => {
    expect(pickLoginRedirect(null, "/profile?returnTo=%2Flistings%2Fnew")).toBe(
      "/profile?returnTo=%2Flistings%2Fnew",
    );
  });

  it("hiçbiri yoksa ana sayfa", () => {
    expect(pickLoginRedirect(null, null)).toBe("/");
    expect(pickLoginRedirect(undefined, "")).toBe("/");
  });

  it("açık yönlendirme denemelerini reddeder", () => {
    expect(pickLoginRedirect(null, "//evil.com")).toBe("/");
    expect(pickLoginRedirect(null, "/\\evil.com")).toBe("/");
    expect(pickLoginRedirect(null, "https://evil.com")).toBe("/");
    expect(pickLoginRedirect(null, "/a\nb")).toBe("/");
    expect(pickLoginRedirect(null, "/en//evil.com")).toBe("/");
  });

  it("güvensiz ipucu sonraki kaynağa düşer", () => {
    expect(pickLoginRedirect("//evil.com", "/profile")).toBe("/profile");
  });

  it("locale önekini atar (router öneki kendisi ekler)", () => {
    expect(pickLoginRedirect(null, "/en/profile")).toBe("/profile");
  });
});
