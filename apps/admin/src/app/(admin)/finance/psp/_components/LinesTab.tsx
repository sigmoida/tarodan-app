/** @format */

"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Badge, Button, Checkbox, Modal, Select, Textarea } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { fmtDate, fmtTry } from "@/lib/format";
import { SectionCard } from "@/components/detail/SectionCard";
import { QueryErrorCard } from "@/components/page/QueryErrorCard";
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
 * dışındaki, çözümlenmemiş satırlar. Her problem satırı "çözüldü" (notla) ya da
 * "yeniden eşle" ile işlenebilir; eskiden liste yalnız büyüyordu.
 */
export function LinesTab() {
  const t = useTranslations();
  const [status, setStatus] = useState("problem");
  const [includeResolved, setIncludeResolved] = useState(false);
  const [page, setPage] = useState(1);
  const [resolving, setResolving] = useState<PspStatementLine | null>(null);

  const query = useQuery({
    queryKey: adminKeys.list(
      "psp-statement-lines",
      `${status}:${includeResolved}:${page}`,
    ),
    queryFn: async () => {
      const res = await adminApi.getPspStatementLines({
        status,
        page,
        limit: PAGE_SIZE,
        includeResolved,
      });
      return res.data as { data: PspStatementLine[]; meta: { total: number } };
    },
  });

  const rematch = useAdminMutation(
    (lineId: string) => adminApi.rematchPspStatementLine(lineId),
    {
      invalidates: ["psp-statement-lines", "psp-reconciliation"],
      successMessage: t("admin.finance.psp.lines.rematched"),
    },
  );

  const rows = query.data?.data ?? [];
  const total = query.data?.meta.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {t("admin.finance.psp.lines.description")}
        </p>
        <div className="flex items-center gap-2">
          <Checkbox
            size="sm"
            checked={includeResolved}
            onChange={(e) => {
              setIncludeResolved(e.target.checked);
              setPage(1);
            }}
            label={t("admin.finance.psp.lines.includeResolved")}
          />
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
      </div>

      {query.isError ? (
        <QueryErrorCard
          onRetry={() => void query.refetch()}
          isRetrying={query.isFetching}
        />
      ) : (
        <SectionCard bodyClassName="overflow-x-auto">
          {query.isLoading ? (
            <p className="py-8 text-center text-muted">{t("common.loading")}</p>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-muted">
              {t("admin.finance.psp.lines.empty")}
            </p>
          ) : (
            <table className="w-full min-w-[960px] text-sm">
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
                  <th className="px-3 py-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {rows.map((line) => (
                  <tr
                    key={line.id}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-3 py-3">
                      {fmtDate(line.transactionDate)}
                    </td>
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
                      <div className="flex flex-wrap items-center gap-1">
                        <Badge variant={STATUS_BADGE[line.matchStatus]}>
                          {t(
                            `admin.finance.psp.lines.status.${line.matchStatus}`,
                          )}
                        </Badge>
                        {line.resolvedAt && (
                          <Badge
                            variant="default"
                            title={line.resolutionNote ?? undefined}
                          >
                            {t("admin.finance.psp.lines.status.resolved")}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <LineReference line={line} />
                    </td>
                    <td className="px-3 py-3">
                      {line.matchStatus !== "matched" && (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={rematch.isPending}
                            onClick={() => rematch.mutate(line.id)}
                          >
                            {t("admin.finance.psp.lines.rematch")}
                          </Button>
                          {!line.resolvedAt && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setResolving(line)}
                            >
                              {t("admin.finance.psp.lines.resolve")}
                            </Button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>
      )}

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

      {resolving && (
        <ResolveLineModal line={resolving} onClose={() => setResolving(null)} />
      )}
    </div>
  );
}

function LineReference({ line }: { line: PspStatementLine }) {
  const t = useTranslations();
  if (line.payment) {
    return (
      <Link
        href={`/finance/payments/${line.payment.id}`}
        className="text-primary-600 hover:underline"
      >
        {line.payment.orderNumber ??
          line.payment.groupNumber ??
          line.payment.tradeNumber ??
          line.payment.id.slice(0, 8)}
      </Link>
    );
  }
  if (line.membershipPayment) {
    return (
      <Link
        href={`/users/${line.membershipPayment.userId}`}
        className="text-primary-600 hover:underline"
      >
        {t("admin.finance.psp.missing.membership")}
      </Link>
    );
  }
  return <span className="text-subtle">—</span>;
}

/** Satırı notla kapat: iş listesinden düşer, gün kartında sayılmaz, audit log'a yazılır. */
function ResolveLineModal({
  line,
  onClose,
}: {
  line: PspStatementLine;
  onClose: () => void;
}) {
  const t = useTranslations();
  const [note, setNote] = useState("");
  const resolve = useAdminMutation(
    (vars: { lineId: string; note: string }) =>
      adminApi.resolvePspStatementLine(vars.lineId, vars.note),
    {
      invalidates: ["psp-statement-lines", "psp-reconciliation"],
      successMessage: t("admin.finance.psp.lines.resolved"),
      onSuccess: onClose,
    },
  );

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t("admin.finance.psp.lines.resolveTitle")}
      size="md"
      closeLabel={t("common.close")}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={note.trim().length === 0}
            isLoading={resolve.isPending}
            onClick={() =>
              resolve.mutate({ lineId: line.id, note: note.trim() })
            }
          >
            {t("admin.finance.psp.lines.resolve")}
          </Button>
        </div>
      }
    >
      <p className="mb-3 text-sm text-muted">
        {t("admin.finance.psp.lines.resolveDescription", {
          oid: line.merchantOid,
          amount: fmtTry(line.amount) ?? "",
        })}
      </p>
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        maxLength={500}
        placeholder={t("admin.finance.psp.lines.resolveNotePlaceholder")}
      />
    </Modal>
  );
}
