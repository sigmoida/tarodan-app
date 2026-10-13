/** @format */

import { describe, expect, it } from "vitest";
import { isMembershipSettled } from "./membershipSettle";

describe("isMembershipSettled", () => {
  it("hedef katman biliniyorsa ona eşitlik aranır", () => {
    expect(isMembershipSettled({ tier: "free", expectedTier: "premium" })).toBe(
      false,
    );
    expect(
      isMembershipSettled({ tier: "premium", expectedTier: "premium" }),
    ).toBe(true);
  });

  it("hedef yoksa önceki katmandan farklı olmak yeterli (PayTR dönüşü)", () => {
    expect(isMembershipSettled({ tier: "free", baselineTier: "free" })).toBe(
      false,
    );
    expect(isMembershipSettled({ tier: "premium", baselineTier: "free" })).toBe(
      true,
    );
  });

  it("karşılaştıracak bir şey yoksa ilk yanıt yeter", () => {
    expect(isMembershipSettled({ tier: "free" })).toBe(true);
  });
});
