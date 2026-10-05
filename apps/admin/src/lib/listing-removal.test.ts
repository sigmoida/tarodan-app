import { describe, expect, it } from "vitest";
import {
  LISTING_REMOVAL_ACTORS,
  LISTING_REMOVAL_REASONS,
  LISTING_VIOLATION_CODES,
} from "@tarodan/types";
import type { Translate } from "@/lib/statusLabels";
import {
  removalActorFilterOptions,
  removalCell,
  removalDetailLabel,
  removalIssueMessage,
  removalPlatformLabel,
  removalReasonFilterOptions,
  removalReasonLabel,
  violationCodeOptions,
  violationLabel,
} from "./listing-removal";

/** Anahtarı köşeli parantezle döndürür: testte etiketin kaynağı görünür. */
const t = ((key: string, values?: Record<string, unknown>) =>
  values
    ? `[${key} ${JSON.stringify(values)}]`
    : `[${key}]`) as unknown as Translate;

describe("removal filter options", () => {
  it("reason filter opens NEUTRAL (empty first value), lists every reason, ends with unknown", () => {
    const options = removalReasonFilterOptions(t);

    expect(options[0]).toEqual({
      value: "",
      label: "[admin.catalog.products.removal.allReasons]",
    });
    expect(options.slice(1, -1).map((o) => o.value)).toEqual([
      ...LISTING_REMOVAL_REASONS,
    ]);
    expect(options[options.length - 1]).toEqual({
      value: "unknown",
      label: "[status.listingRemoval.unknown]",
    });
  });

  it("actor filter opens neutral and lists seller / system / admin", () => {
    const options = removalActorFilterOptions(t);

    expect(options[0].value).toBe("");
    expect(options.slice(1).map((o) => o.value)).toEqual([
      ...LISTING_REMOVAL_ACTORS,
    ]);
    expect(options[3].label).toBe("[status.listingRemoval.actor.admin]");
  });

  it("violation options are the shared (placeholder) catalog, no neutral entry", () => {
    expect(violationCodeOptions(t).map((o) => o.value)).toEqual([
      ...LISTING_VIOLATION_CODES,
    ]);
  });
});

describe("removal labels", () => {
  it("a removal without a recorded reason reads Unknown", () => {
    expect(removalReasonLabel(null, t)).toBe("[status.listingRemoval.unknown]");
    expect(removalReasonLabel("sold_elsewhere", t)).toBe(
      "[status.listingRemoval.reason.sold_elsewhere]",
    );
  });

  it("an unknown platform / retired violation code is shown raw, not dropped", () => {
    expect(removalPlatformLabel("dolap", t)).toBe(
      "[status.listingRemoval.platform.dolap]",
    );
    expect(removalPlatformLabel("gittigidiyor", t)).toBe("gittigidiyor");
    expect(removalPlatformLabel(null, t)).toBeNull();
    expect(violationLabel("retired_code", t)).toBe("retired_code");
  });

  it("a code-less rejection reads Not specified", () => {
    expect(violationLabel(null, t)).toBe(
      "[admin.catalog.products.removal.noViolationCode]",
    );
  });

  it("detail label is the platform for sold_elsewhere and the violation for policy_violation only", () => {
    expect(
      removalDetailLabel(
        { reason: "sold_elsewhere", platform: "letgo", violationCode: null },
        t,
      ),
    ).toBe("[status.listingRemoval.platform.letgo]");
    expect(
      removalDetailLabel(
        {
          reason: "policy_violation",
          platform: null,
          violationCode: "duplicate_listing",
        },
        t,
      ),
    ).toBe("[status.listingRemoval.violation.duplicate_listing]");
    expect(
      removalDetailLabel(
        { reason: "expired", platform: null, violationCode: null },
        t,
      ),
    ).toBeNull();
  });
});

describe("removalCell", () => {
  it("is empty for a listing on the storefront", () => {
    expect(removalCell(null, t)).toBeNull();
  });

  it("joins actor and platform on the secondary line", () => {
    expect(
      removalCell(
        {
          reason: "sold_elsewhere",
          actor: "seller",
          platform: "instagram",
          violationCode: null,
          removedAt: "2026-10-05T10:00:00.000Z",
        },
        t,
      ),
    ).toEqual({
      label: "[status.listingRemoval.reason.sold_elsewhere]",
      secondary:
        "[status.listingRemoval.actor.seller] · [status.listingRemoval.platform.instagram]",
    });
  });

  it("an unknown (pre-feature) removal has no secondary line", () => {
    expect(
      removalCell(
        {
          reason: null,
          actor: null,
          platform: null,
          violationCode: null,
          removedAt: null,
        },
        t,
      ),
    ).toEqual({ label: "[status.listingRemoval.unknown]", secondary: null });
  });
});

describe("removalIssueMessage", () => {
  it("maps a shared-rule issue to its validation key with the length limit", () => {
    expect(removalIssueMessage("detail_too_long", t)).toBe(
      '[validation.listingRemoval.detail_too_long {"max":500}]',
    );
  });
});
