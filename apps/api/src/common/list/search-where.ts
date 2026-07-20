/**
 * Full-content admin search (#381).
 *
 * Builds a case-insensitive `contains` OR across every column an admin table
 * shows, so the search box matches any displayed field instead of 1-2. Each
 * entry is a String column path: a scalar (`"name"`) or a to-ONE relation path
 * (`"seller.displayName"`, `"order.buyer.displayName"`). Only String columns are
 * valid — Prisma `contains` doesn't apply to enum/number/date/boolean fields.
 */

const insensitiveContains = (term: string) =>
  ({ contains: term, mode: "insensitive" }) as const;

/** Nest a leaf filter under a dotted path: `["seller","name"]` → `{ seller: { name: leaf } }`. */
function nestPath(path: string, leaf: unknown): Record<string, unknown> {
  return path
    .split(".")
    .reduceRight<unknown>(
      (acc, segment) => ({ [segment]: acc }),
      leaf,
    ) as Record<string, unknown>;
}

/**
 * `{ OR: [...] }` matching `term` (case-insensitive `contains`) across `fields`,
 * or `undefined` when the term is blank / no fields — so callers can spread it
 * straight into a `where` (top-level keys AND together with existing filters):
 *
 *   const search = buildSearchWhere(query.search, ["name", "seller.displayName"]);
 *   const where = { ...filters, ...(search ?? {}) };
 */
export function buildSearchWhere(
  term: string | undefined,
  fields: readonly string[],
): { OR: Record<string, unknown>[] } | undefined {
  const q = term?.trim();
  if (!q || fields.length === 0) return undefined;

  const leaf = insensitiveContains(q);
  return { OR: fields.map((field) => nestPath(field, leaf)) };
}
