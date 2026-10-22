/** @format */

import { describe, expect, it } from "vitest";
import { cashAmountValue, signedCashAmount } from "./cashAmount";

describe("signedCashAmount", () => {
  it("signs by payer and omits empty cash", () => {
    expect(signedCashAmount("12,50", "me")).toBe(12.5);
    expect(signedCashAmount("12,50", "them")).toBe(-12.5);
    expect(signedCashAmount("", "me")).toBeUndefined();
    expect(signedCashAmount("0,00", "them")).toBeUndefined();
    expect(signedCashAmount("1.000", "me")).toBeUndefined();
    expect(signedCashAmount("1.000", "them")).toBeUndefined();
  });
});

describe("cashAmountValue, the API's ceiling", () => {
  it("keeps the ceiling itself", () => {
    expect(cashAmountValue("9999999")).toBe(9_999_999);
    expect(cashAmountValue("9999999,00")).toBe(9_999_999);
    expect(signedCashAmount("9999999", "them")).toBe(-9_999_999);
  });

  it.each(["10000000", "9999999,01"])(
    "reads %s above the ceiling as no cash",
    (raw) => {
      expect(cashAmountValue(raw)).toBe(0);
      expect(signedCashAmount(raw, "me")).toBeUndefined();
      expect(signedCashAmount(raw, "them")).toBeUndefined();
    },
  );
});
