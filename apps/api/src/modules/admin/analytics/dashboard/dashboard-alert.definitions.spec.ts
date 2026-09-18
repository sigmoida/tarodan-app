import { DASHBOARD_ALERT_KEYS, DASHBOARD_ALERT_LINKS } from "@tarodan/types";
import {
  ALERT_DEFINITIONS,
  DIAGNOSTIC_ALERT_KEYS,
} from "./dashboard-alert.definitions";

const NOW = new Date("2026-09-18T12:00:00.000Z");

/** ConfigService stand-in: answers only the keys a test sets. */
const configWith = (values: Record<string, string>) => ({
  get: <T = string>(key: string) => values[key] as T | undefined,
});

/** Captures the `where` a definition builds, without touching a database. */
function captureWhere(
  key: keyof typeof ALERT_DEFINITIONS,
  config?: { get<T = string>(key: string): T | undefined },
): Record<string, any> {
  let captured: Record<string, any> = {};
  const delegate = {
    count: (args: { where: Record<string, any> }) => {
      captured = args.where;
      return null as never;
    },
  };
  const prisma = new Proxy(
    {},
    {
      get: (_target, property) =>
        property === "$queryRaw" ? (...parts: unknown[]) => parts : delegate,
    },
  );
  ALERT_DEFINITIONS[key].query(prisma as never, NOW, config);
  return captured;
}

describe("dashboard alert definitions", () => {
  it("covers every catalogued alert exactly once", () => {
    const covered = [
      ...Object.keys(ALERT_DEFINITIONS),
      ...DIAGNOSTIC_ALERT_KEYS,
    ].sort();
    expect(covered).toEqual([...DASHBOARD_ALERT_KEYS].sort());
  });

  it("points every alert at a screen where it can be acted on", () => {
    for (const key of DASHBOARD_ALERT_KEYS) {
      expect(DASHBOARD_ALERT_LINKS[key]).toMatch(/^\//);
    }
  });

  describe("thresholds come from configuration, never from a literal", () => {
    it("reads the stuck-shipment threshold from SHIPPED_STALE_ALERT_DAYS", () => {
      const config = configWith({ SHIPPED_STALE_ALERT_DAYS: "3" });
      expect(ALERT_DEFINITIONS.stuckShippedOrders.threshold?.(config)).toEqual({
        value: 3,
        unit: "days",
      });

      const where = captureWhere("stuckShippedOrders", config);
      const cutoff = where.shipment.is.shippedAt.lt as Date;
      expect(NOW.getTime() - cutoff.getTime()).toBe(3 * 24 * 60 * 60 * 1000);
    });

    it("reads the carrier-task threshold from CARRIER_CANCELLATION_ALERT_HOURS", () => {
      const config = configWith({ CARRIER_CANCELLATION_ALERT_HOURS: "6" });
      expect(
        ALERT_DEFINITIONS.agedCarrierCancellations.threshold?.(config),
      ).toEqual({ value: 6, unit: "hours" });

      const where = captureWhere("agedCarrierCancellations", config);
      const cutoff = where.requestedAt.lt as Date;
      expect(NOW.getTime() - cutoff.getTime()).toBe(6 * 60 * 60 * 1000);
    });

    it("reads the outbox threshold from OUTBOX_STALE_PROCESSING_MS, in minutes", () => {
      const config = configWith({ OUTBOX_STALE_PROCESSING_MS: "120000" });
      expect(
        ALERT_DEFINITIONS.outboxStuckProcessing.threshold?.(config),
      ).toEqual({ value: 2, unit: "minutes" });
    });

    it("falls back to the documented default when nothing is configured", () => {
      expect(ALERT_DEFINITIONS.stuckShippedOrders.threshold?.()).toEqual({
        value: 10,
        unit: "days",
      });
    });

    /**
     * The point of the config indirection: a day/hour count baked into this
     * file could not follow the cron that owns the same rule. So every
     * threshold-bearing alert must MOVE when its key moves.
     */
    it("moves every threshold when its configuration key moves", () => {
      const keys = {
        stuckShippedOrders: "SHIPPED_STALE_ALERT_DAYS",
        agedCarrierCancellations: "CARRIER_CANCELLATION_ALERT_HOURS",
        outboxStuckProcessing: "OUTBOX_STALE_PROCESSING_MS",
      } as const;

      for (const [alert, envKey] of Object.entries(keys)) {
        const definition =
          ALERT_DEFINITIONS[alert as keyof typeof ALERT_DEFINITIONS];
        const base = definition.threshold?.();
        const moved = definition.threshold?.(
          configWith({ [envKey]: "999999" }),
        );
        expect(moved).toBeDefined();
        expect(moved).not.toEqual(base);
      }
    });
  });

  describe("sets", () => {
    it("fires the missing-configuration alerts when the count is zero", () => {
      expect(ALERT_DEFINITIONS.noActiveCommissionRuleSet.read(0)).toEqual({
        count: 1,
      });
      expect(ALERT_DEFINITIONS.noActiveCommissionRuleSet.read(1)).toEqual({
        count: 0,
      });
      expect(ALERT_DEFINITIONS.noActiveShippingTariff.read(0)).toEqual({
        count: 1,
      });
    });

    it("treats a missing commission rule set as critical — checkout fails closed", () => {
      expect(ALERT_DEFINITIONS.noActiveCommissionRuleSet.severity).toBe(
        "critical",
      );
    });

    it("counts only unresolved statement lines", () => {
      const where = captureWhere("unresolvedStatementLines");
      expect(where.matchStatus.in).toEqual(["unmatched", "amount_mismatch"]);
      expect(where.resolvedAt).toBeNull();
    });

    it("counts coupon reservations still active past their expiry", () => {
      const where = captureWhere("staleCouponReservations");
      expect(where).toEqual({ status: "active", expiresAt: { lt: NOW } });
    });

    it("warns early — not late — about preparing deadlines", () => {
      const where = captureWhere("preparingDeadlineWithin24h");
      expect(where.preparingDeadline.gte).toEqual(NOW);
      expect(
        (where.preparingDeadline.lt as Date).getTime() - NOW.getTime(),
      ).toBe(24 * 60 * 60 * 1000);
      expect(ALERT_DEFINITIONS.preparingDeadlineWithin24h.severity).toBe(
        "info",
      );
    });

    it("reads a raw COUNT(*) result as a number, not a bigint", () => {
      expect(
        ALERT_DEFINITIONS.exhaustedPayoutRetries.read([{ count: 7n }]),
      ).toEqual({ count: 7 });
      expect(ALERT_DEFINITIONS.exhaustedPayoutRetries.read([])).toEqual({
        count: 0,
      });
    });
  });
});
