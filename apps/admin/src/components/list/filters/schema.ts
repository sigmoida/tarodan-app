import { DEFAULT_FROM_NAME, DEFAULT_TO_NAME, type FilterField } from "./types";

/** The filter keys one dialog row owns. */
export function fieldKeys(field: FilterField): string[] {
  switch (field.type) {
    case "select":
      return [field.name];
    case "dateRange":
      return [
        field.fromName ?? DEFAULT_FROM_NAME,
        field.toName ?? DEFAULT_TO_NAME,
      ];
    case "custom":
      return field.names;
  }
}

/** The value a key holds when it isn't filtering anything. */
function fieldDefaults(field: FilterField): Record<string, string> {
  switch (field.type) {
    case "select":
      return {
        [field.name]: field.defaultValue ?? field.options[0]?.value ?? "",
      };
    case "dateRange":
      return Object.fromEntries(fieldKeys(field).map((key) => [key, ""]));
    case "custom":
      return Object.fromEntries(
        field.names.map((key) => [key, field.defaults?.[key] ?? ""]),
      );
  }
}

/**
 * The list's `initialFilters`, derived from the schema.
 *
 * `useAdminResource` only reads and writes URL params for keys present in
 * `initialFilters`, so deriving it here (rather than hand-writing it next to
 * the schema) is what stops a filter from silently losing its deep link.
 */
export function filterDefaults(
  fields: readonly FilterField[] = [],
): Record<string, string> {
  return Object.assign({}, ...fields.map(fieldDefaults));
}

/**
 * How many filters are active, counted per dialog row: a date range with both
 * ends set is one filter, not two.
 *
 * "Active" means *differs from the default*, not *non-empty* — lists disagree
 * on the neutral value ("all", "", and messages/ starts on "pending"), so an
 * emptiness test would mislabel them.
 */
export function countActiveFilters(
  fields: readonly FilterField[] = [],
  values: Record<string, string> = {},
  defaults: Record<string, string> = filterDefaults(fields),
): number {
  return fields.filter((field) =>
    fieldKeys(field).some(
      (key) => (values[key] ?? "") !== (defaults[key] ?? ""),
    ),
  ).length;
}
