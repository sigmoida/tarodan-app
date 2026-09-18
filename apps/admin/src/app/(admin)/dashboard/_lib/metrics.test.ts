import { describe, expect, it } from "vitest";
import { DASHBOARD_METRIC_KEYS } from "@tarodan/types";
import { toDashboardMetrics } from "./metrics";

describe("toDashboardMetrics", () => {
  it("fills every metric with zeros when the endpoint gave nothing", () => {
    const metrics = toDashboardMetrics(undefined);

    expect(Object.keys(metrics).sort()).toEqual(
      [...DASHBOARD_METRIC_KEYS].sort(),
    );
    expect(metrics.paidOrders).toEqual({
      period: 0,
      previous: 0,
      allTime: 0,
      changePercent: 0,
    });
  });

  it("keeps period and all-time apart", () => {
    const metrics = toDashboardMetrics({
      paidOrders: { period: 5, previous: 4, allTime: 300, changePercent: 25 },
    });

    expect(metrics.paidOrders).toEqual({
      period: 5,
      previous: 4,
      allTime: 300,
      changePercent: 25,
    });
    // a metric the payload omitted still renders
    expect(metrics.signedInUsers.allTime).toBe(0);
  });

  it("coerces string figures (Decimal columns serialize as strings)", () => {
    const metrics = toDashboardMetrics({
      paidAmount: { period: "1000.50", previous: "0", allTime: "90000" },
    });

    expect(metrics.paidAmount.period).toBe(1000.5);
    expect(metrics.paidAmount.allTime).toBe(90000);
    expect(metrics.paidAmount.changePercent).toBe(0);
  });
});
