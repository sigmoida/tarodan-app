/** @format */

"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { DataTable } from "@/components/DataTable";
import { col } from "@/components/table/columns";
import { Empty } from "@/components/table/cells";
import { QueryErrorCard } from "@/components/page/QueryErrorCard";
import type { PspSettlement } from "../_lib/types";
import {
  MerchantBadge,
  MerchantFilter,
  type MerchantFilterValue,
} from "./MerchantFilter";

/**
 * Hakedişler: PayTR'nin mağaza hesabına aktardığı (gerçekleşen) ve aktaracağı
 * (future_payments projeksiyonu) günlük tutarlar. İç tutarlılık (satış − iade =
 * net; kalem toplamı = satış) API'de hesaplanır ve rozetle gösterilir — eskiden
 * yalnız cron log'una düşüyordu.
 */
export function SettlementsTab() {
  const t = useTranslations();
  const [merchant, setMerchant] = useState<MerchantFilterValue>("");
  const query = useQuery({
    queryKey: adminKeys.list("psp-settlements", `31:${merchant}`),
    queryFn: async () =>
      (
        await adminApi.getPspSettlements({
          days: 31,
          limit: 100,
          merchant: merchant || undefined,
        })
      ).data?.data as PspSettlement[],
  });

  const columns = useMemo(
    () => [
      col.date(
        t("admin.finance.psp.settlements.datePaid"),
        (s: PspSettlement) => s.datePaid,
      ),
      col.badge(t("admin.finance.psp.merchant.label"), (s: PspSettlement) => (
        <MerchantBadge merchant={s.paytrMerchant} />
      )),
      col.badge(t("admin.finance.psp.settlements.state"), (s: PspSettlement) =>
        s.isProjection ? (
          <Badge variant="warning">
            {t("admin.finance.psp.settlements.projection")}
          </Badge>
        ) : (
          <Badge variant="success">
            {t("admin.finance.psp.settlements.realized")}
          </Badge>
        ),
      ),
      col.money(
        t("admin.finance.psp.summary.sales"),
        (s: PspSettlement) => s.salesTotal,
      ),
      col.money(
        t("admin.finance.psp.summary.refunds"),
        (s: PspSettlement) => s.returnTotal,
      ),
      col.money(
        t("admin.finance.psp.summary.net"),
        (s: PspSettlement) => s.netTotal,
      ),
      col.badge(t("admin.finance.psp.settlements.check"), (s: PspSettlement) =>
        s.isProjection ? (
          <Empty />
        ) : s.consistent === false || s.itemsConsistent === false ? (
          <Badge variant="danger">
            {t("admin.finance.psp.settlements.inconsistent")}
          </Badge>
        ) : (
          <Badge variant="success">
            {t("admin.finance.psp.settlements.consistent")}
          </Badge>
        ),
      ),
      col.code("IBAN", (s: PspSettlement) => s.merchantIban),
      col.custom(
        t("admin.finance.psp.settlements.items"),
        (s: PspSettlement) =>
          s.isProjection ? (
            <Empty />
          ) : s.itemsSynced ? (
            s.itemCount
          ) : (
            t("admin.finance.psp.settlements.itemsPending")
          ),
      ),
    ],
    [t],
  );

  const rows = query.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <MerchantFilter value={merchant} onChange={setMerchant} />
      </div>
      {query.isError ? (
        <QueryErrorCard
          onRetry={() => void query.refetch()}
          isRetrying={query.isFetching}
        />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          loading={query.isLoading}
          emptyText={t("admin.finance.psp.settlements.empty")}
          getRowId={(s) => s.id}
        />
      )}
    </div>
  );
}
