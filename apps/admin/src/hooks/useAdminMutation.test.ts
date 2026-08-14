import { describe, expect, it } from "vitest";
import { patchCachedEntity } from "./useAdminMutation";

describe("patchCachedEntity", () => {
  it("merges the patch into a matching top-level object", () => {
    const original = { id: "1", name: "old", count: 5 };
    const result = patchCachedEntity(original, "1", { name: "new" });
    expect(result).toEqual({ id: "1", name: "new", count: 5 });
  });

  it("returns the exact same reference when nothing matches (structural sharing)", () => {
    const original = { id: "1", name: "old" };
    const result = patchCachedEntity(original, "does-not-exist", {
      name: "new",
    });
    expect(result).toBe(original);
  });

  it("patches only the matching item inside an array, others unchanged by reference", () => {
    const untouched = { id: "2", name: "b" };
    const target = { id: "1", name: "a" };
    const original = [target, untouched];
    const result = patchCachedEntity(original, "1", { name: "A!" }) as any[];

    expect(result).not.toBe(original); // .map always returns a new array
    expect(result[0]).toEqual({ id: "1", name: "A!" });
    expect(result[0]).not.toBe(target); // the patched item is a new object
    expect(result[1]).toBe(untouched); // untouched item keeps its reference
  });

  it("propagates the change up through nested structures, sharing untouched siblings", () => {
    const meta = { total: 2 };
    const rowA = { id: "1", name: "a" };
    const rowB = { id: "2", name: "b" };
    const original = { data: [rowA, rowB], meta };

    const result = patchCachedEntity(original, "2", { name: "B!" }) as any;

    expect(result).not.toBe(original); // top-level changed
    expect(result.data).not.toBe(original.data); // nested array changed
    expect(result.data[0]).toBe(rowA); // untouched row: same reference
    expect(result.data[1]).toEqual({ id: "2", name: "B!" });
    expect(result.meta).toBe(meta); // untouched sibling: same reference
  });

  it("patches every occurrence when the same id appears more than once", () => {
    const original = {
      buyer: { id: "u1", name: "old" },
      recentBuyer: { id: "u1", name: "old" },
    };
    const result = patchCachedEntity(original, "u1", {
      name: "new",
    }) as any;
    expect(result.buyer.name).toBe("new");
    expect(result.recentBuyer.name).toBe("new");
  });

  it("passes primitives through unchanged", () => {
    expect(patchCachedEntity("abc", "1", {})).toBe("abc");
    expect(patchCachedEntity(42, "1", {})).toBe(42);
    expect(patchCachedEntity(null, "1", {})).toBe(null);
    expect(patchCachedEntity(undefined, "1", {})).toBe(undefined);
  });

  it("does not recurse into Date instances", () => {
    const date = new Date("2026-01-01T00:00:00Z");
    const original = { id: "1", createdAt: date };
    // id doesn't match, so nothing should change and the Date must survive
    // untouched (not spread into a plain object).
    const result = patchCachedEntity(original, "other", {}) as any;
    expect(result.createdAt).toBe(date);
  });
});
