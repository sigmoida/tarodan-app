"use client";

import { useTranslations } from "next-intl";
import { FormCheckbox, FormInput } from "@tarodan/ui/form";
import { SectionCard } from "@/components/detail/SectionCard";
import type {
  InvoicingSettingGroup,
  InvoicingSettingsState,
} from "@/lib/api/invoicing-settings.types";
import {
  CARI_CODE_MAX_LENGTH,
  ITEM_CODE_MAX_LENGTH,
  fieldName,
  rowsInGroup,
  settingHelperKey,
  settingLabelKey,
} from "../_lib/invoicing-settings";

const MAX_LENGTH: Record<InvoicingSettingGroup, number> = {
  cari: CARI_CODE_MAX_LENGTH,
  serial: 3,
  item: ITEM_CODE_MAX_LENGTH,
};

/**
 * Bir ayar grubunun kartı (Cari / Seriler / Hizmet Kartları). Alanlar sunucunun
 * döndürdüğü satırlardan çizilir: yeni bir ücret türü ya da ayar eklendiğinde
 * ekran kendiliğinden bir girdi kazanır.
 */
export function SettingsGroupCard({
  group,
  state,
}: {
  group: InvoicingSettingGroup;
  state: InvoicingSettingsState;
}) {
  const t = useTranslations();
  const rows = rowsInGroup(state.settings, group);
  if (rows.length === 0) return null;

  return (
    <SectionCard title={t(`admin.invoicingSettings.groups.${group}`)}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {rows.map((row) => {
          const helper = settingHelperKey(row);
          const label = t(settingLabelKey(row, state.feeTypes));
          return row.type === "boolean" ? (
            <FormCheckbox
              key={row.key}
              name={fieldName(row.key)}
              label={label}
            />
          ) : (
            <FormInput
              key={row.key}
              name={fieldName(row.key)}
              label={label}
              maxLength={MAX_LENGTH[group]}
              helperText={helper ? t(helper) : undefined}
            />
          );
        })}
      </div>
    </SectionCard>
  );
}
