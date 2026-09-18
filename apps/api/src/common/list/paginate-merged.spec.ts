import { paginateMerged, type MergedListSource } from "./paginate-merged";

type Row = { id: string; at: number };

/** A source that serves `rows` (already in the shared order) and records `take`. */
function source(rows: Row[]) {
  const takes: number[] = [];
  const src: MergedListSource<Row> = {
    count: async () => rows.length,
    head: async (take) => {
      takes.push(take);
      return rows.slice(0, take);
    },
  };
  return { src, takes };
}

const newestFirst = (a: Row, b: Row) => b.at - a.at;

describe("paginateMerged", () => {
  it("interleaves the sources in the shared order and totals both counts", async () => {
    const a = source([
      { id: "a1", at: 9 },
      { id: "a2", at: 5 },
      { id: "a3", at: 1 },
    ]);
    const b = source([
      { id: "b1", at: 8 },
      { id: "b2", at: 2 },
    ]);

    const page2 = await paginateMerged([a.src, b.src], newestFirst, {
      page: 2,
      limit: 2,
    });

    expect(page2.data.map((r) => r.id)).toEqual(["a2", "b2"]);
    expect(page2.meta).toEqual({ total: 5, page: 2, limit: 2, totalPages: 3 });
    // Each source only has to supply its first page*limit rows: a row beyond
    // that can never land on this page, whatever the other source holds.
    expect(a.takes).toEqual([4]);
    expect(b.takes).toEqual([4]);
  });

  it("applies the shared defaults and cap", async () => {
    const a = source([]);
    const result = await paginateMerged([a.src], newestFirst, {
      page: 0,
      limit: 10_000,
    });
    expect(result.meta).toEqual({
      total: 0,
      page: 1,
      limit: 500,
      totalPages: 0,
    });
    expect(a.takes).toEqual([500]);
  });

  it("keeps each source's own order where the comparator disagrees with it", async () => {
    // The database orders `b` by a collation JS does not share: B-first, then
    // a-second. Re-sorting the union would move rows across page boundaries;
    // merging keeps every row on exactly one page.
    const a = source([{ id: "a1", at: 5 }]);
    const b = source([
      { id: "b1", at: 1 },
      { id: "b2", at: 9 },
    ]);
    const pages = await Promise.all(
      [1, 2, 3].map((page) =>
        paginateMerged([a.src, b.src], newestFirst, { page, limit: 1 }),
      ),
    );
    const ids = pages.flatMap((p) => p.data.map((r) => r.id));
    expect([...ids].sort()).toEqual(["a1", "b1", "b2"]);
  });

  it("works with a single source", async () => {
    const a = source([
      { id: "a1", at: 3 },
      { id: "a2", at: 2 },
      { id: "a3", at: 1 },
    ]);
    const result = await paginateMerged([a.src], newestFirst, {
      page: 2,
      limit: 2,
    });
    expect(result.data.map((r) => r.id)).toEqual(["a3"]);
  });
});
