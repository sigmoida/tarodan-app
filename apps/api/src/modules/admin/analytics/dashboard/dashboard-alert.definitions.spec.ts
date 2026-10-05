import {
  DASHBOARD_ALERT_KEYS,
  DASHBOARD_ALERT_LINKS,
  type TimingRuleId,
} from "@tarodan/types";
import {
  ALERT_DEFINITIONS,
  DIAGNOSTIC_ALERT_KEYS,
} from "./dashboard-alert.definitions";
import type { AlertThresholdContext } from "../../../../config/alert-thresholds";
import { defaultTimingValues } from "../../../../common/timing-rules";

const NOW = new Date("2026-09-18T12:00:00.000Z");

/** ConfigService stand-in: answers only the keys a test sets. */
const configWith = (values: Record<string, string>) => ({
  get: <T = string>(key: string) => values[key] as T | undefined,
});

/**
 * Threshold context: Durations & Rules values (registry defaults unless a test
 * overrides one) plus the env reader for technical thresholds.
 */
const ctxWith = (
  timing: Partial<Record<TimingRuleId, number>> = {},
  env: Record<string, string> = {},
): AlertThresholdContext => ({
  timing: { ...defaultTimingValues(), ...timing },
  config: configWith(env),
});

/** Captures the `where` a definition builds, without touching a database. */
function captureWhere(
  key: keyof typeof ALERT_DEFINITIONS,
  ctx: AlertThresholdContext = ctxWith(),
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
  ALERT_DEFINITIONS[key].query(prisma as never, NOW, ctx);
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

  describe("thresholds come from Durations & Rules, never from a literal", () => {
    it("reads the stuck-shipment threshold from shippedStaleAlertDays", () => {
      const ctx = ctxWith({ shippedStaleAlertDays: 3 });
      expect(ALERT_DEFINITIONS.stuckShippedOrders.threshold?.(ctx)).toEqual({
        value: 3,
        unit: "days",
      });

      const where = captureWhere("stuckShippedOrders", ctx);
      const cutoff = where.shipment.is.shippedAt.lt as Date;
      expect(NOW.getTime() - cutoff.getTime()).toBe(3 * 24 * 60 * 60 * 1000);
    });

    it("reads the carrier-task threshold from carrierCancellationAlertHours", () => {
      const ctx = ctxWith({ carrierCancellationAlertHours: 6 });
      expect(
        ALERT_DEFINITIONS.agedCarrierCancellations.threshold?.(ctx),
      ).toEqual({ value: 6, unit: "hours" });

      const where = captureWhere("agedCarrierCancellations", ctx);
      const cutoff = where.requestedAt.lt as Date;
      expect(NOW.getTime() - cutoff.getTime()).toBe(6 * 60 * 60 * 1000);
    });

    it("reads both trade parcel alerts from tradeLostParcelGraceDays", () => {
      const ctx = ctxWith({ tradeLostParcelGraceDays: 5 });
      expect(
        ALERT_DEFINITIONS.stuckWarehouseTrades.threshold?.(ctx),
      ).toEqual({ value: 5, unit: "days" });
      const inbound = captureWhere("stuckWarehouseTrades", ctx);
      expect(
        NOW.getTime() - (inbound.shippingDeadline.lt as Date).getTime(),
      ).toBe(5 * 24 * 60 * 60 * 1000);
      const outbound = captureWhere("stuckOutboundTrades", ctx);
      expect(
        NOW.getTime() -
          (outbound.shipments.some.shippedAt.lt as Date).getTime(),
      ).toBe(5 * 24 * 60 * 60 * 1000);
    });

    it("reads the outbox threshold from OUTBOX_STALE_PROCESSING_MS, in minutes", () => {
      const ctx = ctxWith({}, { OUTBOX_STALE_PROCESSING_MS: "120000" });
      expect(ALERT_DEFINITIONS.outboxStuckProcessing.threshold?.(ctx)).toEqual(
        { value: 2, unit: "minutes" },
      );
    });

    it("keeps today's defaults when no admin value is set", () => {
      const ctx = ctxWith();
      expect(ALERT_DEFINITIONS.stuckShippedOrders.threshold?.(ctx)).toEqual({
        value: 10,
        unit: "days",
      });
      expect(
        ALERT_DEFINITIONS.agedCarrierCancellations.threshold?.(ctx),
      ).toEqual({ value: 24, unit: "hours" });
      expect(
        ALERT_DEFINITIONS.stuckWarehouseTrades.threshold?.(ctx),
      ).toEqual({ value: 14, unit: "days" });
    });

    /**
     * The point of the indirection: a day/hour count baked into this file
     * could not follow the cron that owns the same rule. So every
     * threshold-bearing alert must MOVE when its source moves.
     */
    it("moves every threshold when its source moves", () => {
      const moved: Array<[keyof typeof ALERT_DEFINITIONS, AlertThresholdContext]> =
        [
          ["stuckShippedOrders", ctxWith({ shippedStaleAlertDays: 77 })],
          [
            "agedCarrierCancellations",
            ctxWith({ carrierCancellationAlertHours: 77 }),
          ],
          ["stuckWarehouseTrades", ctxWith({ tradeLostParcelGraceDays: 77 })],
          ["stuckOutboundTrades", ctxWith({ tradeLostParcelGraceDays: 77 })],
          [
            "outboxStuckProcessing",
            ctxWith({}, { OUTBOX_STALE_PROCESSING_MS: "999999" }),
          ],
        ];

      for (const [alert, ctx] of moved) {
        const definition = ALERT_DEFINITIONS[alert];
        const base = definition.threshold?.(ctxWith());
        const next = definition.threshold?.(ctx);
        expect(next).toBeDefined();
        expect(next).not.toEqual(base);
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

    /**
     * Test şeridi uyarılara girmez: test kolisi taşıyıcıya gitmediği için hep
     * "kargoda" kalır, test ödemesi PayTR dökümünde yoktur — sayılsalardı
     * kalıcı sahte alarm olurlardı.
     */
    it.each([
      "stuckShippedOrders",
      "stuckWarehouseTrades",
      "stuckOutboundTrades",
      "preparingDeadlineWithin24h",
    ] as const)("%s counts live-lane rows only", (key) => {
      expect(captureWhere(key).isTest).toBe(false);
    });

    it.each([
      ["paymentsMissingFromStatement", '"p"."is_test" = false'],
      ["deliveredHoldsWithoutRelease", '"o"."is_test" = false'],
      ["exhaustedPayoutRetries", '"is_test" = true'],
    ] as const)("%s filters the test lane in SQL", (key, fragment) => {
      const parts = ALERT_DEFINITIONS[key].query(
        new Proxy(
          {},
          {
            get:
              () =>
              (...args: unknown[]) =>
                args,
          },
        ) as never,
        NOW,
        ctxWith(),
      ) as unknown as unknown[];
      const sqlText = parts
        .slice(1)
        .map((value) =>
          value && typeof value === "object" && "sql" in value
            ? String((value as { sql: string }).sql)
            : "",
        )
        .join(" ");
      expect(sqlText).toContain(fragment);
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
