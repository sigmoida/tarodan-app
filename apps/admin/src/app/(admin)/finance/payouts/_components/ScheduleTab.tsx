"use client";

import { adminApi } from "@/lib/api";
import { ResourceList } from "@/components/list";
import { clientListFetcher } from "@/lib/query/client-list";
import { scheduleColumns } from "../_lib/columns";
import { type ScheduleItem } from "../_lib/types";
import { useTranslations } from "next-intl";

export function ScheduleTab() {
  const t = useTranslations();
  return (
    <ResourceList<ScheduleItem>
      resource="payouts-schedule"
      fetcher={clientListFetcher<ScheduleItem>(
        () => adminApi.getPayoutsSchedule({ limit: 50 }),
        (raw) => (Array.isArray(raw) ? raw : (raw?.data ?? [])),
      )}
      getRowId={(s) => s.id}
    >
      <ResourceList.Table
        columns={scheduleColumns(t)}
        emptyText={t("admin.finance.payouts.noUpcomingPayments")}
      />
      <ResourceList.Pagination />
    </ResourceList>
  );
}
