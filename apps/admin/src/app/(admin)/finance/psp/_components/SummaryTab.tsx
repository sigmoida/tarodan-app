/** @format */

"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Badge, Button, Modal, Select } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { fmtDate, fmtDateTime, fmtTry } from "@/lib/format";
import { SectionCard } from "@/components/detail/SectionCard";
import { QueryErrorCard } from "@/components/page/QueryErrorCard";
import { SyncBanner } from "./SyncBanner";
import {
  PSP_DAY_OPTIONS,
  type PspDayCard,
  type PspMissingPayment,
  type PspReconciliationResponse,
} from "../_lib/types";

/** İşaretli fark: +₺12,00 / −₺3,50; toleransın altı sıfır sayılır. */
function DiffCell({ diff, tolerance }: { diff: number; tolerance: number }) {
  const t = useTranslations();
  if (Math.abs(diff) <= tolerance) {
    return (
      <span className="text-xs text-success-700">
        {t("admin.finance.psp.summary.inBalance")}
      </span>
    );
  }
  const sign = diff > 0 ? "+" : "−";
  return (
    <span className="text-xs font-semibold text-danger-600">
      {sign}
      {fmtTry(Math.abs(diff))}
    </span>
  );
}

/**
 * Gün kartları: PayTR dökümü ↔ bizim kayıtlar. Fark işaretli tutar olarak
 * gösterilir; |fark| ≤ tolerans (eşleştiriciyle aynı 0,05) dengede sayılır.
 * Tutarların HİÇBİRİ burada hesaplanmaz — API'nin gün kartı yanıtı basılır.
 */
export function SummaryTab() {
  const t = useTranslations();
  const [days, setDays] = useState<number>(7);
  const [missingDay, setMissingDay] = useState<string | null>(null);
  const query = useQuery({
    queryKey: adminKeys.list("psp-reconciliation", String(days)),
    queryFn: async () =>
      (await adminApi.getPspReconciliation(days))
        .data as PspReconciliationResponse,
  });

  if (query.isError) {
    return (
      <QueryErrorCard
        onRetry={() => void query.refetch()}
        isRetrying={query.isFetching}
      />
    );
  }
  if (query.isLoading) {
    return <p className="py-8 text-center text-muted">{t("common.loading")}</p>;
  }
  const cards = query.data?.days ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SyncBanner sync={query.data?.sync} />
        <Select
          value={String(days)}
          onChange={(e) => setDays(Number(e.target.value))}
          options={PSP_DAY_OPTIONS.map((d) => ({
            value: String(d),
            label: t("admin.finance.psp.summary.lastDays", { count: d }),
          }))}
        />
      </div>

      {cards.length === 0 ? (
        <SectionCard>
          <p className="py-8 text-center text-muted">
            {query.data?.sync.enabled
              ? t("admin.finance.psp.summary.empty")
              : t("admin.finance.psp.summary.emptyDisabled")}
          </p>
        </SectionCard>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {cards.map((day) => (
            <DayCardView
              key={day.date}
              day={day}
              onShowMissing={() => setMissingDay(day.date)}
            />
          ))}
        </div>
      )}

      {missingDay && (
        <MissingPaymentsModal
          date={missingDay}
          onClose={() => setMissingDay(null)}
        />
      )}
    </div>
  );
}

function DayCardView({
  day,
  onShowMissing,
}: {
  day: PspDayCard;
  onShowMissing: () => void;
}) {
  const t = useTranslations();
  const problems =
    day.match.mismatched + day.match.unmatched + day.missingInPaytr;
  const balanced =
    Math.abs(day.salesDiff) <= day.tolerance &&
    Math.abs(day.refundDiff) <= day.tolerance;
  const clean = day.paytrCovered && problems === 0 && balanced;

  return (
    <SectionCard>
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-heading">{fmtDate(day.date)}</h3>
        <div className="flex items-center gap-1">
          {day.provisional && (
            <Badge variant="default">
              {t("admin.finance.psp.summary.provisional")}
            </Badge>
          )}
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
                count: problems + (balanced ? 0 : 1),
              })}
            </Badge>
          )}
        </div>
      </div>

      <table className="mt-3 w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted">
            <th className="py-1 font-medium" />
            <th className="py-1 font-medium">PayTR</th>
            <th className="py-1 font-medium">
              {t("admin.finance.psp.summary.ours")}
            </th>
            <th className="py-1 font-medium">
              {t("admin.finance.psp.summary.diff")}
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
            <td className="py-1">
              {fmtTry(day.ours.salesTotal)}{" "}
              <span className="text-xs text-subtle">
                ({day.ours.salesCount})
              </span>
            </td>
            <td className="py-1">
              {day.paytrCovered ? (
                <DiffCell diff={day.salesDiff} tolerance={day.tolerance} />
              ) : (
                <span className="text-subtle">—</span>
              )}
            </td>
          </tr>
          <tr>
            <td className="py-1 text-muted">
              {t("admin.finance.psp.summary.refunds")}
            </td>
            <td className="py-1">{fmtTry(day.paytr.refundTotal)}</td>
            <td className="py-1">{fmtTry(day.ours.refundTotal)}</td>
            <td className="py-1">
              {day.paytrCovered ? (
                <DiffCell diff={day.refundDiff} tolerance={day.tolerance} />
              ) : (
                <span className="text-subtle">—</span>
              )}
            </td>
          </tr>
          <tr>
            <td className="py-1 text-muted">
              {t("admin.finance.psp.summary.fee")}
            </td>
            <td className="py-1">{fmtTry(day.paytr.feeTotal)}</td>
            <td
              className="py-1"
              title={t("admin.finance.psp.summary.feeBookedHint")}
            >
              {fmtTry(day.ours.feeBooked)}
            </td>
            <td className="py-1">
              {day.paytrCovered ? (
                <DiffCell
                  diff={day.ours.feeBooked - day.paytr.feeTotal}
                  tolerance={day.tolerance}
                />
              ) : (
                <span className="text-subtle">—</span>
              )}
            </td>
          </tr>
          <tr>
            <td className="py-1 text-muted">
              {t("admin.finance.psp.summary.net")}
            </td>
            <td className="py-1 font-medium">{fmtTry(day.paytr.netTotal)}</td>
            <td className="py-1 text-subtle">—</td>
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
            <Link href="/finance/psp?tab=lines">
              <Badge variant="danger">
                {t("admin.finance.psp.summary.mismatched", {
                  count: day.match.mismatched,
                })}
              </Badge>
            </Link>
          )}
          {day.match.unmatched > 0 && (
            <Link href="/finance/psp?tab=lines">
              <Badge variant="warning">
                {t("admin.finance.psp.summary.unmatched", {
                  count: day.match.unmatched,
                })}
              </Badge>
            </Link>
          )}
          {day.missingInPaytr > 0 && (
            <Button variant="ghost" size="sm" onClick={onShowMissing}>
              <Badge variant="danger">
                {t("admin.finance.psp.summary.missing", {
                  count: day.missingInPaytr,
                })}
              </Badge>
            </Button>
          )}
        </div>
      )}
    </SectionCard>
  );
}

/** "Dökümde yok" sayacının arkasındaki ödemeler — en kritik sinyal artık listelenir. */
function MissingPaymentsModal({
  date,
  onClose,
}: {
  date: string;
  onClose: () => void;
}) {
  const t = useTranslations();
  const query = useQuery({
    queryKey: adminKeys.list("psp-missing-payments", date),
    queryFn: async () =>
      (await adminApi.getPspMissingPayments(date)).data as {
        items: PspMissingPayment[];
      },
  });
  const items = query.data?.items ?? [];

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t("admin.finance.psp.missing.title", { date: fmtDate(date) })}
      size="lg"
      closeLabel={t("common.close")}
    >
      <p className="mb-3 text-sm text-muted">
        {t("admin.finance.psp.missing.description")}
      </p>
      {query.isLoading ? (
        <p className="py-6 text-center text-muted">{t("common.loading")}</p>
      ) : items.length === 0 ? (
        <p className="py-6 text-center text-muted">
          {t("admin.finance.psp.missing.empty")}
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="px-2 py-2 font-medium">
                {t("admin.finance.psp.missing.paidAt")}
              </th>
              <th className="px-2 py-2 font-medium">
                {t("admin.finance.psp.lines.reference")}
              </th>
              <th className="px-2 py-2 font-medium">merchant_oid</th>
              <th className="px-2 py-2 font-medium">
                {t("admin.finance.psp.lines.amount")}
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.id}
                className="border-b border-border last:border-0"
              >
                <td className="px-2 py-2">{fmtDateTime(item.paidAt)}</td>
                <td className="px-2 py-2">
                  {item.kind === "payment" ? (
                    <Link
                      href={`/finance/payments/${item.id}`}
                      className="text-primary-600 hover:underline"
                    >
                      {item.reference ?? item.id.slice(0, 8)}
                    </Link>
                  ) : (
                    <span>{t("admin.finance.psp.missing.membership")}</span>
                  )}
                </td>
                <td className="px-2 py-2 font-mono text-xs">
                  {item.merchantOid ?? "—"}
                </td>
                <td className="px-2 py-2 font-medium">{fmtTry(item.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}
