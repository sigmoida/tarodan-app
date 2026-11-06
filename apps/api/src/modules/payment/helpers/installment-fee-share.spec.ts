import { Prisma, RefundAttemptStatus } from "@prisma/client";
import {
  installmentFeeShareOf,
  refundFeeShareFor,
  type FeeShareReader,
  type InstallmentFeeShareInput,
  type PriorFeeRefund,
} from "./charged-amount";

/**
 * D7 (ADR 0019, plan 4.4 and 5.6): the vade farkı follows the cash refunded,
 * pro rata per order; the refund that completes the order's (or the
 * payment's) goods refunds takes the remaining fee. PayTR `return_amount` =
 * goods part + this share.
 */
const d = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);

/** One order paid alone: the order and the payment are the same totals. */
function single(
  fee: string,
  total: string,
  goodsRefund: string,
  priorRefunds: PriorFeeRefund[] = [],
): InstallmentFeeShareInput {
  return {
    orderId: "o1",
    orderFee: d(fee),
    orderGoodsTotal: d(total),
    paymentFee: d(fee),
    paymentGoodsTotal: d(total),
    priorRefunds,
    goodsRefund: d(goodsRefund),
  };
}

/** A finished refund of `goods` with fee share `fee` (PSP amount = sum). */
function prior(orderId: string, goods: string, fee: string): PriorFeeRefund {
  return {
    orderId,
    amount: d(goods).plus(fee),
    installmentFeeAmount: d(fee),
  };
}

/** Runs refunds one after the other, feeding each share into the next. */
function refundInSteps(
  base: Omit<InstallmentFeeShareInput, "goodsRefund" | "priorRefunds">,
  steps: Array<{ orderId?: string; goods: string }>,
): string[] {
  const done: PriorFeeRefund[] = [];
  return steps.map((step) => {
    const orderId = step.orderId ?? base.orderId;
    const fee = installmentFeeShareOf({
      ...base,
      orderId,
      orderFee: orderId === base.orderId ? base.orderFee : d(0),
      priorRefunds: done,
      goodsRefund: d(step.goods),
    });
    done.push(prior(orderId, step.goods, fee.toFixed(2)));
    return d(step.goods).plus(fee).toFixed(2);
  });
}

describe("installmentFeeShareOf: the plan's worked examples (1,000.00 TL, 3 installments)", () => {
  describe("k = 0 (F 54.35, C 1,054.35)", () => {
    it("a full refund returns C: 1,054.35", () => {
      const fee = installmentFeeShareOf(single("54.35", "1000.00", "1000.00"));
      expect(fee.toFixed(2)).toBe("54.35");
      expect(d("1000.00").plus(fee).toFixed(2)).toBe("1054.35");
    });

    it("400.00 then 600.00 returns 421.74 then 632.61 (the last takes the rest)", () => {
      expect(
        refundInSteps(
          {
            orderId: "o1",
            orderFee: d("54.35"),
            orderGoodsTotal: d("1000.00"),
            paymentFee: d("54.35"),
            paymentGoodsTotal: d("1000.00"),
          },
          [{ goods: "400.00" }, { goods: "600.00" }],
        ),
      ).toEqual(["421.74", "632.61"]);
    });

    it("a buyer-remorse return with 60.00 return shipping kept returns 991.09", () => {
      const fee = installmentFeeShareOf(single("54.35", "1000.00", "940.00"));
      expect(fee.toFixed(2)).toBe("51.09");
      expect(d("940.00").plus(fee).toFixed(2)).toBe("991.09");
    });
  });

  describe("k = 1/6 (F 66.38, C 1,066.38)", () => {
    it("a full refund returns 1,066.38", () => {
      expect(
        installmentFeeShareOf(single("66.38", "1000.00", "1000.00")).toFixed(2),
      ).toBe("66.38");
    });

    it("400.00 then 600.00 returns 426.55 then 639.83", () => {
      expect(
        refundInSteps(
          {
            orderId: "o1",
            orderFee: d("66.38"),
            orderGoodsTotal: d("1000.00"),
            paymentFee: d("66.38"),
            paymentGoodsTotal: d("1000.00"),
          },
          [{ goods: "400.00" }, { goods: "600.00" }],
        ),
      ).toEqual(["426.55", "639.83"]);
    });

    it("940.00 with return shipping kept returns 1,002.40 (3.98 of F stays)", () => {
      const fee = installmentFeeShareOf(single("66.38", "1000.00", "940.00"));
      expect(fee.toFixed(2)).toBe("62.40");
      expect(d("66.38").minus(fee).toFixed(2)).toBe("3.98");
    });
  });
});

describe("installmentFeeShareOf: many partial refunds", () => {
  const base = {
    orderId: "o1",
    orderFee: d("66.38"),
    orderGoodsTotal: d("1000.00"),
    paymentFee: d("66.38"),
    paymentGoodsTotal: d("1000.00"),
  };

  it("three thirds sum to F exactly (cumulative rounding, no drift)", () => {
    const cash = refundInSteps(base, [
      { goods: "333.33" },
      { goods: "333.33" },
      { goods: "333.34" },
    ]);
    // round2(66.38 * 333.33 / 1000) = 22.13; cumulative 44.25 -> +22.12; rest 22.13.
    expect(cash).toEqual(["355.46", "355.45", "355.47"]);
    const fees = cash.map((c, i) =>
      d(c).minus(["333.33", "333.33", "333.34"][i]),
    );
    expect(fees.reduce((s, f) => s.plus(f), d(0)).toFixed(2)).toBe("66.38");
  });

  it("a hundred 10.00 refunds give back F to the kuruş, never more", () => {
    const cash = refundInSteps(
      base,
      Array.from({ length: 100 }, () => ({ goods: "10.00" })),
    );
    const fees = cash.map((c) => d(c).minus("10.00"));
    expect(fees.every((f) => f.gte(0) && f.lte("0.67"))).toBe(true);
    expect(fees.reduce((s, f) => s.plus(f), d(0)).toFixed(2)).toBe("66.38");
  });

  it("odd amounts with one kuruş fees sum to F", () => {
    const cash = refundInSteps(
      {
        orderId: "o1",
        orderFee: d("0.07"),
        orderGoodsTotal: d("123.45"),
        paymentFee: d("0.07"),
        paymentGoodsTotal: d("123.45"),
      },
      [
        { goods: "0.01" },
        { goods: "17.29" },
        { goods: "50.00" },
        { goods: "0.15" },
        { goods: "56.00" },
      ],
    );
    const goods = ["0.01", "17.29", "50.00", "0.15", "56.00"];
    const fees = cash.map((c, i) => d(c).minus(goods[i]));
    expect(fees.map((f) => f.toFixed(2))).toEqual([
      "0.00",
      "0.01",
      "0.03",
      "0.00",
      "0.03",
    ]);
    expect(fees.reduce((s, f) => s.plus(f), d(0)).toFixed(2)).toBe("0.07");
  });

  it("a partial refund never takes more than the fee left", () => {
    // The fee was already over-given (a hand repair): nothing more.
    expect(
      installmentFeeShareOf(
        single("66.38", "1000.00", "100.00", [prior("o1", "100.00", "60.00")]),
      ).toFixed(2),
    ).toBe("0.00");
  });

  it("the completing refund takes exactly the rest, also after uneven shares", () => {
    expect(
      installmentFeeShareOf(
        single("66.38", "1000.00", "500.00", [prior("o1", "500.00", "30.00")]),
      ).toFixed(2),
    ).toBe("36.38");
  });

  it("a refund within a kuruş of the order total completes it", () => {
    expect(
      installmentFeeShareOf(single("66.38", "1000.00", "999.99")).toFixed(2),
    ).toBe("66.38");
  });
});

describe("installmentFeeShareOf: no fee to give", () => {
  it("is 0 for a single payment (no fee)", () => {
    expect(
      installmentFeeShareOf(single("0", "1000.00", "1000.00")).toFixed(2),
    ).toBe("0.00");
  });

  it("is 0 for a zero-cash settlement, even after a partial refund", () => {
    expect(
      installmentFeeShareOf(
        single("66.38", "1000.00", "0", [prior("o1", "400.00", "26.55")]),
      ).toFixed(2),
    ).toBe("0.00");
  });

  it("is 0 once the order's fee is fully given back", () => {
    expect(
      installmentFeeShareOf(
        single("66.38", "1000.00", "10.00", [prior("o1", "990.00", "66.38")]),
      ).toFixed(2),
    ).toBe("0.00");
  });
});

describe("installmentFeeShareOf: a cart (F allocated per order)", () => {
  // Plan 4.4: orders 600.00 and 400.00, F 66.38 split 39.83 / 26.55.
  const cart = (
    orderId: "big" | "small",
    goodsRefund: string,
    priorRefunds: PriorFeeRefund[] = [],
  ): InstallmentFeeShareInput => ({
    orderId,
    orderFee: d(orderId === "big" ? "39.83" : "26.55"),
    orderGoodsTotal: d(orderId === "big" ? "600.00" : "400.00"),
    paymentFee: d("66.38"),
    paymentGoodsTotal: d("1000.00"),
    priorRefunds,
    goodsRefund: d(goodsRefund),
  });

  it("refunds each order with its own share", () => {
    expect(installmentFeeShareOf(cart("big", "600.00")).toFixed(2)).toBe(
      "39.83",
    );
    expect(installmentFeeShareOf(cart("small", "400.00")).toFixed(2)).toBe(
      "26.55",
    );
  });

  it("a partial refund of one order reads only that order's prior refunds", () => {
    // The other order's full refund does not move this order's ratio.
    expect(
      installmentFeeShareOf(
        cart("small", "200.00", [prior("big", "600.00", "39.83")]),
      ).toFixed(2),
    ).toBe("13.28");
  });

  it("the refund that brings the whole payment back takes the rest of F", () => {
    // The small order kept 10.00 of shipping (fee share 0.66 stayed), then
    // the big order's refund closes the package and returns that shipping
    // too: every goods kuruş of the payment is back, so is every fee kuruş.
    const smallFee = installmentFeeShareOf(cart("small", "390.00"));
    expect(smallFee.toFixed(2)).toBe("25.89");
    const bigFee = installmentFeeShareOf(
      cart("big", "610.00", [prior("small", "390.00", smallFee.toFixed(2))]),
    );
    expect(bigFee.toFixed(2)).toBe("40.49");
    expect(smallFee.plus(bigFee).toFixed(2)).toBe("66.38");
  });

  it("counts a sibling refund still in flight as given (no double count)", () => {
    // The sibling's attempt is submitting: its goods and fee count, so the
    // payment-level rest is not handed out twice.
    expect(
      installmentFeeShareOf(
        cart("big", "600.00", [prior("small", "400.00", "26.55")]),
      ).toFixed(2),
    ).toBe("39.83");
  });
});

describe("refundFeeShareFor (reads the inputs in the claim transaction)", () => {
  function reader(opts: {
    payment: { amount: string; installmentFeeAmount: string } | null;
    orderFee?: string;
    attempts?: PriorFeeRefund[];
  }) {
    const findMany = jest.fn(async () => opts.attempts ?? []);
    const orderFind = jest.fn(async () =>
      opts.orderFee == null ? null : { installmentFeeAmount: d(opts.orderFee) },
    );
    const db = {
      payment: {
        findUnique: jest.fn(async () =>
          opts.payment
            ? {
                amount: d(opts.payment.amount),
                installmentFeeAmount: d(opts.payment.installmentFeeAmount),
              }
            : null,
        ),
      },
      order: { findUnique: orderFind },
      refundAttempt: { findMany },
    };
    return { db: db as unknown as FeeShareReader, findMany, orderFind };
  }

  it("asks for nothing more when the payment has no fee", async () => {
    const { db, findMany, orderFind } = reader({
      payment: { amount: "1000.00", installmentFeeAmount: "0" },
    });
    const fee = await refundFeeShareFor(db, {
      paymentId: "p1",
      orderId: "o1",
      orderGoodsTotal: "1000.00",
      goodsRefund: "1000.00",
    });
    expect(fee.toFixed(2)).toBe("0.00");
    expect(findMany).not.toHaveBeenCalled();
    expect(orderFind).not.toHaveBeenCalled();
  });

  it("reads every non-failed order refund of the payment, the attempt itself left out", async () => {
    const { db, findMany } = reader({
      payment: { amount: "1000.00", installmentFeeAmount: "66.38" },
      orderFee: "66.38",
      attempts: [prior("o1", "400.00", "26.55")],
    });
    const fee = await refundFeeShareFor(db, {
      paymentId: "p1",
      orderId: "o1",
      orderGoodsTotal: "1000.00",
      goodsRefund: "600.00",
      excludeAttemptId: "a2",
    });
    expect(fee.toFixed(2)).toBe("39.83");
    expect(findMany).toHaveBeenCalledWith({
      where: {
        paymentId: "p1",
        orderId: { not: null },
        status: { not: RefundAttemptStatus.failed },
        id: { not: "a2" },
      },
      select: { orderId: true, amount: true, installmentFeeAmount: true },
    });
  });
});
