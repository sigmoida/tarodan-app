/** @format */

import { describe, expect, it } from "vitest";
import type { Translate } from "@/types/i18n";
import {
  EXPIRED_FILTER,
  FILTER_TABS,
  getListingActions,
  isExpiredListing,
  listingFilterParams,
  listingStatusKey,
} from "./status";

const t = ((key: string) => key) as unknown as Translate;

describe("expired listings", () => {
  it("recognises an inactive listing whose reason is expired", () => {
    expect(
      isExpiredListing({ status: "inactive", inactiveReason: "expired" }),
    ).toBe(true);
  });

  it.each([
    [{ status: "inactive", inactiveReason: null }],
    [{ status: "inactive", inactiveReason: "return_quarantine" }],
    [{ status: "inactive" }],
    // The reason only means something while the listing is inactive.
    [{ status: "active", inactiveReason: "expired" }],
  ])("does not treat %j as expired", (listing) => {
    expect(isExpiredListing(listing)).toBe(false);
  });

  it("shows the expired badge for expired listings and the status otherwise", () => {
    expect(
      listingStatusKey({ status: "inactive", inactiveReason: "expired" }),
    ).toBe("expired");
    expect(listingStatusKey({ status: "inactive", inactiveReason: null })).toBe(
      "inactive",
    );
    expect(listingStatusKey({ status: "active" })).toBe("active");
  });

  it("offers a one-click renew (not the edit-screen relist) on an expired listing", () => {
    expect(
      getListingActions({ status: "inactive", inactiveReason: "expired" }),
    ).toEqual(["renew", "delete"]);
    expect(getListingActions({ status: "inactive" })).toEqual([
      "relist",
      "delete",
    ]);
  });

  it("has an expired tab that the email link (?status=expired) lands on", () => {
    expect(FILTER_TABS(t).map((tab) => tab.value)).toContain(EXPIRED_FILTER);
    expect(EXPIRED_FILTER).toBe("expired");
  });

  it("maps the tab to the API query", () => {
    expect(listingFilterParams(EXPIRED_FILTER)).toEqual({
      status: "inactive",
      inactiveReason: "expired",
    });
    expect(listingFilterParams("active")).toEqual({ status: "active" });
    expect(listingFilterParams("all")).toEqual({});
    expect(listingFilterParams("")).toEqual({});
  });
});
