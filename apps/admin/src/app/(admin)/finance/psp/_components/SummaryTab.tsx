/** @format */

"use client";

import { useQuery } from "@tanstack/react-query";
import { Badge } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { fmtDate, fmtTry } from "@/lib/format";
import { SectionCard } from "@/components/detail/SectionCard";
import type { PspDayCard } from "../_lib/types";

/**
 * Gün kartları: PayTR dökümü ↔ bizim kayıtlar. Fark 0 → yeşil; değilse kırmızı.
 * Tutarların HİÇBİRİ burada hesaplanmaz — API'nin gün kartı yanıtı basılır.
 */
export function SummaryTab() {
  const t = useTranslations();
  const query = useQuery({
    queryKey: adminKeys.list("psp-reconciliation", "7"),
    queryFn: async () =>
      (await adminApi.getPspReconciliation(7)).data?.days as PspDayCard[],
  });

  if (query.isLoading) {
    return <p className="py-8 text-center text-muted">{t("common.loading")}</p>;
  }
  const days = query.data ?? [];
  if (days.length === 0) {
    return (
      <SectionCard>
        <p className="py-8 text-center text-muted">
          {t("admin.finance.psp.summary.empty")}
        </p>
      </SectionCard>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {days.map((day) => {
        const problems =
          day.match.mismatched + day.match.unmatched + day.missingInPaytr;
        const clean = day.paytrCovered && problems === 0 && day.salesDiff === 0;
        return (
          <SectionCard key={day.date}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-heading">
                {fmtDate(day.date)}
              </h3>
              {!day.paytrCovered ? (
                <Badge variant="default">
                  {t("admin.finance.psp.summary.notCovered")}
                </Badge>
              ) : clean ? (
                <Badge variant="success">
                  {t("admin.finance.psp.summary.clean")}
                </Badge>
              ) : (
                <Badge variant="danger">
                  {t("admin.finance.psp.summary.problems", {
                    count: problems,
                  })}
                </Badge>
              )}
            </div>

            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="py-1 font-medium" />
                  <th className="py-1 font-medium">PayTR</th>
                  <th className="py-1 font-medium">
                    {t("admin.finance.psp.summary.ours")}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="py-1 text-muted">
                    {t("admin.finance.psp.summary.sales")}
                  </td>
                  <td className="py-1">
                    {fmtTry(day.paytr.salesTotal)}{" "}
                    <span className="text-xs text-subtle">
                      ({day.paytr.salesCount})
                    </span>
                  </td>
                  <td
                    className={
                      day.salesDiff !== 0 && day.paytrCovered
                        ? "py-1 font-medium text-danger-600"
                        : "py-1"
                    }
                  >
                    {fmtTry(day.ours.salesTotal)}{" "}
                    <span className="text-xs text-subtle">
                      ({day.ours.salesCount})
                    </span>
                  </td>
                </tr>
                <tr>
                  <td className="py-1 text-muted">
                    {t("admin.finance.psp.summary.refunds")}
                  </td>
                  <td className="py-1">{fmtTry(day.paytr.refundTotal)}</td>
                  <td
                    className={
                      day.refundDiff !== 0 && day.paytrCovered
                        ? "py-1 font-medium text-danger-600"
                        : "py-1"
                    }
                  >
                    {fmtTry(day.ours.refundTotal)}
                  </td>
                </tr>
                <tr>
                  <td className="py-1 text-muted">
                    {t("admin.finance.psp.summary.fee")}
                  </td>
                  <td className="py-1">{fmtTry(day.paytr.feeTotal)}</td>
                  <td className="py-1 text-subtle">—</td>
                </tr>
                <tr>
                  <td className="py-1 text-muted">
                    {t("admin.finance.psp.summary.net")}
                  </td>
                  <td className="py-1 font-medium">
                    {fmtTry(day.paytr.netTotal)}
                  </td>
                  <td className="py-1 text-subtle">—</td>
                </tr>
              </tbody>
            </table>

            {day.paytrCovered && (
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <Badge variant="success">
                  {t("admin.finance.psp.summary.matched", {
                    count: day.match.matched,
                  })}
                </Badge>
                {day.match.mismatched > 0 && (
                  <Badge variant="danger">
                    {t("admin.finance.psp.summary.mismatched", {
                      count: day.match.mismatched,
                    })}
                  </Badge>
                )}
                {day.match.unmatched > 0 && (
                  <Badge variant="warning">
                    {t("admin.finance.psp.summary.unmatched", {
                      count: day.match.unmatched,
                    })}
                  </Badge>
                )}
                {day.missingInPaytr > 0 && (
                  <Badge variant="danger">
                    {t("admin.finance.psp.summary.missing", {
                      count: day.missingInPaytr,
                    })}
                  </Badge>
                )}
              </div>
            )}
          </SectionCard>
        );
      })}
    </div>
  );
}
