/** @format */

import { describe, expect, it } from "vitest";
import {
  isTlAmountRefused,
  parseTlAmount,
  tlAmountInputValue,
  tlAmountValue,
} from "./tlAmount";

describe("parseTlAmount", () => {
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

  it.each([
    "1.000",
    "1.250,50",
    "1,250.50",
    "12,345",
    "12,505",
    "0,005",
    "1.005",
    "1,2,3",
    "abc",
    "1e3",
    "-5",
    "1 000",
    "١٢",
    "１２",
    "9".repeat(400),
    "9".repeat(17),
  ])("refuses %j", (raw) => {
    expect(parseTlAmount(raw)).toEqual({ status: "refused" });
    expect(isTlAmountRefused(raw)).toBe(true);
    expect(tlAmountValue(raw)).toBe(0);
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
  ])("shows %j as %j", (amount, text) => {
    expect(tlAmountInputValue(amount)).toBe(text);
  });

  it("round-trips through the parser", () => {
    expect(parseTlAmount(tlAmountInputValue(1250.5))).toEqual({
      status: "ok",
      amount: 1250.5,
    });
  });
});
