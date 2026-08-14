import { describe, expect, it } from "vitest";
import { extractData } from "./useAdminResource";

describe("extractData", () => {
  it("reads shape { data: [...], meta: { total } } (getOrders/getTrades/getProducts)", () => {
    const raw = { data: [{ id: 1 }, { id: 2 }], meta: { total: 50 } };
    const { rows, total } = extractData<{ id: number }>(raw, "orders");
    expect(rows).toEqual([{ id: 1 }, { id: 2 }]);
    expect(total).toBe(50);
  });

  it("reads shape { [queryKey]: [...], meta: { total } }", () => {
    const raw = { users: [{ id: 1 }], meta: { total: 5 } };
    const { rows, total } = extractData<{ id: number }>(raw, "users");
    expect(rows).toEqual([{ id: 1 }]);
    expect(total).toBe(5);
  });

  it("reads a nested wrapper { data: { data: [...], meta } }", () => {
    const raw = { data: { data: [{ id: 1 }], meta: { total: 3 } } };
    const { rows, total } = extractData<{ id: number }>(raw, "x");
    expect(rows).toEqual([{ id: 1 }]);
    expect(total).toBe(3);
  });

  it("reads shape { items: [...], total }", () => {
    const raw = { items: [{ id: 1 }, { id: 2 }, { id: 3 }], total: 100 };
    const { rows, total } = extractData<{ id: number }>(raw, "x");
    expect(rows).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    expect(total).toBe(100);
  });

  it("reads a top-level total alongside empty data (empty-search branch)", () => {
    const raw = { data: [], total: 25, page: 1 };
    const { rows, total } = extractData<{ id: number }>(raw, "x");
    expect(rows).toEqual([]);
    expect(total).toBe(25);
  });

  it("accepts a raw array response with no wrapper at all", () => {
    const raw = [{ id: 1 }, { id: 2 }];
    const { rows, total } = extractData<{ id: number }>(raw, "x");
    expect(rows).toEqual([{ id: 1 }, { id: 2 }]);
    expect(total).toBe(2); // falls back to rows.length
  });

  it("prefers meta.total over a sibling top-level total", () => {
    const raw = { data: [{ id: 1 }], meta: { total: 99 }, total: 1 };
    const { total } = extractData<{ id: number }>(raw, "x");
    expect(total).toBe(99);
  });

  it("falls back to rows.length when no total field exists anywhere", () => {
    const raw = { data: [{ id: 1 }, { id: 2 }] };
    const { total } = extractData<{ id: number }>(raw, "x");
    expect(total).toBe(2);
  });

  it("returns an empty page for null/undefined response data", () => {
    expect(extractData(null, "x")).toEqual({ rows: [], total: 0 });
    expect(extractData(undefined, "x")).toEqual({ rows: [], total: 0 });
  });
});
