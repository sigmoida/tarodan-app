/** @format */

"use client";

import { adminApi } from "@/lib/api";
import { AdminPage } from "@/components/page/AdminPage";
import { PageHeader } from "@/components/AdminList";
import { ResourceList } from "@/components/list";
import {
  type Message,
  mapMessage,
  mapFilterToApiStatus,
  messageFilterOptions,
} from "./_lib/types";
import { MessagesSummary } from "./_components/MessagesSummary";
import { MessagesTable } from "./_components/MessagesTable";
import { useTranslations } from "next-intl";

export default function MessagesPage() {
  const t = useTranslations();
  return (
    <AdminPage>
      <PageHeader
        title={t("admin.messaging.messages.title")}
        description={<MessagesSummary />}
      />
      <ResourceList<Message>
        resource="messages"
        fetcher={(params) => {
          const { status, ...rest } = params;
          return adminApi
            .getMessages({ ...rest, status: mapFilterToApiStatus(status) })
            .then((res) => {
              const root = res.data ?? {};
              const raw = root.data ?? root.messages ?? root.items ?? [];
              const total = root.meta?.total ?? root.total ?? raw.length;
              return {
                ...res,
                data: {
                  data: raw.map((message: any) => mapMessage(message, t)),
                  meta: { total },
                },
              };
            });
        }}
        getRowId={(m) => m.id}
        syncUrl
        initialFilters={{ status: "pending", fromDate: "", toDate: "" }}
      >
        <ResourceList.Toolbar>
          <ResourceList.Search />
          <ResourceList.FilterSelect
            name="status"
            options={messageFilterOptions(t)}
            className="sm:w-48"
          />
          <ResourceList.DateRange fromName="fromDate" toName="toDate" />
        </ResourceList.Toolbar>
        <MessagesTable />
        <ResourceList.Pagination />
      </ResourceList>
    </AdminPage>
  );
}
