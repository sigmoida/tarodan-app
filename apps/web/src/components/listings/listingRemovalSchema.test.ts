/** @format */

import { describe, expect, it } from "vitest";
import { LISTING_REMOVAL_DETAIL_MAX_LENGTH } from "@tarodan/types";
import type { Translate } from "@/types/i18n";
import {
  EMPTY_LISTING_REMOVAL,
  listingRemovalSchema,
  toListingRemovalPayload,
  type ListingRemovalValues,
  type SellerRemovalAction,
} from "./listingRemovalSchema";

const t = ((key: string) => key) as unknown as Translate;

const values = (patch: Partial<ListingRemovalValues>): ListingRemovalValues => ({
  ...EMPTY_LISTING_REMOVAL,
  ...patch,
});

/** First issue the form would show: `{ field, message }`, or null when valid. */
const firstIssue = (
  action: SellerRemovalAction,
  patch: Partial<ListingRemovalValues>,
) => {
  const result = listingRemovalSchema(t, action).safeParse(values(patch));
  if (result.success) return null;
  const [issue] = result.error.issues;
  return { field: issue.path[0], message: issue.message };
};

describe("listingRemovalSchema — the shared rule on the seller form", () => {
  it.each<SellerRemovalAction>(["delete", "deactivate"])(
    "requires a reason (%s)",
    (action) => {
      expect(firstIssue(action, {})).toEqual({
        field: "reason",
        message: "validation.listingRemoval.reason_required",
      });
    },
  );

  it("accepts a plain reason with no note", () => {
    expect(firstIssue("delete", { reason: "changed_mind" })).toBeNull();
  });

  it("sold elsewhere asks which platform", () => {
    expect(firstIssue("delete", { reason: "sold_elsewhere" })).toEqual({
      field: "platform",
      message: "validation.listingRemoval.platform_required",
    });
    expect(
      firstIssue("delete", { reason: "sold_elsewhere", platform: "dolap" }),
    ).toBeNull();
  });

  it("the 'other' platform needs a note naming it", () => {
    expect(
      firstIssue("delete", { reason: "sold_elsewhere", platform: "other" }),
    ).toEqual({
      field: "detail",
      message: "validation.listingRemoval.detail_required",
    });
    expect(
      firstIssue("delete", {
        reason: "sold_elsewhere",
        platform: "other",
        detail: "Facebook Marketplace",
      }),
    ).toBeNull();
  });

  it("a whitespace-only note does not count as naming the platform", () => {
    expect(
      firstIssue("delete", {
        reason: "sold_elsewhere",
        platform: "other",
        detail: "   ",
      })?.field,
    ).toBe("detail");
  });

  it("a temporary pause is a deactivation reason only", () => {
    expect(firstIssue("deactivate", { reason: "paused_temporarily" })).toBeNull();
    expect(firstIssue("delete", { reason: "paused_temporarily" })).toEqual({
      field: "reason",
      message: "validation.listingRemoval.reason_not_allowed",
    });
  });

  it("rejects a note longer than the shared limit", () => {
    expect(
      firstIssue("deactivate", {
        reason: "changed_mind",
        detail: "x".repeat(LISTING_REMOVAL_DETAIL_MAX_LENGTH + 1),
      }),
    ).toEqual({
      field: "detail",
      message: "validation.listingRemoval.detail_too_long",
    });
    expect(
      firstIssue("deactivate", {
        reason: "changed_mind",
        detail: "x".repeat(LISTING_REMOVAL_DETAIL_MAX_LENGTH),
      }),
    ).toBeNull();
  });

  it("a platform left over from an earlier choice does not block another reason", () => {
    expect(
      firstIssue("deactivate", { reason: "changed_mind", platform: "letgo" }),
    ).toBeNull();
  });
});

describe("toListingRemovalPayload", () => {
  it("sends the reason, platform and trimmed note for a sale elsewhere", () => {
    expect(
      toListingRemovalPayload(
        values({
          reason: "sold_elsewhere",
          platform: "instagram",
          detail: "  sold via a story  ",
        }),
      ),
    ).toEqual({
      removalReason: "sold_elsewhere",
      removalPlatform: "instagram",
      removalDetail: "sold via a story",
    });
  });

  it("drops the platform unless the reason is sold elsewhere", () => {
    expect(
      toListingRemovalPayload(
        values({ reason: "changed_mind", platform: "dolap" }),
      ),
    ).toEqual({
      removalReason: "changed_mind",
      removalPlatform: undefined,
      removalDetail: undefined,
    });
  });

  it("turns empty and whitespace-only fields into undefined", () => {
    expect(
      toListingRemovalPayload(values({ reason: "", detail: "   " })),
    ).toEqual({
      removalReason: undefined,
      removalPlatform: undefined,
      removalDetail: undefined,
    });
  });
});
