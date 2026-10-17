import { describe, expect, it } from "vitest";
import { canRenewByRole, canRenewExpiredListing } from "./renewal";

describe("canRenewExpiredListing", () => {
  it("pasif + süresi doldu ilanda açılır", () => {
    expect(
      canRenewExpiredListing({ status: "inactive", inactiveReason: "expired" }),
    ).toBe(true);
  });

  it("başka bir kapanış nedeninde açılmaz", () => {
    for (const inactiveReason of [
      null,
      undefined,
      "out_of_stock",
      "refund_quarantine",
    ]) {
      expect(
        canRenewExpiredListing({ status: "inactive", inactiveReason }),
      ).toBe(false);
    }
  });

  it("pasif olmayan ilanda açılmaz", () => {
    expect(
      canRenewExpiredListing({ status: "active", inactiveReason: "expired" }),
    ).toBe(false);
  });
});

describe("canRenewByRole", () => {
  it("yalnız super_admin ve admin için açılır", () => {
    expect(canRenewByRole("super_admin")).toBe(true);
    expect(canRenewByRole("admin")).toBe(true);
  });

  it("moderatör ve bilinmeyen rolde kapalıdır", () => {
    expect(canRenewByRole("moderator")).toBe(false);
    expect(canRenewByRole(undefined)).toBe(false);
    expect(canRenewByRole(null)).toBe(false);
  });
});
