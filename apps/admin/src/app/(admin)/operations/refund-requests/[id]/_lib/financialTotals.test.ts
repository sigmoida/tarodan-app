import { describe, expect, it } from "vitest";
import { financialTotalsGroups, shippingRefundValue } from "./financialTotals";
import type { RefundFinancialTotals } from "../types";

const totals: RefundFinancialTotals = {
  buyerRefund: 1250.5,
  buyerCharge: 40,
  buyerNet: 1210.5,
  sellerRefund: 0,
  sellerCharge: 900,
  sellerNet: 900,
  platformRetain: 25,
  platformRefund: 10,
  platformNet: 15,
  shippingRefund: 59.9,
};

describe("financialTotalsGroups", () => {
  it("orders the sides buyer, seller, platform", () => {
    expect(financialTotalsGroups(totals).map((g) => g.side)).toEqual([
      "buyer",
      "seller",
      "platform",
    ]);
  });

  it("gives buyer and seller refund/charge/net and platform retain/refund/net", () => {
    const lines = financialTotalsGroups(totals).map((g) =>
      g.rows.map((r) => r.line),
    );
    expect(lines).toEqual([
      ["refund", "charge", "net"],
      ["refund", "charge", "net"],
      ["retain", "refund", "net"],
    ]);
  });

  it("formats every amount with fmtTry", () => {
    const [buyer, seller, platform] = financialTotalsGroups(totals);
    expect(buyer!.rows.map((r) => r.value)).toEqual([
      "₺1.250,50",
      "₺40,00",
      "₺1.210,50",
    ]);
    expect(seller!.rows[0]!.value).toBe("₺0,00");
    expect(platform!.rows[2]!.value).toBe("₺15,00");
  });
});

describe("shippingRefundValue", () => {
  it("formats the shipping refund", () => {
    expect(shippingRefundValue(totals)).toBe("₺59,90");
  });
});
