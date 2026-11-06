import { describe, expect, it } from "vitest";
import type { AdminInstallmentRule } from "@tarodan/types";
import { fakeT } from "@/test-utils/dom";
import type { Translate } from "@/lib/statusLabels";
import { overlappingRules } from "./overlaps";
import { previewAmountOf, previewParamsOf } from "./preview";
import { fmtShare } from "./preview-columns";
import { parseRuleForm } from "./rule-form";
import {
  minAmountFormValues,
  minAmountOf,
  minAmountSchema,
} from "./settings-form";

const t = fakeT as unknown as Translate;

const messageOf = (minAmount: string) => {
  const result = minAmountSchema(t).safeParse({ minAmount });
  return result.success ? null : result.error.issues[0]?.message;
};

describe("minimum amount form", () => {
  it("accepts a TL amount, 0 included, and reads it as TL", () => {
    expect(messageOf("500")).toBeNull();
    expect(messageOf("0")).toBeNull();
    expect(messageOf("1250,50")).toBeNull();
    expect(minAmountOf({ minAmount: "1250,50" })).toBe(1250.5);
    // A dot is a decimal point, never grouping: "1.50" is 1,50 TL.
    expect(minAmountOf({ minAmount: "1.50" })).toBe(1.5);
    expect(minAmountOf({ minAmount: "0" })).toBe(0);
    expect(() => minAmountOf({ minAmount: "1.000" })).toThrow();
  });

  it("refuses grouping (1.000 is never 1 TL) and an empty field", () => {
    expect(messageOf("1.000,00")).toBe("validation.amountFormatRefused");
    expect(messageOf("")).toBe("validation.required");
  });

  it("refuses an amount above the shared maximum with the API's message", () => {
    expect(messageOf("1000000,01")).toBe(
      'server.admin.installments.minAmount.outOfRange|{"min":"0","max":"1.000.000"}',
    );
  });

  it("prefills with a decimal comma", () => {
    expect(minAmountFormValues(500)).toEqual({ minAmount: "500" });
    expect(minAmountFormValues(749.9)).toEqual({ minAmount: "749,90" });
  });
});

describe("preview query", () => {
  it("asks nothing without a valid amount or a family", () => {
    expect(
      previewParamsOf({ segment: "free", amountText: "", family: "bonus" }),
    ).toBeNull();
    expect(
      previewParamsOf({ segment: "free", amountText: "0", family: "bonus" }),
    ).toBeNull();
    expect(
      previewParamsOf({ segment: "free", amountText: "1000", family: "" }),
    ).toBeNull();
    expect(previewAmountOf("1000000,01")).toEqual({ status: "aboveMax" });
    // The maximum itself is priced (the API's @Max is inclusive).
    expect(previewAmountOf("1000000")).toEqual({
      status: "ok",
      amount: 1_000_000,
    });
    expect(previewAmountOf("0,01")).toEqual({ status: "ok", amount: 0.01 });
    // A well-formed 0 asks for an amount; it is not a refused format.
    expect(previewAmountOf("0,00")).toEqual({ status: "empty" });
    expect(previewAmountOf("1.000")).toEqual({ status: "refused" });
  });

  it("carries the draft and the replaced version", () => {
    expect(
      previewParamsOf({
        segment: "premium",
        amountText: "1.000",
        family: "bonus",
      }),
    ).toBeNull();
    expect(
      previewParamsOf({
        segment: "premium",
        amountText: "1000,50",
        family: "bonus",
        draft: {
          segment: "all",
          minCount: 2,
          maxCount: 3,
          allowed: true,
          platformSharePct: 50,
          priority: 1,
        },
        replacesRuleId: "rule-2",
      }),
    ).toEqual({
      segment: "premium",
      amount: 1000.5,
      family: "bonus",
      draftSegment: "all",
      draftMinCount: 2,
      draftMaxCount: 3,
      draftAllowed: true,
      draftPlatformSharePct: 50,
      draftPriority: 1,
      replacesRuleId: "rule-2",
    });
  });

  it("prices the live rules only when there is no draft", () => {
    expect(
      previewParamsOf({
        segment: "guest",
        amountText: "750",
        family: "world",
        replacesRuleId: "ignored-without-a-draft",
      }),
    ).toEqual({ segment: "guest", amount: 750, family: "world" });
  });
});

describe("overlappingRules", () => {
  const existing = (
    over: Partial<AdminInstallmentRule>,
  ): AdminInstallmentRule => ({
    id: "r1",
    lineageId: "l1",
    version: 1,
    name: "Everyone 2-6",
    segment: "all",
    minCount: 2,
    maxCount: 6,
    allowed: true,
    platformSharePct: 0,
    priority: 0,
    validFrom: "2026-01-01T00:00:00.000Z",
    validUntil: null,
    createdBy: "a",
    createdAt: "2026-01-01T00:00:00.000Z",
    archivedAt: null,
    archivedBy: null,
    status: "active",
    ...over,
  });
  const input = parseRuleForm({
    name: "Premium 3",
    segment: "premium",
    minCount: "3",
    maxCount: "3",
    allowed: true,
    platformSharePct: "100",
    priority: "0",
    validFrom: "2026-11-15T00:00",
    validUntil: "",
  });

  it("lists same-priority current rules that can meet the same buyer and count", () => {
    expect(
      overlappingRules(input, [
        existing({}),
        existing({ id: "r2", lineageId: "l2", priority: 1 }),
        existing({ id: "r3", lineageId: "l3", segment: "free" }),
        existing({ id: "r4", lineageId: "l4", archivedAt: "2026-02-01" }),
        existing({ id: "r5", lineageId: "l5", minCount: 4, maxCount: 6 }),
      ]),
    ).toEqual([
      { id: "r1", lineageId: "l1", version: 1, name: "Everyone 2-6" },
    ]);
  });

  it("leaves out the lineage being replaced and an invalid input", () => {
    expect(overlappingRules(input, [existing({})], "l1")).toEqual([]);
    expect(
      overlappingRules({ ...input, minCount: 9, maxCount: 2 }, [existing({})]),
    ).toEqual([]);
  });
});

describe("fmtShare", () => {
  it("shows a share as typed", () => {
    expect(fmtShare(100)).toBe("%100");
    expect(fmtShare(12.5)).toBe("%12,5");
    expect(fmtShare(33.33)).toBe("%33,33");
  });
});
