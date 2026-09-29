import { describe, expect, it } from "vitest";
import {
  DASHBOARD_QUEUE_LINKS,
  DASHBOARD_QUEUE_PART_LINKS,
} from "@tarodan/types";
import {
  CANCELLATIONS_REFUNDS_PATH,
  VIEW_SCOPED_PARAMS,
  refundsViewHref,
  resolveCancellationRefundView,
} from "./view";
import { refundRequestFilterFields } from "./refunds/filters";
import { cancellationFilterFields } from "./filters";
import { fieldKeys } from "@/components/list/filters/schema";

const t = ((key: string) => key) as unknown as Parameters<
  typeof cancellationFilterFields
>[0];

describe("resolveCancellationRefundView", () => {
  it("defaults to the cancellations view", () => {
    expect(resolveCancellationRefundView(undefined)).toBe("cancellations");
    expect(resolveCancellationRefundView("nope")).toBe("cancellations");
    expect(resolveCancellationRefundView("refunds")).toBe("refunds");
  });
});

describe("refundsViewHref (old refund-requests list → İadeler tab)", () => {
  it("opens the refunds view", () => {
    expect(refundsViewHref()).toBe(
      "/operations/cancellations-refunds?view=refunds",
    );
  });

  it("keeps the old link's filters in the query string", () => {
    expect(
      refundsViewHref({
        status: "pending_review",
        from: "2026-09-01",
        q: "RF",
      }),
    ).toBe(
      "/operations/cancellations-refunds?view=refunds&status=pending_review&from=2026-09-01&q=RF",
    );
  });

  it("repeats multi-value params and drops a conflicting view", () => {
    const href = refundsViewHref(
      new URLSearchParams("view=cancellations&status=a&status=b"),
    );
    expect(href).toBe(
      "/operations/cancellations-refunds?view=refunds&status=a&status=b",
    );
  });
});

describe("deep links", () => {
  it("the dashboard's refund queue opens the İadeler tab with its own status", () => {
    expect(DASHBOARD_QUEUE_LINKS.refundRequests).toBe(refundsViewHref());
    expect(DASHBOARD_QUEUE_PART_LINKS.refundsPendingReview).toBe(
      refundsViewHref({ status: "pending_review" }),
    );
    expect(DASHBOARD_QUEUE_PART_LINKS.refundsDisputed).toBe(
      refundsViewHref({ status: "disputed" }),
    );
    for (const href of Object.values(DASHBOARD_QUEUE_PART_LINKS)) {
      expect(href).not.toContain("/operations/refund-requests");
    }
  });

  it("switching tabs clears every filter either tab owns", () => {
    const owned = [
      ...cancellationFilterFields(t).flatMap(fieldKeys),
      ...refundRequestFilterFields(t).flatMap(fieldKeys),
    ];
    for (const key of owned) {
      expect(VIEW_SCOPED_PARAMS).toContain(key);
    }
    expect(CANCELLATIONS_REFUNDS_PATH).toBe(
      "/operations/cancellations-refunds",
    );
  });
});
