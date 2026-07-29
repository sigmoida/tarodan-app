/** @format */

"use client";

import { adminApi } from "@/lib/api";
import { ResourceList } from "@/components/list";
import { ticketColumns } from "../_lib/columns";
import {
  type SupportTicket,
  ticketStatusOptions,
  ticketPriorityOptions,
  ticketCategoryOptions,
} from "../_lib/types";
import { useTranslations } from "next-intl";

/** Support tickets — server-paginated list (getTickets uses `pageSize`). */
export function TicketsTab() {
  const t = useTranslations();
  return (
    <ResourceList<SupportTicket>
      resource="tickets"
      fetcher={(params) => adminApi.getTickets(params)}
      getRowId={(t) => t.id}
      syncUrl
      initialFilters={{
        status: "all",
        priority: "all",
        category: "all",
        fromDate: "",
        toDate: "",
      }}
    >
      <ResourceList.Toolbar>
        <ResourceList.Search />
        <ResourceList.FilterSelect
          name="status"
          options={ticketStatusOptions(t)}
          className="sm:w-44"
        />
        <ResourceList.FilterSelect
          name="priority"
          options={ticketPriorityOptions(t)}
          className="sm:w-44"
        />
        <ResourceList.FilterSelect
          name="category"
          options={ticketCategoryOptions(t)}
          className="sm:w-44"
        />
        <ResourceList.DateRange fromName="fromDate" toName="toDate" />
      </ResourceList.Toolbar>
      <ResourceList.Table
        columns={ticketColumns(t)}
        emptyText={t("admin.messaging.support.notFound")}
      />
      <ResourceList.Pagination />
    </ResourceList>
  );
}
