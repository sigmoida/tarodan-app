import {
  refundHeadComparator,
  tradeHeadTake,
  tradeRefundHeads,
  type RefundHead,
} from "./refund-list-heads";

const request = (id: string, iso: string): RefundHead => ({
  kind: "request",
  id,
  at: new Date(iso),
});
const tradeSide = (id: string, iso: string | null): RefundHead => ({
  kind: "trade",
  id,
  role: "initiator",
  at: iso ? new Date(iso) : null,
});

describe("refundHeadComparator", () => {
  it("newest first by default; an open trade (no close time) counts as newest", () => {
    const heads = [
      request("old", "2026-10-01T00:00:00.000Z"),
      tradeSide("open", null),
      request("new", "2026-10-10T00:00:00.000Z"),
    ];
    expect(
      [...heads].sort(refundHeadComparator("desc")).map((head) => head.id),
    ).toEqual(["open", "new", "old"]);
  });

  it("oldest first ascending; an open trade goes last", () => {
    const heads = [
      tradeSide("open", null),
      request("new", "2026-10-10T00:00:00.000Z"),
      request("old", "2026-10-01T00:00:00.000Z"),
    ];
    expect(
      [...heads].sort(refundHeadComparator("asc")).map((head) => head.id),
    ).toEqual(["old", "new", "open"]);
  });

  it("ties are 0 so the merge keeps source order (a trade's two rows stay together)", () => {
    const compare = refundHeadComparator("desc");
    expect(compare(tradeSide("a", null), tradeSide("b", null))).toBe(0);
    expect(
      compare(
        request("a", "2026-10-01T00:00:00.000Z"),
        tradeSide("b", "2026-10-01T00:00:00.000Z"),
      ),
    ).toBe(0);
  });
});

describe("tradeRefundHeads", () => {
  const trades = [
    { id: "t1", cancelledAt: null },
    { id: "t2", cancelledAt: new Date("2026-10-05T00:00:00.000Z") },
  ];

  it("yields two rows per trade, initiator then responder", () => {
    expect(tradeRefundHeads(trades, 10)).toEqual([
      { kind: "trade", id: "t1", role: "initiator", at: null },
      { kind: "trade", id: "t1", role: "responder", at: null },
      { kind: "trade", id: "t2", role: "initiator", at: trades[1].cancelledAt },
      { kind: "trade", id: "t2", role: "responder", at: trades[1].cancelledAt },
    ]);
  });

  it("cuts at take, even mid-trade", () => {
    expect(tradeRefundHeads(trades, 3)).toHaveLength(3);
  });

  it("reads half as many trades as rows (rounded up)", () => {
    expect(tradeHeadTake(20)).toBe(10);
    expect(tradeHeadTake(21)).toBe(11);
    expect(tradeHeadTake(1)).toBe(1);
  });
});
