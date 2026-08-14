import type { ReactNode } from "react";
import type { useTranslations } from "next-intl";
import type { SelectOption } from "@tarodan/ui";

/**
 * The `t` a schema factory takes. Schemas are module-level (they can't call
 * hooks), so the page passes its `useTranslations()` result in.
 */
export type TranslateFn = ReturnType<typeof useTranslations<never>>;

/**
 * The dialog's working copy. Controls read `values` and write through `set`;
 * nothing reaches the list until "Uygula" commits the whole draft at once.
 * This is why filter controls take a `FilterDraft` rather than binding straight
 * to the list's `setFilter` — that commits (and refetches) on every change.
 */
export interface FilterDraft {
  values: Record<string, string>;
  /** Merge a patch into the draft. Multiple keys at once is the point. */
  set: (patch: Record<string, string>) => void;
}

interface BaseField {
  /** Label for the field's row in the dialog. */
  label: string;
}

export interface SelectField extends BaseField {
  type: "select";
  name: string;
  options: SelectOption[];
  /**
   * The value that counts as "not filtering" — the badge ignores it and the URL
   * stays clean. Defaults to the first option's value, which is the "Tümü"
   * entry on every list that follows the existing option-factory convention.
   */
  defaultValue?: string;
}

export interface DateRangeField extends BaseField {
  type: "dateRange";
  /** Filter keys differ per endpoint (startDate/fromDate/from/dateFrom). */
  fromName?: string;
  toName?: string;
}

/**
 * Escape hatch for controls the two field types above can't express — today
 * only the dependent brand → car-model pair and the per-tab log filters.
 * `names` is what makes the badge and the reset work without the field having
 * to report its own state.
 */
export interface CustomField extends BaseField {
  type: "custom";
  names: string[];
  /** Per-key "not filtering" values. Keys left out default to "". */
  defaults?: Record<string, string>;
  render: (draft: FilterDraft) => ReactNode;
}

export type FilterField = SelectField | DateRangeField | CustomField;

export const DEFAULT_FROM_NAME = "startDate";
export const DEFAULT_TO_NAME = "endDate";
