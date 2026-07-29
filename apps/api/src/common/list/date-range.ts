/**
 * Build a Prisma date-range `where` fragment from a list query's `startDate` /
 * `endDate` (both `YYYY-MM-DD`, inclusive). Returns `{}` when neither is set, so
 * callers can spread it unconditionally: `where: { ...base, ...dateRangeWhere(query) }`.
 *
 * The end date is expanded to the end of that day so a same-day range still
 * matches records created later in the day. Defaults to the `createdAt` field;
 * pass another field for resources that track time elsewhere (e.g. `updatedAt`).
 */
export function dateRangeWhere(
  query: { startDate?: string; endDate?: string },
  field = "createdAt",
): Record<string, { gte?: Date; lte?: Date }> {
  const { startDate, endDate } = query;
  if (!startDate && !endDate) return {};

  const range: { gte?: Date; lte?: Date } = {};
  if (startDate) {
    const from = new Date(startDate);
    if (!Number.isNaN(from.getTime())) range.gte = from;
  }
  if (endDate) {
    const to = new Date(endDate);
    if (!Number.isNaN(to.getTime())) {
      to.setHours(23, 59, 59, 999);
      range.lte = to;
    }
  }
  return Object.keys(range).length ? { [field]: range } : {};
}
