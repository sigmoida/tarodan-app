"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@tarodan/ui";
import { FilterFieldRow } from "./FilterFieldRow";
import type { FilterDraft, FilterField } from "./types";

/**
 * The list's filter dialog. Edits land in a local draft and reach the list only
 * on "Uygula", which commits every changed key in a single `setFilters` call —
 * one URL write, one request, no half-applied intermediate states.
 *
 * The caller mounts this only while open (and keyed on that), so the draft is
 * seeded fresh from the applied filters on every open with no effect syncing.
 */
export function FilterDialog({
  fields,
  applied,
  defaults,
  onApply,
  onClose,
}: {
  fields: readonly FilterField[];
  applied: Record<string, string>;
  defaults: Record<string, string>;
  onApply: (values: Record<string, string>) => void;
  onClose: () => void;
}) {
  const t = useTranslations();
  const [values, setValues] = useState<Record<string, string>>(() => ({
    ...defaults,
    ...applied,
  }));

  const draft: FilterDraft = {
    values,
    set: (patch) => setValues((prev) => ({ ...prev, ...patch })),
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t("admin.shared.filterDialog.title")}
      size="md"
      closeLabel={t("common.close")}
      bodyClassName="space-y-4"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
          {/* Resets the draft only — the list stays put until Uygula. */}
          <Button
            variant="ghost"
            onClick={() => setValues({ ...defaults })}
            className="sm:mr-auto"
          >
            {t("common.clear")}
          </Button>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => onApply(values)}>{t("common.apply")}</Button>
        </div>
      }
    >
      {fields.map((field, index) => (
        <FilterFieldRow
          key={`${field.type}-${index}`}
          field={field}
          draft={draft}
        />
      ))}
    </Modal>
  );
}
