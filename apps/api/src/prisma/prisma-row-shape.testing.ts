/**
 * Spec helper: shape a fixture row the way Prisma shapes a query result. With
 * a top-level `select` only the selected columns come back; with `include` (or
 * neither) every scalar column does. A fake `findUnique` built on it makes a
 * spec fail when the code under test stops selecting a column it reads, which
 * a mock that ignores its arguments cannot catch.
 */
export function shapeRowBySelect<T extends object>(
  row: T | null,
  args: { select?: object | null } | undefined,
): Partial<T> | null {
  const select = args?.select as Record<string, unknown> | null | undefined;
  if (!row || !select) return row;
  return Object.fromEntries(
    Object.entries(row).filter(([key]) => Boolean(select[key])),
  ) as Partial<T>;
}

/** A Prisma `findUnique` fake that returns `row` shaped by its arguments. */
export function findUniqueShaping<T extends object>(row: T | null) {
  return jest.fn((args?: { select?: object | null }) =>
    Promise.resolve(shapeRowBySelect(row, args)),
  );
}
