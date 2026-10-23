/** @format */

"use client";

import { RocketLaunchIcon } from "@heroicons/react/24/outline";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { EmptyState, Pagination, Skeleton } from "@tarodan/ui";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { MY_LISTINGS_PATH } from "@/lib/paymentKind";
import ErrorState from "@/components/feedback/ErrorState";
import { useInvoiceDownload } from "../../_hooks/useInvoiceDownload";
import { useMyBoosts } from "../_hooks/useMyBoosts";
import { groupBoosts, type BoostGroup } from "../_lib/boosts";
import BoostGroupCard from "./BoostGroupCard";
import BoostHistoryRow from "./BoostHistoryRow";

function BoostSkeletons() {
  return (
    <div className="space-y-4" aria-busy="true">
      {[...Array(3)].map((_, i) => (
        <div
          key={i}
          className="space-y-3 rounded-lg border border-border bg-surface-elevated p-4"
        >
          <div className="flex gap-3">
            <Skeleton className="h-16 w-16 shrink-0 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          </div>
          <Skeleton className="h-16 w-full rounded-lg" />
        </div>
      ))}
    </div>
  );
}

/**
 * One tab of "My boosts": loading, error with retry, empty, and the list.
 * "Aktif" shows one card per listing; "Geçmiş" one row per boost, paged.
 */
export default function BoostSection({
  state,
  onExtend,
}: {
  state: "current" | "history";
  onExtend: (group: BoostGroup) => void;
}) {
  const t = useTranslations();
  const [page, setPage] = useState(1);
  const { rows, meta, isLoading, isError, refetch } = useMyBoosts(
    state,
    page,
    true,
  );
  // A boost order has no order detail page: several documents (the sale
  // invoice and a later return) open the sale invoice.
  const { downloadingId, download } = useInvoiceDownload({ many: "primary" });
  const groups = useMemo(() => groupBoosts(rows), [rows]);

  if (isLoading) return <BoostSkeletons />;

  if (isError) {
    return (
      <ErrorState
        title={t("profile.boosts.loadFailed")}
        reset={() => void refetch()}
        inline
      />
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<RocketLaunchIcon className="h-7 w-7" />}
        title={t("profile.boosts.empty.title")}
        description={t("profile.boosts.empty.description")}
        action={
          <ButtonLink href={MY_LISTINGS_PATH}>
            {t("profile.boosts.empty.action")}
          </ButtonLink>
        }
      />
    );
  }

  if (state === "current") {
    const now = Date.now();
    return (
      <div className="space-y-4">
        {groups.map((group) => (
          <BoostGroupCard
            key={group.productId}
            group={group}
            now={now}
            onExtend={onExtend}
          />
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {rows.map((row) => (
          <BoostHistoryRow
            key={row.id}
            row={row}
            invoiceLoading={downloadingId === row.orderId}
            onInvoice={download}
          />
        ))}
      </div>
      <Pagination
        page={meta.page}
        pageSize={meta.limit}
        total={meta.total}
        onPageChange={setPage}
        className="mt-6"
      />
    </>
  );
}
