"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { DataTable } from "@/components/DataTable";
import { useResourceList } from "@/components/list";
import { offerColumns } from "../_lib/offerColumns";
import type { OfferRow } from "../_lib/offers";
import { CancelOfferModal } from "../offers/[id]/_modals/CancelOfferModal";

export function OffersTable() {
  const t = useTranslations();
  const router = useRouter();
  const { rows, isLoading, search, filters, sort, setSort } =
    useResourceList<OfferRow>();
  const [cancelTarget, setCancelTarget] = useState<OfferRow | null>(null);

  const columns = offerColumns({
    t,
    onView: (o) => router.push(`/operations/orders/offers/${o.id}`),
    onCancel: (o) => setCancelTarget(o),
  });

  const emptyText =
    search || filters.status !== "all" || filters.userId || filters.productId
      ? t("admin.operations.offers.emptyFiltered")
      : t("admin.operations.offers.empty");

  return (
    <>
      <DataTable
        columns={columns}
        data={rows}
        loading={isLoading}
        emptyText={emptyText}
        getRowId={(o) => o.id}
        sort={sort}
        onSort={setSort}
      />
      {cancelTarget && (
        <CancelOfferModal
          open
          onClose={() => setCancelTarget(null)}
          offer={cancelTarget}
        />
      )}
    </>
  );
}
