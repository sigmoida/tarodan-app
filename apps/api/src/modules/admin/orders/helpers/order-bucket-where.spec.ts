import {
  CancellationActor,
  OfferStatus,
  OrderOrigin,
  OrderStatus,
  ShipmentStatus,
} from "@prisma/client";
import {
  ADMIN_ORDER_BUCKETS,
  CANCELLATION_ACTORS,
  OFFER_STATUSES,
  ORDER_CLOSED_BUCKETS,
  ORDER_ORIGINS,
  ORDER_LINE_STAGES,
  ORDER_LINE_STAGE_RULES,
  ORDER_STATUSES,
  SHIPMENT_STATUSES,
  orderCartBucketOf,
  orderLineStageOf,
  type OrderCartBucket,
  type OrderLineState,
} from "@tarodan/types";
import {
  cartBucketWhere,
  groupLines,
  notCancelledOrderLineWhere,
  orderLineStageWhere,
  refundOrderLineWhere,
  singleLine,
} from "./order-bucket-where";

describe("commerce status values mirror the Prisma enums", () => {
  // @tarodan/types taşıdığı değerler şemayla ayrışırsa kova builder'ı var
  // olmayan bir durumu sorgular (ya da yeni bir durumu hiçbir kovaya koymaz).
  it.each([
    ["OrderStatus", ORDER_STATUSES, OrderStatus],
    ["ShipmentStatus", SHIPMENT_STATUSES, ShipmentStatus],
    ["OfferStatus", OFFER_STATUSES, OfferStatus],
    ["OrderOrigin", ORDER_ORIGINS, OrderOrigin],
    ["CancellationActor", CANCELLATION_ACTORS, CancellationActor],
  ])("%s", (_name, shared, prismaEnum) => {
    expect([...shared].sort()).toEqual(Object.values(prismaEnum).sort());
  });
});

describe("order line stage rules", () => {
  it("put every order × shipment combination in exactly one stage (or other)", () => {
    // orderLineStageOf ilk eşleşmeyi döndürür; kurallar örtüşseydi aynı
    // satır iki kovada birden sayılırdı. Her kombinasyonda eşleşen kural
    // sayısını tablodan doğrudan say: en fazla bir.
    const matches = (
      stage: (typeof ORDER_LINE_STAGES)[number],
      order: (typeof ORDER_STATUSES)[number],
      shipment: (typeof SHIPMENT_STATUSES)[number] | null,
    ) => {
      const rule = ORDER_LINE_STAGE_RULES[stage];
      if (!rule.orderStatuses.includes(order)) return false;
      if (!rule.shipment) return true;
      return shipment === null
        ? rule.shipment.allowMissing
        : rule.shipment.statuses.includes(shipment);
    };
    for (const order of ORDER_STATUSES) {
      for (const shipment of [null, ...SHIPMENT_STATUSES]) {
        const hits = ORDER_LINE_STAGES.filter((stage) =>
          matches(stage, order, shipment),
        );
        expect(hits.length).toBeLessThanOrEqual(1);
        expect(orderLineStageOf(order, shipment)).toBe(hits[0] ?? "other");
      }
    }
    expect(orderLineStageOf("paid", null)).toBe("new");
    expect(orderLineStageOf("preparing", "label_created")).toBe("new");
    expect(orderLineStageOf("shipped", null)).toBe("shipped");
    expect(orderLineStageOf("shipped", "picked_up")).toBe("shipped");
    expect(orderLineStageOf("shipped", "out_for_delivery")).toBe("in_transit");
    expect(orderLineStageOf("shipped", "returned")).toBe("other");
    expect(orderLineStageOf("awaiting_buyer_confirmation", "delivered")).toBe(
      "delivered",
    );
    expect(orderLineStageOf("pending_payment", null)).toBe("other");
    expect(orderLineStageOf("refund_requested", "delivered")).toBe("other");
  });
});

describe("orderLineStageWhere", () => {
  it("new = paid or preparing, whatever the shipment says", () => {
    expect(orderLineStageWhere("new")).toEqual({
      status: { in: ["paid", "preparing"] },
    });
  });

  it("shipped = shipped order whose parcel is not moving yet, or has no shipment row", () => {
    expect(orderLineStageWhere("shipped")).toEqual({
      AND: [
        { status: { in: ["shipped"] } },
        {
          OR: [
            { shipment: { is: null } },
            {
              shipment: {
                is: {
                  status: { in: ["pending", "label_created", "picked_up"] },
                },
              },
            },
          ],
        },
      ],
    });
  });

  it("in_transit requires a moving shipment row", () => {
    expect(orderLineStageWhere("in_transit")).toEqual({
      AND: [
        { status: { in: ["shipped"] } },
        {
          shipment: {
            is: {
              status: {
                in: [
                  "in_transit",
                  "at_delivery_branch",
                  "out_for_delivery",
                  "delivered",
                ],
              },
            },
          },
        },
      ],
    });
  });

  it("delivered covers the confirmation window and completion", () => {
    expect(orderLineStageWhere("delivered")).toEqual({
      status: { in: ["delivered", "awaiting_buyer_confirmation", "completed"] },
    });
  });
});

describe("cartBucketWhere — the least-advanced-package rule", () => {
  const stage = (s: Parameters<typeof orderLineStageWhere>[0]) =>
    orderLineStageWhere(s);

  it("the first stage only needs a line in it", () => {
    expect(cartBucketWhere("new", groupLines)).toEqual({
      AND: [{ orders: { some: stage("new") } }],
    });
  });

  it("a later stage needs a line in it and NO line in an earlier stage", () => {
    expect(cartBucketWhere("in_transit", groupLines)).toEqual({
      AND: [
        { orders: { some: stage("in_transit") } },
        {
          NOT: {
            orders: { some: { OR: [stage("new"), stage("shipped")] } },
          },
        },
      ],
    });
  });

  // Eskiden tek "other" kovası vardı; artık kapanmış sepet üçe ayrılıyor
  // (İptaller / İadeler / Diğer) ve üçü de aynı "kapanmış" tabanı paylaşıyor.
  const closedBase = [
    { orders: { some: {} } },
    {
      NOT: {
        orders: {
          some: {
            OR: [
              stage("new"),
              stage("shipped"),
              stage("in_transit"),
              stage("delivered"),
            ],
          },
        },
      },
    },
  ];

  it("refunds = a closed cart with at least one refund-marked line", () => {
    expect(cartBucketWhere("refunds", groupLines)).toEqual({
      AND: [...closedBase, { orders: { some: refundOrderLineWhere() } }],
    });
  });

  it("cancelled = a closed cart with no refund mark and no line that is not cancelled", () => {
    expect(cartBucketWhere("cancelled", groupLines)).toEqual({
      AND: [
        ...closedBase,
        { NOT: { orders: { some: refundOrderLineWhere() } } },
        { NOT: { orders: { some: notCancelledOrderLineWhere() } } },
      ],
    });
  });

  it("other = a closed cart with no refund mark and a line that is not cancelled", () => {
    expect(cartBucketWhere("other", groupLines)).toEqual({
      AND: [
        ...closedBase,
        { NOT: { orders: { some: refundOrderLineWhere() } } },
        { orders: { some: notCancelledOrderLineWhere() } },
      ],
    });
  });

  it("a refund mark is the order status or a parcel coming back", () => {
    expect(refundOrderLineWhere()).toEqual({
      OR: [
        { status: { in: ["refund_requested", "refunded"] } },
        {
          shipment: {
            is: { status: { in: ["return_in_progress", "returned"] } },
          },
        },
      ],
    });
  });

  it("the same rule reads a one-line cart (offer order) directly", () => {
    expect(cartBucketWhere("delivered", singleLine)).toEqual({
      AND: [
        stage("delivered"),
        {
          NOT: { OR: [stage("new"), stage("shipped"), stage("in_transit")] },
        },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// Contract: kovalar birbirini dışlar ve her sepeti kapsar.
//
// Üretilen Prisma `where`'leri burada küçük bir bellek-içi yorumlayıcıyla
// değerlendirilir (yalnız builder'ın kullandığı operatörler: AND/OR/NOT,
// `in`/`notIn`, `shipment.is`, `orders.some`). Her sipariş durumu × kargo
// durumu (kargo yok dahil) kombinasyonu için: tam olarak BİR kova eşleşir ve
// o kova `orderCartBucketOf`'un (panelin okuduğu düz kural) söylediğidir.
// ---------------------------------------------------------------------------

type Where = Record<string, unknown>;

function matchesScalar(filter: unknown, value: string): boolean {
  const f = filter as { in?: string[]; notIn?: string[] };
  if (f.in) return f.in.includes(value);
  if (f.notIn) return !f.notIn.includes(value);
  throw new Error(`unsupported scalar filter ${JSON.stringify(filter)}`);
}

function matchesLine(where: unknown, line: OrderLineState): boolean {
  return Object.entries(where as Where).every(([key, value]) => {
    switch (key) {
      case "AND":
        return (value as unknown[]).every((part) => matchesLine(part, line));
      case "OR":
        return (value as unknown[]).some((part) => matchesLine(part, line));
      case "NOT":
        return !matchesLine(value, line);
      case "status":
        return matchesScalar(value, line.status);
      case "shipment": {
        const is = (value as { is: Where | null }).is;
        if (is === null) return line.shipmentStatus === null;
        if (line.shipmentStatus === null) return false;
        return matchesScalar(is.status, line.shipmentStatus);
      }
      default:
        throw new Error(`unsupported line key ${key}`);
    }
  });
}

function matchesGroup(where: unknown, lines: OrderLineState[]): boolean {
  return Object.entries(where as Where).every(([key, value]) => {
    switch (key) {
      case "AND":
        return (value as unknown[]).every((part) => matchesGroup(part, lines));
      case "OR":
        return (value as unknown[]).some((part) => matchesGroup(part, lines));
      case "NOT":
        return !matchesGroup(value, lines);
      case "orders": {
        const some = (value as { some: unknown }).some;
        return lines.some((line) => matchesLine(some, line));
      }
      default:
        throw new Error(`unsupported group key ${key}`);
    }
  });
}

const CART_BUCKETS = [
  ...ORDER_LINE_STAGES,
  ...ORDER_CLOSED_BUCKETS,
] as const satisfies readonly OrderCartBucket[];

const EVERY_LINE: OrderLineState[] = ORDER_STATUSES.flatMap((status) =>
  [null, ...SHIPMENT_STATUSES].map((shipmentStatus) => ({
    status,
    shipmentStatus,
  })),
);

describe("cart buckets — mutually exclusive and exhaustive (contract)", () => {
  it("the screen's bucket list is 'all', the stages, then the closed buckets", () => {
    expect([...ADMIN_ORDER_BUCKETS]).toEqual(["all", ...CART_BUCKETS]);
    expect([...ORDER_CLOSED_BUCKETS]).toEqual([
      "cancelled",
      "refunds",
      "other",
    ]);
  });

  it("a one-line cart (offer order): every order × shipment status lands in exactly one bucket", () => {
    for (const line of EVERY_LINE) {
      const hits = CART_BUCKETS.filter((bucket) =>
        matchesLine(cartBucketWhere(bucket, singleLine), line),
      );
      expect({ line, hits }).toEqual({
        line,
        hits: [orderCartBucketOf([line])],
      });
    }
  });

  it("a two-line cart (CheckoutGroup): every pair of lines lands in exactly one bucket", () => {
    const wheres = CART_BUCKETS.map(
      (bucket) => [bucket, cartBucketWhere(bucket, groupLines)] as const,
    );
    for (const a of EVERY_LINE) {
      for (const b of EVERY_LINE) {
        const cart = [a, b];
        const hits = wheres
          .filter(([, where]) => matchesGroup(where, cart))
          .map(([bucket]) => bucket);
        if (hits.length !== 1 || hits[0] !== orderCartBucketOf(cart)) {
          throw new Error(
            `cart ${JSON.stringify(cart)} → ${JSON.stringify(hits)}, expected ${orderCartBucketOf(cart)}`,
          );
        }
      }
    }
  });

  it("an empty cart is in no bucket", () => {
    expect(orderCartBucketOf([])).toBeNull();
    for (const bucket of CART_BUCKETS) {
      expect(matchesGroup(cartBucketWhere(bucket, groupLines), [])).toBe(false);
    }
  });

  it.each<[string, OrderLineState[], OrderCartBucket]>([
    [
      "unpaid / abandoned",
      [{ status: "pending_payment", shipmentStatus: null }],
      "other",
    ],
    [
      "fully cancelled",
      [{ status: "cancelled", shipmentStatus: null }],
      "cancelled",
    ],
    [
      "cancelled after the label was voided",
      [{ status: "cancelled", shipmentStatus: "cancelled" }],
      "cancelled",
    ],
    [
      "refund requested",
      [{ status: "refund_requested", shipmentStatus: "delivered" }],
      "refunds",
    ],
    ["refunded", [{ status: "refunded", shipmentStatus: null }], "refunds"],
    [
      "parcel returned to sender",
      [{ status: "shipped", shipmentStatus: "returned" }],
      "refunds",
    ],
    [
      "failed shipment",
      [{ status: "shipped", shipmentStatus: "failed" }],
      "other",
    ],
    [
      "one cancelled + one refunded package → refunds wins",
      [
        { status: "cancelled", shipmentStatus: null },
        { status: "refunded", shipmentStatus: "returned" },
      ],
      "refunds",
    ],
    [
      "one cancelled + one unpaid line is still open work → other",
      [
        { status: "cancelled", shipmentStatus: null },
        { status: "pending_payment", shipmentStatus: null },
      ],
      "other",
    ],
    [
      "a live package keeps the cart in its stage",
      [
        { status: "cancelled", shipmentStatus: null },
        { status: "delivered", shipmentStatus: "delivered" },
      ],
      "delivered",
    ],
  ])("%s", (_name, cart, expected) => {
    expect(orderCartBucketOf(cart)).toBe(expected);
  });
});
