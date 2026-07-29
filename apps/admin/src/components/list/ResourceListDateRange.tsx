"use client";

import { useTranslations } from "next-intl";
import { DatePicker } from "@tarodan/ui";
import { useFilter } from "@/context/ResourceListContext";

/** A from/to date-range filter pair bound to two filter keys. */
export function ResourceListDateRange({
  fromName = "startDate",
  toName = "endDate",
}: {
  fromName?: string;
  toName?: string;
}) {
  const t = useTranslations();
  const [from, setFrom] = useFilter(fromName);
  const [to, setTo] = useFilter(toName);
  return (
    <div className="flex shrink-0 gap-3">
      <DatePicker
        value={from}
        onChange={(v) => setFrom(v)}
        className="w-40"
        aria-label={t("admin.shared.dateRange.startDate")}
      />
      <DatePicker
        value={to}
        onChange={(v) => setTo(v)}
        className="w-40"
        aria-label={t("admin.shared.dateRange.endDate")}
      />
    </div>
  );
}
