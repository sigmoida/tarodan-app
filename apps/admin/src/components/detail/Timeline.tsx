"use client";

import { useTranslations } from "next-intl";
import { fmtDateTime } from "@/lib/format";
import { SectionCard } from "./SectionCard";

export interface TimelineEntry {
  label: string;
  at?: string | null;
}

/**
 * A timestamped event list (created / updated / …). Entries with no `at` are
 * dropped, so callers can pass the full set and only the reached steps show.
 */
export function Timeline({
  items,
  title,
}: {
  items: TimelineEntry[];
  title?: string;
}) {
  const t = useTranslations();
  const resolvedTitle = title ?? t("admin.shared.timeline.title");
  const visible = items.filter((i) => i.at);
  if (visible.length === 0) return null;

  return (
    <SectionCard title={resolvedTitle}>
      <ol className="space-y-3">
        {visible.map((item, i) => (
          <li key={i}>
            <p className="text-sm font-medium text-heading">{item.label}</p>
            <p className="text-xs text-muted">{fmtDateTime(item.at)}</p>
          </li>
        ))}
      </ol>
    </SectionCard>
  );
}
