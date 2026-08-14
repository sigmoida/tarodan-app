import type { ColumnDef } from "@tanstack/react-table";

/** UTF-8 BOM — makes Excel render Turkish characters correctly. */
const BOM = "﻿";

/** CSV-escape a value: quote when it contains a comma, quote or newline. */
export function csvCell(v: string | number | null | undefined): string {
  if (v == null) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Build a CSV string from the columns that carry export meta (`col.*` fills these
 * for value-based columns) and the given rows. Columns without an `exportValue`
 * (badge/custom/actions) are skipped.
 */
export function columnsToCsv<T>(
  columns: ColumnDef<T, any>[],
  rows: T[],
): string {
  const cols = columns.filter(
    (c) => c.meta?.exportHeader && c.meta?.exportValue,
  );
  const header = cols.map((c) => csvCell(c.meta!.exportHeader!)).join(",");
  const body = rows
    .map((row) => cols.map((c) => csvCell(c.meta!.exportValue!(row))).join(","))
    .join("\n");
  return `${BOM}${header}\n${body}`;
}

/** True when at least one column can be exported. */
export function hasExportableColumns<T>(columns: ColumnDef<T, any>[]): boolean {
  return columns.some((c) => c.meta?.exportHeader && c.meta?.exportValue);
}
