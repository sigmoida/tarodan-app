/** @format */

"use client";

import { adminApi } from "@/lib/api";
import { ResourceList } from "@/components/list";
import { ticketColumns } from "../_lib/columns";
import { type SupportTicket } from "../_lib/types";
import { ticketFilterFields } from "../_lib/filters";
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
      filters={ticketFilterFields(t)}
    >
      <ResourceList.Toolbar />
      <ResourceList.Table
        columns={ticketColumns(t)}
        emptyText={t("admin.messaging.support.notFound")}
      />
      <ResourceList.Pagination />
    </ResourceList>
  );
}
