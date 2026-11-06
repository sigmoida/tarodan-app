import { Prisma } from "@prisma/client";
import {
  chargeAttemptByOid,
  chargedAmountOf,
  expectedPaytrChargeFor,
  orderChargedTotalOf,
  orderInstallmentFeeOf,
  paytrAmountMatches,
  paytrChargeExpectationsOf,
  paytrChargeExpectationsForPayments,
  paytrChargeCovers,
  paytrKurusMatches,
  refundGoodsPartOf,
  type ChargeAttemptReader,
} from "./charged-amount";

const d = (value: string) => new Prisma.Decimal(value);

describe("chargedAmountOf", () => {
  it("reads a legacy payment (no charged amount) as its goods total", () => {
    expect(
      chargedAmountOf({ amount: d("1000.00"), chargedAmount: null }).toFixed(2),
    ).toBe("1000.00");
  });

  it("reads a captured installment payment as the charged total C = T + F", () => {
    // Plan 4.4: 1,000.00 TL cart, 3 installments, default rule, k = 1/6.
    expect(
      chargedAmountOf({
        amount: d("1000.00"),
        chargedAmount: d("1066.38"),
      }).toFixed(2),
    ).toBe("1066.38");
  });

  it("reads a single payment captured through an attempt as its charged amount", () => {
    expect(
      chargedAmountOf({
        amount: d("250.50"),
        chargedAmount: d("250.50"),
      }).toFixed(2),
    ).toBe("250.50");
  });

  it("keeps the Decimal (no float rounding)", () => {
    const charged = chargedAmountOf({
      amount: d("0.10"),
      chargedAmount: d("0.30"),
    });
    expect(Prisma.Decimal.isDecimal(charged)).toBe(true);
    expect(charged.minus(d("0.10")).toFixed(2)).toBe("0.20");
  });
});

describe("orderChargedTotalOf", () => {
  it("adds the order's allocated fee to its goods total", () => {
    // Plan 4.4: two sellers, orders 600.00 and 400.00, F 66.38 split 39.83 /
    // 26.55 by largest remainder.
    expect(
      orderChargedTotalOf({
        totalAmount: d("600.00"),
        installmentFeeAmount: d("39.83"),
      }).toFixed(2),
    ).toBe("639.83");
    expect(
      orderChargedTotalOf({
        totalAmount: d("400.00"),
        installmentFeeAmount: d("26.55"),
      }).toFixed(2),
    ).toBe("426.55");
  });

  it("is the goods total for a single payment or a legacy order", () => {
    expect(
      orderChargedTotalOf({
        totalAmount: d("837.50"),
        installmentFeeAmount: d("0"),
      }).toFixed(2),
    ).toBe("837.50");
  });
});

describe("refundGoodsPartOf", () => {
  it("takes the fee share out of the PSP refund amount", () => {
    // Plan 4.4: one item of 400.00 refunded, return_amount 426.55.
    expect(
      refundGoodsPartOf({
        amount: d("426.55"),
        installmentFeeAmount: d("26.55"),
      }).toFixed(2),
    ).toBe("400.00");
  });

  it("is the whole amount for a refund without a fee share", () => {
    expect(
      refundGoodsPartOf({
        amount: d("120.00"),
        installmentFeeAmount: d("0"),
      }).toFixed(2),
    ).toBe("120.00");
  });
});

describe("orderInstallmentFeeOf", () => {
  it("reads the order's allocated fee share", () => {
    expect(
      orderInstallmentFeeOf({ installmentFeeAmount: d("39.83") }).toFixed(2),
    ).toBe("39.83");
  });
});

/**
 * The PSP-scale expectation per merchant_oid (plan 5.6): a form signed with
 * an attempt is checked against that attempt's C, also after a later form
 * superseded it; anything else against the legacy rule.
 */
describe("expected PayTR charge by oid", () => {
  const pending = { id: "pay-1", amount: d("1000.00"), chargedAmount: null };
  const attempts = [
    { merchantOid: "ORD1A", chargedAmount: d("1066.38") }, // 3 x, superseded
    { merchantOid: "ORD1B", chargedAmount: d("1000.00") }, // single, current
  ];
  const reader = () => {
    const paymentChargeAttempt = {
      findFirst: jest.fn(
        async ({
          where,
        }: {
          where: { merchantOid: string; paymentId: string };
        }) =>
          where.paymentId === "pay-1"
            ? (attempts.find((a) => a.merchantOid === where.merchantOid) ??
              null)
            : null,
      ),
      findMany: jest.fn(async (_args: unknown) => attempts),
    };
    return {
      paymentChargeAttempt,
      db: { paymentChargeAttempt } as unknown as ChargeAttemptReader,
    };
  };

  it("checks a late callback of a superseded attempt against its own C", async () => {
    expect(
      (await expectedPaytrChargeFor(reader().db, pending, "ORD1A")).toFixed(2),
    ).toBe("1066.38");
    expect(
      (await expectedPaytrChargeFor(reader().db, pending, "ORD1B")).toFixed(2),
    ).toBe("1000.00");
  });

  it("falls back to the legacy amount for an oid signed before attempts", async () => {
    expect(
      (await expectedPaytrChargeFor(reader().db, pending, "ORD1OLD")).toFixed(
        2,
      ),
    ).toBe("1000.00");
  });

  it("falls back to the captured charged amount of a completed payment", async () => {
    const captured = { ...pending, chargedAmount: d("1066.38") };
    expect(
      (await expectedPaytrChargeFor(reader().db, captured, "ORD1OLD")).toFixed(
        2,
      ),
    ).toBe("1066.38");
  });

  it("reads only THIS payment's attempt for the oid", async () => {
    const { db, paymentChargeAttempt } = reader();
    await chargeAttemptByOid(db, "pay-1", "ORD1A");
    expect(paymentChargeAttempt.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { merchantOid: "ORD1A", paymentId: "pay-1" },
      }),
    );
    expect(await chargeAttemptByOid(db, "pay-2", "ORD1A")).toBeNull();
  });

  it("maps every oid of a payment with one query (the sweeps)", async () => {
    const { db, paymentChargeAttempt } = reader();
    const expectedFor = await paytrChargeExpectationsOf(db, pending);
    expect(expectedFor("ORD1A").toFixed(2)).toBe("1066.38");
    expect(expectedFor("ORD1B").toFixed(2)).toBe("1000.00");
    expect(expectedFor("ORD1OLD").toFixed(2)).toBe("1000.00");
    expect(paymentChargeAttempt.findMany).toHaveBeenCalledTimes(1);
    expect(paymentChargeAttempt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { paymentId: "pay-1" } }),
    );
  });

  it("maps a whole sweep batch with one query, each attempt only for its own payment", async () => {
    const other = { id: "pay-2", amount: d("500.00"), chargedAmount: null };
    const findMany = jest.fn(async (_args: unknown) => [
      { paymentId: "pay-1", ...attempts[0] },
      { paymentId: "pay-1", ...attempts[1] },
      // The same oid string under another payment never leaks across.
      { paymentId: "pay-2", merchantOid: "ORD1B", chargedAmount: d("533.20") },
    ]);
    const db = {
      paymentChargeAttempt: { findFirst: jest.fn(), findMany },
    } as unknown as ChargeAttemptReader;

    const expectedOf = await paytrChargeExpectationsForPayments(db, [
      pending,
      other,
    ]);

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { paymentId: { in: ["pay-1", "pay-2"] } },
      }),
    );
    expect(expectedOf(pending, "ORD1A").toFixed(2)).toBe("1066.38");
    expect(expectedOf(pending, "ORD1B").toFixed(2)).toBe("1000.00");
    expect(expectedOf(other, "ORD1B").toFixed(2)).toBe("533.20");
    expect(expectedOf(other, "ORD1A").toFixed(2)).toBe("500.00");
  });

  it("asks nothing for an empty batch", async () => {
    const findMany = jest.fn();
    const db = {
      paymentChargeAttempt: { findFirst: jest.fn(), findMany },
    } as unknown as ChargeAttemptReader;
    await paytrChargeExpectationsForPayments(db, []);
    expect(findMany).not.toHaveBeenCalled();
  });
});

describe("paytrAmountMatches / paytrKurusMatches (the one comparison rule)", () => {
  it.each`
    reported        | expected     | matches
    ${1066.38}      | ${"1066.38"} | ${true}
    ${1066.43}      | ${"1066.38"} | ${true}
    ${1066.44}      | ${"1066.38"} | ${false}
    ${1000}         | ${"1066.38"} | ${false}
    ${"1066.33"}    | ${"1066.38"} | ${true}
    ${d("1066.38")} | ${1066.38}   | ${true}
  `(
    "TL $reported vs $expected within 0.05: $matches",
    ({ reported, expected, matches }) => {
      expect(paytrAmountMatches(reported, expected, 0.05)).toBe(matches);
    },
  );

  it.each([NaN, Infinity, "abc", "", "1e3"])(
    "never matches a value that is not an amount (%p): fail closed",
    (reported) => {
      expect(paytrAmountMatches(reported, d("1000.00"), 0.05)).toBe(false);
    },
  );

  it("reads the callback's kuruş", () => {
    expect(paytrKurusMatches("106638", d("1066.38"), 0.05)).toBe(true);
    // The goods total T instead of C: not completed (plan 6.1).
    expect(paytrKurusMatches("100000", d("1066.38"), 0.05)).toBe(false);
  });

  it.each(["", "abc", "1066.38", "-100", " "])(
    "never matches a kuruş value that is not whole digits (%p)",
    (reported) => {
      expect(paytrKurusMatches(reported, d("1066.38"), 0.05)).toBe(false);
    },
  );
});

describe("paytrChargeCovers (kuruş scale)", () => {
  it.each`
    charged         | required     | covers
    ${d("1066.38")} | ${"1000.00"} | ${true}
    ${d("1066.38")} | ${"1066.38"} | ${true}
    ${d("1066.38")} | ${"1066.39"} | ${false}
    ${"1000.004"}   | ${"1000.00"} | ${true}
    ${"999.995"}    | ${"1000.00"} | ${true}
    ${"999.994"}    | ${"1000.00"} | ${false}
    ${NaN}          | ${"1000.00"} | ${false}
    ${"abc"}        | ${"1000.00"} | ${false}
  `("$charged covers $required: $covers", ({ charged, required, covers }) => {
    expect(paytrChargeCovers(charged, required)).toBe(covers);
  });
});
