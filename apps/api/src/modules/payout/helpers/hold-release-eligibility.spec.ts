import {
  OrderStatus,
  PaymentHoldStatus,
  RefundRequestStatus,
} from "@prisma/client";
import { HOLD_RELEASE_BLOCKED_REASONS } from "@tarodan/types";
import {
  HOLD_RELEASE_BLOCKED_MESSAGE_KEYS,
  closedOrderHoldResidual,
  holdPayoutOrderBlock,
  holdResidualSettleable,
  holdReleaseBlockedReason,
  holdReleaseOrderFacts,
  holdResidual,
  holdResidualPayable,
  isSellerFaultRefund,
  type HoldReleaseHoldFacts,
  type HoldReleaseOrderFacts,
} from "./hold-release-eligibility";

const NOW = new Date("2026-10-12T09:00:00.000Z");
const PAST = new Date("2026-10-01T09:00:00.000Z");
const FUTURE = new Date("2026-10-20T09:00:00.000Z");

const hold = (
  overrides: Partial<HoldReleaseHoldFacts> = {},
): HoldReleaseHoldFacts => ({
  status: PaymentHoldStatus.held,
  frozenByRefundId: null,
  amount: 420,
  refundedAmount: 395,
  releaseAt: PAST,
  ...overrides,
});

const order = (
  overrides: Partial<HoldReleaseOrderFacts> = {},
): HoldReleaseOrderFacts => ({
  status: OrderStatus.cancelled,
  hasOpenRefund: false,
  finalizedRefunds: [{ faultParty: "buyer", policyCode: "v2_buyer_return" }],
  ...overrides,
});

describe("isSellerFaultRefund — the fault source", () => {
  it.each([
    ["v2 seller", { faultParty: "seller", policyCode: "v2_seller_x" }, true],
    ["v2 buyer", { faultParty: "buyer", policyCode: "v2_buyer_x" }, false],
    ["v2 carrier", { faultParty: "carrier", policyCode: "v2_carrier_x" }, false],
    ["v2 platform", { faultParty: "platform", policyCode: "v2_platform_x" }, false],
    ["v1 seller return", { faultParty: null, policyCode: "seller_fault_return" }, true],
    [
      "v1 seller cancellation",
      { faultParty: null, policyCode: "seller_fault_cancellation" },
      true,
    ],
    ["v1 buyer remorse", { faultParty: null, policyCode: "buyer_remorse_return" }, false],
    ["v1 platform", { faultParty: null, policyCode: "platform_cancellation" }, false],
    // faultParty is authoritative even if a legacy code says otherwise
    ["column wins", { faultParty: "buyer", policyCode: "seller_fault_return" }, false],
  ] as const)("%s → %s", (_name, refund, expected) => {
    expect(isSellerFaultRefund(refund)).toBe(expected);
  });
});

describe("holdResidual", () => {
  it("is amount − refundedAmount in Decimal, never negative", () => {
    expect(holdResidual({ amount: "420.10", refundedAmount: "395.05" }).toString()).toBe(
      "25.05",
    );
    expect(holdResidual({ amount: 100, refundedAmount: null }).toNumber()).toBe(100);
    expect(holdResidual({ amount: 100, refundedAmount: 120 }).toNumber()).toBe(0);
  });
});

describe("holdReleaseBlockedReason — the one release predicate", () => {
  it.each<[string, HoldReleaseHoldFacts, HoldReleaseOrderFacts | null, string | null]>([
    // ── normal path ──────────────────────────────────────────────────────
    ["delivered, due", hold({ refundedAmount: 0 }), order({ status: OrderStatus.delivered, finalizedRefunds: [] }), null],
    ["completed, due", hold({ refundedAmount: 0 }), order({ status: OrderStatus.completed, finalizedRefunds: [] }), null],
    ["delivered, not yet due", hold({ refundedAmount: 0, releaseAt: FUTURE }), order({ status: OrderStatus.delivered }), "not_due"],
    ["delivered, never scheduled", hold({ refundedAmount: 0, releaseAt: null }), order({ status: OrderStatus.delivered }), "not_due"],
    ["shipped order", hold({ refundedAmount: 0 }), order({ status: OrderStatus.shipped }), "order_not_terminal"],
    ["refund requested", hold({ refundedAmount: 0 }), order({ status: OrderStatus.refund_requested }), "order_not_terminal"],
    ["order missing", hold(), null, "order_not_terminal"],
    // ── locks ────────────────────────────────────────────────────────────
    ["frozen hold", hold({ frozenByRefundId: "rr-1" }), order({ status: OrderStatus.delivered }), "frozen"],
    ["open refund on the order", hold(), order({ status: OrderStatus.delivered, hasOpenRefund: true }), "frozen"],
    ["already released", hold({ status: PaymentHoldStatus.released }), order(), "already_released"],
    ["consumed by refund", hold({ status: PaymentHoldStatus.cancelled }), order(), "already_released"],
    // ── residual path ────────────────────────────────────────────────────
    ["cancelled, buyer fault, due", hold(), order(), null],
    ["refunded, carrier fault, due", hold(), order({ status: OrderStatus.refunded, finalizedRefunds: [{ faultParty: "carrier", policyCode: "v2_carrier_x" }] }), null],
    ["cancelled before shipping (no stamp)", hold({ releaseAt: null }), order(), null],
    ["refunded, window still open", hold({ releaseAt: FUTURE }), order({ status: OrderStatus.refunded }), "not_due"],
    ["cancelled, seller fault", hold(), order({ finalizedRefunds: [{ faultParty: "seller", policyCode: "v2_seller_x" }] }), "seller_at_fault"],
    ["cancelled, one of two refunds seller fault", hold(), order({ finalizedRefunds: [{ faultParty: "buyer", policyCode: "a" }, { faultParty: "seller", policyCode: "b" }] }), "seller_at_fault"],
    ["cancelled, fault unknown", hold(), order({ finalizedRefunds: [] }), "seller_at_fault"],
    ["cancelled, nothing left", hold({ refundedAmount: 420 }), order(), "already_released"],
    ["cancelled, a cent left", hold({ refundedAmount: 419.99 }), order(), "already_released"],
  ])("%s → %s", (_name, holdFacts, orderFacts, expected) => {
    expect(
      holdReleaseBlockedReason({ hold: holdFacts, order: orderFacts, now: NOW }),
    ).toBe(expected);
  });

  it("early release lifts only the date condition", () => {
    const early = { now: NOW, ignoreReleaseDate: true };
    expect(
      holdReleaseBlockedReason({
        hold: hold({ refundedAmount: 0, releaseAt: FUTURE }),
        order: order({ status: OrderStatus.delivered }),
        ...early,
      }),
    ).toBeNull();
    expect(
      holdReleaseBlockedReason({
        hold: hold({ releaseAt: FUTURE }),
        order: order({ finalizedRefunds: [{ faultParty: "seller", policyCode: "x" }] }),
        ...early,
      }),
    ).toBe("seller_at_fault");
    expect(
      holdReleaseBlockedReason({
        hold: hold({ frozenByRefundId: "rr" }),
        order: order({ status: OrderStatus.delivered }),
        ...early,
      }),
    ).toBe("frozen");
  });

  it("every reason has a localized message key", () => {
    expect(Object.keys(HOLD_RELEASE_BLOCKED_MESSAGE_KEYS).sort()).toEqual(
      [...HOLD_RELEASE_BLOCKED_REASONS].sort(),
    );
  });
});

describe("holdResidualPayable", () => {
  it("is the residual path of the release predicate", () => {
    expect(holdResidualPayable(hold(), order(), NOW)).toBe(true);
    expect(
      holdResidualPayable(
        hold(),
        order({ finalizedRefunds: [{ faultParty: "seller", policyCode: "x" }] }),
        NOW,
      ),
    ).toBe(false);
    expect(holdResidualPayable(hold({ frozenByRefundId: "rr" }), order(), NOW)).toBe(false);
    expect(holdResidualPayable(hold({ refundedAmount: 420 }), order(), NOW)).toBe(false);
    // a delivered order is the normal path, not a residual
    expect(
      holdResidualPayable(
        hold({ refundedAmount: 0 }),
        order({ status: OrderStatus.delivered }),
        NOW,
      ),
    ).toBe(false);
  });
});

describe("closedOrderHoldResidual", () => {
  it("is the leftover of a held hold on a closed order, zero otherwise", () => {
    expect(closedOrderHoldResidual(hold(), order()).toNumber()).toBe(25);
    // the retained share swallowed the whole hold: nothing was consumed
    expect(
      closedOrderHoldResidual(hold({ amount: 30, refundedAmount: 0 }), order()).toNumber(),
    ).toBe(30);
    expect(
      closedOrderHoldResidual(hold(), order({ status: OrderStatus.delivered })).toNumber(),
    ).toBe(0);
    expect(
      closedOrderHoldResidual(hold({ status: PaymentHoldStatus.cancelled }), order()).toNumber(),
    ).toBe(0);
    expect(closedOrderHoldResidual(hold(), null).toNumber()).toBe(0);
  });
});

describe("holdResidualSettleable — the seller-fault residual goes to the platform", () => {
  const sellerFault = order({
    status: OrderStatus.refunded,
    finalizedRefunds: [{ faultParty: "seller", policyCode: "v2_seller_cancellation" }],
  });

  it("settles a seller-fault residual, whatever the release date", () => {
    expect(holdResidualSettleable(hold(), sellerFault, NOW)).toBe(true);
    expect(holdResidualSettleable(hold({ releaseAt: FUTURE }), sellerFault, NOW)).toBe(true);
    expect(holdResidualSettleable(hold({ releaseAt: null }), sellerFault, NOW)).toBe(true);
    // v1 row: the fault is in the policy code
    expect(
      holdResidualSettleable(
        hold(),
        order({ finalizedRefunds: [{ faultParty: null, policyCode: "seller_fault_cancellation" }] }),
        NOW,
      ),
    ).toBe(true);
    // unknown fault is treated like seller fault (never paid to the seller)
    expect(holdResidualSettleable(hold(), order({ finalizedRefunds: [] }), NOW)).toBe(true);
  });

  it.each<[string, HoldReleaseHoldFacts, HoldReleaseOrderFacts | null]>([
    ["seller not at fault (it is released instead)", hold(), order()],
    ["hold frozen by an open refund", hold({ frozenByRefundId: "rr" }), sellerFault],
    ["open refund on the order", hold(), { ...sellerFault, hasOpenRefund: true }],
    ["hold already settled / released", hold({ status: PaymentHoldStatus.cancelled }), sellerFault],
    ["nothing left in the hold", hold({ refundedAmount: 420 }), sellerFault],
    ["only a kuruş left", hold({ refundedAmount: 419.99 }), sellerFault],
    ["order not closed", hold(), { ...sellerFault, status: OrderStatus.delivered }],
    ["order missing", hold(), null],
  ])("not settleable: %s", (_name, h, o) => {
    expect(holdResidualSettleable(h, o, NOW)).toBe(false);
  });
});

describe("holdPayoutOrderBlock — what payouts check once the hold is released", () => {
  it.each([
    [OrderStatus.delivered, [], null],
    [OrderStatus.awaiting_buyer_confirmation, [], null],
    [OrderStatus.cancelled, [{ faultParty: "buyer" as const, policyCode: "x" }], null],
    [OrderStatus.refunded, [{ faultParty: "seller" as const, policyCode: "x" }], "seller_at_fault"],
    [OrderStatus.cancelled, [], "seller_at_fault"],
    [OrderStatus.preparing, [], "order_not_terminal"],
    [OrderStatus.pending_payment, [], "order_not_terminal"],
  ])("%s %j → %s", (status, finalizedRefunds, expected) => {
    expect(holdPayoutOrderBlock({ status, finalizedRefunds })).toBe(expected);
  });
});

describe("holdReleaseOrderFacts", () => {
  it("splits the single read into open requests and finalized faults", () => {
    expect(
      holdReleaseOrderFacts({
        status: OrderStatus.cancelled,
        refundRequests: [
          { status: RefundRequestStatus.refunded, faultParty: "buyer", policyCode: "a" },
          { status: RefundRequestStatus.disputed, faultParty: null, policyCode: "b" },
        ],
      }),
    ).toEqual({
      status: OrderStatus.cancelled,
      hasOpenRefund: true,
      finalizedRefunds: [
        { status: RefundRequestStatus.refunded, faultParty: "buyer", policyCode: "a" },
      ],
    });
  });
});
