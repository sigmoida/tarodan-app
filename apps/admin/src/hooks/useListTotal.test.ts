import { describe, expect, it } from "vitest";
import { readListTotal } from "./useListTotal";

describe("readListTotal", () => {
  it("reads meta.total from the { data: [...], meta } envelope (getOrders/getProducts)", () => {
    expect(readListTotal({ data: [{ id: "1" }], meta: { total: 42 } })).toBe(
      42,
    );
  });

  it("reads a top-level total ({ items, total })", () => {
    expect(readListTotal({ items: [], total: 7 })).toBe(7);
  });

  it("reads a nested wrapping ({ data: { data, meta } })", () => {
    expect(readListTotal({ data: { data: [], meta: { total: 3 } } })).toBe(3);
    expect(readListTotal({ data: { items: [], total: 5 } })).toBe(5);
  });

  it("prefers meta.total over a sibling total", () => {
    expect(readListTotal({ meta: { total: 10 }, total: 99 })).toBe(10);
  });

  it("coerces numeric strings", () => {
    expect(readListTotal({ meta: { total: "12" } })).toBe(12);
  });

  it("falls back to 0 (never rows.length) when no total is present", () => {
    expect(readListTotal({ data: [{ id: "1" }] })).toBe(0);
    expect(readListTotal({})).toBe(0);
    expect(readListTotal(undefined)).toBe(0);
    expect(readListTotal(null)).toBe(0);
    expect(readListTotal({ meta: { total: "abc" } })).toBe(0);
  });
});
