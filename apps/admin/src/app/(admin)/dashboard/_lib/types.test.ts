import { DASHBOARD_METRIC_KEYS } from "@tarodan/types";
import { toDashboardMetrics } from "./types";

describe("toDashboardMetrics", () => {
  it("fills every metric with zeros when the endpoint gave nothing", () => {
    const metrics = toDashboardMetrics(undefined);

    expect(Object.keys(metrics).sort()).toEqual(
      [...DASHBOARD_METRIC_KEYS].sort(),
    );
    expect(metrics.orders).toEqual({
      period: 0,
      previous: 0,
      allTime: 0,
      changePercent: 0,
    });
  });

  it("keeps period and all-time apart", () => {
    const metrics = toDashboardMetrics({
      orders: { period: 5, previous: 4, allTime: 300, changePercent: 25 },
    });

    expect(metrics.orders).toEqual({
      period: 5,
      previous: 4,
      allTime: 300,
      changePercent: 25,
    });
    // a metric the payload omitted still renders
    expect(metrics.visitors.allTime).toBe(0);
  });

  it("coerces string figures (Decimal columns serialize as strings)", () => {
    const metrics = toDashboardMetrics({
      grossSales: { period: "1000.50", previous: "0", allTime: "90000" },
    });

    expect(metrics.grossSales.period).toBe(1000.5);
    expect(metrics.grossSales.allTime).toBe(90000);
    expect(metrics.grossSales.changePercent).toBe(0);
  });
});
