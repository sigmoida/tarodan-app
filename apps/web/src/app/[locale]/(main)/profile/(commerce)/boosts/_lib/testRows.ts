/** @format */

/** Test fixture: one "My boosts" row, overridable. */
import type { MyBoostRow } from "@tarodan/types";

export function boostRow(over: Partial<MyBoostRow> = {}): MyBoostRow {
  return {
    id: "b1",
    productId: "p1",
    product: {
      id: "p1",
      title: "Camaro",
      status: "active",
      image: null,
      boostedUntil: "2026-10-30T00:00:00Z",
      homeShowcaseUntil: null,
    },
    source: "purchase",
    packageName: "Standart",
    showcaseOnHome: false,
    durationDays: 7,
    extendedDays: 0,
    price: 100,
    refundedAmount: 0,
    status: "active",
    autoRenew: false,
    startsAt: "2026-10-20T00:00:00Z",
    endsAt: "2026-10-27T00:00:00Z",
    cancelledAt: null,
    orderId: "o1",
    orderNumber: "BST-1",
    isActive: true,
    remainingMs: 0,
    metrics: {
      before: null,
      current: { views: 0, likes: 0, clicks: 0 },
      gain: null,
      performanceScore: null,
    },
    createdAt: "2026-10-20T00:00:00Z",
    isBest: false,
    ...over,
  };
}
