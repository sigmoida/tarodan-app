"use client";

import { useTranslations } from "next-intl";
import type { AdminGibReportRow } from "@tarodan/types";
import { ResourceList } from "@/components/list";
import { gibReportColumns } from "../_lib/columns";

/** Rapor salt okunurdur: satır aksiyonu ve toplu seçim bilinçli olarak yok. */
export function GibReportTable() {
  const t = useTranslations();
  return (
    <ResourceList.Table<AdminGibReportRow>
      columns={gibReportColumns(t)}
      emptyText={t("admin.gibReport.empty")}
    />
  );
}
