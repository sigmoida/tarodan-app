/** @format */

import { describe, expect, it } from "vitest";
import {
  cashAmountValue,
  cashInputValue,
  isCashRefused,
  parseCashInput,
  signedCashAmount,
} from "./cashAmount";

describe("parseCashInput", () => {
  it.each([
    ["12,50", 12.5],
    ["12.50", 12.5],
    ["1250", 1250],
    ["12,5", 12.5],
    ["12,", 12],
    [",5", 0.5],
    [" 7 ", 7],
  ])("accepts %j", (raw, amount) => {
    expect(parseCashInput(raw)).toEqual({ status: "ok", amount });
  });

  it.each(["", "  ", "0", "0,00", ","])("reads %j as empty", (raw) => {
    expect(parseCashInput(raw)).toEqual({ status: "empty" });
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
    expect(parseCashInput(raw)).toEqual({ status: "ok", amount });
  });

  it("refuses at the safe-integer cents boundary, not at whole lira", () => {
    // 2^53 - 1 cents is the largest amount held exactly.
    expect(parseCashInput("90071992547409,91")).toEqual({
      status: "ok",
      amount: 90071992547409.91,
    });
    expect(parseCashInput("90071992547409,92")).toEqual({ status: "refused" });
    expect(parseCashInput("90071992547410")).toEqual({ status: "refused" });
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
    expect(parseCashInput(raw)).toEqual({ status: "refused" });
    expect(isCashRefused(raw)).toBe(true);
    expect(cashAmountValue(raw)).toBe(0);
  });
});

describe("cashInputValue", () => {
  it.each([
    [1250.5, "1250,50"],
    [12, "12"],
    [0.5, "0,50"],
    [0, ""],
    [-3, ""],
    [Number.NaN, ""],
  ])("shows %j as %j", (amount, text) => {
    expect(cashInputValue(amount)).toBe(text);
  });

  it("round-trips through the parser", () => {
    expect(parseCashInput(cashInputValue(1250.5))).toEqual({
      status: "ok",
      amount: 1250.5,
    });
  });
});

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
