/** @format */

import { describe, expect, it } from "vitest";
import type { InstallmentOptionsResponse } from "@tarodan/types";
import {
  installmentBinOf,
  installmentCardLine,
  installmentGateOf,
  installmentOfferOf,
  installmentSelectionOf,
  installmentSigningErrorOf,
  installmentSourceKey,
  installmentsConfigOf,
  paidInstallmentOf,
} from "./installments";

/**
 * Installment rules of the card form (ADR 0019, plan 5.1 / 6.2 / 7). The
 * amounts are the server's; these pins cover what is sent back (`installment`
 * of direct-form, BIN only), when the selector is offered (D6 exclusions,
 * switch, minimum) and how an answer is read (fail closed). Same cases as the
 * mobile M1 module.
 */

const ON = { enabled: true, minAmount: 500 };

const OPTIONS: InstallmentOptionsResponse = {
  enabled: true,
  card: { bank: "Test Bank", family: "world", type: "credit" },
  baseAmount: 1000,
  options: [
    { count: 1, totalAmount: 1000, feeAmount: 0, monthlyAmount: 1000 },
    { count: 3, totalAmount: 1066.38, feeAmount: 66.38, monthlyAmount: 355.46 },
    { count: 2, totalAmount: 1000, feeAmount: 0, monthlyAmount: 500 },
  ],
};

describe("installmentBinOf (PCI: at most the first 8 digits)", () => {
  it("is null below 8 digits", () => {
    expect(installmentBinOf("")).toBeNull();
    expect(installmentBinOf("4546711")).toBeNull();
  });

  it("cuts exactly the first 8 digits of a full number", () => {
    expect(installmentBinOf("4546711234567890")).toBe("45467112");
    expect(installmentBinOf("4546 7112 3456 7890")).toBe("45467112");
    expect(installmentBinOf("4546711234567890")).toHaveLength(8);
  });
});

describe("installmentSourceKey", () => {
  it("names the card source", () => {
    expect(installmentSourceKey(null)).toBeNull();
    expect(installmentSourceKey({ kind: "bin", bin: "45467112" })).toBe(
      "bin:45467112",
    );
    expect(installmentSourceKey({ kind: "saved", savedCardId: "c-1" })).toBe(
      "saved:c-1",
    );
  });
});

describe("installmentsConfigOf (fail closed)", () => {
  it("is on only with enabled true and a valid minimum", () => {
    expect(installmentsConfigOf({ installments: ON })).toEqual(ON);
    expect(
      installmentsConfigOf({ installments: { enabled: true, minAmount: 0 } }),
    ).toEqual({ enabled: true, minAmount: 0 });
  });

  it.each([
    null,
    undefined,
    {},
    { installments: { enabled: false, minAmount: 500 } },
    { installments: { enabled: true } },
    { installments: { enabled: true, minAmount: -1 } },
    { installments: { enabled: true, minAmount: Number.NaN } },
    { installments: { enabled: "true", minAmount: 500 } as never },
  ])("reads %j as off", (config) => {
    expect(installmentsConfigOf(config).enabled).toBe(false);
  });
});

describe("installmentGateOf (switch, minimum, D6)", () => {
  const base = {
    config: ON,
    kind: "checkout" as const,
    amount: 1000,
    target: { orderId: "o-1" },
  };

  it("an order or cart payment above the minimum is priced", () => {
    expect(installmentGateOf(base)).toBe("on");
    expect(
      installmentGateOf({ ...base, target: { checkoutGroupId: "g-1" } }),
    ).toBe("on");
    expect(installmentGateOf({ ...base, amount: 500 })).toBe("on");
  });

  it("the checkout before the order exists is priced by its amount", () => {
    expect(installmentGateOf({ ...base, target: null })).toBe("on");
  });

  it("below the minimum: the note, not a hidden selector", () => {
    expect(installmentGateOf({ ...base, amount: 499.99 })).toBe("belowMinimum");
  });

  it("switch off, unknown amount: no selector", () => {
    expect(
      installmentGateOf({ ...base, config: { enabled: false, minAmount: 0 } }),
    ).toBe("off");
    expect(installmentGateOf({ ...base, amount: undefined })).toBe("off");
    expect(installmentGateOf({ ...base, amount: Number.NaN })).toBe("off");
  });

  it("membership, boost and trade cash never get it (D6)", () => {
    expect(installmentGateOf({ ...base, kind: "membership" })).toBe("off");
    expect(installmentGateOf({ ...base, kind: "boost" })).toBe("off");
    expect(installmentGateOf({ ...base, target: { tradeId: "t-1" } })).toBe(
      "off",
    );
    expect(
      installmentGateOf({
        ...base,
        target: { orderId: "o-1", tradeId: "t-1" },
      }),
    ).toBe("off");
    expect(installmentGateOf({ ...base, target: {} })).toBe("off");
  });
});

describe("installmentOfferOf (fail closed)", () => {
  it("single first, then the counts ascending; the card is kept", () => {
    expect(installmentOfferOf(OPTIONS)).toEqual({
      kind: "options",
      card: OPTIONS.card,
      options: [OPTIONS.options[0], OPTIONS.options[2], OPTIONS.options[1]],
    });
  });

  it("drops malformed and duplicate options", () => {
    const offer = installmentOfferOf({
      ...OPTIONS,
      options: [
        ...OPTIONS.options,
        { count: 3, totalAmount: 1, feeAmount: 0, monthlyAmount: 1 },
        { count: 13, totalAmount: 1, feeAmount: 0, monthlyAmount: 1 },
        { count: 6, totalAmount: -1, feeAmount: 0, monthlyAmount: 1 },
        { count: 9 } as never,
      ],
    });
    expect(
      offer.kind === "options" && offer.options.map((o) => o.count),
    ).toEqual([1, 2, 3]);
  });

  it("no single payment or no count above 1: unavailable", () => {
    expect(
      installmentOfferOf({ ...OPTIONS, options: [OPTIONS.options[1]] }),
    ).toEqual({ kind: "single", reason: "unavailable" });
    expect(
      installmentOfferOf({ ...OPTIONS, options: [OPTIONS.options[0]] }),
    ).toEqual({ kind: "single", reason: "unavailable" });
    expect(installmentOfferOf(null)).toEqual({
      kind: "single",
      reason: "unavailable",
    });
  });

  it("reads each reason; disabled hides the selector", () => {
    const off = (reason: InstallmentOptionsResponse["reason"]) =>
      installmentOfferOf({
        enabled: false,
        reason,
        baseAmount: 1000,
        options: [OPTIONS.options[0]],
      });
    expect(off("disabled")).toEqual({ kind: "hidden" });
    expect(off("card_not_eligible")).toEqual({
      kind: "single",
      reason: "card_not_eligible",
    });
    expect(off("not_offered_for_payment")).toEqual({
      kind: "single",
      reason: "not_offered_for_payment",
    });
    expect(off("unavailable")).toEqual({
      kind: "single",
      reason: "unavailable",
    });
    expect(off(undefined)).toEqual({ kind: "single", reason: "unavailable" });
  });

  it("below_minimum carries the minimum, or falls back without one", () => {
    expect(
      installmentOfferOf({
        enabled: false,
        reason: "below_minimum",
        minAmount: 500,
        baseAmount: 100,
        options: [],
      }),
    ).toEqual({ kind: "single", reason: "below_minimum", minAmount: 500 });
    expect(
      installmentOfferOf({
        enabled: false,
        reason: "below_minimum",
        baseAmount: 100,
        options: [],
      }),
    ).toEqual({ kind: "single", reason: "not_offered_for_payment" });
  });
});

describe("installmentSelectionOf (the direct-form `installment`)", () => {
  const three = OPTIONS.options[1];

  it("a new card sends its BIN and the total it saw", () => {
    expect(
      installmentSelectionOf(three, { kind: "bin", bin: "45467112" }),
    ).toEqual({ count: 3, bin: "45467112", expectedTotal: 1066.38 });
  });

  it("a saved card never sends a BIN", () => {
    expect(
      installmentSelectionOf(three, { kind: "saved", savedCardId: "c-1" }),
    ).toEqual({ count: 3, expectedTotal: 1066.38 });
  });

  it("single payment sends nothing", () => {
    expect(
      installmentSelectionOf(OPTIONS.options[0], { kind: "bin", bin: "1" }),
    ).toBeUndefined();
    expect(installmentSelectionOf(null, null)).toBeUndefined();
    expect(installmentSelectionOf(three, null)).toBeUndefined();
  });
});

describe("installmentSigningErrorOf", () => {
  const err = (i18nKey: string) => ({ response: { data: { i18nKey } } });

  it("maps the four refusals the form handles", () => {
    expect(
      installmentSigningErrorOf(
        err("server.payment.installmentPricingChanged"),
      ),
    ).toBe("pricingChanged");
    expect(
      installmentSigningErrorOf(err("server.payment.installmentUnavailable")),
    ).toBe("unavailable");
    expect(
      installmentSigningErrorOf(err("server.payment.installmentNotOffered")),
    ).toBe("notOffered");
    expect(
      installmentSigningErrorOf(err("server.payment.paymentAmountOutOfDate")),
    ).toBe("amountOutOfDate");
  });

  it("anything else is not one", () => {
    expect(installmentSigningErrorOf(err("server.auth.loginRequired"))).toBe(
      null,
    );
    expect(installmentSigningErrorOf(new Error("x"))).toBeNull();
    expect(installmentSigningErrorOf(null)).toBeNull();
  });
});

describe("installmentCardLine", () => {
  it("bank and capitalised family", () => {
    expect(installmentCardLine(OPTIONS.card)).toBe("Test Bank · World");
    expect(installmentCardLine({ family: "bonus" })).toBe("Bonus");
    expect(installmentCardLine(undefined)).toBe("");
  });
});

describe("paidInstallmentOf", () => {
  it("reads a paid installment payment", () => {
    expect(
      paidInstallmentOf({
        installmentCount: 3,
        installmentFeeAmount: 66.38,
        chargedAmount: 1066.38,
      }),
    ).toEqual({ count: 3, feeAmount: 66.38, chargedAmount: 1066.38 });
  });

  it("a single payment, an older API or the seller's view: nothing", () => {
    expect(
      paidInstallmentOf({
        installmentCount: 1,
        installmentFeeAmount: 0,
        chargedAmount: 1000,
      }),
    ).toBeNull();
    expect(paidInstallmentOf({})).toBeNull();
    expect(paidInstallmentOf(null)).toBeNull();
    expect(paidInstallmentOf({ installmentCount: 3 })).toBeNull();
  });
});
