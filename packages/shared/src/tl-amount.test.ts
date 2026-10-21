import { describe, expect, it } from "vitest";
import {
  STRICT_TL_AMOUNT,
  ZERO_TL_AMOUNT,
  isOptionalTlAmountWithin,
  isTlAmountRefused,
  optionalTlAmountPayload,
  parseTlAmount,
  tlAmountInputValue,
  tlAmountValue,
} from "./tl-amount";

/** Refused under every rule set: the shape itself is wrong. */
const ALWAYS_REFUSED = [
  "1.000",
  "1.250",
  "1.250,50",
  "1,250",
  "1,250.50",
  "12,345",
  "12,505",
  "0,005",
  "1.005",
  "1,2,3",
  "50,2,5",
  // One separator only, also when two sit side by side.
  "12,,5",
  "1.,50",
  "1,.5",
  "..",
  "abc",
  "1e3",
  "1e2",
  "-5",
  "1 000",
  "١٢",
  "１２",
  "9".repeat(400),
  "9".repeat(17),
];

describe("parseTlAmount (default rules: web input fields)", () => {
  it.each([
    ["12,50", 12.5],
    ["12.50", 12.5],
    ["1250", 1250],
    ["1000", 1000],
    ["1250,50", 1250.5],
    ["12,5", 12.5],
    ["12,", 12],
    [",5", 0.5],
    [" 7 ", 7],
  ])("accepts %j", (raw, amount) => {
    expect(parseTlAmount(raw)).toEqual({ status: "ok", amount });
  });

  it.each(["", "  ", "0", "0,00", ","])("reads %j as empty", (raw) => {
    expect(parseTlAmount(raw)).toEqual({ status: "empty" });
  });

  it.each([
    ["1,29", 1.29],
    ["0,57", 0.57],
    ["0.57", 0.57],
    ["4.35", 4.35],
    ["0,01", 0.01],
    ["0.01", 0.01],
    ["99999999,99", 99999999.99],
    ["99999999.99", 99999999.99],
  ])("keeps %j as exact cents without a floating-point step", (raw, amount) => {
    // "0.57" read as one float and scaled is 56.99999999999999 cents; the
    // dot must split into digit strings exactly like the comma.
    expect(parseTlAmount(raw)).toEqual({ status: "ok", amount });
  });

  it("refuses at the safe-integer cents boundary, not at whole lira", () => {
    // 2^53 - 1 cents is the largest amount held exactly.
    expect(parseTlAmount("90071992547409,91")).toEqual({
      status: "ok",
      amount: 90071992547409.91,
    });
    expect(parseTlAmount("90071992547409,92")).toEqual({ status: "refused" });
    expect(parseTlAmount("90071992547410")).toEqual({ status: "refused" });
  });

  it.each(ALWAYS_REFUSED)("refuses %j", (raw) => {
    expect(parseTlAmount(raw)).toEqual({ status: "refused" });
    expect(isTlAmountRefused(raw)).toBe(true);
    expect(tlAmountValue(raw)).toBe(0);
  });
});

describe("parseTlAmount with STRICT_TL_AMOUNT (refunds)", () => {
  it.each([
    ["50,25", 50.25],
    ["50.25", 50.25],
    [" 59 ", 59],
    ["0,5", 0.5],
    ["0,01", 0.01],
    ["1250,50", 1250.5],
  ])("accepts %j", (raw, amount) => {
    expect(parseTlAmount(raw, STRICT_TL_AMOUNT)).toEqual({
      status: "ok",
      amount,
    });
  });

  it.each(["", "   "])("reads only blank text %j as empty", (raw) => {
    expect(parseTlAmount(raw, STRICT_TL_AMOUNT)).toEqual({ status: "empty" });
  });

  it.each(["0", "0,00", "0.0", "50,", ",5", ",", "."])(
    "refuses %j, so it can never mean 'refund all'",
    (raw) => {
      expect(parseTlAmount(raw, STRICT_TL_AMOUNT)).toEqual({
        status: "refused",
      });
    },
  );

  it.each(ALWAYS_REFUSED)("refuses %j", (raw) => {
    expect(parseTlAmount(raw, STRICT_TL_AMOUNT)).toEqual({
      status: "refused",
    });
  });
});

describe("parseTlAmount with ZERO_TL_AMOUNT (0 is a real value)", () => {
  it.each(["0", "0,00", ",", "0,"])("reads %j as the amount 0", (raw) => {
    expect(parseTlAmount(raw, ZERO_TL_AMOUNT)).toEqual({
      status: "ok",
      amount: 0,
    });
  });

  it("keeps blank text empty and grouping refused", () => {
    expect(parseTlAmount("", ZERO_TL_AMOUNT)).toEqual({ status: "empty" });
    expect(parseTlAmount("1.000", ZERO_TL_AMOUNT)).toEqual({
      status: "refused",
    });
    expect(parseTlAmount("1000", ZERO_TL_AMOUNT)).toEqual({
      status: "ok",
      amount: 1000,
    });
  });
});

describe("tlAmountInputValue", () => {
  it.each([
    [1250.5, "1250,50"],
    [12, "12"],
    [0.5, "0,50"],
    [0, ""],
    [-3, ""],
    [Number.NaN, ""],
    [Number.POSITIVE_INFINITY, ""],
  ])("shows %j as %j", (amount, text) => {
    expect(tlAmountInputValue(amount)).toBe(text);
  });

  it("shows 0 only where 0 is a real value", () => {
    expect(tlAmountInputValue(0, ZERO_TL_AMOUNT)).toBe("0");
    expect(tlAmountInputValue(-1, ZERO_TL_AMOUNT)).toBe("");
  });

  it("round-trips through the parser", () => {
    expect(parseTlAmount(tlAmountInputValue(1250.5))).toEqual({
      status: "ok",
      amount: 1250.5,
    });
    expect(parseTlAmount(tlAmountInputValue(1250.5), STRICT_TL_AMOUNT)).toEqual(
      { status: "ok", amount: 1250.5 },
    );
  });
});

describe("isOptionalTlAmountWithin", () => {
  it("accepts blank text and amounts above 0 up to the maximum", () => {
    expect(isOptionalTlAmountWithin("", 59)).toBe(true);
    expect(isOptionalTlAmountWithin("59,00", 59)).toBe(true);
    expect(isOptionalTlAmountWithin("0,01", 59)).toBe(true);
  });

  it("refuses 0, a bare separator, above the maximum and grouping", () => {
    expect(isOptionalTlAmountWithin("0", 59)).toBe(false);
    expect(isOptionalTlAmountWithin("0,00", 59)).toBe(false);
    expect(isOptionalTlAmountWithin("50,", 59)).toBe(false);
    expect(isOptionalTlAmountWithin(",5", 59)).toBe(false);
    expect(isOptionalTlAmountWithin("59,01", 59)).toBe(false);
    expect(isOptionalTlAmountWithin("1.250,50", 2000)).toBe(false);
    expect(isOptionalTlAmountWithin("1.000", 2000)).toBe(false);
  });
});

describe("optionalTlAmountPayload", () => {
  it("is undefined only for blank text", () => {
    expect(optionalTlAmountPayload(" ")).toBeUndefined();
    expect(optionalTlAmountPayload("20,5")).toBe(20.5);
  });

  it.each(["50,2,5", "0", "50,", ",5", "1.000"])(
    "throws on %j instead of sending it as 'all'",
    (raw) => {
      expect(() => optionalTlAmountPayload(raw)).toThrow();
    },
  );
});
