/** @format */

"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Badge, Button, EmptyState, Modal, Select } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { fmtDate, fmtTry } from "@/lib/format";
import { DataTable } from "@/components/DataTable";
import { PageLoading } from "@/components/PageLoading";
import { SectionCard } from "@/components/detail/SectionCard";
import { SectionTitle } from "@/components/detail/SectionTitle";
import { col } from "@/components/table/columns";
import { CellLink, Empty } from "@/components/table/cells";
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
    return <PageLoading />;
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
          <EmptyState
            size="compact"
            title={
              query.data?.sync.enabled
                ? t("admin.finance.psp.summary.empty")
                : t("admin.finance.psp.summary.emptyDisabled")
            }
          />
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

/** Gün kartı tablosunun bir satırı — hücreler hazır basılır, hesap yok. */
interface DayRow {
  key: string;
  label: string;
  paytr: ReactNode;
  ours: ReactNode;
  oursTitle?: string;
  diff: ReactNode;
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

  const columns = useMemo(
    () => [
      col.custom(
        "",
        (r: DayRow) => <span className="text-muted">{r.label}</span>,
        {
          id: "label",
        },
      ),
      col.custom("PayTR", (r: DayRow) => r.paytr),
      col.custom(t("admin.finance.psp.summary.ours"), (r: DayRow) => (
        <span title={r.oursTitle}>{r.ours}</span>
      )),
      col.custom(t("admin.finance.psp.summary.diff"), (r: DayRow) => r.diff),
    ],
    [t],
  );
  const noDiff = <Empty />;
  const diffOf = (diff: number) =>
    day.paytrCovered ? (
      <DiffCell diff={diff} tolerance={day.tolerance} />
    ) : (
      noDiff
    );
  const rows: DayRow[] = [
    {
      key: "sales",
      label: t("admin.finance.psp.summary.sales"),
      paytr: (
        <>
          {fmtTry(day.paytr.salesTotal)}{" "}
          <span className="text-xs text-subtle">({day.paytr.salesCount})</span>
        </>
      ),
      ours: (
        <>
          {fmtTry(day.ours.salesTotal)}{" "}
          <span className="text-xs text-subtle">({day.ours.salesCount})</span>
        </>
      ),
      diff: diffOf(day.salesDiff),
    },
    {
      key: "refunds",
      label: t("admin.finance.psp.summary.refunds"),
      paytr: fmtTry(day.paytr.refundTotal),
      ours: fmtTry(day.ours.refundTotal),
      diff: diffOf(day.refundDiff),
    },
    {
      key: "fee",
      label: t("admin.finance.psp.summary.fee"),
      paytr: fmtTry(day.paytr.feeTotal),
      ours: fmtTry(day.ours.feeBooked),
      oursTitle: t("admin.finance.psp.summary.feeBookedHint"),
      diff: diffOf(day.ours.feeBooked - day.paytr.feeTotal),
    },
    {
      key: "net",
      label: t("admin.finance.psp.summary.net"),
      paytr: <span className="font-medium">{fmtTry(day.paytr.netTotal)}</span>,
      ours: noDiff,
      diff: noDiff,
    },
  ];

  return (
    <SectionCard>
      <div className="flex items-center justify-between gap-2">
        <SectionTitle>{fmtDate(day.date)}</SectionTitle>
        <div className="flex items-center gap-1">
          {day.provisional && (
            <Badge variant="outline">
              {t("admin.finance.psp.summary.provisional")}
            </Badge>
          )}
          {!day.paytrCovered ? (
            <Badge variant="outline">
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

      <div className="mt-3">
        <DataTable
          columns={columns}
          data={rows}
          dense
          getRowId={(r) => r.key}
        />
      </div>

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

  const columns = useMemo(
    () => [
      col.date(
        t("admin.finance.psp.missing.paidAt"),
        (i: PspMissingPayment) => i.paidAt,
        {
          withTime: true,
        },
      ),
      col.custom(
        t("admin.finance.psp.lines.reference"),
        (i: PspMissingPayment) =>
          i.kind === "payment" ? (
            <CellLink
              href={`/finance/payments/${i.id}`}
              label={i.reference ?? i.id.slice(0, 8)}
            />
          ) : (
            <span>{t("admin.finance.psp.missing.membership")}</span>
          ),
      ),
      col.code("merchant_oid", (i: PspMissingPayment) => i.merchantOid),
      col.money(
        t("admin.finance.psp.lines.amount"),
        (i: PspMissingPayment) => i.amount,
      ),
    ],
    [t],
  );

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
      <DataTable
        columns={columns}
        data={items}
        loading={query.isLoading}
        emptyText={t("admin.finance.psp.missing.empty")}
        dense
        getRowId={(item) => item.id}
      />
    </Modal>
  );
}
