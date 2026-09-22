import {
  CancellationActor,
  OrderOrigin,
  OrderStatus,
  ProductKind,
} from "@prisma/client";
import {
  ADMIN_CANCELLATION_BUCKETS,
  ADMIN_CANCELLATION_NEW_WINDOW_MS,
  ADMIN_CANCELLATION_TABS,
  CANCELLATION_ACTORS,
} from "@tarodan/types";
import {
  CANCELLED_TRADE_STATUSES,
  PAID_PAYMENT_STATUSES,
  cancellationBucketWhere,
  cancellationScopeOf,
  cancellationSourceWheres,
} from "./cancellation-where";

const NOW = new Date("2026-09-22T12:00:00.000Z");
const json = (value: unknown) => JSON.stringify(value);

describe("cancellation where-builder", () => {
  describe("sources per tab", () => {
    it("all = cancelled direct + PAID offer orders + cancelled/rejected trades", () => {
      const { order, trade } = cancellationSourceWheres("all", "all", {}, NOW);
      expect(order).toEqual({
        AND: [
          {
            AND: [
              {
                status: OrderStatus.cancelled,
                product: { kind: ProductKind.listing },
              },
              {
                OR: [
                  { origin: OrderOrigin.direct_sale },
                  {
                    origin: OrderOrigin.offer,
                    payment: {
                      is: { status: { in: PAID_PAYMENT_STATUSES } },
                    },
                  },
                ],
              },
            ],
          },
        ],
      });
      expect(trade).toEqual({
        AND: [{ status: { in: CANCELLED_TRADE_STATUSES } }],
      });
    });

    it("direct_sale = cancelled direct-sale listing orders only, no trades", () => {
      const { order, trade } = cancellationSourceWheres(
        "direct_sale",
        "all",
        {},
        NOW,
      );
      expect(json(order)).toContain(`"origin":"direct_sale"`);
      expect(json(order)).not.toContain(`"origin":"offer"`);
      expect(trade).toBeUndefined();
    });

    it("offer = cancelled offer orders that had been PAID — dropped unpaid offers never list", () => {
      const { order, trade } = cancellationSourceWheres(
        "offer",
        "all",
        {},
        NOW,
      );
      expect(json(order)).toContain(`"origin":"offer"`);
      expect(json(order)).toContain(
        json({
          payment: { is: { status: { in: ["completed", "refunded"] } } },
        }).slice(1, -1),
      );
      expect(json(order)).not.toContain(`"origin":"direct_sale"`);
      expect(trade).toBeUndefined();
    });

    it("trade = cancelled or rejected trades, no orders", () => {
      const { order, trade } = cancellationSourceWheres(
        "trade",
        "all",
        {},
        NOW,
      );
      expect(order).toBeUndefined();
      expect(CANCELLED_TRADE_STATUSES).toEqual(["cancelled", "rejected"]);
      expect(json(trade)).toContain(`"status":{"in":["cancelled","rejected"]}`);
    });

    it("platform service orders (membership / boost) are never operation rows", () => {
      for (const tab of ["all", "direct_sale", "offer"] as const) {
        const { order } = cancellationSourceWheres(tab, "all", {}, NOW);
        expect(json(order)).toContain(`"kind":"listing"`);
        expect(json(order)).not.toContain("platform_service");
      }
    });
  });

  describe("sub-tabs", () => {
    it("all adds no condition", () => {
      expect(cancellationBucketWhere("all", NOW)).toBeUndefined();
    });

    it("new = cancelled within the last 24 hours", () => {
      expect(cancellationBucketWhere("new", NOW)).toEqual({
        cancelledAt: {
          gte: new Date(NOW.getTime() - ADMIN_CANCELLATION_NEW_WINDOW_MS),
        },
      });
    });

    it("actor sub-tabs: buyer, seller, and Tarodan = platform + system", () => {
      expect(cancellationBucketWhere("buyer", NOW)).toEqual({
        cancelledBy: { in: [CancellationActor.buyer] },
      });
      expect(cancellationBucketWhere("seller", NOW)).toEqual({
        cancelledBy: { in: [CancellationActor.seller] },
      });
      expect(cancellationBucketWhere("platform", NOW)).toEqual({
        cancelledBy: {
          in: [CancellationActor.platform, CancellationActor.system],
        },
      });
    });

    it("every actor is covered by exactly one actor sub-tab; unknown (null) by none", () => {
      const actorBuckets = ["buyer", "seller", "platform"] as const;
      for (const actor of CANCELLATION_ACTORS) {
        const owners = actorBuckets.filter((bucket) =>
          json(cancellationBucketWhere(bucket, NOW)).includes(`"${actor}"`),
        );
        expect(owners).toHaveLength(1);
      }
      for (const bucket of actorBuckets) {
        expect(json(cancellationBucketWhere(bucket, NOW))).not.toContain(
          "null",
        );
      }
    });

    it.each(
      ADMIN_CANCELLATION_TABS.flatMap((tab) =>
        ADMIN_CANCELLATION_BUCKETS.map((bucket) => [tab, bucket] as const),
      ),
    )(
      "%s × %s applies the SAME sub-tab condition to every source",
      (tab, bucket) => {
        const { order, trade } = cancellationSourceWheres(tab, bucket, {}, NOW);
        const condition = cancellationBucketWhere(bucket, NOW);
        for (const where of [order, trade]) {
          if (!where) continue;
          const parts = (where as { AND: unknown[] }).AND;
          if (condition) expect(parts).toContainEqual(condition);
          else expect(parts).toHaveLength(1);
        }
        expect(Boolean(order)).toBe(tab !== "trade");
        expect(Boolean(trade)).toBe(tab === "all" || tab === "trade");
      },
    );
  });

  describe("filters", () => {
    it("searches each code in its own columns, per source", () => {
      const { order, trade } = cancellationSourceWheres(
        "all",
        "all",
        { orderNumber: "ORD-1", cargoCode: "123", groupNumber: "GRP-9" },
        NOW,
      );
      const o = json(order);
      expect(o).toContain(`"orderNumber":{"contains":"ORD-1"`);
      expect(o).toContain(`"shipment":{"trackingNumber":{"contains":"123"`);
      expect(o).toContain(`"shipment":{"providerTrackingId":{"contains":"123"`);
      expect(o).toContain(`"checkoutGroup":{"groupNumber":{"contains":"GRP-9"`);
      const t = json(trade);
      expect(t).toContain(`"tradeNumber":{"contains":"ORD-1"`);
      expect(t).toContain(`"shipments":{"some":{"OR"`);
      // Takasın grubu yoktur: grup kodu filtresi hiçbir takası eşlemez.
      expect(t).toContain(`"id":{"in":[]}`);
    });

    it("party matches names, e-mails, user codes and user ids on both sides", () => {
      const { order, trade } = cancellationSourceWheres(
        "all",
        "all",
        { party: "K010001" },
        NOW,
      );
      for (const column of [
        `"buyer":{"displayName"`,
        `"seller":{"adminCode"`,
        `"buyerId":{"contains"`,
        `"sellerId":{"contains"`,
      ]) {
        expect(json(order)).toContain(column);
      }
      for (const column of [
        `"initiator":{"email"`,
        `"receiver":{"adminCode"`,
        `"initiatorId":{"contains"`,
        `"receiverId":{"contains"`,
      ]) {
        expect(json(trade)).toContain(column);
      }
    });

    it("the date range filters the CANCELLATION moment, not creation", () => {
      const { order, trade } = cancellationSourceWheres(
        "all",
        "all",
        { startDate: "2026-09-01", endDate: "2026-09-10" },
        NOW,
      );
      for (const where of [order, trade]) {
        expect(json(where)).toContain(`"cancelledAt":{"gte"`);
        expect(json(where)).not.toContain(`"createdAt"`);
      }
    });

    it("blank filters add nothing", () => {
      const { order } = cancellationSourceWheres(
        "direct_sale",
        "all",
        { orderNumber: "  ", party: "" },
        NOW,
      );
      expect((order as { AND: unknown[] }).AND).toHaveLength(1);
    });
  });

  it("resolves unknown tab / sub-tab to the defaults", () => {
    expect(cancellationScopeOf({ tab: "x", bucket: "y" })).toMatchObject({
      tab: "all",
      bucket: "all",
    });
    expect(
      cancellationScopeOf({ tab: "trade", bucket: "seller", party: "a" }),
    ).toEqual({
      tab: "trade",
      bucket: "seller",
      filters: expect.objectContaining({ party: "a" }),
    });
  });
});
