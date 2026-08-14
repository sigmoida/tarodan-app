import type { ColumnDef } from "@tanstack/react-table";
import { describe, expect, it } from "vitest";
import { computeColumnLayout } from "./columnLayout";

interface Row {
  id: string;
}

function col(meta: ColumnDef<Row, any>["meta"]): ColumnDef<Row, any> {
  return { id: JSON.stringify(meta), meta };
}

describe("computeColumnLayout — hasSizing", () => {
  it("is false when no column carries sizing meta (legacy raw ColumnDef tables)", () => {
    const layout = computeColumnLayout<Row>([{ id: "a" }, { id: "b" }]);
    expect(layout.hasSizing).toBe(false);
    expect(layout.tableMinWidth).toBe(0);
  });

  it("is true when at least one column has minWidth/grow/align meta", () => {
    expect(computeColumnLayout<Row>([col({ minWidth: 100 })]).hasSizing).toBe(
      true,
    );
    expect(computeColumnLayout<Row>([col({ grow: 1 })]).hasSizing).toBe(true);
    expect(computeColumnLayout<Row>([col({ align: "right" })]).hasSizing).toBe(
      true,
    );
  });
});

describe("computeColumnLayout — width split", () => {
  const fixedCol = col({ minWidth: 100, fixed: true });
  const flexColA = col({ minWidth: 100 });
  const flexColB = col({ minWidth: 200 });
  const columns = [fixedCol, flexColA, flexColB];

  it("keeps a fixed column at exactly its minWidth", () => {
    const layout = computeColumnLayout<Row>(columns);
    expect(layout.widthOf(fixedCol)).toBe("100px");
  });

  it("splits flexible columns proportionally to minWidth * FLEX_SLACK (1.2)", () => {
    const layout = computeColumnLayout<Row>(columns);
    // flexMin: A = 100*1.2 = 120, B = 200*1.2 = 240; flexibleWidth = 360.
    // fixedWidth = 100 (fixedCol only, no `selectable`).
    expect(layout.widthOf(flexColA)).toBe(
      `calc((100% - 100px) * ${120 / 360})`,
    );
    expect(layout.widthOf(flexColB)).toBe(
      `calc((100% - 100px) * ${240 / 360})`,
    );
  });

  it("adds 44px to the fixed width when selectable (checkbox column)", () => {
    const withoutSelect = computeColumnLayout<Row>(columns, false);
    const withSelect = computeColumnLayout<Row>(columns, true);
    expect(withSelect.tableMinWidth).toBe(withoutSelect.tableMinWidth + 44);
  });

  it("sums fixed + flexible width into tableMinWidth", () => {
    const layout = computeColumnLayout<Row>(columns);
    expect(layout.tableMinWidth).toBe(100 + 120 + 240);
  });

  it("defaults a column with no minWidth to 140px", () => {
    const layout = computeColumnLayout<Row>([col({ fixed: true })]);
    expect(layout.widthOf(col({ fixed: true }))).toBe("140px");
  });
});

describe("computeColumnLayout — all-fixed edge case", () => {
  it("returns a plain px width (not a calc string) when there are no flexible columns", () => {
    const onlyFixed = [col({ minWidth: 100, fixed: true })];
    const layout = computeColumnLayout<Row>(onlyFixed);
    expect(layout.widthOf(onlyFixed[0])).toBe("100px");
    expect(layout.widthOf(onlyFixed[0])).not.toMatch(/calc/);
  });
});

describe("computeColumnLayout — alignOf", () => {
  it("maps each alignment to its text-align class", () => {
    const layout = computeColumnLayout<Row>([]);
    expect(layout.alignOf("left")).toBe("text-left");
    expect(layout.alignOf("right")).toBe("text-right");
    expect(layout.alignOf("center")).toBe("text-center");
  });

  it("returns undefined for no alignment", () => {
    const layout = computeColumnLayout<Row>([]);
    expect(layout.alignOf(undefined)).toBeUndefined();
  });
});
