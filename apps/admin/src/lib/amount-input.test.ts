import { describe, expect, it } from "vitest";
import {
  isOptionalTlAmountWithin,
  optionalTlAmountPayload,
  parseTlAmount,
} from "./amount-input";

describe("parseTlAmount", () => {
  it("reads a decimal comma or point with up to two decimals", () => {
    expect(parseTlAmount("50,25")).toBe(50.25);
    expect(parseTlAmount("50.25")).toBe(50.25);
    expect(parseTlAmount(" 59 ")).toBe(59);
    expect(parseTlAmount("0,5")).toBe(0.5);
  });

  it("refuses thousands separators, signs, exponents and stray text", () => {
    for (const text of [
      "1.250",
      "1.250,50",
      "1,250",
      "-5",
      "1e2",
      "50,",
      ",5",
      "abc",
      "",
    ]) {
      expect(parseTlAmount(text)).toBeNull();
    }
  });
});

describe("isOptionalTlAmountWithin", () => {
  it("accepts empty and amounts above 0 up to the maximum", () => {
    expect(isOptionalTlAmountWithin("", 59)).toBe(true);
    expect(isOptionalTlAmountWithin("59,00", 59)).toBe(true);
    expect(isOptionalTlAmountWithin("0,01", 59)).toBe(true);
  });

  it("refuses 0, above the maximum and text that is not an amount", () => {
    expect(isOptionalTlAmountWithin("0", 59)).toBe(false);
    expect(isOptionalTlAmountWithin("59,01", 59)).toBe(false);
    expect(isOptionalTlAmountWithin("1.250,50", 2000)).toBe(false);
  });
});

describe("optionalTlAmountPayload", () => {
  it("is undefined only for an empty field", () => {
    expect(optionalTlAmountPayload(" ")).toBeUndefined();
    expect(optionalTlAmountPayload("20,5")).toBe(20.5);
  });

  it("throws instead of sending text that is not an amount as 'all'", () => {
    expect(() => optionalTlAmountPayload("50,2,5")).toThrow();
  });
});
