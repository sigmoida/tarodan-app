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

export function HistoryTab() {
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
      errorMessage="Bildirim geçmişi yüklenemedi"
    >
      <ResourceList.Toolbar>
        <ResourceList.Search />
        <ResourceList.FilterSelect
          name="channel"
          options={channelFilterOptions}
          className="sm:w-44"
        />
        <ResourceList.FilterSelect
          name="status"
          options={deliveryFilterOptions}
          className="sm:w-44"
        />
      </ResourceList.Toolbar>
      <ResourceList.Table
        columns={historyColumns}
        emptyText="Bildirim geçmişi boş"
      />
      <ResourceList.Pagination />
    </ResourceList>
  );
}
