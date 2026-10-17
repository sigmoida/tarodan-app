import { describe, expect, it } from "vitest";
import type { AdminRefundRow } from "@tarodan/types";
import {
  REFUND_NOTE_MAX_LENGTH,
  refundGroupRef,
  refundRowClassName,
  truncateNote,
} from "./rowView";

const row = (overrides: Partial<AdminRefundRow>) =>
  ({
    order: { id: "o1", orderNumber: "ORD-1", groupNumber: null },
    trade: null,
    ...overrides,
  }) as AdminRefundRow;

const tradeRow = row({
  trade: {
    tradeId: "t1",
    tradeNumber: "TKS-10001",
    role: "responder",
    counterpartRefundId: "r1",
  },
});

describe("refundRowClassName", () => {
  it("marks both rows of a trade with the group line, others not", () => {
    expect(refundRowClassName(tradeRow)).toContain("inset");
    expect(refundRowClassName(row({}))).toBeUndefined();
  });
});

describe("refundGroupRef", () => {
  it("prefers the trade number, then the group number", () => {
    expect(refundGroupRef(tradeRow)).toEqual({
      kind: "trade",
      tradeId: "t1",
      number: "TKS-10001",
    });
    expect(
      refundGroupRef(
        row({
          order: {
            id: "o1",
            orderNumber: "ORD-1",
            groupNumber: "GRP-9",
          } as AdminRefundRow["order"],
        }),
      ),
    ).toEqual({ kind: "group", number: "GRP-9" });
    expect(refundGroupRef(row({}))).toBeNull();
  });
});

describe("truncateNote", () => {
  it("returns null for blank notes and clips long ones", () => {
    expect(truncateNote(null)).toBeNull();
    expect(truncateNote("   ")).toBeNull();
    expect(truncateNote(" kısa not ")).toBe("kısa not");
    const clipped = truncateNote("x".repeat(200)) ?? "";
    expect(clipped).toHaveLength(REFUND_NOTE_MAX_LENGTH);
    expect(clipped.endsWith("…")).toBe(true);
  });
});
