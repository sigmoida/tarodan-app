import { describe, expect, it } from "vitest";
import type { AdminRefundRow } from "@tarodan/types";
import {
  MONEY_LINE_I18N_KEYS,
  MONEY_STATUS_BADGES,
  fmtAmountWithRate,
  moneyTooltip,
  refundMoneyView,
} from "./moneyView";

const money = (overrides: Partial<AdminRefundRow["money"]> = {}) =>
  ({
    unitPrice: 1000,
    commissionRate: 10,
    commissionAmount: 100,
    refundableCommissionRate: 7.5,
    refundableCommissionAmount: 75,
    buyerDeduction: 20,
    sellerDeduction: 30,
    refundAmount: 900,
    status: "pending",
    refundedAt: null,
    ...overrides,
  }) as AdminRefundRow["money"];

const keys = (lines: { key: string }[]) => lines.map((line) => line.key);

describe("fmtAmountWithRate", () => {
  it("prints the amount with its rate, whole or one decimal", () => {
    expect(fmtAmountWithRate(100, 10)).toBe("₺100,00 · %10");
    expect(fmtAmountWithRate(75, 7.5)).toBe("₺75,00 · %7,5");
  });

  it("omits a missing rate and dashes a missing amount", () => {
    expect(fmtAmountWithRate(100, null)).toBe("₺100,00");
    expect(fmtAmountWithRate(null, 10)).toBe("—");
  });
});

describe("refundMoneyView", () => {
  it("shows four compact lines on the all / direct tabs", () => {
    for (const tab of ["all", "direct"] as const) {
      const { lines } = refundMoneyView(money(), tab);
      expect(keys(lines)).toEqual([
        "unitPrice",
        "commission",
        "refundableCommission",
        "deductions",
      ]);
    }
  });

  it("pairs the buyer / seller deductions and dashes missing values", () => {
    const { lines } = refundMoneyView(
      money({ commissionAmount: null, commissionRate: null }),
      "all",
    );
    expect(lines.find((l) => l.key === "deductions")?.value).toBe(
      "₺20,00 / ₺30,00",
    );
    expect(lines.find((l) => l.key === "commission")?.value).toBe("—");
  });

  it("adds the listing vs offer commission only on the offer tab", () => {
    const row = money({
      listingCommissionAmount: 60,
      offerCommissionAmount: null,
      priceDifference: 50,
    });
    const offer = refundMoneyView(row, "offer");
    expect(keys(offer.lines)).toContain("commissionSplit");
    expect(offer.lines.find((l) => l.key === "commissionSplit")?.value).toBe(
      "₺60,00 / —",
    );
    expect(keys(offer.lines)).not.toContain("priceDifference");
    expect(keys(offer.detail)).toEqual(
      expect.arrayContaining(["listingCommission", "offerCommission"]),
    );
    for (const tab of ["all", "direct", "trade"] as const) {
      const view = refundMoneyView(row, tab);
      expect(keys(view.lines)).not.toContain("commissionSplit");
      expect(keys(view.detail)).not.toContain("listingCommission");
    }
  });

  it("adds the price difference only on the trade tab", () => {
    const row = money({ priceDifference: 50 });
    const trade = refundMoneyView(row, "trade");
    expect(trade.lines.at(-1)).toEqual({
      key: "priceDifference",
      value: "₺50,00",
    });
    for (const tab of ["all", "direct", "offer"] as const) {
      expect(keys(refundMoneyView(row, tab).lines)).not.toContain(
        "priceDifference",
      );
    }
  });

  it("the tooltip lists every line, deductions split apart", () => {
    const { detail } = refundMoneyView(money(), "all");
    expect(keys(detail)).toEqual([
      "unitPrice",
      "commission",
      "refundableCommission",
      "buyerDeduction",
      "sellerDeduction",
    ]);
    expect(moneyTooltip(detail, (key) => `<${key}>`)).toBe(
      [
        "<unitPrice>: ₺1.000,00",
        "<commission>: ₺100,00 · %10",
        "<refundableCommission>: ₺75,00 · %7,5",
        "<buyerDeduction>: ₺20,00",
        "<sellerDeduction>: ₺30,00",
      ].join("\n"),
    );
  });

  it("every emitted key has an i18n label", () => {
    const all = refundMoneyView(money(), "trade").detail.concat(
      refundMoneyView(money(), "offer").detail,
    );
    for (const line of all) {
      expect(MONEY_LINE_I18N_KEYS[line.key]).toMatch(
        /^admin\.operations\.refunds\.money\./,
      );
    }
  });
});

describe("MONEY_STATUS_BADGES", () => {
  it("maps the five money states to the customer's badges", () => {
    expect(MONEY_STATUS_BADGES.none.variant).toBe("outline");
    expect(MONEY_STATUS_BADGES.pending.variant).toBe("outline");
    expect(MONEY_STATUS_BADGES.refunding.variant).toBe("warning");
    expect(MONEY_STATUS_BADGES.refunded.variant).toBe("success");
    expect(MONEY_STATUS_BADGES.failed.variant).toBe("danger");
  });
});
