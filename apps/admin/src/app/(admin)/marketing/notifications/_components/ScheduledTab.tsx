"use client";

import { adminApi } from "@/lib/api";
import { ResourceList } from "@/components/list";
import { useConfirm } from "@/provider/ConfirmProvider";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { scheduledColumns } from "../_lib/columns";
import { type ScheduledNotification } from "../_lib/types";
import { useTranslations } from "next-intl";

export function ScheduledTab() {
  const t = useTranslations();
  const confirm = useConfirm();
  const cancel = useAdminMutation(
    (id: string) => adminApi.cancelScheduledNotification(id),
    {
      invalidates: ["scheduled-notifications"],
      successMessage: t("admin.marketing.notifications.cancelled"),
    },
  );

  const onCancel = async (id: string) => {
    await confirm({
      description: t("admin.marketing.notifications.cancelConfirm"),
      destructive: true,
      onConfirm: () => cancel.mutateAsync(id),
    });
  };

  return (
    <ResourceList<ScheduledNotification>
      resource="scheduled-notifications"
      fetcher={(params) =>
        adminApi.getScheduledNotifications({ ...params, status: "pending" })
      }
      getRowId={(n) => n.id}
    >
      <ResourceList.Table
        columns={scheduledColumns(onCancel, t)}
        emptyText={t("admin.marketing.notifications.emptyScheduled")}
      />
      <ResourceList.Pagination />
    </ResourceList>
  );
}
