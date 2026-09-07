/** @format */

"use client";

import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { Badge } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { SectionCard } from "@/components/detail/SectionCard";
import { fmtDate, fmtTry } from "@/lib/format";
import type { ComparisonSection as Comparison } from "../_lib/types";

/**
 * PayTR ile karşılaştırma: bizim kayıtlar ↔ senkronlanan PayTR dökümü/hakedişi.
 * "Bizim" taraf dökümün kapsadığı ilk günden itibaren sayılır; senkron kapalıyken
 * rozetle gösterilir, gizlenmez (karar).
 */
export function ComparisonSectionView({
  comparison,
}: {
  comparison: Comparison;
}) {
  const t = useTranslations();
  const base = "admin.finance.overview.comparison";

  return (
    <SectionCard
      title={
        <span className="flex items-center gap-2">
          {t(`${base}.title`)}
          <Link
            href="/finance/psp"
            className="text-sm font-normal text-primary-600 hover:underline"
          >
            {t(`${base}.open`)}
          </Link>
        </span>
      }
      actions={
        !comparison.syncEnabled ? (
          <Badge
            variant="warning"
            title={t("admin.finance.overview.syncOffHint")}
          >
            {t("admin.finance.overview.syncOff")}
          </Badge>
        ) : comparison.coverageFrom ? (
          <span className="text-xs text-muted">
            {t(`${base}.coverageFrom`, {
              date: fmtDate(comparison.coverageFrom) ?? "",
            })}
          </span>
        ) : undefined
      }
      bodyClassName="overflow-x-auto"
    >
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="text-left text-xs text-muted">
            <th className="py-1 font-medium" />
            <th className="py-1 font-medium">{t(`${base}.ours`)}</th>
            <th className="py-1 font-medium">PayTR</th>
            <th className="py-1 font-medium">{t(`${base}.diff`)}</th>
          </tr>
        </thead>
        <tbody>
          {comparison.rows.map((row) => (
            <tr key={row.key} className="border-t border-border">
              <td className="py-2 text-body">
                {t(`${base}.rows.${row.key}`)}
                {row.key === "payouts" &&
                  row.count !== undefined &&
                  row.count > 0 && (
                    <span className="ml-1 text-xs text-subtle">
                      {t(`${base}.awaiting`, { count: row.count })}
                    </span>
                  )}
              </td>
              <td className="py-2 tabular-nums">{fmtTry(row.ours)}</td>
              <td className="py-2 tabular-nums">{fmtTry(row.theirs)}</td>
              <td
                className={`py-2 tabular-nums ${
                  row.informational && !row.balanced
                    ? "text-muted"
                    : row.balanced
                      ? "text-success-700"
                      : "font-semibold text-danger-600"
                }`}
                title={
                  row.informational ? t(`${base}.informationalHint`) : undefined
                }
              >
                <span className="inline-flex items-center gap-1">
                  {row.balanced ? (
                    <CheckCircleIcon className="h-4 w-4" />
                  ) : row.informational ? null : (
                    <ExclamationTriangleIcon className="h-4 w-4" />
                  )}
                  {row.difference < 0 ? "−" : ""}
                  {fmtTry(Math.abs(row.difference))}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </SectionCard>
  );
}
