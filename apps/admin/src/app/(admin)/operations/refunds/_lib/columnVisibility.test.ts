import { describe, expect, it } from "vitest";
import { ADMIN_REFUND_TABS } from "@tarodan/types";
import { REFUND_COLUMN_KEYS, refundColumnKeys } from "./columnVisibility";

describe("refundColumnKeys (tab → visible columns)", () => {
  it("shows the Depo column on the trade tab only", () => {
    expect(refundColumnKeys("trade")).toContain("warehouse");
    for (const tab of ADMIN_REFUND_TABS.filter((tab) => tab !== "trade")) {
      expect(refundColumnKeys(tab)).not.toContain("warehouse");
    }
  });

  it("trade shows all eleven columns in screen order", () => {
    expect(refundColumnKeys("trade")).toEqual([...REFUND_COLUMN_KEYS]);
    expect(REFUND_COLUMN_KEYS).toHaveLength(11);
  });

  it("the other tabs share the same ten columns", () => {
    const expected = REFUND_COLUMN_KEYS.filter((key) => key !== "warehouse");
    for (const tab of ["all", "direct", "offer"] as const) {
      expect(refundColumnKeys(tab)).toEqual(expected);
    }
  });
});
