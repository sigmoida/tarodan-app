"use client";

import { adminApi } from "@/lib/api";
import { ResourceList } from "@/components/list";
import { scheduleColumns } from "../_lib/columns";
import { type ScheduleItem } from "../_lib/types";
import { useTranslations } from "next-intl";
import { useTimingPolicy } from "@/hooks/useTimingPolicy";

export function ScheduleTab() {
  const t = useTranslations();
  const policy = useTimingPolicy();
  return (
    <ResourceList<ScheduleItem>
      resource="payouts-schedule"
      fetcher={(params) => adminApi.getPayoutsSchedule(params)}
      getRowId={(s) => s.id}
      syncUrl
    >
      <ResourceList.Toolbar />
      <ResourceList.Table
        columns={scheduleColumns(t, policy.returnWindowDays.value)}
        emptyText={t("admin.finance.payouts.noUpcomingPayments")}
      />
      <ResourceList.Pagination />
    </ResourceList>
  );
}
