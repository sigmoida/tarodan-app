/** @format */

"use client";

import { useQuery } from "@tanstack/react-query";
import { Badge } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { fmtDate, fmtTry } from "@/lib/format";
import { SectionCard } from "@/components/detail/SectionCard";
import { QueryErrorCard } from "@/components/page/QueryErrorCard";
import type { PspSettlement } from "../_lib/types";

/**
 * Hakedişler: PayTR'nin mağaza hesabına aktardığı (gerçekleşen) ve aktaracağı
 * (future_payments projeksiyonu) günlük tutarlar. İç tutarlılık (satış − iade =
 * net; kalem toplamı = satış) API'de hesaplanır ve rozetle gösterilir — eskiden
 * yalnız cron log'una düşüyordu.
 */
export function SettlementsTab() {
  const t = useTranslations();
  const query = useQuery({
    queryKey: adminKeys.list("psp-settlements", "31"),
    queryFn: async () =>
      (await adminApi.getPspSettlements({ days: 31, limit: 100 })).data
        ?.data as PspSettlement[],
  });

  if (query.isError) {
    return (
      <QueryErrorCard
        onRetry={() => void query.refetch()}
        isRetrying={query.isFetching}
      />
    );
  }
  const rows = query.data ?? [];

  return (
    <SectionCard bodyClassName="overflow-x-auto">
      {query.isLoading ? (
        <p className="py-8 text-center text-muted">{t("common.loading")}</p>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-muted">
          {t("admin.finance.psp.settlements.empty")}
        </p>
      ) : (
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="px-3 py-3 font-medium">
                {t("admin.finance.psp.settlements.datePaid")}
              </th>
              <th className="px-3 py-3 font-medium">
                {t("admin.finance.psp.settlements.state")}
              </th>
              <th className="px-3 py-3 font-medium">
                {t("admin.finance.psp.summary.sales")}
              </th>
              <th className="px-3 py-3 font-medium">
                {t("admin.finance.psp.summary.refunds")}
              </th>
              <th className="px-3 py-3 font-medium">
                {t("admin.finance.psp.summary.net")}
              </th>
              <th className="px-3 py-3 font-medium">
                {t("admin.finance.psp.settlements.check")}
              </th>
              <th className="px-3 py-3 font-medium">IBAN</th>
              <th className="px-3 py-3 font-medium">
                {t("admin.finance.psp.settlements.items")}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} className="border-b border-border last:border-0">
                <td className="px-3 py-3 font-medium">{fmtDate(s.datePaid)}</td>
                <td className="px-3 py-3">
                  {s.isProjection ? (
                    <Badge variant="warning">
                      {t("admin.finance.psp.settlements.projection")}
                    </Badge>
                  ) : (
                    <Badge variant="success">
                      {t("admin.finance.psp.settlements.realized")}
                    </Badge>
                  )}
                </td>
                <td className="px-3 py-3">{fmtTry(s.salesTotal)}</td>
                <td className="px-3 py-3">{fmtTry(s.returnTotal)}</td>
                <td className="px-3 py-3 font-semibold">
                  {fmtTry(s.netTotal)}
                </td>
                <td className="px-3 py-3">
                  {s.isProjection ? (
                    <span className="text-subtle">—</span>
                  ) : s.consistent === false || s.itemsConsistent === false ? (
                    <Badge variant="danger">
                      {t("admin.finance.psp.settlements.inconsistent")}
                    </Badge>
                  ) : (
                    <Badge variant="success">
                      {t("admin.finance.psp.settlements.consistent")}
                    </Badge>
                  )}
                </td>
                <td className="px-3 py-3 font-mono text-xs">
                  {s.merchantIban ?? "—"}
                </td>
                <td className="px-3 py-3">
                  {s.isProjection
                    ? "—"
                    : s.itemsSynced
                      ? s.itemCount
                      : t("admin.finance.psp.settlements.itemsPending")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </SectionCard>
  );
}
