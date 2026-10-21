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

  it("keeps exact cents without a floating-point step", () => {
    expect(parseCashInput("1,29")).toEqual({ status: "ok", amount: 1.29 });
    expect(parseCashInput("0,01")).toEqual({ status: "ok", amount: 0.01 });
    expect(parseCashInput("99999999,99")).toEqual({
      status: "ok",
      amount: 99999999.99,
    });
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
    expect(signedCashAmount("1.000", "me")).toBeUndefined();
  });
});
