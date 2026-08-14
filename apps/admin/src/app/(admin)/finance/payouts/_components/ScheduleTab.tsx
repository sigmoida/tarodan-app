"use client";

import { adminApi } from "@/lib/api";
import { ResourceList } from "@/components/list";
import { scheduleColumns } from "../_lib/columns";
import { type ScheduleItem } from "../_lib/types";
import { useTranslations } from "next-intl";

export function ScheduleTab() {
  const t = useTranslations();
  return (
    <ResourceList<ScheduleItem>
      resource="payouts-schedule"
      fetcher={(params) => adminApi.getPayoutsSchedule(params)}
      getRowId={(s) => s.id}
      syncUrl
    >
      <ResourceList.Toolbar />
      <ResourceList.Table
        columns={scheduleColumns(t)}
        emptyText={t("admin.finance.payouts.noUpcomingPayments")}
      />
      <ResourceList.Pagination />
    </ResourceList>
  );
}
