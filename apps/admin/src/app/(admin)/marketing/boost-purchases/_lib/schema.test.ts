import { describe, expect, it } from "vitest";
import { BOOST_GRANT_MAX_DAYS, BOOST_GRANT_MIN_DAYS } from "@tarodan/types";
import {
  grantBoostPayload,
  grantBoostSchema,
  isPartialRefund,
  refundBoostPayload,
  refundBoostSchema,
} from "./schema";

const t = ((key: string) => key) as never;

describe("refundBoostSchema", () => {
  const schema = refundBoostSchema(t, 59);
  const ok = (amount: string) =>
    schema.safeParse({ amount, reason: "Seller asked for it" }).success;

  it("accepts empty (all of it) and any amount above 0 up to the maximum", () => {
    expect(ok("")).toBe(true);
    expect(ok("0.01")).toBe(true);
    expect(ok("59")).toBe(true);
    expect(ok("59.00")).toBe(true);
  });

  it("refuses 0, more than the maximum, and more than two decimals", () => {
    expect(ok("0")).toBe(false);
    expect(ok("59.01")).toBe(false);
    expect(ok("1.005")).toBe(false);
    expect(ok("1e2")).toBe(false);
  });

  it.each(["0,00", ",", "50,", ",5", "1.000", "1.250,50"])(
    "refuses %j, which must not read as blank (refund all) or as 0",
    (amount) => {
      expect(ok(amount)).toBe(false);
    },
  );

  it("sends a comma amount exactly", () => {
    expect(refundBoostPayload({ amount: "20,57", reason: "why" })).toEqual({
      amount: 20.57,
      reason: "why",
    });
  });
});

describe("refund payload", () => {
  it("leaves an empty amount out and never adds an idempotency key", () => {
    expect(refundBoostPayload({ amount: " ", reason: " why " })).toEqual({
      reason: "why",
    });
    expect(refundBoostPayload({ amount: "20.5", reason: "why" })).toEqual({
      amount: 20.5,
      reason: "why",
    });
  });

  it("calls a refund below the maximum partial", () => {
    expect(isPartialRefund({ amount: "20", reason: "" }, 59)).toBe(true);
    expect(isPartialRefund({ amount: "59", reason: "" }, 59)).toBe(false);
    expect(isPartialRefund({ amount: "", reason: "" }, 59)).toBe(false);
  });
});

describe("grantBoostSchema", () => {
  const schema = grantBoostSchema(t);
  const valid = {
    productId: "U010001",
    packageId: "",
    durationDays: "7",
    reason: "Outage compensation",
  };
  const ok = (over: Partial<typeof valid>) =>
    schema.safeParse({ ...valid, ...over }).success;

  it("accepts the shared day limits themselves", () => {
    expect(BOOST_GRANT_MIN_DAYS).toBe(1);
    expect(BOOST_GRANT_MAX_DAYS).toBe(90);
    expect(ok({ durationDays: "1" })).toBe(true);
    expect(ok({ durationDays: "90" })).toBe(true);
  });

  it.each(["0", "91", "1.5", "-3", "", "abc", "1e1"])(
    "refuses %j days",
    (durationDays) => {
      expect(ok({ durationDays })).toBe(false);
    },
  );

  it("caps the listing reference at the DTO's 64 characters", () => {
    expect(ok({ productId: "x".repeat(64) })).toBe(true);
    expect(ok({ productId: "x".repeat(65) })).toBe(false);
    expect(ok({ productId: "   " })).toBe(false);
  });
});

describe("grantBoostPayload", () => {
  it("sends the package only when one is chosen", () => {
    expect(
      grantBoostPayload({
        productId: " U010001 ",
        packageId: "pkg-1",
        durationDays: "7",
        reason: " Outage compensation ",
      }),
    ).toEqual({
      productId: "U010001",
      packageId: "pkg-1",
      durationDays: 7,
      reason: "Outage compensation",
    });
    expect(
      grantBoostPayload({
        productId: "U010001",
        packageId: "",
        durationDays: "90",
        reason: "Outage compensation",
      }),
    ).not.toHaveProperty("packageId");
  });
});
