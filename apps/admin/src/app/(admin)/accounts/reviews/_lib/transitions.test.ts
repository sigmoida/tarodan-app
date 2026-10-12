import { describe, expect, it } from "vitest";
import { reviewTransitions } from "./transitions";

describe("reviewTransitions", () => {
  it("offers approve and reject for a pending review", () => {
    expect(reviewTransitions("pending")).toEqual(["approved", "rejected"]);
  });

  it("offers only reject for an approved review", () => {
    expect(reviewTransitions("approved")).toEqual(["rejected"]);
  });

  it("offers approve and revert (not reject) for a rejected review", () => {
    expect(reviewTransitions("rejected")).toEqual(["approved", "pending"]);
  });

  it("treats a missing status as approved", () => {
    expect(reviewTransitions(undefined)).toEqual(["rejected"]);
  });
});
