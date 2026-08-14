import { describe, expect, it } from "vitest";
import type { useTranslations } from "next-intl";
import {
  ESCROW_RELEASE_DAYS,
  REFUND_WINDOW_DAYS,
  cancellationTypeLabel,
  computeEstimatedReleaseAt,
  computeRefundWindowEnd,
  describeHoldReason,
} from "./escrow";

type T = ReturnType<typeof useTranslations<never>>;
// Real i18n isn't under test here — return the key so assertions can still
// distinguish branches without wiring next-intl. "common.dateLocale" is the
// one exception: describeHoldReason feeds it straight into
// toLocaleDateString(), which throws on a non-BCP-47 string.
const t = ((key: string) => (key === "common.dateLocale" ? "tr-TR" : key)) as T;

const DAY_MS = 86_400_000;
const DELIVERED = "2026-01-01T00:00:00Z";

describe("computeEstimatedReleaseAt", () => {
  it("adds ESCROW_RELEASE_DAYS to the delivery date", () => {
    const result = computeEstimatedReleaseAt(DELIVERED);
    expect(result?.getTime()).toBe(
      new Date(DELIVERED).getTime() + ESCROW_RELEASE_DAYS * DAY_MS,
    );
  });

  it("returns null when there's no delivery date", () => {
    expect(computeEstimatedReleaseAt(null)).toBeNull();
    expect(computeEstimatedReleaseAt(undefined)).toBeNull();
  });

  it("returns null for an invalid date", () => {
    expect(computeEstimatedReleaseAt("not-a-date")).toBeNull();
  });
});

describe("computeRefundWindowEnd", () => {
  it("adds REFUND_WINDOW_DAYS to the delivery date", () => {
    const result = computeRefundWindowEnd(DELIVERED);
    expect(result?.getTime()).toBe(
      new Date(DELIVERED).getTime() + REFUND_WINDOW_DAYS * DAY_MS,
    );
  });

  it("returns null when there's no delivery date", () => {
    expect(computeRefundWindowEnd(null)).toBeNull();
  });
});

describe("describeHoldReason", () => {
  const now = new Date("2026-01-20T00:00:00Z");

  it("frozen wins over every other condition", () => {
    const result = describeHoldReason(
      {
        frozen: true,
        hasOpenRefund: true,
        deliveredAt: DELIVERED,
        now,
      },
      t,
    );
    expect(result.code).toBe("frozen");
    expect(result.tone).toBe("danger");
  });

  it("open refund wins over the delivery-window checks", () => {
    const result = describeHoldReason(
      { hasOpenRefund: true, deliveredAt: DELIVERED, now },
      t,
    );
    expect(result.code).toBe("open_refund");
    expect(result.tone).toBe("danger");
  });

  it("not delivered when there's no deliveredAt and no releaseAt", () => {
    const result = describeHoldReason({ now }, t);
    expect(result.code).toBe("not_delivered");
    expect(result.tone).toBe("warning");
  });

  it("window not elapsed when the release date is still in the future", () => {
    // delivered 2026-01-01 + 15 days = 2026-01-16, `now` is 2026-01-20 in
    // most tests below, so use a `now` before that to hit this branch.
    const result = describeHoldReason(
      { deliveredAt: DELIVERED, now: new Date("2026-01-10T00:00:00Z") },
      t,
    );
    expect(result.code).toBe("window_not_elapsed");
    expect(result.tone).toBe("info");
  });

  it("ready once the release date has elapsed", () => {
    const result = describeHoldReason({ deliveredAt: DELIVERED, now }, t);
    expect(result.code).toBe("ready");
    expect(result.tone).toBe("success");
  });

  it("ready exactly at the release instant (not strictly after)", () => {
    const releaseInstant = computeEstimatedReleaseAt(DELIVERED)!;
    const result = describeHoldReason(
      { deliveredAt: DELIVERED, now: releaseInstant },
      t,
    );
    expect(result.code).toBe("ready");
  });

  it("a real releaseAt from the backend takes precedence over the estimate", () => {
    // deliveredAt would put the estimate well in the past (ready), but a
    // real releaseAt further in the future must still block it.
    const result = describeHoldReason(
      {
        deliveredAt: DELIVERED,
        releaseAt: "2026-02-01T00:00:00Z",
        now,
      },
      t,
    );
    expect(result.code).toBe("window_not_elapsed");
  });

  it("releaseAt alone (no deliveredAt) still counts as delivered", () => {
    const result = describeHoldReason(
      { releaseAt: "2026-02-01T00:00:00Z", now },
      t,
    );
    expect(result.code).toBe("window_not_elapsed");
  });
});

describe("cancellationTypeLabel", () => {
  it("returns null for a falsy type", () => {
    expect(cancellationTypeLabel(null, t)).toBeNull();
    expect(cancellationTypeLabel(undefined, t)).toBeNull();
    expect(cancellationTypeLabel("", t)).toBeNull();
  });

  it("returns distinct copy for iptal vs iade", () => {
    const iptal = cancellationTypeLabel("iptal", t);
    const iade = cancellationTypeLabel("iade", t);
    expect(iptal).not.toBeNull();
    expect(iade).not.toBeNull();
    expect(iptal?.label).not.toBe(iade?.label);
  });

  it("passes an unrecognized type through as the label with empty detail", () => {
    expect(cancellationTypeLabel("something_else", t)).toEqual({
      label: "something_else",
      detail: "",
    });
  });
});
