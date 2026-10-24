import { describe, expect, it } from "vitest";
import { targetHref, type ReportDetail } from "./detail";
import { reportTypeLabels, reportTypeOptions } from "./types";

const t = ((key: string) => key) as never;

const report = (extra: Partial<ReportDetail>): ReportDetail => ({
  id: "r1",
  type: "review",
  targetId: "rev-1",
  reason: "harassment",
  status: "pending",
  createdAt: "2026-10-13T00:00:00Z",
  ...extra,
});

// S9c — Apple 1.2: yorum şikayeti (`review`) admin listesinde ve detayında.
describe("review reports", () => {
  it("type filter and labels include review", () => {
    expect(reportTypeOptions(t).map((o) => o.value)).toContain("review");
    expect(reportTypeLabels(t).review).toBe("admin.reports.type.review");
  });

  it("review target opens the matching tab on that review", () => {
    expect(
      targetHref(
        report({ target: { id: "rev-1", reviewKind: "seller", score: 1 } }),
      ),
    ).toBe("/accounts/reviews?tab=seller&id=rev-1");
    expect(
      targetHref(
        report({ target: { id: "rev-1", reviewKind: "product", score: 1 } }),
      ),
    ).toBe("/accounts/reviews?tab=product&id=rev-1");
  });

  it("deleted review has no target link", () => {
    expect(
      targetHref(report({ target: { id: "rev-1", deleted: true } })),
    ).toBeNull();
  });
});
