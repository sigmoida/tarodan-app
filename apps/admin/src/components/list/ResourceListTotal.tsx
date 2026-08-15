"use client";

import { useTranslations } from "next-intl";
import { useResourceList } from "@/context/ResourceListContext";

/** A "Toplam N <unit>" line — handy under tab tables where the total isn't in a header. */
export function ResourceListTotal({ unit }: { unit: string }) {
  const t = useTranslations();
  const { total } = useResourceList();
  return (
    <p className="text-sm text-muted">
      {t("admin.shared.list.totalLine", { total, unit })}
    </p>
  );
}
