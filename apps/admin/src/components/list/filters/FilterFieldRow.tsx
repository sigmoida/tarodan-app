"use client";

import { useTranslations } from "next-intl";
import { DatePicker, Select } from "@tarodan/ui";
import {
  DEFAULT_FROM_NAME,
  DEFAULT_TO_NAME,
  type FilterDraft,
  type FilterField,
} from "./types";

/**
 * One row of the filter dialog. Controls write to the draft, never to the list —
 * nothing refetches until the dialog commits.
 *
 * Widths are deliberately absent: inside the dialog every control is full width,
 * which is what retires the per-page `sm:w-44` / truncate patches the toolbar
 * needed back when filters competed for one row.
 */
export function FilterFieldRow({
  field,
  draft,
}: {
  field: FilterField;
  draft: FilterDraft;
}) {
  const t = useTranslations();

  if (field.type === "select") {
    return (
      <Select
        label={field.label}
        value={draft.values[field.name] ?? ""}
        onChange={(event) => draft.set({ [field.name]: event.target.value })}
        options={field.options}
      />
    );
  }

  if (field.type === "dateRange") {
    const fromName = field.fromName ?? DEFAULT_FROM_NAME;
    const toName = field.toName ?? DEFAULT_TO_NAME;
    return (
      <fieldset className="space-y-2">
        <legend className="mb-1 block text-sm font-medium text-body">
          {field.label}
        </legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <DatePicker
            value={draft.values[fromName] ?? ""}
            onChange={(value) => draft.set({ [fromName]: value })}
            aria-label={t("admin.shared.dateRange.startDate")}
            placeholder={t("admin.shared.dateRange.startDate")}
          />
          <DatePicker
            value={draft.values[toName] ?? ""}
            onChange={(value) => draft.set({ [toName]: value })}
            aria-label={t("admin.shared.dateRange.endDate")}
            placeholder={t("admin.shared.dateRange.endDate")}
          />
        </div>
      </fieldset>
    );
  }

  return <>{field.render(draft)}</>;
}
