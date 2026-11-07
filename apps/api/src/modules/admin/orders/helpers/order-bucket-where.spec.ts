import {
  CancellationActor,
  OfferStatus,
  OrderOrigin,
  OrderStatus,
  PaymentStatus,
  RefundAttemptStatus,
  RefundRequestStatus,
  ShipmentStatus,
  TradeStatus,
} from "@prisma/client";
import {
  ADMIN_ORDER_BUCKETS,
  ADMIN_ORDER_TAB_BUCKETS,
  ADMIN_ORDER_TABS,
  CANCELLATION_ACTORS,
  OFFER_STATUSES,
  ORDER_CLOSED_BUCKETS,
  ORDER_ORIGINS,
  ORDER_LINE_STAGES,
  ORDER_LINE_STAGE_RULES,
  ORDER_STATUSES,
  REFUND_ATTEMPT_STATUSES,
  REFUND_REQUEST_STATUSES,
  SHIPMENT_STATUSES,
  TRADE_STATUSES,
  orderCartBucketOf,
  orderLineStageOf,
  type OrderCartBucket,
  type OrderLineState,
} from "@tarodan/types";
import {
  CHARGED_PAYMENT_STATUSES,
  chargedOrderLineWhere,
  isChargedOrderLine,
} from "./charged-payment";
import {
  cartBucketWhere,
  groupLines,
  notCancelledOrderLineWhere,
  notUnpaidOrderLineWhere,
  orderLineStageWhere,
  refundOrderLineWhere,
  singleLine,
  unpaidOrderLineWhere,
} from "./order-bucket-where";

describe("commerce status values mirror the Prisma enums", () => {
  // If the values @tarodan/types carries drift from the schema, the bucket
  // builder queries a status that does not exist (or puts a new status in
  // no bucket).
  it.each([
    ["OrderStatus", ORDER_STATUSES, OrderStatus],
    ["ShipmentStatus", SHIPMENT_STATUSES, ShipmentStatus],
    ["OfferStatus", OFFER_STATUSES, OfferStatus],
    ["OrderOrigin", ORDER_ORIGINS, OrderOrigin],
    ["CancellationActor", CANCELLATION_ACTORS, CancellationActor],
    // The refunds screen's bucket rule reads these (admin-refund-list.ts).
    ["RefundRequestStatus", REFUND_REQUEST_STATUSES, RefundRequestStatus],
    ["RefundAttemptStatus", REFUND_ATTEMPT_STATUSES, RefundAttemptStatus],
    ["TradeStatus", TRADE_STATUSES, TradeStatus],
  ])("%s", (_name, shared, prismaEnum) => {
    expect([...shared].sort()).toEqual(Object.values(prismaEnum).sort());
  });
});

describe("order line stage rules", () => {
  it("put every order × shipment combination in exactly one stage (or other)", () => {
    // orderLineStageOf returns the first match; overlapping rules would count
    // one line in two buckets. Count the matching rules straight from the
    // table for every combination: at most one.
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

describe("charged / unpaid line filters", () => {
  it("charged = completed or refunded, on the order's payment or its group's", () => {
    expect(CHARGED_PAYMENT_STATUSES).toEqual(["completed", "refunded"]);
    expect(chargedOrderLineWhere()).toEqual({
      OR: [
        { payment: { is: { status: { in: ["completed", "refunded"] } } } },
        {
          AND: [
            // NULL guard: a groupless order must make this branch false, not
            // SQL NULL, or `NOT charged` drops it (see charged-payment.ts)
            { checkoutGroupId: { not: null } },
            {
              checkoutGroup: {
                is: {
                  payment: {
                    is: { status: { in: ["completed", "refunded"] } },
                  },
                },
              },
            },
          ],
        },
      ],
    });
  });

  it("unpaid = awaiting payment or cancelled, and not charged", () => {
    expect(unpaidOrderLineWhere()).toEqual({
      AND: [
        { status: { in: ["pending_payment", "cancelled"] } },
        { NOT: chargedOrderLineWhere() },
      ],
    });
  });

  it("not unpaid = another status, or charged (the positive complement)", () => {
    expect(notUnpaidOrderLineWhere()).toEqual({
      OR: [
        { status: { notIn: ["pending_payment", "cancelled"] } },
        chargedOrderLineWhere(),
      ],
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

  // The closed carts are split four ways (cancelled / refunds / unpaid /
  // other) and all four share the same "closed" base.
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
  const noRefund = { NOT: { orders: { some: refundOrderLineWhere() } } };

  it("refunds = a closed cart with at least one refund-marked line", () => {
    expect(cartBucketWhere("refunds", groupLines)).toEqual({
      AND: [...closedBase, { orders: { some: refundOrderLineWhere() } }],
    });
  });

  it("unpaid = a closed cart with no refund mark and no line that is not unpaid", () => {
    expect(cartBucketWhere("unpaid", groupLines)).toEqual({
      AND: [
        ...closedBase,
        noRefund,
        { NOT: { orders: { some: notUnpaidOrderLineWhere() } } },
      ],
    });
  });

  it("cancelled = a closed cart with no refund mark, a line that is not unpaid and no line that is not cancelled", () => {
    expect(cartBucketWhere("cancelled", groupLines)).toEqual({
      AND: [
        ...closedBase,
        noRefund,
        { orders: { some: notUnpaidOrderLineWhere() } },
        { NOT: { orders: { some: notCancelledOrderLineWhere() } } },
      ],
    });
  });

  it("other = a closed cart with no refund mark, a line that is not unpaid and a line that is not cancelled", () => {
    expect(cartBucketWhere("other", groupLines)).toEqual({
      AND: [
        ...closedBase,
        noRefund,
        { orders: { some: notUnpaidOrderLineWhere() } },
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
// Contract: the buckets are disjoint and cover every cart.
//
// The generated Prisma `where`s are evaluated by a small in-memory
// interpreter (only the operators the builder uses: AND/OR/NOT, `in`/`notIn`,
// `not: null`, `shipment.is`, `payment.is`, `checkoutGroup.is`,
// `orders.some`). For every order status × shipment status (no shipment
// included) × charge state: exactly ONE bucket matches, and it is the one
// `orderCartBucketOf` (the plain rule the panel reads) names.
//
// The interpreter follows SQL's three-valued logic where Prisma can produce
// NULL, and models the pessimistic case on purpose:
// - `payment` and `shipment` are back relations (the key is on the related
//   table). Prisma renders them as `id IN (SELECT fk ... AND fk IS NOT NULL)`,
//   which is never NULL: a missing row is plainly "no match".
// - `checkoutGroup` is a forward relation over the nullable
//   `checkoutGroupId`. On a groupless order this interpreter returns NULL
//   (unknown), as `NULL IN (...)` would, so a builder that negated it without
//   the `checkoutGroupId: { not: null }` guard would lose the order from
//   every bucket and fail here.
// - `orders.some` is a subquery: a NULL row condition just does not select
//   the line.
// ---------------------------------------------------------------------------

type Where = Record<string, unknown>;
type Tri = boolean | null;

/** A line as the database holds it: the order, its payment and its group. */
interface DbLine extends OrderLineState {
  /** The order's own payment row; null when it has none. */
  payment: PaymentStatus | null;
  /** The checkout group; null for a groupless order. */
  group: { payment: PaymentStatus | null } | null;
}

function triAnd(values: Tri[]): Tri {
  if (values.includes(false)) return false;
  return values.includes(null) ? null : true;
}

function triOr(values: Tri[]): Tri {
  if (values.includes(true)) return true;
  return values.includes(null) ? null : false;
}

function matchesScalar(filter: unknown, value: string): boolean {
  const f = filter as { in?: string[]; notIn?: string[] };
  if (f.in) return f.in.includes(value);
  if (f.notIn) return !f.notIn.includes(value);
  throw new Error(`unsupported scalar filter ${JSON.stringify(filter)}`);
}

/** `{ is: null }` / `{ is: { status } }` on a to-one row that may be missing. */
function matchesToOne(filter: unknown, status: string | null): boolean {
  const is = (filter as { is: Where | null }).is;
  if (is === null) return status === null;
  const keys = Object.keys(is);
  if (keys.length !== 1 || keys[0] !== "status") {
    throw new Error(`unsupported relation filter ${JSON.stringify(is)}`);
  }
  return status !== null && matchesScalar(is.status, status);
}

function evalLine(where: unknown, line: DbLine): Tri {
  return triAnd(
    Object.entries(where as Where).map(([key, value]): Tri => {
      switch (key) {
        case "AND":
          return triAnd((value as unknown[]).map((p) => evalLine(p, line)));
        case "OR":
          return triOr((value as unknown[]).map((p) => evalLine(p, line)));
        case "NOT": {
          const inner = evalLine(value, line);
          return inner === null ? null : !inner;
        }
        case "status":
          return matchesScalar(value, line.status);
        case "shipment":
          return matchesToOne(value, line.shipmentStatus);
        case "payment":
          return matchesToOne(value, line.payment);
        case "checkoutGroupId": {
          if (JSON.stringify(value) !== JSON.stringify({ not: null })) {
            throw new Error(`unsupported filter ${JSON.stringify(value)}`);
          }
          return line.group !== null;
        }
        case "checkoutGroup": {
          // NULL foreign key: unknown, not false (see the header).
          if (line.group === null) return null;
          const is = (value as { is: Where }).is;
          const keys = Object.keys(is ?? {});
          if (keys.length !== 1 || keys[0] !== "payment") {
            throw new Error(`unsupported group filter ${JSON.stringify(is)}`);
          }
          return matchesToOne(is.payment, line.group.payment);
        }
        default:
          throw new Error(`unsupported line key ${key}`);
      }
    }),
  );
}

/** A WHERE clause selects the row only when it is TRUE. */
const matchesLine = (where: unknown, line: DbLine) =>
  evalLine(where, line) === true;

/**
 * Line verdicts per `orders.some` condition object: the pair test evaluates
 * the same few conditions on the same lines tens of thousands of times.
 */
const lineVerdicts = new WeakMap<object, Map<DbLine, boolean>>();

function someLineMatches(some: object, line: DbLine): boolean {
  let verdicts = lineVerdicts.get(some);
  if (!verdicts) {
    verdicts = new Map();
    lineVerdicts.set(some, verdicts);
  }
  let verdict = verdicts.get(line);
  if (verdict === undefined) {
    verdict = matchesLine(some, line);
    verdicts.set(line, verdict);
  }
  return verdict;
}

function matchesGroup(where: unknown, lines: DbLine[]): boolean {
  return Object.entries(where as Where).every(([key, value]) => {
    switch (key) {
      case "AND":
        return (value as unknown[]).every((part) => matchesGroup(part, lines));
      case "OR":
        return (value as unknown[]).some((part) => matchesGroup(part, lines));
      case "NOT":
        return !matchesGroup(value, lines);
      case "orders": {
        const some = (value as { some: object }).some;
        return lines.some((line) => someLineMatches(some, line));
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

const PAYMENT_STATUSES = Object.values(PaymentStatus);

const charged = (payment: PaymentStatus | null) =>
  payment !== null && CHARGED_PAYMENT_STATUSES.includes(payment);

/** Every order status × shipment status (none included). */
const EVERY_STATE = ORDER_STATUSES.flatMap((status) =>
  [null, ...SHIPMENT_STATUSES].map((shipmentStatus) => ({
    status,
    shipmentStatus,
  })),
);

/**
 * A groupless order (offer order) with every payment state its own payment
 * row can have — no row at all included.
 */
const EVERY_SINGLE_LINE: DbLine[] = EVERY_STATE.flatMap((state) =>
  [null, ...PAYMENT_STATUSES].map((payment) => ({
    ...state,
    charged: charged(payment),
    payment,
    group: null,
  })),
);

/**
 * A cart line, charged or not through its group's payment. A charged and an
 * uncharged line may share a cart here (the real cart shares one payment):
 * the rule must still hold line by line.
 */
const EVERY_GROUP_LINE: DbLine[] = EVERY_STATE.flatMap((state) =>
  [true, false].map((isCharged) => ({
    ...state,
    charged: isCharged,
    payment: null,
    group: { payment: isCharged ? PaymentStatus.completed : null },
  })),
);

describe("charged / unpaid line filters agree with the plain rule (contract)", () => {
  // Every own-payment state × every group state, a missing row included.
  const groups = [
    null,
    { payment: null },
    ...PAYMENT_STATUSES.map((payment) => ({ payment })),
  ];
  const lines: DbLine[] = ORDER_STATUSES.flatMap((status) =>
    [null, ...PAYMENT_STATUSES].flatMap((payment) =>
      groups.map((group) => ({
        status,
        shipmentStatus: null,
        payment,
        group,
        charged: charged(payment) || charged(group?.payment ?? null),
      })),
    ),
  );

  it("charged matches the mapper's isChargedOrderLine on every combination", () => {
    for (const line of lines) {
      const facts = {
        payment: line.payment ? { status: line.payment } : null,
        checkoutGroup: line.group
          ? {
              payment: line.group.payment
                ? { status: line.group.payment }
                : null,
            }
          : null,
      };
      expect({ line, charged: isChargedOrderLine(facts) }).toEqual({
        line,
        charged: line.charged,
      });
      // never NULL: safe under NOT
      expect({ line, sql: evalLine(chargedOrderLineWhere(), line) }).toEqual({
        line,
        sql: line.charged,
      });
    }
  });

  it("unpaid and not-unpaid are exact complements, never NULL", () => {
    for (const line of lines) {
      const unpaid = evalLine(unpaidOrderLineWhere(), line);
      const notUnpaid = evalLine(notUnpaidOrderLineWhere(), line);
      const expected =
        ["pending_payment", "cancelled"].includes(line.status) && !line.charged;
      expect({ line, unpaid, notUnpaid }).toEqual({
        line,
        unpaid: expected,
        notUnpaid: !expected,
      });
    }
  });

  it("a missing payment row is not charged", () => {
    const orphan: DbLine = {
      status: "cancelled",
      shipmentStatus: null,
      charged: false,
      payment: null,
      group: null,
    };
    expect(evalLine(chargedOrderLineWhere(), orphan)).toBe(false);
    expect(matchesLine(unpaidOrderLineWhere(), orphan)).toBe(true);
  });
});

describe("cart buckets — mutually exclusive and exhaustive (contract)", () => {
  it("the screen's bucket list is 'all', the stages, then the closed buckets", () => {
    expect([...ADMIN_ORDER_BUCKETS]).toEqual(["all", ...CART_BUCKETS]);
    expect([...ORDER_CLOSED_BUCKETS]).toEqual([
      "cancelled",
      "refunds",
      "unpaid",
      "other",
    ]);
  });

  it("every order tab offers the unpaid bucket next to cancelled and other", () => {
    for (const tab of ADMIN_ORDER_TABS) {
      expect(ADMIN_ORDER_TAB_BUCKETS[tab]).toEqual(
        expect.arrayContaining(["cancelled", "unpaid", "other"]),
      );
    }
  });

  it("a one-line cart (offer order): every status × shipment × payment lands in exactly one bucket", () => {
    const wheres = CART_BUCKETS.map(
      (bucket) => [bucket, cartBucketWhere(bucket, singleLine)] as const,
    );
    for (const line of EVERY_SINGLE_LINE) {
      const hits = wheres
        .filter(([, where]) => matchesLine(where, line))
        .map(([bucket]) => bucket);
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
    for (const a of EVERY_GROUP_LINE) {
      for (const b of EVERY_GROUP_LINE) {
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

  const paid = { charged: true };
  const unpaid = { charged: false };

  it.each<[string, OrderLineState[], OrderCartBucket]>([
    [
      "awaiting payment (abandoned checkout, unpaid accepted offer)",
      [{ status: "pending_payment", shipmentStatus: null, ...unpaid }],
      "unpaid",
    ],
    [
      "cancelled at payment expiry, never charged",
      [{ status: "cancelled", shipmentStatus: null, ...unpaid }],
      "unpaid",
    ],
    [
      "cancelled after a charge",
      [{ status: "cancelled", shipmentStatus: null, ...paid }],
      "cancelled",
    ],
    [
      "cancelled after the label was voided",
      [{ status: "cancelled", shipmentStatus: "cancelled", ...paid }],
      "cancelled",
    ],
    [
      "one cancelled + one awaiting payment, both unpaid → unpaid",
      [
        { status: "cancelled", shipmentStatus: null, ...unpaid },
        { status: "pending_payment", shipmentStatus: null, ...unpaid },
      ],
      "unpaid",
    ],
    [
      "one charged cancel + one unpaid cancel → cancelled",
      [
        { status: "cancelled", shipmentStatus: null, ...paid },
        { status: "cancelled", shipmentStatus: null, ...unpaid },
      ],
      "cancelled",
    ],
    [
      "one charged cancel + one line awaiting payment → other",
      [
        { status: "cancelled", shipmentStatus: null, ...paid },
        { status: "pending_payment", shipmentStatus: null, ...unpaid },
      ],
      "other",
    ],
    [
      "refund requested",
      [{ status: "refund_requested", shipmentStatus: "delivered", ...paid }],
      "refunds",
    ],
    [
      "refunded",
      [{ status: "refunded", shipmentStatus: null, ...paid }],
      "refunds",
    ],
    [
      "parcel returned to sender",
      [{ status: "shipped", shipmentStatus: "returned", ...paid }],
      "refunds",
    ],
    [
      "failed shipment",
      [{ status: "shipped", shipmentStatus: "failed", ...paid }],
      "other",
    ],
    [
      "one cancelled + one refunded package → refunds wins",
      [
        { status: "cancelled", shipmentStatus: null, ...paid },
        { status: "refunded", shipmentStatus: "returned", ...paid },
      ],
      "refunds",
    ],
    [
      "a live package keeps the cart in its stage",
      [
        { status: "cancelled", shipmentStatus: null, ...paid },
        { status: "delivered", shipmentStatus: "delivered", ...paid },
      ],
      "delivered",
    ],
  ])("%s", (_name, cart, expected) => {
    expect(orderCartBucketOf(cart)).toBe(expected);
  });
});
