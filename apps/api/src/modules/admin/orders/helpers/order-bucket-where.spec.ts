import {
  CancellationActor,
  OfferStatus,
  OrderOrigin,
  OrderStatus,
  ShipmentStatus,
} from "@prisma/client";
import {
  CANCELLATION_ACTORS,
  OFFER_STATUSES,
  ORDER_ORIGINS,
  ORDER_LINE_STAGES,
  ORDER_LINE_STAGE_RULES,
  ORDER_STATUSES,
  SHIPMENT_STATUSES,
  orderLineStageOf,
} from "@tarodan/types";
import {
  cartBucketWhere,
  groupLines,
  orderLineStageWhere,
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

  it("other = a cart with lines, none of them in any progress stage", () => {
    expect(cartBucketWhere("other", groupLines)).toEqual({
      AND: [
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
