import { Badge } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { col } from "@/components/table";
import {
  type Report,
  reportStatusConfig,
  reportTypeLabels,
  reportReasonLabels,
} from "./types";

type T = ReturnType<typeof useTranslations<never>>;

export function reportColumns({ t }: { t: T }) {
  const typeLabels = reportTypeLabels(t);
  const reasonLabels = reportReasonLabels(t);
  const statusConfig = reportStatusConfig(t);
  return [
    col.text<Report>(
      t("admin.reports.columns.type"),
      (r) => typeLabels[r.type] ?? r.type,
      {
        grow: 1,
        minWidth: 110,
        sortKey: "type",
        sortType: "text",
      },
    ),
    col.text<Report>(
      t("admin.reports.columns.reason"),
      (r) => reasonLabels[r.reason] ?? r.reason,
      {
        sortKey: "reason",
        sortType: "text",
      },
    ),
    col.custom<Report>(
      t("common.description"),
      (r) =>
        r.description ? (
          <p className="whitespace-normal break-words text-sm leading-5 text-muted">
            {r.description}
          </p>
        ) : (
          <span className="text-subtle">—</span>
        ),
      {
        grow: 3,
        minWidth: 320,
        sortKey: "description",
        sortType: "text",
        exportValue: (r) => r.description ?? "",
      },
    ),
    col.user<Report>(
      t("admin.reports.columns.reporter"),
      (r) =>
        r.reporter
          ? {
              name: r.reporter.displayName,
              secondary: r.reporter.email,
              avatar: r.reporter.avatarUrl,
              href: `/accounts/users/${r.reporter.id}`,
            }
          : null,
      { minWidth: 260, sortKey: "reporter.displayName" },
    ),
    col.date<Report>(t("common.date"), "createdAt"),
    col.badge<Report>(
      t("common.status"),
      (r) => <Badge status={r.status} config={statusConfig} />,
      { sortKey: "status", sortType: "text" },
    ),
    col.muted<Report>(
      t("admin.reports.columns.resolution"),
      (r) => r.adminNote || null,
      { grow: 2 },
    ),
  ];
}
