import {
  ADMIN_REFUND_BUCKETS,
  ADMIN_REFUND_TABS,
  REFUND_ATTEMPT_IN_FLIGHT_STATUSES,
  REFUND_ATTEMPT_STATUSES,
  REFUND_CANCELLATION_POLICY_SUFFIX,
  REFUND_REQUEST_OPEN_STATUSES,
  REFUND_REQUEST_STATUSES,
  REFUND_REQUEST_STATUS_BUCKETS,
  SHIPMENT_STATUSES,
  TRADE_STATUSES,
  refundRequestBucketOf,
  tradeRefundBucketOf,
  type AdminRefundFilterBucket,
  type RefundAttemptStatusValue,
  type RefundRequestBucketState,
  type RefundRequestStatusValue,
  type ShipmentStatusValue,
  type TradeStatusValue,
} from "@tarodan/types";
import {
  TRADE_REFUND_SCOPE,
  refundBucketNeedsAttempts,
  refundListScopeOf,
  refundListSourceWheres,
  refundRequestBucketWhere,
  tradeRefundBucketWhere,
  tradeRefundKindOf,
  tradeRefundKindWhere,
} from "./refund-list-where";

const FILTER_BUCKETS = ADMIN_REFUND_BUCKETS.filter(
  (bucket): bucket is AdminRefundFilterBucket => bucket !== "all",
);

// ---------------------------------------------------------------------------
// Bellek-içi yorumlayıcı: builder'ın kullandığı operatörler (AND/OR/NOT,
// `in` / `notIn` / `endsWith` / null / `not: null`, `refundAttempts.some/none`).
// Her kova `where`'i bir satıra uygulanır; contract "tam olarak bir kova ve o
// kova düz kuralın söylediği"dir.
// ---------------------------------------------------------------------------

type Where = Record<string, unknown>;

function matchesScalar(filter: unknown, value: string | null): boolean {
  if (filter === null) return value === null;
  const f = filter as {
    in?: string[];
    notIn?: string[];
    endsWith?: string;
    not?: unknown;
  };
  if (f.in) return value !== null && f.in.includes(value);
  if (f.notIn) return value !== null && !f.notIn.includes(value);
  if (f.endsWith !== undefined) {
    return value !== null && value.endsWith(f.endsWith);
  }
  if ("not" in f && f.not === null) return value !== null;
  throw new Error(`unsupported scalar filter ${JSON.stringify(filter)}`);
}

interface RequestRow {
  id: string;
  status: RefundRequestStatusValue;
  policyCode: string;
  returnStatus: ShipmentStatusValue | null;
}

function matchesRequest(where: unknown, row: RequestRow): boolean {
  return Object.entries(where as Where).every(([key, value]) => {
    switch (key) {
      case "AND":
        return (value as unknown[]).every((part) => matchesRequest(part, row));
      case "OR":
        return (value as unknown[]).some((part) => matchesRequest(part, row));
      case "NOT":
        return !matchesRequest(value, row);
      case "id":
      case "status":
      case "policyCode":
      case "returnStatus":
        return matchesScalar(value, row[key]);
      default:
        throw new Error(`unsupported request key ${key}`);
    }
  });
}

interface TradeRow {
  status: TradeStatusValue;
  refundFailureReason: string | null;
  attemptStatuses: RefundAttemptStatusValue[];
}

function matchesTrade(where: unknown, row: TradeRow): boolean {
  return Object.entries(where as Where).every(([key, value]) => {
    switch (key) {
      case "AND":
        return (value as unknown[]).every((part) => matchesTrade(part, row));
      case "OR":
        return (value as unknown[]).some((part) => matchesTrade(part, row));
      case "NOT":
        return !matchesTrade(value, row);
      case "id":
        // MATCH_NOTHING: boş id kümesi.
        return matchesScalar(value, "trade-id");
      case "status":
      case "refundFailureReason":
        return matchesScalar(value, row[key]);
      case "refundAttempts": {
        const relation = value as { some?: Where; none?: Where };
        const hit = (filter: Where) =>
          row.attemptStatuses.some((status) =>
            matchesScalar(filter.status, status),
          );
        if (relation.some) return hit(relation.some);
        if (relation.none) return !hit(relation.none);
        throw new Error("unsupported relation filter");
      }
      default:
        throw new Error(`unsupported trade key ${key}`);
    }
  });
}

const policyOf = (kind: RefundRequestBucketState["kind"]) =>
  kind === "cancellation"
    ? `buyer${REFUND_CANCELLATION_POLICY_SUFFIX}`
    : "seller_fault_return";

describe("refund request bucket table", () => {
  it("terminal + open statuses cover every status exactly once", () => {
    const terminal = Object.values(REFUND_REQUEST_STATUS_BUCKETS).flat();
    const all = [...terminal, ...REFUND_REQUEST_OPEN_STATUSES].sort();
    expect(all).toEqual([...REFUND_REQUEST_STATUSES].sort());
  });

  it("the in-flight attempt states are every state but finalized", () => {
    expect([...REFUND_ATTEMPT_IN_FLIGHT_STATUSES].sort()).toEqual(
      REFUND_ATTEMPT_STATUSES.filter((s) => s !== "finalized").sort(),
    );
  });

  it("the screen's bucket list is 'all' then the seven filter buckets", () => {
    expect([...ADMIN_REFUND_BUCKETS]).toEqual([
      "all",
      "pending_review",
      "awaiting_return",
      "at_warehouse",
      "refunding",
      "completed",
      "rejected",
      "disputed",
    ]);
  });
});

describe("refund request buckets — exclusive and exhaustive (contract)", () => {
  it("every status × attempt × return shipment × kind lands in exactly one bucket, the one refundRequestBucketOf names", () => {
    let n = 0;
    for (const status of REFUND_REQUEST_STATUSES) {
      for (const attempt of [null, ...REFUND_ATTEMPT_STATUSES]) {
        for (const returnStatus of [null, ...SHIPMENT_STATUSES]) {
          for (const kind of ["cancellation", "return"] as const) {
            const id = `rr-${n++}`;
            const inFlight =
              attempt !== null &&
              (REFUND_ATTEMPT_IN_FLIGHT_STATUSES as readonly string[]).includes(
                attempt,
              );
            const ctx = { inFlightRequestIds: inFlight ? [id] : [] };
            const row: RequestRow = {
              id,
              status,
              policyCode: policyOf(kind),
              returnStatus,
            };
            const hits = FILTER_BUCKETS.filter((bucket) =>
              matchesRequest(refundRequestBucketWhere(bucket, ctx), row),
            );
            const expected = refundRequestBucketOf({
              status,
              kind,
              refundAttemptStatus: attempt,
              returnStatus,
            });
            if (hits.length !== 1 || hits[0] !== expected) {
              throw new Error(
                `${JSON.stringify({ status, attempt, returnStatus, kind })} → ${JSON.stringify(hits)}, expected ${expected}`,
              );
            }
          }
        }
      }
    }
  });

  it.each<[string, RefundRequestBucketState, AdminRefundFilterBucket]>([
    [
      "waiting for admin review",
      {
        status: "pending_review",
        kind: "return",
        refundAttemptStatus: null,
        returnStatus: null,
      },
      "pending_review",
    ],
    [
      "approved return, label not created yet",
      {
        status: "approved",
        kind: "return",
        refundAttemptStatus: null,
        returnStatus: null,
      },
      "awaiting_return",
    ],
    [
      "item on its way back",
      {
        status: "return_in_transit",
        kind: "return",
        refundAttemptStatus: null,
        returnStatus: "in_transit",
      },
      "awaiting_return",
    ],
    [
      "carrier delivered the return, request not flipped yet",
      {
        status: "return_in_transit",
        kind: "return",
        refundAttemptStatus: null,
        returnStatus: "delivered",
      },
      "at_warehouse",
    ],
    [
      "return delivered, inspection window",
      {
        status: "return_delivered",
        kind: "return",
        refundAttemptStatus: null,
        returnStatus: "delivered",
      },
      "at_warehouse",
    ],
    [
      "refund submitted to PayTR",
      {
        status: "return_delivered",
        kind: "return",
        refundAttemptStatus: "submitting",
        returnStatus: "delivered",
      },
      "refunding",
    ],
    [
      "refund failed, will be retried",
      {
        status: "return_delivered",
        kind: "return",
        refundAttemptStatus: "failed",
        returnStatus: "delivered",
      },
      "refunding",
    ],
    [
      "pre-shipment cancellation goes straight to refunding",
      {
        status: "approved",
        kind: "cancellation",
        refundAttemptStatus: null,
        returnStatus: null,
      },
      "refunding",
    ],
    [
      "refunded",
      {
        status: "refunded",
        kind: "cancellation",
        refundAttemptStatus: "finalized",
        returnStatus: null,
      },
      "completed",
    ],
    [
      "closed without refund",
      {
        status: "cancelled",
        kind: "return",
        refundAttemptStatus: null,
        returnStatus: null,
      },
      "rejected",
    ],
    [
      "disputed during inspection",
      {
        status: "disputed",
        kind: "return",
        refundAttemptStatus: null,
        returnStatus: "delivered",
      },
      "disputed",
    ],
  ])("%s", (_label, state, bucket) => {
    expect(refundRequestBucketOf(state)).toBe(bucket);
  });

  it("an open return with no return shipment is awaiting (NULL is not 'not delivered' in SQL)", () => {
    const where = refundRequestBucketWhere("awaiting_return", {
      inFlightRequestIds: [],
    });
    expect(JSON.stringify(where)).toContain('{"returnStatus":null}');
  });
});

describe("trade refund buckets — exclusive and exhaustive (contract)", () => {
  const ATTEMPT_SETS: RefundAttemptStatusValue[][] = [
    [],
    ["finalized"],
    ["failed"],
    ["submitting"],
    ["finalized", "manual_review"],
  ];

  it("every trade status × failure marker × attempts lands in exactly one bucket, the one tradeRefundBucketOf names", () => {
    for (const status of TRADE_STATUSES) {
      for (const failed of [false, true]) {
        for (const attempts of ATTEMPT_SETS) {
          const row: TradeRow = {
            status,
            refundFailureReason: failed ? "paytr: rejected" : null,
            attemptStatuses: attempts,
          };
          const hits = FILTER_BUCKETS.filter((bucket) =>
            matchesTrade(tradeRefundBucketWhere(bucket), row),
          );
          const expected = tradeRefundBucketOf({
            status,
            refundFailed: failed,
            hasInFlightRefundAttempt: attempts.some((s) =>
              (REFUND_ATTEMPT_IN_FLIGHT_STATUSES as readonly string[]).includes(
                s,
              ),
            ),
          });
          if (hits.length !== 1 || hits[0] !== expected) {
            throw new Error(
              `${JSON.stringify(row)} → ${JSON.stringify(hits)}, expected ${expected}`,
            );
          }
        }
      }
    }
  });

  it("a trade is never in review or rejected (it has no refund request)", () => {
    for (const status of TRADE_STATUSES) {
      const row: TradeRow = {
        status,
        refundFailureReason: null,
        attemptStatuses: [],
      };
      expect(
        matchesTrade(tradeRefundBucketWhere("pending_review"), row),
      ).toBe(false);
      expect(matchesTrade(tradeRefundBucketWhere("rejected"), row)).toBe(false);
    }
  });

  it.each<[string, TradeStatusValue, boolean, boolean, AdminRefundFilterBucket]>([
    ["warehouse rejected, parcels going back", "returning", false, false, "at_warehouse"],
    ["closed after the return", "cancelled", false, false, "completed"],
    ["refund failed on a cancelled trade", "cancelled", true, false, "refunding"],
    ["refund in flight", "returning", false, true, "refunding"],
    ["disputed trade, even with a failure marker", "disputed", true, false, "disputed"],
    ["dispute resolved with a compensation refund", "completed", false, false, "completed"],
  ])("%s", (_label, status, refundFailed, inFlight, bucket) => {
    expect(
      tradeRefundBucketOf({
        status,
        refundFailed,
        hasInFlightRefundAttempt: inFlight,
      }),
    ).toBe(bucket);
  });
});

describe("tradeRefundKindOf / tradeRefundKindWhere", () => {
  it.each([
    [null, false, "cancellation"],
    [new Date("2026-10-01T10:00:00.000Z"), false, "return"],
    [null, true, "return"],
  ] as const)(
    "arrival=%s returnLeg=%s → %s",
    (firstWarehouseArrivalAt, hasReturnLeg, kind) => {
      expect(tradeRefundKindOf({ firstWarehouseArrivalAt, hasReturnLeg })).toBe(
        kind,
      );
    },
  );

  it("the where is the same rule (arrival stamp or a return leg)", () => {
    expect(tradeRefundKindWhere("return")).toEqual({
      OR: [
        { firstWarehouseArrivalAt: { not: null } },
        { shipments: { some: { leg: "return" } } },
      ],
    });
    expect(tradeRefundKindWhere("cancellation")).toEqual({
      AND: [
        { firstWarehouseArrivalAt: null },
        { shipments: { none: { leg: "return" } } },
      ],
    });
  });
});

describe("refundListSourceWheres — tabs", () => {
  const ctx = { inFlightRequestIds: [] };

  it("all = requests of every origin + trades", () => {
    const wheres = refundListSourceWheres("all", "all", {}, ctx);
    expect(wheres.request).toEqual({ AND: [{}] });
    expect(wheres.trade).toEqual({ AND: [TRADE_REFUND_SCOPE] });
  });

  it("direct = requests of non-offer orders only", () => {
    const wheres = refundListSourceWheres("direct", "all", {}, ctx);
    expect(wheres.request).toEqual({
      AND: [{ order: { origin: { not: "offer" } } }],
    });
    expect(wheres.trade).toBeUndefined();
  });

  it("offer = requests of offer orders only", () => {
    const wheres = refundListSourceWheres("offer", "all", {}, ctx);
    expect(wheres.request).toEqual({ AND: [{ order: { origin: "offer" } }] });
    expect(wheres.trade).toBeUndefined();
  });

  it("trade = trade refunds only", () => {
    const wheres = refundListSourceWheres("trade", "all", {}, ctx);
    expect(wheres.request).toBeUndefined();
    expect(wheres.trade).toEqual({ AND: [TRADE_REFUND_SCOPE] });
  });

  it("every tab has at least one source", () => {
    for (const tab of ADMIN_REFUND_TABS) {
      const wheres = refundListSourceWheres(tab, "all", {}, ctx);
      expect(wheres.request ?? wheres.trade).toBeDefined();
    }
  });

  it("the trade scope is a charged payment plus a refund trace", () => {
    expect(TRADE_REFUND_SCOPE).toEqual({
      cashPayments: {
        some: { status: { in: ["completed", "refunded"] } },
      },
      OR: [
        { status: { in: ["returning", "cancelled", "disputed"] } },
        { cashPayments: { some: { refundedAt: { not: null } } } },
        { refundFailureReason: { not: null } },
        { refundAttempts: { some: {} } },
      ],
    });
  });

  it("a bucket adds the same rule the counts use", () => {
    const wheres = refundListSourceWheres("all", "refunding", {}, ctx);
    expect(wheres.request?.AND).toContainEqual(
      refundRequestBucketWhere("refunding", ctx),
    );
    expect(wheres.trade?.AND).toContainEqual(
      tradeRefundBucketWhere("refunding"),
    );
  });
});

describe("refundListSourceWheres — filters", () => {
  const ctx = { inFlightRequestIds: [] };

  it("date range uses Istanbul day edges on the refund time", () => {
    const wheres = refundListSourceWheres(
      "all",
      "all",
      { dateFrom: "2026-10-01", dateTo: "2026-10-12" },
      ctx,
    );
    const range = {
      gte: new Date("2026-09-30T21:00:00.000Z"),
      lte: new Date("2026-10-12T20:59:59.999Z"),
    };
    expect(wheres.request?.AND).toContainEqual({ createdAt: range });
    expect(wheres.trade?.AND).toContainEqual({
      OR: [{ cancelledAt: range }, { cancelledAt: null, updatedAt: range }],
    });
  });

  it("kind filters requests by policy and trades by warehouse arrival", () => {
    const wheres = refundListSourceWheres(
      "all",
      "all",
      { kind: "cancellation" },
      ctx,
    );
    expect(wheres.request?.AND).toContainEqual({
      policyCode: { endsWith: REFUND_CANCELLATION_POLICY_SUFFIX },
    });
    expect(wheres.trade?.AND).toContainEqual(
      tradeRefundKindWhere("cancellation"),
    );
  });

  it("search reaches refund no, order, parties, product and cargo codes", () => {
    const wheres = refundListSourceWheres(
      "all",
      "all",
      { search: "RFD-1" },
      ctx,
    );
    const text = JSON.stringify(wheres.request);
    for (const column of [
      "refundNumber",
      "returnTrackingNumber",
      "orderNumber",
      "groupNumber",
      "providerTrackingId",
      "adminCode",
      "productCode",
    ]) {
      expect(text).toContain(column);
    }
    const trade = JSON.stringify(wheres.trade);
    for (const column of ["tradeNumber", "shipments", "items", "adminCode"]) {
      expect(trade).toContain(column);
    }
  });

  it("a blank search adds nothing", () => {
    expect(refundListSourceWheres("all", "all", { search: "  " }, ctx)).toEqual(
      refundListSourceWheres("all", "all", {}, ctx),
    );
  });
});

describe("refundListScopeOf", () => {
  it("falls back to all / all and drops an unknown kind", () => {
    expect(
      refundListScopeOf({
        tab: "nope",
        bucket: "nope",
        kind: "bogus" as never,
      }),
    ).toEqual({
      tab: "all",
      bucket: "all",
      filters: {
        search: undefined,
        dateFrom: undefined,
        dateTo: undefined,
        kind: undefined,
      },
    });
  });

  it("keeps a known tab, bucket and kind", () => {
    expect(
      refundListScopeOf({ tab: "trade", bucket: "refunding", kind: "return" }),
    ).toMatchObject({
      tab: "trade",
      bucket: "refunding",
      filters: { kind: "return" },
    });
  });
});

describe("refundBucketNeedsAttempts", () => {
  it("only the buckets that read the attempt state need the prefetch", () => {
    expect(
      ADMIN_REFUND_BUCKETS.filter((bucket) => refundBucketNeedsAttempts(bucket)),
    ).toEqual(["awaiting_return", "at_warehouse", "refunding"]);
  });
});
