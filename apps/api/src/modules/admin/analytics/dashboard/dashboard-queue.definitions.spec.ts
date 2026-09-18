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

const NOW = new Date("2026-09-18T12:00:00.000Z");

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
      QUEUE_PART_DEFINITIONS[key].where(NOW) as Record<string, any>;

    it("reads refunds from the REQUEST's own status, not the order's", () => {
      expect(whereOf("refundsPendingReview")).toEqual({
        status: "pending_review",
      });
      expect(whereOf("refundsDisputed")).toEqual({ status: "disputed" });
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
      expect(whereOf("tradeDisputesOpen")).toEqual({ resolvedAt: null });
      expect(whereOf("tradeRefundFailures")).toEqual({
        refundFailureAt: { not: null },
      });
      expect(whereOf("tradeCompensationPending")).toEqual({
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
        uninvoicedDeliveredWhere(NOW),
      );
    });

    it("flags shipments that never got a carrier tracking id", () => {
      const where = missingTrackingWhere(NOW) as Record<string, any>;
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
