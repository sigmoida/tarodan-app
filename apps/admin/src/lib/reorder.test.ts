import { describe, expect, it } from "vitest";
import { moveId } from "./reorder";

describe("moveId", () => {
  const ids = ["a", "b", "c"];
  it("moves down and up", () => {
    expect(moveId(ids, "a", 1)).toEqual(["b", "a", "c"]);
    expect(moveId(ids, "c", -1)).toEqual(["a", "c", "b"]);
  });
  it("is a no-op at the edges and for unknown ids", () => {
    expect(moveId(ids, "a", -1)).toEqual(ids);
    expect(moveId(ids, "c", 1)).toEqual(ids);
    expect(moveId(ids, "x", 1)).toEqual(ids);
  });
  it("does not mutate the input", () => {
    moveId(ids, "a", 1);
    expect(ids).toEqual(["a", "b", "c"]);
  });
});
