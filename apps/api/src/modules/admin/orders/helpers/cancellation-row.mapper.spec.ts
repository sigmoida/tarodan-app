import { Prisma } from "@prisma/client";
import { ORDER_CANCEL_REASON } from "../../../order/helpers/order-cancel-reasons";
import { TRADE_CANCEL_REASON } from "../../../trade/helpers/trade-cancel-reasons";
import {
  mapCancelledCartRow,
  mapCancelledTradeRow,
  orderCancellationReason,
  orderRefundState,
  tradeCancellationReason,
  tradeRefundState,
} from "./cancellation-row.mapper";
import type {
  CancellationLine,
  CancellationTrade,
} from "./cancellation-select";
import type { RowMapContext } from "./order-list-row.mapper";

const NOW = new Date("2026-09-22T12:00:00.000Z");
const D = (n: number) => new Prisma.Decimal(n);

const party = (id: string) => ({
  id,
  displayName: `name-${id}`,
  email: `${id}@x.com`,
  adminCode: `K-${id}`,
});

const product = (id: string) => ({
  id,
  title: `title-${id}`,
  productCode: `U-${id}`,
  modelCode: `MC-${id}`,
  price: D(100),
  brand: { name: "Hot Wheels" },
  images: [{ cardKey: `img/${id}` }],
});

function line(overrides: Partial<CancellationLine> = {}): CancellationLine {
  return {
    id: "o1",
    orderNumber: "ORD-1",
    origin: "direct_sale",
    status: "cancelled",
    cancellationType: "iptal",
    cancelledBy: "buyer",
    cancelledAt: new Date("2026-09-21T10:00:00.000Z"),
    cancelReason: "vazgeçtim",
    cancellationReasonCode: "changed_mind",
    quantity: 1,
    unitPrice: D(100),
    subtotal: D(100),
    totalAmount: D(120),
    preparingDeadline: null,
    deliveredAt: null,
    createdAt: new Date("2026-09-20T09:00:00.000Z"),
    checkoutGroupId: "g1",
    packageId: "p1",
    shippingAddress: null,
    financialSnapshot: null,
    sellerCommissionAmount: D(10),
    buyerCommissionAmount: D(0),
    sellerPlatformFeeAmount: D(2),
    buyerServiceFeeAmount: D(3),
    buyer: party("b1"),
    seller: party("s1"),
    product: product("pr1"),
    package: { packageNumber: "PKG-1" },
    shipment: null,
    offer: null,
    refundRequests: [],
    payment: null,
    checkoutGroup: { payment: { status: "completed" } },
    refundAttempts: [],
    ...overrides,
  } as CancellationLine;
}

function trade(overrides: Partial<CancellationTrade> = {}): CancellationTrade {
  return {
    id: "t1",
    tradeNumber: "TKS-1",
    status: "cancelled",
    createdAt: new Date("2026-09-10T09:00:00.000Z"),
    cancelledAt: new Date("2026-09-12T09:00:00.000Z"),
    cancelledBy: "system",
    cancelReason: TRADE_CANCEL_REASON.autoExpired,
    refundFailureAt: null,
    initiator: party("u-init"),
    receiver: party("u-recv"),
    items: [
      {
        id: "i1",
        side: "initiator",
        quantity: 1,
        valueAtTrade: D(300),
        product: product("p-init"),
      },
      {
        id: "i2",
        side: "receiver",
        quantity: 2,
        valueAtTrade: D(150),
        product: product("p-recv"),
      },
    ],
    cashPayments: [
      {
        status: "completed",
        refundedAt: null,
        totalAmount: D(80),
        commission: D(0),
        tradeFeeAmount: D(50),
      },
    ],
    ...overrides,
  } as CancellationTrade;
}

const ctx: RowMapContext = {
  now: NOW,
  imageUrl: (key) => (key ? `https://cdn/${key}` : null),
  invoicesBySource: new Map(),
};

describe("cancellation reason", () => {
  it("shows the buyer's chosen reason code when the buyer cancelled", () => {
    expect(
      orderCancellationReason({
        cancelledBy: "buyer",
        cancellationReasonCode: "wrong_card",
        cancelReason: "yanlış kart",
      }),
    ).toEqual({ kind: "code", code: "wrong_card" });
  });

  it.each([
    ORDER_CANCEL_REASON.paymentWindowExpired,
    ORDER_CANCEL_REASON.sellerShipDeadlineExpired,
  ])("reads the system expiry %s as Süresi Dolan", (text) => {
    expect(
      orderCancellationReason({
        cancelledBy: "system",
        cancellationReasonCode: null,
        cancelReason: text,
      }),
    ).toEqual({ kind: "expired" });
  });

  it("an expiry wins over a stale buyer code the cron superseded", () => {
    // Alıcının incelemedeki iptal talebi varken satıcı süresinde kargolamadı:
    // iptali sistem yaptı, kod bayattır.
    expect(
      orderCancellationReason({
        cancelledBy: "system",
        cancellationReasonCode: "delivery_delayed",
        cancelReason: ORDER_CANCEL_REASON.sellerShipDeadlineExpired,
      }),
    ).toEqual({ kind: "expired" });
  });

  it("keeps a legacy (unknown actor) code, then free text, then nothing", () => {
    expect(
      orderCancellationReason({
        cancelledBy: null,
        cancellationReasonCode: "other",
        cancelReason: null,
      }),
    ).toEqual({ kind: "code", code: "other" });
    expect(
      orderCancellationReason({
        cancelledBy: "platform",
        cancellationReasonCode: null,
        cancelReason: "  Stok tükendi  ",
      }),
    ).toEqual({ kind: "text", text: "Stok tükendi" });
    expect(
      orderCancellationReason({
        cancelledBy: "system",
        cancellationReasonCode: null,
        cancelReason: "   ",
      }),
    ).toEqual({ kind: "none" });
  });

  it("trade: deadline sweep is Süresi Dolan, lost parcel is its own text", () => {
    expect(
      tradeCancellationReason({
        cancelReason: TRADE_CANCEL_REASON.autoExpired,
      }),
    ).toEqual({ kind: "expired" });
    expect(
      tradeCancellationReason({ cancelReason: TRADE_CANCEL_REASON.lostParcel }),
    ).toEqual({ kind: "text", text: TRADE_CANCEL_REASON.lostParcel });
    expect(tradeCancellationReason({ cancelReason: null })).toEqual({
      kind: "none",
    });
  });
});

describe("refund state", () => {
  const base = {
    payment: null,
    checkoutGroup: null,
    refundAttempts: [],
    refundRequests: [],
  };

  it("nothing was charged → not charged", () => {
    expect(orderRefundState(base)).toBe("not_charged");
    expect(orderRefundState({ ...base, payment: { status: "failed" } })).toBe(
      "not_charged",
    );
  });

  it("reads the group payment of a cart line", () => {
    expect(
      orderRefundState({
        ...base,
        checkoutGroup: { payment: { status: "completed" } },
      }),
    ).toBe("pending");
  });

  it("a successful attempt is refunded, an open request in review, only failures failed", () => {
    const paid = { ...base, payment: { status: "refunded" as const } };
    expect(
      orderRefundState({
        ...paid,
        refundAttempts: [{ status: "failed" }, { status: "finalized" }],
      }),
    ).toBe("refunded");
    expect(orderRefundState({ ...paid, refundRequests: [{ id: "r1" }] })).toBe(
      "in_review",
    );
    expect(
      orderRefundState({
        ...paid,
        refundAttempts: [{ status: "manual_review" }],
      }),
    ).toBe("failed");
  });

  it("trade: unpaid, pending, partially / fully refunded, failed", () => {
    expect(tradeRefundState({ refundFailureAt: null, cashPayments: [] })).toBe(
      "not_charged",
    );
    const paid = { status: "completed" as const, refundedAt: null };
    const refunded = { status: "refunded" as const, refundedAt: NOW };
    expect(
      tradeRefundState({ refundFailureAt: null, cashPayments: [paid] }),
    ).toBe("pending");
    expect(
      tradeRefundState({ refundFailureAt: null, cashPayments: [refunded] }),
    ).toBe("refunded");
    expect(
      tradeRefundState({ refundFailureAt: NOW, cashPayments: [paid] }),
    ).toBe("failed");
    expect(
      tradeRefundState({
        refundFailureAt: null,
        cashPayments: [paid, refunded],
      }),
    ).toBe("refunded");
  });
});

describe("mapCancelledCartRow", () => {
  it("a partially cancelled cart (GRP) carries ONLY its cancelled lines", () => {
    const row = mapCancelledCartRow(
      { kind: "group", id: "g1", number: "GRP-1", createdAt: NOW },
      [line({ id: "o1" }), line({ id: "o2", orderNumber: "ORD-2" })],
      3,
      ctx,
    );
    expect(row.kind).toBe("group");
    expect(row.number).toBe("GRP-1");
    expect(row.origin).toBe("direct_sale");
    expect(
      row.packages.flatMap((pkg) => pkg.lines).map((l) => l.orderId),
    ).toEqual(["o1", "o2"]);
    expect(row.lineCounts).toEqual({ cancelled: 2, total: 3 });
    expect(Object.keys(row.cancellations)).toEqual(["o1", "o2"]);
    expect(row.detailOrderId).toBe("o1");
    expect(row.tradeId).toBeNull();
  });

  it("an offer order is its own row (ORD) with the offer origin", () => {
    const row = mapCancelledCartRow(
      {
        kind: "order",
        id: "o9",
        number: "ORD-9",
        createdAt: NOW,
      },
      [line({ id: "o9", origin: "offer", checkoutGroupId: null })],
      1,
      ctx,
    );
    expect(row.kind).toBe("order");
    expect(row.origin).toBe("offer");
    expect(row.lineCounts).toEqual({ cancelled: 1, total: 1 });
  });

  it("the row's cancellation moment is its latest line; per-line info is kept", () => {
    const row = mapCancelledCartRow(
      { kind: "group", id: "g1", number: "GRP-1", createdAt: NOW },
      [
        line({
          id: "o1",
          cancelledAt: new Date("2026-09-20T10:00:00.000Z"),
        }),
        line({
          id: "o2",
          cancelledAt: new Date("2026-09-21T10:00:00.000Z"),
          cancelledBy: null,
          cancellationReasonCode: null,
          cancelReason: ORDER_CANCEL_REASON.paymentWindowExpired,
        }),
      ],
      2,
      ctx,
    );
    expect(row.cancelledAt).toBe("2026-09-21T10:00:00.000Z");
    expect(row.cancellations.o1).toEqual({
      cancelledAt: "2026-09-20T10:00:00.000Z",
      cancelledBy: "buyer",
      reason: { kind: "code", code: "changed_mind" },
      refundState: "pending",
    });
    expect(row.cancellations.o2).toMatchObject({
      cancelledBy: null,
      reason: { kind: "expired" },
    });
  });

  it("an unstamped (legacy) cancellation has no moment", () => {
    const row = mapCancelledCartRow(
      { kind: "order", id: "o1", number: "ORD-1", createdAt: NOW },
      [line({ cancelledAt: null, checkoutGroupId: null })],
      1,
      ctx,
    );
    expect(row.cancelledAt).toBeNull();
  });
});

describe("mapCancelledTradeRow", () => {
  it("maps a trade to one package per owner side, initiator as buyer", () => {
    const row = mapCancelledTradeRow(trade(), ctx);
    expect(row).toMatchObject({
      kind: "trade",
      number: "TKS-1",
      origin: "trade",
      status: "cancelled",
      tradeId: "t1",
      detailOrderId: null,
      buyer: { id: "u-init" },
      sellers: [{ id: "u-recv" }],
      lineCounts: { cancelled: 2, total: 2 },
      cancelledAt: "2026-09-12T09:00:00.000Z",
    });
    expect(row.packages.map((pkg) => [pkg.key, pkg.seller.id])).toEqual([
      ["t1:initiator", "u-init"],
      ["t1:receiver", "u-recv"],
    ]);
    const receiverLine = row.packages[1].lines[0];
    expect(receiverLine).toMatchObject({
      orderId: "i2",
      orderNumber: "TKS-1",
      quantity: 2,
      unitPrice: 150,
      subtotal: 300,
    });
    expect(row.subtotal).toBe(600);
  });

  it("every trade item shares the trade's cancellation (Süresi Dolan, system)", () => {
    const row = mapCancelledTradeRow(trade(), ctx);
    expect(row.cancellations.i1).toEqual({
      cancelledAt: "2026-09-12T09:00:00.000Z",
      cancelledBy: "system",
      reason: { kind: "expired" },
      refundState: "pending",
    });
    expect(row.cancellations.i2).toEqual(row.cancellations.i1);
  });

  it("charges come from the paid cash payments; unpaid rows count nothing", () => {
    const row = mapCancelledTradeRow(
      trade({
        cashPayments: [
          {
            status: "completed",
            refundedAt: null,
            totalAmount: D(80),
            commission: D(5),
            tradeFeeAmount: D(50),
          },
          {
            status: "pending",
            refundedAt: null,
            totalAmount: D(999),
            commission: D(999),
            tradeFeeAmount: D(999),
          },
        ] as CancellationTrade["cashPayments"],
      }),
      ctx,
    );
    expect(row.totalAmount).toBe(80);
    expect(row.fees).toEqual({ salesCommission: 5, platformFee: 50 });
  });

  it("a rejected trade keeps its status and the seller as actor", () => {
    const row = mapCancelledTradeRow(
      trade({ status: "rejected", cancelledBy: "seller", cancelReason: null }),
      ctx,
    );
    expect(row.status).toBe("rejected");
    expect(row.cancellations.i1).toMatchObject({
      cancelledBy: "seller",
      reason: { kind: "none" },
    });
  });
});
