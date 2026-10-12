import { describe, expect, it } from "vitest";
import {
  holdReasonView,
  holdReleaseAction,
  type HoldReleaseBlockedReason,
} from "./holdReason";

describe("holdReasonView", () => {
  it("shows 'releasable' (success) when the server says releasable", () => {
    expect(holdReasonView({ releasable: true, releaseBlockedReason: null })).toEqual({
      code: "releasable",
      tone: "success",
      labelKey: "admin.finance.payouts.holdReasons.releasable.label",
      detailKey: "admin.finance.payouts.holdReasons.releasable.detail",
    });
  });

  it.each<[HoldReleaseBlockedReason, string]>([
    ["not_due", "outline"],
    ["frozen", "warning"],
    ["order_not_terminal", "outline"],
    ["seller_at_fault", "danger"],
    ["already_released", "outline"],
  ])("maps %s to the %s tone", (reason, tone) => {
    const view = holdReasonView({
      releasable: false,
      releaseBlockedReason: reason,
    });
    expect(view?.code).toBe(reason);
    expect(view?.tone).toBe(tone);
    expect(view?.labelKey).toBe(
      `admin.finance.payouts.holdReasons.${reason}.label`,
    );
  });

  it("prefers releasable over a stale blocked reason", () => {
    expect(
      holdReasonView({ releasable: true, releaseBlockedReason: "not_due" })
        ?.code,
    ).toBe("releasable");
  });

  it("renders nothing when the server sent no flags", () => {
    expect(holdReasonView({})).toBeNull();
    expect(holdReasonView({ releasable: false, releaseBlockedReason: null })).toBeNull();
  });
});

describe("holdReleaseAction", () => {
  it("releases normally when releasable", () => {
    expect(holdReleaseAction({ releasable: true })).toBe("release");
  });

  it("offers early release only when the due date is the sole blocker", () => {
    expect(
      holdReleaseAction({ releasable: false, releaseBlockedReason: "not_due" }),
    ).toBe("early");
  });

  it.each<HoldReleaseBlockedReason>([
    "frozen",
    "order_not_terminal",
    "seller_at_fault",
    "already_released",
  ])("offers no button when blocked by %s", (reason) => {
    expect(
      holdReleaseAction({ releasable: false, releaseBlockedReason: reason }),
    ).toBe("none");
  });

  it("offers no button without server flags", () => {
    expect(holdReleaseAction({})).toBe("none");
  });
});
