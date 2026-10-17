/** The five `@tarodan/ui` Badge variants a table badge may use. */
export type TableBadgeVariant =
  "default" | "success" | "warning" | "danger" | "outline";

/**
 * The ONE status → colour rule for table badges. A status map picks the
 * semantic tone of each state here instead of choosing a variant ad hoc, so
 * "scheduled" is the same colour in the ads, hero and discounts tables.
 *
 *  - live / active / success           → success
 *  - scheduled / pending (not yet on)  → default
 *  - expired / ended / needs attention → warning
 *  - failed / rejected / cancelled     → danger
 *  - inactive / closed / neutral       → outline
 */
export const STATUS_TONE = {
  live: "success",
  pending: "default",
  ended: "warning",
  failed: "danger",
  inactive: "outline",
} as const satisfies Record<string, TableBadgeVariant>;
