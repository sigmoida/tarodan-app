import { describe, expect, it } from "vitest";
import { REVIEW_TRANSITION_LABEL_KEY, reviewTransitions } from "./transitions";

describe("reviewTransitions", () => {
  it("offers only hide for an approved review", () => {
    expect(reviewTransitions("approved")).toEqual(["hidden"]);
  });

  it("offers only show again for a hidden review", () => {
    expect(reviewTransitions("hidden")).toEqual(["approved"]);
  });

  it("treats a missing status as approved", () => {
    expect(reviewTransitions(undefined)).toEqual(["hidden"]);
  });

  it("lets a legacy unpublished review be shown or hidden", () => {
    for (const status of ["pending", "rejected", "spam", "deleted"] as const) {
      expect(reviewTransitions(status)).toEqual(["approved", "hidden"]);
    }
  });

  it("never offers a way back to pending", () => {
    const all = (
      ["pending", "approved", "rejected", "spam", "deleted", "hidden"] as const
    ).flatMap((status) => reviewTransitions(status));

    expect(all).not.toContain("pending");
    expect(Object.keys(REVIEW_TRANSITION_LABEL_KEY).sort()).toEqual([
      "approved",
      "hidden",
    ]);
  });
});
