/** @format */

import { describe, expect, it } from "vitest";
import { signedCashAmount } from "./cashAmount";

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
