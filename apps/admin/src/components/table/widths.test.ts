import { describe, expect, it } from "vitest";
import { col } from "./columns";
import { COL_SIZE, COL_WIDTH } from "./widths";

interface Row {
  id: string;
  at: string;
}

describe("COL_SIZE", () => {
  it("is a fixed column at the kind's shared width", () => {
    for (const [kind, width] of Object.entries(COL_WIDTH)) {
      expect(COL_SIZE[kind as keyof typeof COL_WIDTH]).toEqual({
        minWidth: width,
        fixed: true,
      });
    }
  });
});

describe("col.* widths come from COL_WIDTH", () => {
  // Single-letter headers so the header-aware widening never kicks in.
  it("defaults date / money / number / badge / rowMenu to the shared widths", () => {
    expect(col.date<Row>("D", (r) => r.at).meta?.minWidth).toBe(COL_WIDTH.date);
    expect(col.money<Row>("M", () => 1).meta?.minWidth).toBe(COL_WIDTH.amount);
    expect(col.number<Row>("N", () => 1).meta?.minWidth).toBe(COL_WIDTH.count);
    expect(col.badge<Row>("B", () => null).meta?.minWidth).toBe(
      COL_WIDTH.status,
    );
    expect(col.rowMenu<Row>(() => []).meta?.minWidth).toBe(COL_WIDTH.rowMenu);
  });

  it("status / dateRange / toggle are fixed at their kind's width", () => {
    const status = col.status<Row>("S", () => null).meta;
    const range = col.dateRange<Row>("R", () => ({})).meta;
    const toggle = col.toggle<Row>("T", () => ({
      checked: true,
      onChange: () => {},
      label: "x",
      stateText: "y",
    })).meta;
    expect(status).toMatchObject({ minWidth: COL_WIDTH.status, fixed: true });
    expect(range).toMatchObject({ minWidth: COL_WIDTH.dateRange, fixed: true });
    expect(toggle).toMatchObject({ minWidth: COL_WIDTH.toggle, fixed: true });
  });

  it("spreading COL_SIZE pins any column to the kind's width", () => {
    expect(col.text<Row>("X", "id", COL_SIZE.count).meta).toMatchObject({
      minWidth: COL_WIDTH.count,
      fixed: true,
      sortKey: "id",
    });
  });

  it("title is the main-cell column (wide, flexible)", () => {
    const meta = col.title<Row>("T", (r) => ({ title: r.id })).meta;
    expect(meta?.minWidth).toBe(240);
    expect(meta?.fixed).toBeUndefined();
  });
});
