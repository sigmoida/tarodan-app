import type { ColumnDef } from "@tanstack/react-table";
import { describe, expect, it } from "vitest";
import { columnsToCsv, csvCell, hasExportableColumns } from "./csv";

describe("csvCell", () => {
  it("passes plain values through unchanged", () => {
    expect(csvCell("hello")).toBe("hello");
    expect(csvCell(42)).toBe("42");
  });

  it("returns an empty string for null/undefined", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("quotes a value containing a comma", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
  });

  it("quotes and doubles embedded quotes", () => {
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it("quotes a value containing a newline", () => {
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });
});

interface Row {
  id: string;
  name: string;
}

function col(
  exportHeader: string | undefined,
  exportValue: ((row: Row) => string) | undefined,
): ColumnDef<Row, unknown> {
  return { id: exportHeader ?? "x", meta: { exportHeader, exportValue } };
}

describe("hasExportableColumns", () => {
  it("is true when at least one column has both exportHeader and exportValue", () => {
    expect(
      hasExportableColumns([
        col("Name", (r) => r.name),
        col(undefined, undefined),
      ]),
    ).toBe(true);
  });

  it("is false when no column has both", () => {
    expect(
      hasExportableColumns([col("Name", undefined), col(undefined, () => "x")]),
    ).toBe(false);
  });
});

describe("columnsToCsv", () => {
  it("builds a BOM-prefixed CSV from exportable columns only", () => {
    const columns = [
      col("ID", (r) => r.id),
      col("Name", (r) => r.name),
      col(undefined, undefined), // not exportable, skipped
    ];
    const rows: Row[] = [
      { id: "1", name: "Ada" },
      { id: "2", name: "Grace" },
    ];
    const csv = columnsToCsv(columns, rows);
    expect(csv).toBe("﻿ID,Name\n1,Ada\n2,Grace");
  });

  it("escapes cell values that need it", () => {
    const columns = [col("Name", (r) => r.name)];
    const rows: Row[] = [{ id: "1", name: "Doe, Jane" }];
    expect(columnsToCsv(columns, rows)).toBe('﻿Name\n"Doe, Jane"');
  });
});
