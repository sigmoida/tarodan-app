import { describe, expect, it } from "vitest";
import { expiredLoginHref, safeAdminReturnPath } from "./auth-redirect";

describe("safeAdminReturnPath", () => {
  it("passes through a normal same-origin path", () => {
    expect(safeAdminReturnPath("/operations/orders/123")).toBe(
      "/operations/orders/123",
    );
  });

  it("keeps query string and hash on a valid path", () => {
    expect(safeAdminReturnPath("/accounts/users?tab=trades#top")).toBe(
      "/accounts/users?tab=trades#top",
    );
  });

  it("falls back to /dashboard for null/undefined/empty", () => {
    expect(safeAdminReturnPath(null)).toBe("/dashboard");
    expect(safeAdminReturnPath(undefined)).toBe("/dashboard");
    expect(safeAdminReturnPath("")).toBe("/dashboard");
  });

  it("rejects an absolute URL (doesn't start with /)", () => {
    expect(safeAdminReturnPath("https://evil.example/phish")).toBe(
      "/dashboard",
    );
  });

  it("rejects a protocol-relative open-redirect attempt", () => {
    expect(safeAdminReturnPath("//evil.example/phish")).toBe("/dashboard");
  });

  it("rejects a path containing a backslash", () => {
    expect(safeAdminReturnPath("/\\evil.example")).toBe("/dashboard");
    expect(safeAdminReturnPath("/foo\\bar")).toBe("/dashboard");
  });

  it("redirects an exact auth-page path to /dashboard instead of looping", () => {
    expect(safeAdminReturnPath("/login")).toBe("/dashboard");
    expect(safeAdminReturnPath("/forgot-password")).toBe("/dashboard");
    expect(safeAdminReturnPath("/reset-password")).toBe("/dashboard");
  });

  it("redirects an auth-page sub-path to /dashboard", () => {
    expect(safeAdminReturnPath("/reset-password/abc123")).toBe("/dashboard");
  });

  it("does NOT block a path that merely contains an auth path as a substring", () => {
    // "/users/login-history" starts with "/login" as a raw string but is a
    // distinct route — the guard must match on path segments, not substrings.
    expect(safeAdminReturnPath("/users/login-history")).toBe(
      "/users/login-history",
    );
  });

  it("checks the auth-path guard against the pathname only, ignoring query/hash", () => {
    expect(safeAdminReturnPath("/login?next=/dashboard")).toBe("/dashboard");
    expect(safeAdminReturnPath("/login#section")).toBe("/dashboard");
  });
});

describe("expiredLoginHref", () => {
  it("builds a /login href with the reason and a safe redirect target", () => {
    const href = expiredLoginHref("idle", "/accounts/users/1");
    expect(href).toBe("/login?expired=idle&redirect=%2Faccounts%2Fusers%2F1");
  });

  it("sanitizes an unsafe return path before embedding it", () => {
    const href = expiredLoginHref("session", "//evil.example");
    expect(href).toBe("/login?expired=session&redirect=%2Fdashboard");
  });
});
