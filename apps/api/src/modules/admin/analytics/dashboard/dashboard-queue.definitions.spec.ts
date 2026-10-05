import {
  DASHBOARD_QUEUE_KEYS,
  DASHBOARD_QUEUE_PARTS,
  DASHBOARD_QUEUE_PART_KEYS,
  DASHBOARD_QUEUE_PART_LINKS,
} from "@tarodan/types";
import {
  QUEUE_PART_DEFINITIONS,
  missingTrackingWhere,
} from "./dashboard-queue.definitions";
import {
  exhaustedInvoicesWhere,
  failedTransfersWhere,
  openAdjustmentsWhere,
  overdueHoldsWhere,
  uninvoicedDeliveredWhere,
} from "../../finance/finance-health.where";
import type { AlertThresholdContext } from "../../../../config/alert-thresholds";
import { defaultTimingValues } from "../../../../common/timing-rules";

const NOW = new Date("2026-09-18T12:00:00.000Z");

/** Durations & Rules values a dashboard build resolves; registry defaults here. */
const CTX: AlertThresholdContext = { timing: defaultTimingValues() };

describe("dashboard queue definitions", () => {
  it("defines every catalogued line exactly once, under exactly one tile", () => {
    expect(Object.keys(QUEUE_PART_DEFINITIONS).sort()).toEqual(
      [...DASHBOARD_QUEUE_PART_KEYS].sort(),
    );

    const grouped = DASHBOARD_QUEUE_KEYS.flatMap(
      (queue) => DASHBOARD_QUEUE_PARTS[queue],
    );
    expect(grouped.sort()).toEqual([...DASHBOARD_QUEUE_PART_KEYS].sort());
  });

  it("gives every line the admin screen that clears it", () => {
    for (const key of DASHBOARD_QUEUE_PART_KEYS) {
      expect(DASHBOARD_QUEUE_PART_LINKS[key]).toMatch(/^\//);
    }
  });

  describe("where clauses", () => {
    const whereOf = (key: keyof typeof QUEUE_PART_DEFINITIONS) =>
      QUEUE_PART_DEFINITIONS[key].where(NOW, CTX) as Record<string, any>;

    it("reads refunds from the REQUEST's own status, not the order's", () => {
      expect(whereOf("refundsPendingReview")).toEqual({
        order: { isTest: false },
        status: "pending_review",
      });
      expect(whereOf("refundsDisputed")).toEqual({
        order: { isTest: false },
        status: "disputed",
      });
      // The replaced endpoint counted Order.status = refund_requested here.
      expect(JSON.stringify(whereOf("refundsPendingReview"))).not.toContain(
        "refund_requested",
      );
    });

    it("covers the four trade situations an operator must resolve", () => {
      expect(whereOf("tradesAtWarehouse").status.in).toEqual([
        "at_warehouse",
        "admin_reviewing",
      ]);
      expect(whereOf("tradeDisputesOpen")).toEqual({
        trade: { isTest: false },
        resolvedAt: null,
      });
      expect(whereOf("tradeRefundFailures")).toEqual({
        isTest: false,
        refundFailureAt: { not: null },
      });
      expect(whereOf("tradeCompensationPending")).toEqual({
        isTest: false,
        compensationPendingUserId: { not: null },
        compensationResolvedAt: null,
      });
    });

    it("moderates only real listings, never virtual products", () => {
      expect(whereOf("productsPending")).toEqual({
        kind: "listing",
        status: "pending",
      });
      expect(whereOf("messagesPendingApproval")).toEqual({
        status: "pending_approval",
      });
    });

    it("counts seller applications and the CURRENT documents only", () => {
      expect(whereOf("corporateApplications").status.in).toEqual([
        "submitted",
        "under_review",
      ]);
      const documents = whereOf("sellerDocuments");
      expect(documents.isCurrent).toBe(true);
      expect(documents.status.in).toEqual([
        "pending",
        "appealed",
        "revision_requested",
      ]);
    });

    it("treats urgent tickets as a highlighted SUBSET of the open ones", () => {
      expect(whereOf("ticketsOpen").status.in).toEqual(["open", "in_progress"]);
      expect(whereOf("ticketsUrgent").priority.in).toEqual(["urgent", "high"]);
      expect(QUEUE_PART_DEFINITIONS.ticketsUrgent.subsetOf).toBe("ticketsOpen");
      // Everything else is counted in full.
      const subsets = DASHBOARD_QUEUE_PART_KEYS.filter(
        (key) => QUEUE_PART_DEFINITIONS[key].subsetOf,
      );
      expect(subsets).toEqual(["ticketsUrgent"]);
    });

    it("reuses the finance health definitions instead of restating them", () => {
      expect(whereOf("payoutsFailed")).toEqual(failedTransfersWhere);
      expect(whereOf("holdsOverdue")).toEqual(overdueHoldsWhere(NOW));
      expect(whereOf("adjustmentsOpen")).toEqual(openAdjustmentsWhere);
      expect(whereOf("invoicesExhausted")).toEqual(exhaustedInvoicesWhere);
      expect(whereOf("ordersUninvoiced")).toEqual(
        uninvoicedDeliveredWhere(NOW, CTX),
      );
    });

    it("ages the tracking and invoice queues by the Durations & Rules values", () => {
      const ctx: AlertThresholdContext = {
        timing: {
          ...defaultTimingValues(),
          missingTrackingAlertHours: 6,
          invoiceDeadlineDays: 2,
        },
      };
      const tracking = missingTrackingWhere(NOW, ctx) as Record<string, any>;
      expect(NOW.getTime() - tracking.createdAt.lt.getTime()).toBe(
        6 * 60 * 60 * 1000,
      );
      const uninvoiced = uninvoicedDeliveredWhere(NOW, ctx) as Record<
        string,
        any
      >;
      expect(NOW.getTime() - uninvoiced.deliveredAt.lt.getTime()).toBe(
        2 * 24 * 60 * 60 * 1000,
      );
      // Admin değeri yokken bugünkü varsayılanlar (24 saat / 5 gün).
      const base = missingTrackingWhere(NOW, CTX) as Record<string, any>;
      expect(NOW.getTime() - base.createdAt.lt.getTime()).toBe(
        24 * 60 * 60 * 1000,
      );
    });

    it("flags shipments that never got a carrier tracking id", () => {
      const where = missingTrackingWhere(NOW, CTX) as Record<string, any>;
      expect(where.providerTrackingId).toBeNull();
      expect(where.createdAt.lt.getTime()).toBeLessThan(NOW.getTime());
      // A finished shipment is not waiting on anyone.
      expect(where.status.notIn).toEqual([
        "delivered",
        "cancelled",
        "returned",
      ]);
    });
  });

  /**
   * Test şeridi: para/teslimat kuyrukları test kaydını saymaz (kargo gitmez,
   * payout açılmaz, belge kesilmez — kapanmayan iş gibi görünürlerdi);
   * moderasyon kuyrukları şeritten bağımsızdır (inceleme hesabının ilanı da
   * onay bekler).
   */
  describe("test lane", () => {
    const whereOf = (key: keyof typeof QUEUE_PART_DEFINITIONS) =>
      JSON.stringify(QUEUE_PART_DEFINITIONS[key].where(NOW, CTX));

    it.each([
      "refundsPendingReview",
      "refundsDisputed",
      "tradesAtWarehouse",
      "tradeDisputesOpen",
      "tradeRefundFailures",
      "tradeCompensationPending",
      "payoutsFailed",
      "holdsOverdue",
      "ordersUninvoiced",
      "shipmentsWithoutTracking",
    ] as const)("%s excludes the test lane", (key) => {
      expect(whereOf(key)).toMatch(/"isTest":(false|true)/);
    });

    it("keeps the live-only predicate inside the shared finance set", () => {
      expect(overdueHoldsWhere(NOW)).toMatchObject({
        payment: { isTest: false },
      });
      expect(uninvoicedDeliveredWhere(NOW, CTX)).toMatchObject({
        isTest: false,
      });
      // Payout'ta damga yok: yalnız açıkça test olanlar NOT ile elenir.
      expect(JSON.stringify(failedTransfersWhere)).toContain('"NOT"');
    });

    it.each([
      "productsPending",
      "messagesPendingApproval",
      "corporateApplications",
      "sellerDocuments",
      "ticketsOpen",
      "reportsPending",
    ] as const)("%s stays lane-agnostic (human moderation)", (key) => {
      expect(whereOf(key)).not.toContain("isTest");
    });
  });

  describe("readings", () => {
    it("reports the count and the age of the oldest waiting item", () => {
      const oldest = new Date("2026-08-01T00:00:00.000Z");
      const reading = QUEUE_PART_DEFINITIONS.refundsPendingReview.read({
        _count: { _all: 4 },
        _min: { createdAt: oldest },
      });
      expect(reading).toEqual({ count: 4, oldestAt: oldest });
    });

    it("carries the money at stake where the unit of work is money", () => {
      const reading = QUEUE_PART_DEFINITIONS.adjustmentsOpen.read({
        _count: { _all: 2 },
        _min: { createdAt: null },
        _sum: { remainingAmount: "125.456" },
      });
      expect(reading).toEqual({ count: 2, oldestAt: null, amount: 125.46 });
    });

    it("survives an empty aggregate without inventing a zero-age item", () => {
      const reading = QUEUE_PART_DEFINITIONS.productsPending.read({
        _count: { _all: 0 },
        _min: { createdAt: null },
      });
      expect(reading).toEqual({ count: 0, oldestAt: null });
    });
  });
});
