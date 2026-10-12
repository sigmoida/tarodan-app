import { describe, expect, it } from "vitest";
import {
  DASHBOARD_QUEUE_LINKS,
  DASHBOARD_QUEUE_PART_LINKS,
  ADMIN_REFUND_BUCKETS,
  ADMIN_REFUND_BUCKET_I18N_KEYS,
  ADMIN_REFUND_TABS,
} from "@tarodan/types";
import {
  REFUNDS_PATH,
  REFUND_TAB_I18N_KEYS,
  isLegacyRefundsView,
  refundsHref,
  resolveRefundBucket,
  resolveRefundTab,
} from "./screenTabs";

describe("resolveRefundTab / resolveRefundBucket", () => {
  it("keeps known values and falls back to Tümü", () => {
    expect(resolveRefundTab("trade")).toBe("trade");
    expect(resolveRefundTab("direct_sale")).toBe("all");
    expect(resolveRefundTab(undefined)).toBe("all");
    expect(resolveRefundBucket("at_warehouse")).toBe("at_warehouse");
    expect(resolveRefundBucket("new")).toBe("all");
    expect(resolveRefundBucket(null)).toBe("all");
  });
});

describe("bucket label resolution", () => {
  it("every tab and bucket has a label key under admin.operations.refunds", () => {
    for (const tab of ADMIN_REFUND_TABS) {
      expect(REFUND_TAB_I18N_KEYS[tab]).toBe(
        `admin.operations.refunds.tabs.${tab}`,
      );
    }
    for (const bucket of ADMIN_REFUND_BUCKETS) {
      expect(ADMIN_REFUND_BUCKET_I18N_KEYS[bucket]).toBe(
        `admin.operations.refunds.buckets.${bucket}`,
      );
    }
  });

  it("the sub-tabs are the customer's eight, in order", () => {
    expect(ADMIN_REFUND_BUCKETS).toEqual([
      "all",
      "pending_review",
      "awaiting_return",
      "at_warehouse",
      "refunding",
      "completed",
      "rejected",
      "disputed",
    ]);
    expect(ADMIN_REFUND_TABS).toEqual(["all", "direct", "offer", "trade"]);
  });
});

describe("refundsHref (old refund list / İadeler view → new screen)", () => {
  it("opens the screen without a query", () => {
    expect(refundsHref()).toBe(REFUNDS_PATH);
    expect(refundsHref({ view: "refunds" })).toBe(REFUNDS_PATH);
  });

  it("turns the old status filter into the matching sub-tab", () => {
    expect(refundsHref({ view: "refunds", status: "pending_review" })).toBe(
      "/operations/refunds?bucket=pending_review",
    );
    expect(refundsHref({ status: "disputed" })).toBe(
      "/operations/refunds?bucket=disputed",
    );
    expect(refundsHref({ status: "refunded" })).toBe(
      "/operations/refunds?bucket=completed",
    );
  });

  it("drops a status that has no sub-tab", () => {
    expect(refundsHref({ status: "return_in_transit" })).toBe(REFUNDS_PATH);
  });

  it("renames the date range and keeps the other filters", () => {
    expect(
      refundsHref({ view: "refunds", from: "2026-09-01", to: "2026-09-30", q: "RF", kind: "return" }),
    ).toBe(
      "/operations/refunds?dateFrom=2026-09-01&dateTo=2026-09-30&q=RF&kind=return",
    );
  });

  it("keeps a valid tab and ignores the cancellations screen's own sub-tabs", () => {
    expect(refundsHref({ view: "refunds", tab: "trade", bucket: "buyer" })).toBe(
      "/operations/refunds?tab=trade",
    );
    expect(
      refundsHref(new URLSearchParams("view=refunds&status=a&q=x")),
    ).toBe("/operations/refunds?q=x");
  });
});

describe("isLegacyRefundsView", () => {
  it("detects ?view=refunds only", () => {
    expect(isLegacyRefundsView({ view: "refunds" })).toBe(true);
    expect(isLegacyRefundsView({ view: "cancellations" })).toBe(false);
    expect(isLegacyRefundsView(new URLSearchParams("view=refunds"))).toBe(true);
    expect(isLegacyRefundsView({})).toBe(false);
  });
});

describe("dashboard refund queue links (still ?view=refunds&status=…)", () => {
  const redirected = (href: string) =>
    refundsHref(new URL(href, "http://admin.local").searchParams);

  it("land on the matching sub-tab of the new screen", () => {
    expect(redirected(DASHBOARD_QUEUE_LINKS.refundRequests)).toBe(
      REFUNDS_PATH,
    );
    expect(redirected(DASHBOARD_QUEUE_PART_LINKS.refundsPendingReview)).toBe(
      "/operations/refunds?bucket=pending_review",
    );
    expect(redirected(DASHBOARD_QUEUE_PART_LINKS.refundsDisputed)).toBe(
      "/operations/refunds?bucket=disputed",
    );
  });
});
