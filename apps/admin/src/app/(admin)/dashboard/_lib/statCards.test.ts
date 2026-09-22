import { describe, expect, it } from "vitest";
import { DASHBOARD_METRIC_KEYS } from "@tarodan/types";
import { STAT_CARDS } from "./statCards";

/**
 * `STAT_CARDS` is the grid's ONLY source of truth (one row per card). If a
 * metric key exists on the API but has no card here it silently never
 * renders; if a card points at a key the API dropped, the screen shows a
 * permanent zero. Both are drift bugs this contract catches.
 */
describe("STAT_CARDS", () => {
  it("has exactly one card per catalogued metric, in either direction", () => {
    const cardMetrics = STAT_CARDS.map((card) => card.metric).sort();
    expect(cardMetrics).toEqual([...DASHBOARD_METRIC_KEYS].sort());
  });

  it("never lists the same metric twice", () => {
    const cardMetrics = STAT_CARDS.map((card) => card.metric);
    expect(new Set(cardMetrics).size).toBe(cardMetrics.length);
  });

  it("removed the old refundedAmount card (split into İADE and İPTAL)", () => {
    expect(STAT_CARDS.some((card) => card.metric === "refundedAmount")).toBe(
      false,
    );
  });

  it("gives every count/amount pair for a two-sided metric its own card", () => {
    const pairs: Array<[string, string]> = [
      ["sellerPayoutCount", "sellerPayoutAmount"],
      ["returnRefundCount", "returnRefundAmount"],
      ["cancelRefundCount", "cancelRefundAmount"],
      ["netRevenue", "netRevenueCount"],
      ["serviceFeeCount", "serviceFeeAmount"],
      ["commissionCount", "commissionAmount"],
      ["shippingCount", "shippingAmount"],
      ["deliveredOrders", "deliveredAmount"],
      ["membershipRevenue", "membershipCount"],
      ["boostRevenue", "boostCount"],
      ["completedTrades", "completedTradeAmount"],
    ];
    const metrics = new Set(STAT_CARDS.map((card) => card.metric));

    for (const [a, b] of pairs) {
      expect(metrics.has(a)).toBe(true);
      expect(metrics.has(b)).toBe(true);
    }
  });

  it("flags the component-split caveat on both fee cards, count and amount", () => {
    const flagged = STAT_CARDS.filter((card) =>
      ["serviceFeeCount", "serviceFeeAmount", "commissionCount", "commissionAmount"].includes(
        card.metric,
      ),
    );
    expect(flagged).toHaveLength(4);
    flagged.forEach((card) =>
      expect(card.noteKey).toBe("admin.dashboard.stats.feeSplitIncomplete"),
    );
  });

  it("formats every *Count/*Amount card by its unit", () => {
    STAT_CARDS.forEach((card) => {
      if (card.metric.toLowerCase().endsWith("amount")) {
        expect(card.format).toBe("currency");
      }
      if (card.metric.toLowerCase().endsWith("count")) {
        expect(card.format).toBe("count");
      }
    });
  });
});
