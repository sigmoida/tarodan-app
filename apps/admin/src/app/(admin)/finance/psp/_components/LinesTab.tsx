/** @format */

"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Badge, Button, Select } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { fmtDate, fmtTry } from "@/lib/format";
import { SectionCard } from "@/components/detail/SectionCard";
import type { PspStatementLine } from "../_lib/types";

const PAGE_SIZE = 50;

const STATUS_BADGE: Record<
  PspStatementLine["matchStatus"],
  "success" | "warning" | "danger"
> = {
  matched: "success",
  unmatched: "warning",
  amount_mismatch: "danger",
};

/**
 * PayTR döküm satırları — varsayılan görünüm operasyonun iş listesi: matched
 * dışındaki (karşılıksız / tutar farklı) satırlar. Filtreyle tümü de gezilebilir.
 */
export function LinesTab() {
  const t = useTranslations();
  const [status, setStatus] = useState("problem");
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: adminKeys.list("psp-statement-lines", `${status}:${page}`),
    queryFn: async () => {
      const res = await adminApi.getPspStatementLines({
        status: status === "problem" ? undefined : status,
        page,
        limit: PAGE_SIZE,
      });
      return res.data as { data: PspStatementLine[]; meta: { total: number } };
    },
  });

  const rows = query.data?.data ?? [];
  const total = query.data?.meta.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {t("admin.finance.psp.lines.description")}
        </p>
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          options={[
            {
              value: "problem",
              label: t("admin.finance.psp.lines.filter.problem"),
            },
            { value: "all", label: t("admin.finance.psp.lines.filter.all") },
            {
              value: "matched",
              label: t("admin.finance.psp.lines.filter.matched"),
            },
            {
              value: "unmatched",
              label: t("admin.finance.psp.lines.filter.unmatched"),
            },
            {
              value: "amount_mismatch",
              label: t("admin.finance.psp.lines.filter.amountMismatch"),
            },
          ]}
        />
      </div>

      <SectionCard bodyClassName="overflow-x-auto">
        {query.isLoading ? (
          <p className="py-8 text-center text-muted">{t("common.loading")}</p>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-muted">
            {t("admin.finance.psp.lines.empty")}
          </p>
        ) : (
          <table className="w-full min-w-[840px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <th className="px-3 py-3 font-medium">
                  {t("admin.finance.psp.lines.date")}
                </th>
                <th className="px-3 py-3 font-medium">
                  {t("admin.finance.psp.lines.type")}
                </th>
                <th className="px-3 py-3 font-medium">merchant_oid</th>
                <th className="px-3 py-3 font-medium">
                  {t("admin.finance.psp.lines.amount")}
                </th>
                <th className="px-3 py-3 font-medium">
                  {t("admin.finance.psp.lines.fee")}
                </th>
                <th className="px-3 py-3 font-medium">
                  {t("admin.finance.psp.lines.matchStatus")}
                </th>
                <th className="px-3 py-3 font-medium">
                  {t("admin.finance.psp.lines.reference")}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((line) => (
                <tr
                  key={line.id}
                  className="border-b border-border last:border-0"
                >
                  <td className="px-3 py-3">{fmtDate(line.transactionDate)}</td>
                  <td className="px-3 py-3">
                    <Badge
                      variant={line.type === "sale" ? "success" : "warning"}
                    >
                      {t(
                        line.type === "sale"
                          ? "admin.finance.psp.lines.sale"
                          : "admin.finance.psp.lines.refund",
                      )}
                    </Badge>
                  </td>
                  <td className="px-3 py-3 font-mono text-xs">
                    {line.merchantOid}
                  </td>
                  <td className="px-3 py-3 font-medium">
                    {fmtTry(line.amount)}
                  </td>
                  <td className="px-3 py-3">{fmtTry(line.fee) ?? "—"}</td>
                  <td className="px-3 py-3">
                    <Badge variant={STATUS_BADGE[line.matchStatus]}>
                      {t(`admin.finance.psp.lines.status.${line.matchStatus}`)}
                    </Badge>
                  </td>
                  <td className="px-3 py-3">
                    {line.payment ? (
                      <Link
                        href={`/finance/payments/${line.payment.id}`}
                        className="text-primary-600 hover:underline"
                      >
                        {line.payment.orderNumber ??
                          line.payment.groupNumber ??
                          line.payment.id.slice(0, 8)}
                      </Link>
                    ) : (
                      <span className="text-subtle">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      {pageCount > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <Button
            variant="secondary"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            ‹
          </Button>
          <span className="text-muted">
            {page} / {pageCount}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={page >= pageCount}
            onClick={() => setPage((p) => p + 1)}
          >
            ›
          </Button>
        </div>
      )}
    </div>
  );
}
