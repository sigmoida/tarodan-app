import { describe, expect, it } from "vitest";
import { canRenewExpiredListing } from "./renewal";

describe("canRenewExpiredListing", () => {
  it("pasif + süresi doldu ilanda açılır", () => {
    expect(
      canRenewExpiredListing({ status: "inactive", inactiveReason: "expired" }),
    ).toBe(true);
  });

  it("başka bir kapanış nedeninde açılmaz", () => {
    for (const inactiveReason of [null, undefined, "out_of_stock", "refund_quarantine"]) {
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
