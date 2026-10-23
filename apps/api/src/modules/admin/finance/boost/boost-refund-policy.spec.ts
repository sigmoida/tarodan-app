import {
  BoostSource,
  BoostStatus,
  PaymentStatus,
  Prisma,
} from "@prisma/client";
import {
  boostRefundableAmount,
  type BoostRefundFacts,
} from "./boost-refund-policy";

const D = (v: number | string) => new Prisma.Decimal(v);

const facts = (over: Partial<BoostRefundFacts> = {}): BoostRefundFacts => ({
  source: BoostSource.purchase,
  status: BoostStatus.active,
  price: D(59),
  refundedAmount: null,
  orderId: "order-1",
  payment: { status: PaymentStatus.completed, amount: D(59), metadata: {} },
  ...over,
});

describe("boostRefundableAmount", () => {
  it("is the full price of a running paid boost", () => {
    expect(boostRefundableAmount(facts()).toNumber()).toBe(59);
  });

  it("is the full price of a paused one too", () => {
    expect(
      boostRefundableAmount(facts({ status: BoostStatus.paused })).toNumber(),
    ).toBe(59);
  });

  it("keeps kuruş exact", () => {
    expect(
      boostRefundableAmount(
        facts({
          price: D("149.90"),
          payment: {
            status: PaymentStatus.completed,
            amount: D("149.90"),
            metadata: {},
          },
        }),
      ).toString(),
    ).toBe("149.9");
  });

  it("subtracts what was refunded on the boost already", () => {
    expect(
      boostRefundableAmount(facts({ refundedAmount: D("20.50") })).toNumber(),
    ).toBe(38.5);
  });

  it("never exceeds what the payment still holds (an older manual refund)", () => {
    expect(
      boostRefundableAmount(
        facts({
          payment: {
            status: PaymentStatus.completed,
            amount: D(59),
            metadata: { refundedOrders: { "order-1": 50 } },
          },
        }),
      ).toNumber(),
    ).toBe(9);
  });

  it.each([
    ["a free grant", { source: BoostSource.admin_grant }],
    ["an ended boost (D2)", { status: BoostStatus.expired }],
    ["a stopped boost", { status: BoostStatus.cancelled }],
    ["an unpaid boost", { status: BoostStatus.pending }],
    ["a boost without an order", { orderId: null }],
    ["a boost without a payment", { payment: null }],
    [
      "a fully refunded payment",
      {
        payment: {
          status: PaymentStatus.refunded,
          amount: D(59),
          metadata: {},
        },
      },
    ],
  ] as const)("is zero for %s", (_label, over) => {
    expect(boostRefundableAmount(facts(over)).toNumber()).toBe(0);
  });

  it("is never negative", () => {
    expect(
      boostRefundableAmount(facts({ refundedAmount: D(70) })).toNumber(),
    ).toBe(0);
  });
});
