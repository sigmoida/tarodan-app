"use client";

import { useTranslations } from "next-intl";
import {
  NETSIS_ACCOUNT_CODE_MAX,
  NETSIS_CARI_CODE_MAX,
  NETSIS_ITEM_CODE_MAX,
  NETSIS_SERIAL_LENGTH,
} from "@tarodan/types";
import { FormCheckbox, FormInput } from "@tarodan/ui/form";
import { SectionCard } from "@/components/detail/SectionCard";
import type {
  InvoicingSettingGroup,
  InvoicingSettingsState,
} from "@/lib/api/invoicing-settings.types";
import {
  fieldName,
  rowsInGroup,
  settingHelperKey,
  settingLabelKey,
} from "../_lib/invoicing-settings";

const MAX_LENGTH: Record<InvoicingSettingGroup, number> = {
  cari: NETSIS_CARI_CODE_MAX,
  serial: NETSIS_SERIAL_LENGTH,
  item: NETSIS_ITEM_CODE_MAX,
  // Belge grubu: adres alanları (biçim sunucuda doğrulanır).
  document: 2048,
  // Muhasebe hesap kodları (`netsis.account.*`).
  account: NETSIS_ACCOUNT_CODE_MAX,
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
