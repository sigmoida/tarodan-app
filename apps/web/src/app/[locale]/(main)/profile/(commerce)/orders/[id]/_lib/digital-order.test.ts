/** @format */

import { describe, expect, it } from "vitest";
import { FALLBACK_TIMING_POLICY } from "@/lib/timing-policy";
import {
  isGroupCancellable,
  isOrderCancellable,
  type ServerOrderGroup,
} from "../../_lib/types";
import { preparingDeadlineNoticeOf } from "./preparing-deadline";
import {
  canReview,
  hasReviewed,
  isOrderReturnable,
  type OrderDetail,
} from "./types";

/**
 * Digital orders (membership, boost) sell a platform service, not goods: the
 * order rules never offer review, refund, cancel or a "ship by" note for
 * them. Each digital case keeps the listing order's data and changes only the
 * signals `isDigitalOrder` reads, so a pass proves the gate and not missing
 * data. The listing case pins that physical orders are unchanged.
 */
const NOW = new Date("2026-10-23T09:00:00.000Z");
const policy = FALLBACK_TIMING_POLICY;

type Signals = Pick<OrderDetail, "kind" | "origin" | "isMembership">;

const CASES: Array<[string, Signals]> = [
  ["boost", { kind: "boost" }],
  ["membership", { kind: "membership" }],
  ["no kind, origin platform_service", { origin: "platform_service" }],
  ["no kind, deprecated isMembership", { isMembership: true }],
];
const LISTING: Signals = { kind: "listing" };

const order = (signals: Signals, overrides: Partial<OrderDetail> = {}) =>
  ({
    id: "o1",
    orderNumber: "ORD-1",
    ...signals,
    status: "delivered",
    totalAmount: 1100,
    amount: 1100,
    commissionAmount: 0,
    createdAt: "2026-10-20T09:00:00.000Z",
    updatedAt: "2026-10-22T09:00:00.000Z",
    deliveredAt: "2026-10-22T09:00:00.000Z",
    returnWindowEndsAt: "2099-01-01T00:00:00.000Z",
    product: { id: "p1", title: "Model car", status: "sold" },
    buyer: { id: "b1", displayName: "Buyer" },
    seller: { id: "s1", displayName: "Seller" },
    shipment: {
      id: "sh1",
      provider: "surat",
      trackingNumber: "T1",
      cargoCode: "C1",
      status: "delivered",
      shippedAt: "2026-10-21T09:00:00.000Z",
    },
    isBuyer: true,
    isSeller: false,
    hasProductRating: false,
    payment: {
      id: "pay1",
      status: "completed",
      amount: 1100,
      provider: "card",
    },
    ...overrides,
  }) as OrderDetail;

const preparing = (signals: Signals) =>
  order(signals, {
    status: "paid",
    deliveredAt: null,
    returnWindowEndsAt: null,
    shipment: undefined,
    preparingDeadline: "2026-10-25T09:00:00.000Z",
  });

const group = (o: OrderDetail): ServerOrderGroup => ({
  kind: "synthetic",
  id: o.id,
  groupNumber: o.orderNumber,
  totalAmount: o.totalAmount,
  status: o.status,
  createdAt: o.createdAt,
  viewerRole: "buyer",
  payment: null,
  packages: [],
  orders: [o as never],
});

describe("order rules for a listing order (unchanged)", () => {
  it("offers review, refund, the ship-by note and cancel", () => {
    expect(canReview(order(LISTING))).toBe(true);
    expect(hasReviewed(order(LISTING, { hasProductRating: true }))).toBe(true);
    expect(isOrderReturnable(order(LISTING), policy)).toBe(true);
    expect(preparingDeadlineNoticeOf(preparing(LISTING), NOW)).not.toBeNull();
    expect(isOrderCancellable(preparing(LISTING))).toBe(true);
    expect(isGroupCancellable(group(preparing(LISTING)))).toBe(true);
  });
});

describe.each(CASES)("order rules for a digital order (%s)", (_, signals) => {
  it("offers no review and shows no submitted review", () => {
    expect(canReview(order(signals))).toBe(false);
    expect(hasReviewed(order(signals, { hasProductRating: true }))).toBe(false);
  });

  it("offers no refund request", () => {
    expect(isOrderReturnable(order(signals), policy)).toBe(false);
  });

  it("shows no ship-by note", () => {
    expect(preparingDeadlineNoticeOf(preparing(signals), NOW)).toBeNull();
  });

  it("offers no line or group cancel", () => {
    expect(isOrderCancellable(preparing(signals))).toBe(false);
    expect(isGroupCancellable(group(preparing(signals)))).toBe(false);
  });
});

describe("a group mixing a digital order", () => {
  it("offers no group cancel", () => {
    const mixed = group(preparing(LISTING));
    mixed.orders.push(
      preparing({ kind: "boost" }) as unknown as ServerOrderGroup["orders"][0],
    );
    expect(isGroupCancellable(mixed)).toBe(false);
  });
});
