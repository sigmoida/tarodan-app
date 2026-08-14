import { describe, expect, it } from "vitest";
import { paginateClient } from "./client-list";

interface Row {
  id: number;
  name: string;
  code: string;
  age: number | null;
  createdAt?: string;
  buyer?: { name: string };
}

const rows: Row[] = [
  { id: 1, name: "Ahmet", code: "item10", age: 30, buyer: { name: "Zeynep" } },
  { id: 2, name: "Bora", code: "item2", age: 10, buyer: { name: "Ali" } },
  { id: 3, name: "Can", code: "item1", age: null, buyer: { name: "Mehmet" } },
];

describe("paginateClient — pagination", () => {
  it("slices to the requested page/limit and reports the full total in meta", () => {
    const page1 = paginateClient(rows, { page: 1, limit: 2 });
    expect(page1.data.map((r) => r.id)).toEqual([1, 2]);
    expect(page1.meta.total).toBe(3);

    const page2 = paginateClient(rows, { page: 2, limit: 2 });
    expect(page2.data.map((r) => r.id)).toEqual([3]);
    expect(page2.meta.total).toBe(3);
  });

  it("defaults to page 1 / limit 20 when unset", () => {
    const result = paginateClient(rows, {});
    expect(result.data).toHaveLength(3);
  });
});

describe("paginateClient — search", () => {
  it("full-content search matches a nested relation field by default", () => {
    const result = paginateClient(rows, { search: "mehmet" });
    expect(result.data.map((r) => r.id)).toEqual([3]);
  });

  it("full-content search is case-insensitive", () => {
    const result = paginateClient(rows, { search: "AHMET" });
    expect(result.data.map((r) => r.id)).toEqual([1]);
  });

  it("narrows to explicit searchFields when given (array form)", () => {
    // "Zeynep" only appears under buyer.name, which is excluded here.
    const result = paginateClient(
      rows,
      { search: "zeynep" },
      { searchFields: ["name", "code"] },
    );
    expect(result.data).toHaveLength(0);
  });

  it("narrows to explicit searchFields when given (selector-fn form)", () => {
    const result = paginateClient(
      rows,
      { search: "ali" },
      { searchFields: (item) => [item.buyer?.name] },
    );
    expect(result.data.map((r) => r.id)).toEqual([2]);
  });
});

describe("paginateClient — filter", () => {
  it("applies the filter predicate before search/pagination", () => {
    const result = paginateClient(rows, {}, { filter: (r) => r.age !== null });
    expect(result.data.map((r) => r.id)).toEqual([1, 2]);
    expect(result.meta.total).toBe(2);
  });
});

describe("paginateClient — sorting", () => {
  it("sorts by sortType 'number' numerically, empty values last regardless of direction", () => {
    const asc = paginateClient(rows, {
      sortBy: "age",
      sortOrder: "asc",
      sortType: "number",
    });
    expect(asc.data.map((r) => r.id)).toEqual([2, 1, 3]); // 10, 30, null

    const desc = paginateClient(rows, {
      sortBy: "age",
      sortOrder: "desc",
      sortType: "number",
    });
    expect(desc.data.map((r) => r.id)).toEqual([1, 2, 3]); // 30, 10, null (still last)
  });

  it('text sort is numeric-aware ("item2" before "item10", not lexicographic)', () => {
    const result = paginateClient(rows, { sortBy: "code", sortOrder: "asc" });
    // Plain string compare would put "item1" < "item10" < "item2"; the
    // {numeric:true} comparator must put "item2" before "item10".
    expect(result.data.map((r) => r.code)).toEqual([
      "item1",
      "item2",
      "item10",
    ]);
  });

  it("supports a dotted sortKey into a nested field", () => {
    const result = paginateClient(rows, {
      sortBy: "buyer.name",
      sortOrder: "asc",
    });
    // Ali, Mehmet, Zeynep
    expect(result.data.map((r) => r.id)).toEqual([2, 3, 1]);
  });

  it("leaves order unchanged when no sortBy is given", () => {
    const result = paginateClient(rows, {});
    expect(result.data.map((r) => r.id)).toEqual([1, 2, 3]);
  });
});
