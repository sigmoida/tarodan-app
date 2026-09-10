"use client";

import { useState } from "react";
import { Button, Select } from "@tarodan/ui";
import { ArrowDownTrayIcon } from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { downloadBlob } from "@/lib/download";
import { SectionCard } from "@/components/detail/SectionCard";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const now = new Date();

/**
 * Aylık resmî bildirim dosyası. Dönem sunucuda ZORUNLU — sınırsız bir tam-tablo
 * dışa aktarımı, tek tıkla bütün kimlik havuzunu dışarı taşırdı. İndirme
 * sunucuda zorunlu denetim kaydı bırakır.
 */
export function DeletedIdentitiesExport() {
  const t = useTranslations();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [busy, setBusy] = useState(false);

  const monthNames = Array.from({ length: 12 }, (_, index) =>
    new Date(2024, index, 1).toLocaleDateString(t("common.dateLocale"), {
      month: "long",
    }),
  );

  const onExport = async () => {
    setBusy(true);
    try {
      const response = await adminApi.getDeletedIdentitiesExport({
        year: Number(year),
        month: Number(month),
      });
      downloadBlob(
        `tarodan-silinen-hesap-bildirimi-${year}-${month.padStart(2, "0")}.xlsx`,
        response.data as BlobPart,
        XLSX_MIME,
      );
      toast.success(t("admin.deletedIdentities.exported"));
    } catch {
      toast.error(t("admin.deletedIdentities.exportFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard title={t("admin.deletedIdentities.exportTitle")}>
      <div className="flex min-w-0 flex-nowrap items-end gap-4 overflow-x-auto pb-1">
        <Select
          label={t("admin.deletedIdentities.exportYear")}
          value={year}
          onChange={(event) => setYear(event.target.value)}
          options={Array.from({ length: 4 }, (_, index) => {
            const value = String(now.getFullYear() - index);
            return { value, label: value };
          })}
        />
        <Select
          label={t("admin.deletedIdentities.exportMonth")}
          value={month}
          onChange={(event) => setMonth(event.target.value)}
          options={monthNames.map((name, index) => ({
            value: String(index + 1),
            label: name,
          }))}
        />
        <Button
          variant="outline"
          className="shrink-0"
          leftIcon={<ArrowDownTrayIcon className="h-5 w-5" />}
          isLoading={busy}
          onClick={onExport}
        >
          {t("admin.deletedIdentities.exportButton")}
        </Button>
      </div>
      <p className="text-muted mt-3 text-sm">
        {t("admin.deletedIdentities.exportHint")}
      </p>
    </SectionCard>
  );
}
