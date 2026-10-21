import { describe, expect, it } from "vitest";
import { refundPaymentSchema } from "./schema";

const t = ((key: string) => key) as never;

/** Refunds: blank refunds all, so nothing else may read as blank or as 0. */
describe("refundPaymentSchema amount", () => {
  const schema = refundPaymentSchema(t, 500);
  const ok = (amount: string | undefined) =>
    schema.safeParse({ amount, reason: "" }).success;

  it("accepts blank (refund all) and amounts above 0 up to the total", () => {
    expect(ok(undefined)).toBe(true);
    expect(ok("")).toBe(true);
    expect(ok("  ")).toBe(true);
    expect(ok("0,01")).toBe(true);
    expect(ok("50,25")).toBe(true);
    expect(ok("500")).toBe(true);
    expect(ok("500,00")).toBe(true);
  });

  it.each(["0", "0,00", "0.0", ",", ".", "50,", ",5", "50."])(
    "refuses %j, so it never refunds all or nothing by accident",
    (amount) => {
      expect(ok(amount)).toBe(false);
    },
  );

  it.each(["1.000", "1.250,50", "12,345", "-5", "1e2", "abc", "500,01"])(
    "refuses %j",
    (amount) => {
      expect(ok(amount)).toBe(false);
    },
  );
});
