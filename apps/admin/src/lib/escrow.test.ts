import { describe, expect, it } from "vitest";
import type { useTranslations } from "next-intl";
import { cancellationTypeLabel, describeHoldReason } from "./escrow";

type T = ReturnType<typeof useTranslations<never>>;
// Real i18n isn't under test here — return the key so assertions can still
// distinguish branches without wiring next-intl. "common.dateLocale" is the
// one exception: describeHoldReason feeds it straight into
// toLocaleDateString(), which throws on a non-BCP-47 string. Params are echoed
// back so the policy-driven label value can be asserted.
const t = ((key: string, values?: Record<string, unknown>) =>
  key === "common.dateLocale"
    ? "tr-TR"
    : values?.days !== undefined
      ? `${key}|${values.days}`
      : key) as T;

// The server stamps the release date at delivery (delivery + window + grace);
// the helper only compares it with `now` — it never recomputes a date.
const RELEASE_AT = "2026-01-16T00:00:00Z";
const RETURN_WINDOW_DAYS = 14;

describe("describeHoldReason", () => {
  const now = new Date("2026-01-20T00:00:00Z");

  it("frozen wins over every other condition", () => {
    const result = describeHoldReason(
      {
        frozen: true,
        hasOpenRefund: true,
        releaseAt: RELEASE_AT,
        returnWindowDays: RETURN_WINDOW_DAYS,
        now,
      },
      t,
    );
    expect(result.code).toBe("frozen");
    expect(result.tone).toBe("danger");
  });

  it("open refund wins over the release-date checks", () => {
    const result = describeHoldReason(
      {
        hasOpenRefund: true,
        releaseAt: RELEASE_AT,
        returnWindowDays: RETURN_WINDOW_DAYS,
        now,
      },
      t,
    );
    expect(result.code).toBe("open_refund");
    expect(result.tone).toBe("danger");
  });

  it("not delivered when the server has no releaseAt", () => {
    const result = describeHoldReason(
      { returnWindowDays: RETURN_WINDOW_DAYS, now },
      t,
    );
    expect(result.code).toBe("not_delivered");
    expect(result.tone).toBe("warning");
  });

  it("window not elapsed while the server release date is in the future", () => {
    const result = describeHoldReason(
      {
        releaseAt: RELEASE_AT,
        returnWindowDays: RETURN_WINDOW_DAYS,
        now: new Date("2026-01-10T00:00:00Z"),
      },
      t,
    );
    expect(result.code).toBe("window_not_elapsed");
    expect(result.tone).toBe("default");
  });

  it("quotes the policy window length, not a hardcoded constant", () => {
    const result = describeHoldReason(
      {
        releaseAt: "2026-02-01T00:00:00Z",
        returnWindowDays: 30,
        now,
      },
      t,
    );
    expect(result.label).toBe(
      "admin.shared.escrow.reasons.windowNotElapsed.label|30",
    );
  });

  it("ready once the release date has elapsed", () => {
    const result = describeHoldReason(
      { releaseAt: RELEASE_AT, returnWindowDays: RETURN_WINDOW_DAYS, now },
      t,
    );
    expect(result.code).toBe("ready");
    expect(result.tone).toBe("success");
  });

  it("ready exactly at the release instant (not strictly after)", () => {
    const result = describeHoldReason(
      {
        releaseAt: RELEASE_AT,
        returnWindowDays: RETURN_WINDOW_DAYS,
        now: new Date(RELEASE_AT),
      },
      t,
    );
    expect(result.code).toBe("ready");
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
