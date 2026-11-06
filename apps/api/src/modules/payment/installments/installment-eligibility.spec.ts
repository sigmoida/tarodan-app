import { OrderOrigin, PaytrMerchant, Prisma } from "@prisma/client";
import {
  cardAllowsInstallments,
  evaluateInstallmentOffer,
  offeredInstallmentCounts,
  paymentKindAllowsInstallments,
  paymentLaneConsistent,
  rateFamiliesOf,
  type InstallmentPaymentKind,
  type InstallmentRateSource,
} from "./installment-eligibility";
import type { InstallmentRuleCandidate } from "./installment-rules";

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const NOW = new Date("2026-11-10T12:00:00Z");

const goods: InstallmentPaymentKind = {
  paytrMerchant: PaytrMerchant.marketplace,
  tradeCashPaymentId: null,
  orderId: "order-1",
  checkoutGroupId: null,
  orderOrigins: [OrderOrigin.direct_sale],
};

describe("paymentLaneConsistent (plan 5.2)", () => {
  it.each`
    case                                       | input                                                                               | expected
    ${"a live payment of live orders"}         | ${{ paymentIsTest: false, orderIsTest: [false, false], buyerIsTestAccount: false }} | ${true}
    ${"a test payment of a test account"}      | ${{ paymentIsTest: true, orderIsTest: [true], buyerIsTestAccount: true }}           | ${true}
    ${"a guest payment (no buyer to compare)"} | ${{ paymentIsTest: false, orderIsTest: [false], buyerIsTestAccount: null }}         | ${true}
    ${"a trade cash payment (no orders)"}      | ${{ paymentIsTest: true, orderIsTest: [], buyerIsTestAccount: true }}               | ${true}
    ${"a test payment of a live order"}        | ${{ paymentIsTest: true, orderIsTest: [false], buyerIsTestAccount: true }}          | ${false}
    ${"a cart mixing lanes"}                   | ${{ paymentIsTest: false, orderIsTest: [false, true], buyerIsTestAccount: false }}  | ${false}
    ${"a live payment of a test account"}      | ${{ paymentIsTest: false, orderIsTest: [false], buyerIsTestAccount: true }}         | ${false}
  `("$case: $expected", ({ input, expected }) => {
    expect(paymentLaneConsistent(input)).toBe(expected);
  });
});

describe("paymentKindAllowsInstallments (D6)", () => {
  it.each`
    case                                | kind
    ${"direct buy"}                     | ${goods}
    ${"offer order"}                    | ${{ ...goods, orderOrigins: [OrderOrigin.offer] }}
    ${"cart / group (guest or member)"} | ${{ ...goods, orderId: null, checkoutGroupId: "group-1", orderOrigins: [OrderOrigin.direct_sale, OrderOrigin.offer] }}
  `("allows a $case", ({ kind }) => {
    expect(paymentKindAllowsInstallments(kind)).toBe(true);
  });

  it.each`
    case                                                 | kind
    ${"trade cash payment"}                              | ${{ ...goods, orderId: null, tradeCashPaymentId: "tcp-1", orderOrigins: [] }}
    ${"trade cash even if an order id leaked in"}        | ${{ ...goods, tradeCashPaymentId: "tcp-1" }}
    ${"membership (membership store, platform service)"} | ${{ ...goods, paytrMerchant: PaytrMerchant.membership, orderOrigins: [OrderOrigin.platform_service] }}
    ${"membership store even for a goods origin"}        | ${{ ...goods, paytrMerchant: PaytrMerchant.membership }}
    ${"boost (platform_service on the marketplace)"}     | ${{ ...goods, orderOrigins: [OrderOrigin.platform_service] }}
    ${"a group with one platform_service order"}         | ${{ ...goods, orderId: null, checkoutGroupId: "g", orderOrigins: [OrderOrigin.direct_sale, OrderOrigin.platform_service] }}
    ${"a payment with no order and no group"}            | ${{ ...goods, orderId: null, orderOrigins: [] }}
    ${"an order list that did not load"}                 | ${{ ...goods, orderOrigins: [] }}
  `("refuses a $case", ({ kind }) => {
    expect(paymentKindAllowsInstallments(kind)).toBe(false);
  });
});

describe("cardAllowsInstallments (D5)", () => {
  it("allows a personal credit card of a PayTR family", () => {
    expect(
      cardAllowsInstallments({
        cardType: "credit",
        family: "world",
        businessCard: false,
      }),
    ).toBe(true);
  });

  it.each`
    case                        | card
    ${"debit card"}             | ${{ cardType: "debit", family: "world", businessCard: false }}
    ${"business card"}          | ${{ cardType: "credit", family: "world", businessCard: true }}
    ${"business flag unknown"}  | ${{ cardType: "credit", family: "world", businessCard: undefined }}
    ${"brand none (no family)"} | ${{ cardType: "credit", family: undefined, businessCard: false }}
    ${"unknown card type"}      | ${{ cardType: undefined, family: "bonus", businessCard: false }}
    ${"family not PayTR's"}     | ${{ cardType: "credit", family: "visa", businessCard: false }}
  `("refuses a $case", ({ card }) => {
    expect(cardAllowsInstallments(card)).toBe(false);
  });
});

const snapshot: InstallmentRateSource = {
  id: "snap-1",
  fetchedAt: NOW,
  singleRatePct: D("3"),
  maxInstallmentNonBusiness: 6,
  rates: {
    world: { "2": "5.5", "3": "8", "6": "13", "9": "18" },
    bonus: { "3": 8.2, "4": "bad", "5": "100" },
    unknownfamily: { "2": "1" },
  },
};

describe("offeredInstallmentCounts (D2)", () => {
  it("lists the family's counts up to max_inst_non_bus, with no platform cap", () => {
    expect(
      offeredInstallmentCounts(snapshot, "world").map((o) => [
        o.count,
        o.installmentRatePct.toString(),
      ]),
    ).toEqual([
      [2, "5.5"],
      [3, "8"],
      [6, "13"],
    ]);
    expect(
      offeredInstallmentCounts(
        { ...snapshot, maxInstallmentNonBusiness: 12 },
        "world",
      ).map((o) => o.count),
    ).toEqual([2, 3, 6, 9]);
  });

  it("drops counts whose value is not a rate", () => {
    expect(
      offeredInstallmentCounts(snapshot, "bonus").map((o) => o.count),
    ).toEqual([3]);
  });

  it("fails closed without max_inst_non_bus, a family row or a rate table", () => {
    expect(
      offeredInstallmentCounts(
        { ...snapshot, maxInstallmentNonBusiness: null },
        "world",
      ),
    ).toEqual([]);
    expect(
      offeredInstallmentCounts(
        { ...snapshot, maxInstallmentNonBusiness: 1 },
        "world",
      ),
    ).toEqual([]);
    expect(offeredInstallmentCounts(snapshot, "axess")).toEqual([]);
    expect(
      offeredInstallmentCounts({ ...snapshot, rates: [] }, "world"),
    ).toEqual([]);
    expect(
      offeredInstallmentCounts({ ...snapshot, rates: null }, "world"),
    ).toEqual([]);
  });

  it("lists only PayTR families as present", () => {
    expect(rateFamiliesOf(snapshot.rates)).toEqual(["bonus", "world"]);
    expect(rateFamiliesOf(null)).toEqual([]);
  });
});

describe("evaluateInstallmentOffer", () => {
  const premiumFree: InstallmentRuleCandidate = {
    id: "rule-premium",
    segment: "premium",
    minCount: 2,
    maxCount: 3,
    allowed: true,
    platformSharePct: D(100),
    priority: 0,
    validFrom: new Date(NOW.getTime() - 1000),
    validUntil: null,
    archivedAt: null,
    createdAt: new Date(NOW.getTime() - 1000),
  };
  const noSix: InstallmentRuleCandidate = {
    ...premiumFree,
    id: "rule-all-no-6",
    segment: "all",
    minCount: 6,
    maxCount: 6,
    allowed: false,
    platformSharePct: D(0),
  };
  const base = {
    baseAmount: D("1000.00"),
    snapshot,
    family: "world" as const,
    now: NOW,
    feeVatRatePct: D(20),
    slices: null,
  };

  it("prices every count PayTR offers with the default rule", () => {
    const result = evaluateInstallmentOffer({
      ...base,
      segment: "free",
      rules: [],
    });
    expect(result.offeredByPaytr).toEqual([2, 3, 6]);
    expect(
      result.offers.map((o) => [
        o.price.count,
        o.price.chargedAmount.toFixed(2),
      ]),
    ).toEqual([
      [2, expect.any(String)],
      [3, "1066.38"],
      [6, "1142.22"],
    ]);
    expect(result.offers.every((o) => o.rule.ruleId === null)).toBe(true);
  });

  it("applies the winning rule per count and removes disallowed counts", () => {
    const premium = evaluateInstallmentOffer({
      ...base,
      segment: "premium",
      rules: [premiumFree, noSix],
    });
    expect(
      premium.offers.map((o) => [
        o.price.count,
        o.price.feeAmount.toFixed(2),
        o.rule.ruleId,
      ]),
    ).toEqual([
      [2, "0.00", "rule-premium"],
      [3, "0.00", "rule-premium"],
    ]);
    expect(premium.offers[1].price.platformCostAmount.toFixed(2)).toBe("50.00");
    expect(premium.excludedByRule).toEqual([6]);

    const free = evaluateInstallmentOffer({
      ...base,
      segment: "free",
      rules: [premiumFree, noSix],
    });
    expect(
      free.offers.map((o) => [o.price.count, o.price.chargedAmount.toFixed(2)]),
    ).toEqual([
      [2, expect.any(String)],
      [3, "1066.38"],
    ]);
  });

  it("runs the keep guard only when the order slices are known", () => {
    const slices = [{ totalAmount: D("1000.00"), sellerAmount: D("900.00") }];
    const premium = evaluateInstallmentOffer({
      ...base,
      segment: "premium",
      rules: [premiumFree],
      slices,
    });
    // 100% share at 3: C = T, deduction 80.00 <= margin 100.00 -> kept;
    // default at 6: C = 1,142.22, deduction 148.49 <= 242.22 -> kept.
    expect(premium.offers.map((o) => o.price.count)).toEqual([2, 3, 6]);
    const tight = evaluateInstallmentOffer({
      ...base,
      segment: "premium",
      rules: [premiumFree],
      slices: [{ totalAmount: D("1000.00"), sellerAmount: D("950.00") }],
    });
    expect(tight.excludedByKeepGuard).toEqual([2, 3]);
    expect(tight.offers.map((o) => o.price.count)).toEqual([6]);
  });

  it("skips a count whose rate the formula cannot price (fail closed)", () => {
    const result = evaluateInstallmentOffer({
      ...base,
      snapshot: { ...snapshot, rates: { world: { "2": "95", "3": "8" } } },
      segment: "free",
      rules: [],
    });
    expect(result.unpriceable).toEqual([2]);
    expect(result.offers.map((o) => o.price.count)).toEqual([3]);
  });
});
