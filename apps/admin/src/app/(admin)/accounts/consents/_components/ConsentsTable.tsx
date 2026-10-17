"use client";

import { useTranslations } from "next-intl";
import type { AdminConsentRecordRow } from "@tarodan/types";
import { ResourceList } from "@/components/list";
import { consentColumns } from "../_lib/columns";

/** Kayıtlar salt okunurdur: satır aksiyonu ve toplu seçim bilinçli olarak yok. */
export function ConsentsTable() {
  const t = useTranslations();
  return (
    <ResourceList.Table<AdminConsentRecordRow>
      columns={consentColumns(t)}
      emptyText={t("admin.consents.empty")}
    />
  );
}
