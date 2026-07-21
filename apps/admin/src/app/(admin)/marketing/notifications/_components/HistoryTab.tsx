/** @format */

"use client";

import { adminApi } from "@/lib/api";
import { ResourceList } from "@/components/list";
import { historyColumns } from "../_lib/columns";
import {
  type NotificationLog,
  channelFilterOptions,
  deliveryFilterOptions,
} from "../_lib/types";
import { useTranslations } from "next-intl";

export function HistoryTab() {
  const t = useTranslations();
  return (
    <ResourceList<NotificationLog>
      resource="notification-history"
      fetcher={(p) =>
        adminApi.getNotificationHistory({
          page: p.page,
          limit: p.limit,
          channel: p.channel,
          status: p.status,
          search: p.search,
          sortBy: p.sortBy,
          sortOrder: p.sortOrder,
        })
      }
      getRowId={(n) => n.id}
      syncUrl
      initialFilters={{ channel: "all", status: "all" }}
    >
      <ResourceList.Toolbar>
        <ResourceList.Search />
        <ResourceList.FilterSelect
          name="channel"
          options={channelFilterOptions(t)}
          className="sm:w-44"
        />
        <ResourceList.FilterSelect
          name="status"
          options={deliveryFilterOptions(t)}
          className="sm:w-44"
        />
      </ResourceList.Toolbar>
      <ResourceList.Table
        columns={historyColumns(t)}
        emptyText={t("admin.marketing.notifications.emptyHistory")}
      />
      <ResourceList.Pagination />
    </ResourceList>
  );
}
